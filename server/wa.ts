import fs from 'fs';
import path from 'path';
import * as Baileys from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { DATA_DIR, readJSON, writeJSON } from './store';
import type { WaAccount, WaAccountState, RotationSettings } from '../src/types';

const B: any = (Baileys as any).default?.makeWASocket ? (Baileys as any).default : Baileys;
const makeWASocket: any = B.makeWASocket ?? B.default ?? B;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  downloadMediaMessage,
  getContentType,
}: any = B;

const AUTH_ROOT = path.join(DATA_DIR, 'wa-auth');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });
if (!fs.existsSync(AUTH_ROOT)) fs.mkdirSync(AUTH_ROOT, { recursive: true });

const logger = pino({ level: 'silent' });

const MEDIA_MAX_BYTES = 32 * 1024 * 1024;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** download a remote media URL with hard timeout + size cap (throws Arabic error) */
async function downloadRemoteMedia(url: string, timeoutMs = 25_000): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': BROWSER_UA },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`رابط الوسائط رد بكود ${res.status}. تحقق من الرابط أو ارفع الملف مباشرة.`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MEDIA_MAX_BYTES) throw new Error('حجم ملف الوسائط يتجاوز 32MB.');
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('رابط الوسائط فارغ. تحقق من الرابط.');
    if (buf.length > MEDIA_MAX_BYTES) throw new Error('حجم ملف الوسائط يتجاوز 32MB.');
    return buf;
  } catch (err: any) {
    if (err?.message && !/aborted|abort/i.test(err.message)) throw err;
    throw new Error('تعذر تحميل الوسائط من الرابط خلال 25 ثانية. تحقق من الرابط أو ارفع الملف مباشرة.');
  } finally {
    clearTimeout(timer);
  }
}

/** fast reachability probe used BEFORE enqueueing (fail fast with a clear message) */
export async function checkMediaUrl(url: string): Promise<{ ok: boolean; error?: string; bytes?: number }> {
  if (!url) return { ok: true };
  if (url.startsWith('/media/')) {
    const abs = path.join(DATA_DIR, 'media', decodeURIComponent(url.replace(/^\/media\//, '')));
    return fs.existsSync(abs) ? { ok: true } : { ok: false, error: 'ملف المرفق غير موجود على الخادم.' };
  }
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'رابط الوسائط غير صالح. استخدم رابط https:// مباشر أو ارفع الملف.' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    let res: Response;
    try {
      res = await fetch(url, { method: 'HEAD', signal: controller.signal, headers: { 'User-Agent': BROWSER_UA }, redirect: 'follow' });
      // some hosts (e.g. image CDNs) answer HEAD unreliably — confirm with a tiny ranged GET
      if (!res.ok) {
        res = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'User-Agent': BROWSER_UA, Range: 'bytes=0-1023' },
          redirect: 'follow',
        });
      }
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return { ok: false, error: `رابط الوسائط لا يعمل (كود ${res.status}). تحقق من الرابط أو ارفع الملف مباشرة.` };
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MEDIA_MAX_BYTES) return { ok: false, error: 'حجم ملف الوسائط يتجاوز 32MB.' };
    return { ok: true, bytes: len || undefined };
  } catch {
    return { ok: false, error: 'تعذر الوصول لرابط الوسائط. تحقق من الرابط أو ارفع الملف مباشرة.' };
  }
}

export interface WaStatus {
  state: WaAccountState;
  qr: string | null;
  user: { id: string; name: string; phone: string } | null;
  lastError: string | null;
  startedAt: string | null;
  trace: string[];
}

export interface IncomingMessage {
  id: string;
  chatId: string;
  phone: string;
  name: string;
  text: string;
  timestamp: string;
  fromMe: boolean;
  isGroup: boolean;
  accountId: string;
  media?: { type: 'image' | 'video' | 'audio' | 'document'; url: string; name: string };
}

type Listener<T> = (payload: T) => void;

const DEFAULT_ROTATION: RotationSettings = {
  strategy: 'least-used',
  perAccountHourlyCap: 25,
  perAccountDailyCap: 300,
  failStreakLimit: 2,
  cooldownMinutes: 45,
};

interface Persisted {
  accounts: Array<{
    id: string;
    name: string;
    createdAt: string;
    paused: boolean;
    sentHour: number;
    sentToday: number;
    sentDay: string;
    hourWindowStart: number;
    failStreak: number;
    cooldownUntil: number | null;
  }>;
  activeAccountId: string | null;
  rotation: RotationSettings;
}

// ---------------------------------------------------------------- single session
class WaSession {
  status: WaStatus = {
    state: 'disconnected',
    qr: null,
    user: null,
    lastError: null,
    startedAt: null,
    trace: [],
  };

  private sock: any = null;
  private startPromise: Promise<WaStatus> | null = null;
  private intentionalStop = false;
  private restartTimer: NodeJS.Timeout | null = null;

  constructor(
    readonly accountId: string,
    private emitStatus: () => void,
    private emitMessage: (m: IncomingMessage) => void,
  ) {}

  private authDir() {
    return path.join(AUTH_ROOT, this.accountId);
  }

  private tracePush(msg: string) {
    const line = `${new Date().toLocaleTimeString('en-GB')} ${msg}`;
    console.log(`[wa:${this.accountId}] ${msg}`);
    this.status.trace = [...this.status.trace.slice(-24), line];
  }

  private setStatus(patch: Partial<WaStatus>) {
    this.status = { ...this.status, ...patch };
    this.emitStatus();
  }

  getStatus(): WaStatus {
    return { ...this.status, trace: [...this.status.trace] };
  }

  /** raw Baileys socket (for queries like onWhatsApp) */
  getSocket(): any {
    return this.sock;
  }

  isConnected() {
    return this.status.state === 'connected' && !!this.sock;
  }

  async start(): Promise<WaStatus> {
    if (this.startPromise) return this.startPromise;
    if (this.sock && this.status.state !== 'disconnected') return this.getStatus();
    this.intentionalStop = false;
    this.startPromise = this.doStart().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async doStart(): Promise<WaStatus> {
    this.setStatus({ state: 'connecting', lastError: null, startedAt: new Date().toISOString() });
    this.tracePush('starting session');

    try {
      if (this.sock) {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        await this.sock.ws?.close?.();
      }
    } catch {
      /* ignore */
    }
    this.sock = null;

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authDir());
      if (this.intentionalStop) {
        this.setStatus({ state: 'disconnected', qr: null, user: null, startedAt: null });
        return this.getStatus();
      }
      const { version } = await fetchLatestBaileysVersion().catch((e: any) => {
        this.tracePush(`version fetch failed (${e?.message || e}), using bundled defaults`);
        return { version: undefined };
      });

      const sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        logger,
        printQRInTerminal: false,
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: true,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        keepAliveIntervalMs: 30_000,
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        retryRequestDelayMs: 500,
        maxMsgRetryCount: 3,
      });

      this.sock = sock;
      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.tracePush('qr received, waiting for phone scan');
          try {
            const dataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 1 });
            this.setStatus({ state: 'qr', qr: dataUrl, lastError: null });
          } catch {
            this.setStatus({ state: 'qr', qr: null });
          }
        }

        if (connection === 'open') {
          const jid: string = sock.user?.id || '';
          const phone = jid.split(':')[0].split('@')[0];
          this.tracePush(`connected as +${phone}`);
          this.setStatus({
            state: 'connected',
            qr: null,
            lastError: null,
            user: { id: jid, name: sock.user?.name || '', phone },
          });
        }

        if (connection === 'close') {
          const code = lastDisconnect?.error?.output?.statusCode;
          const reason = String(lastDisconnect?.error?.message || '').slice(0, 120);
          const loggedOut = code === DisconnectReason.loggedOut;
          this.tracePush(`closed (code ${code ?? '?'}) ${reason}`);
          this.sock = null;

          if (this.intentionalStop || loggedOut) {
            if (loggedOut && !this.intentionalStop) {
              try {
                fs.rmSync(this.authDir(), { recursive: true, force: true });
              } catch {
                /* ignore */
              }
            }
            this.setStatus({
              state: 'disconnected',
              qr: null,
              user: null,
              startedAt: null,
              lastError: loggedOut && !this.intentionalStop ? 'تم تسجيل الخروج من واتساب. امسح رمزاً جديداً.' : null,
            });
            return;
          }

          this.setStatus({
            state: 'connecting',
            qr: null,
            lastError: code
              ? `انقطع الاتصال (كود ${code})، جارٍ إعادة الاتصال...`
              : 'انقطع الاتصال، جارٍ إعادة المحاولة...',
          });

          if (this.restartTimer) clearTimeout(this.restartTimer);
          this.restartTimer = setTimeout(() => {
            this.start().catch(() => undefined);
          }, 3000);
        }
      });

      sock.ev.on('messages.upsert', async (upsert: any) => {
        try {
          if (!upsert || upsert.type !== 'notify') return;
          for (const raw of upsert.messages || []) {
            const incoming = await this.normalizeMessage(raw);
            if (incoming) this.emitMessage(incoming);
          }
        } catch (err) {
          console.error(`[wa:${this.accountId}] messages.upsert error:`, (err as Error).message);
        }
      });

      this.tracePush('socket created, handshake started');
      return this.getStatus();
    } catch (err: any) {
      this.tracePush(`start failed: ${err?.message || err}`);
      this.setStatus({ state: 'disconnected', qr: null, lastError: err?.message || 'تعذر بدء الجلسة.' });
      throw err;
    }
  }

  async stop(): Promise<WaStatus> {
    this.intentionalStop = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.tracePush('user requested disconnect');
    try {
      if (this.sock) {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        await this.sock.logout().catch(() => undefined);
        await this.sock.ws?.close?.();
      }
    } catch {
      /* ignore */
    }
    this.sock = null;
    try {
      fs.rmSync(this.authDir(), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    this.setStatus({ state: 'disconnected', qr: null, user: null, lastError: null, startedAt: null });
    return this.getStatus();
  }

  private async normalizeMessage(raw: any): Promise<IncomingMessage | null> {
    if (!raw) return null;
    const key = raw.key || {};
    if (key.fromMe) return null;
    const chatId: string = key.remoteJid || '';
    if (!chatId || chatId === 'status@broadcast') return null;

    const message = raw.message || {};
    const content = message.ephemeralMessage?.message || message;
    const type: string = getContentType?.(content) || '';
    let text = '';
    let media: IncomingMessage['media'];

    if (type === 'conversation') text = content.conversation || '';
    else if (type === 'extendedTextMessage') text = content.extendedTextMessage?.text || '';
    else if (type === 'imageMessage') {
      text = content.imageMessage?.caption || '';
      media = { type: 'image', url: '', name: 'image' };
    } else if (type === 'videoMessage') {
      text = content.videoMessage?.caption || '';
      media = { type: 'video', url: '', name: 'video' };
    } else if (type === 'audioMessage') media = { type: 'audio', url: '', name: 'audio' };
    else if (type === 'documentMessage') {
      text = content.documentMessage?.fileName || '';
      media = { type: 'document', url: '', name: content.documentMessage?.fileName || 'document' };
    } else if (type === 'stickerMessage') media = { type: 'image', url: '', name: 'sticker' };

    if (media && this.sock) {
      try {
        const buffer: Buffer = (await downloadMediaMessage(
          raw,
          'buffer',
          {},
          { logger, reuploadRequest: this.sock.updateMediaMessage },
        )) as Buffer;
        const ext = this.extForMime(content[type]?.mimetype || '');
        const fileName = `${raw.key.id || Date.now()}${ext}`;
        fs.writeFileSync(path.join(MEDIA_DIR, fileName), buffer);
        media.url = `/media/${fileName}`;
        media.name = media.type === 'document' ? content.documentMessage?.fileName || fileName : fileName;
      } catch (err) {
        console.error(`[wa:${this.accountId}] media download failed:`, (err as Error).message);
        media = undefined;
      }
    }

    const isGroup = chatId.endsWith('@g.us');
    const phone = isGroup ? chatId : chatId.split('@')[0].split(':')[0];
    if (!text && !media) return null;

    return {
      id: raw.key?.id || `m-${Date.now()}`,
      chatId,
      phone,
      name: raw.pushName || '',
      text,
      timestamp: new Date(Number(raw.messageTimestamp || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      fromMe: false,
      isGroup,
      accountId: this.accountId,
      media,
    };
  }

  private extForMime(mime: string) {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'video/3gpp': '.3gp',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'audio/mp4': '.m4a',
      'application/pdf': '.pdf',
    };
    return map[mime] || '';
  }

  /** infrastructure error (wait + retry) vs recipient error (fail fast, no cooldown) */
  private isInfraError(err: any): boolean {
    const text = String(err?.output?.payload?.message || err?.message || err || '');
    if (/not-in-whatsapp|exists/i.test(text)) return false;
    if (/blocked|403|forbidden/i.test(text)) return false;
    if (/bad-request|400|invalid/i.test(text) && !/timeout/i.test(text)) return false;
    return true;
  }

  async sendText(
    phone: string,
    text: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string; infra?: boolean }> {
    if (!this.isConnected()) return { success: false, error: 'الحساب غير متصل. اربط الرقم أولاً.', infra: true };
    const jid = `${phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    try {
      const sent = await this.sock.sendMessage(jid, { text });
      return { success: true, messageId: sent?.key?.id };
    } catch (err: any) {
      return { success: false, error: this.humanizeError(err), infra: this.isInfraError(err) };
    }
  }

  async sendMedia(
    phone: string,
    media: { type: 'image' | 'video' | 'audio' | 'document'; url: string; name?: string },
    caption: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string; infra?: boolean }> {
    if (!this.isConnected()) return { success: false, error: 'الحساب غير متصل. اربط الرقم أولاً.', infra: true };
    const jid = `${phone.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    let content: any;
    try {
      content = await this.buildMediaContent(media, caption);
    } catch (err: any) {
      // dead URL / missing file = content problem: fail fast, never cool the account
      return { success: false, error: err?.message || 'تعذر تجهيز المرفق.', infra: false };
    }
    try {
      const sent = await this.sock.sendMessage(jid, content);
      return { success: true, messageId: sent?.key?.id };
    } catch (err: any) {
      return { success: false, error: this.humanizeError(err), infra: this.isInfraError(err) };
    }
  }

  private async buildMediaContent(
    media: { type: 'image' | 'video' | 'audio' | 'document'; url: string; name?: string },
    caption: string,
  ): Promise<any> {
    // local uploads (served from /media) are read from disk — reliable behind any host/port
    let data: any;
    if (media.url.startsWith('/media/')) {
      // served as /media/* -> server-data/media/* (keep the media segment!)
      const abs = path.join(DATA_DIR, 'media', decodeURIComponent(media.url.replace(/^\/media\//, '')));
      if (!fs.existsSync(abs)) throw new Error('ملف المرفق غير موجود على الخادم.');
      data = fs.readFileSync(abs);
    } else if (/^https?:\/\//i.test(media.url)) {
      // download remote files OURSELVES with a hard timeout — Baileys' internal
      // fetch has none, so a dead/slow URL used to hang the send until it timed out
      data = await downloadRemoteMedia(media.url);
    } else {
      throw new Error('رابط الوسائط غير صالح. استخدم رابط https:// مباشر أو ارفع الملف.');
    }
    if (media.type === 'image') return { image: data, caption: caption || undefined };
    if (media.type === 'video') return { video: data, caption: caption || undefined };
    if (media.type === 'audio') return { audio: data, mimetype: 'audio/mp4', ptt: false };
    return {
      document: data,
      fileName: media.name || 'document',
      mimetype: this.mimeForFile(media.name || media.url),
      caption: caption || undefined,
    };
  }

  private mimeForFile(name: string) {
    const ext = name.split('.').pop()?.toLowerCase().split('?')[0] || '';
    const map: Record<string, string> = {
      pdf: 'application/pdf',
      zip: 'application/zip',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      m4a: 'audio/mp4',
    };
    return map[ext] || 'application/octet-stream';
  }

  async markRead(chatId: string) {
    if (!this.isConnected()) return;
    try {
      await this.sock.readMessages([{ remoteJid: chatId, id: '', fromMe: true }]);
    } catch {
      /* ignore */
    }
  }

  private humanizeError(err: any): string {
    const text = String(err?.output?.payload?.message || err?.message || err || 'خطأ غير معروف');
    if (/timeout|timed out|socket/i.test(text)) return 'انتهت مهلة الاتصال بواتساب، حاول مجدداً.';
    if (/not-authorized|515|conflict/i.test(text)) return 'الجلسة تحتاج إعادة ربط، افتح نافذة الربط وامسح الرمز.';
    if (/blocked|403|forbidden/i.test(text)) return 'الرقم المستلم محظور أو غير مفعل على واتساب.';
    if (/not-in-whatsapp|exists/i.test(text)) return 'هذا الرقم غير موجود على واتساب.';
    return text.slice(0, 200);
  }
}

// ---------------------------------------------------------------- manager
class WaManager {
  private sessions = new Map<string, WaSession>();
  private data: Persisted = { accounts: [], activeAccountId: null, rotation: DEFAULT_ROTATION };
  private statusListeners = new Set<Listener<WaAccount[]>>();
  private messageListeners = new Set<Listener<IncomingMessage>>();
  private rrIndex = 0;

  constructor() {
    const migrated = this.migrateLegacyAuth();
    this.data = readJSON<Persisted>('accounts', {
      accounts: [],
      activeAccountId: null,
      rotation: DEFAULT_ROTATION,
    });
    if (!this.data.rotation) this.data.rotation = DEFAULT_ROTATION;
    // merge new fields into rotation persisted before the daily-cap update
    this.data.rotation = { ...DEFAULT_ROTATION, ...this.data.rotation };
    // reset volatile runtime fields from a previous process
    for (const a of this.data.accounts) {
      a.sentHour = 0;
      a.hourWindowStart = Date.now();
      a.failStreak = 0;
      a.cooldownUntil = null;
    }
    if (!this.data.accounts.length) {
      const created = this.createRecord('الرقم الرئيسي', migrated ? 'acc-default' : undefined);
      this.data.activeAccountId = created.id;
      this.persist();
    } else if (!this.data.accounts.some((a) => a.id === this.data.activeAccountId)) {
      this.data.activeAccountId = this.data.accounts[0].id;
      this.persist();
    }
  }

  private migrateLegacyAuth(): boolean {
    try {
      if (!fs.existsSync(AUTH_ROOT)) return false;
      const entries = fs.readdirSync(AUTH_ROOT);
      const hasLegacyFiles = entries.some((e) => e.endsWith('.json'));
      if (!hasLegacyFiles) return false;
      const target = path.join(AUTH_ROOT, 'acc-default');
      fs.mkdirSync(target, { recursive: true });
      for (const e of entries) {
        const src = path.join(AUTH_ROOT, e);
        if (fs.statSync(src).isFile()) fs.renameSync(src, path.join(target, e));
      }
      console.log('[wa] migrated legacy single auth to acc-default');
      return true;
    } catch (err) {
      console.error('[wa] legacy migration failed:', (err as Error).message);
      return false;
    }
  }

  private persist() {
    void writeJSON('accounts', this.data);
  }

  onStatus(fn: Listener<WaAccount[]>) {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  onMessage(fn: Listener<IncomingMessage>) {
    this.messageListeners.add(fn);
    return () => this.messageListeners.delete(fn);
  }

  private emitStatus() {
    const list = this.listAccounts();
    this.statusListeners.forEach((fn) => fn(list));
  }

  private sessionFor(id: string): WaSession {
    let s = this.sessions.get(id);
    if (!s) {
      s = new WaSession(
        id,
        () => this.emitStatus(),
        (m) => this.messageListeners.forEach((fn) => fn(m)),
      );
      this.sessions.set(id, s);
    }
    return s;
  }

  /** full snapshot list (persisted counters + live session state) */
  listAccounts(): WaAccount[] {
    const today = new Date().toISOString().slice(0, 10);
    return this.data.accounts.map((a) => {
      const s = this.sessions.get(a.id);
      const st = s?.getStatus();
      if (a.sentDay !== today) {
        a.sentDay = today;
        a.sentToday = 0;
      }
      return {
        id: a.id,
        name: a.name,
        phone: st?.user?.phone || '',
        state: (st?.state || 'disconnected') as WaAccountState,
        user: st?.user || null,
        lastError: st?.lastError || null,
        trace: st?.trace || [],
        paused: a.paused,
        cooldownUntil: a.cooldownUntil,
        sentHour: a.sentHour,
        sentToday: a.sentToday,
        failStreak: a.failStreak,
        createdAt: a.createdAt,
      };
    });
  }

  getRotation(): RotationSettings {
    return { ...this.data.rotation };
  }

  setRotation(r: RotationSettings) {
    this.data.rotation = {
      strategy: r.strategy || 'least-used',
      perAccountHourlyCap: Math.max(5, Math.min(200, r.perAccountHourlyCap || 25)),
      perAccountDailyCap: Math.max(50, Math.min(2000, (r as any).perAccountDailyCap || 300)),
      failStreakLimit: Math.max(1, Math.min(20, r.failStreakLimit || 2)),
      cooldownMinutes: Math.max(5, Math.min(720, r.cooldownMinutes || 45)),
    };
    this.persist();
  }

  getActiveId(): string | null {
    return this.data.activeAccountId;
  }

  private createRecord(name: string, fixedId?: string) {
    const rec = {
      id: fixedId || `acc-${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`,
      name: name || 'رقم واتساب',
      createdAt: new Date().toISOString(),
      paused: false,
      sentHour: 0,
      sentToday: 0,
      sentDay: new Date().toISOString().slice(0, 10),
      hourWindowStart: Date.now(),
      failStreak: 0,
      cooldownUntil: null as number | null,
    };
    this.data.accounts.push(rec);
    return rec;
  }

  createAccount(name: string): WaAccount[] {
    this.createRecord(name);
    this.persist();
    return this.listAccounts();
  }

  async deleteAccount(id: string): Promise<WaAccount[]> {
    const s = this.sessions.get(id);
    if (s) {
      try {
        await s.stop();
      } catch {
        /* ignore */
      }
      this.sessions.delete(id);
    }
    try {
      fs.rmSync(path.join(AUTH_ROOT, id), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    this.data.accounts = this.data.accounts.filter((a) => a.id !== id);
    if (this.data.activeAccountId === id) {
      this.data.activeAccountId = this.data.accounts[0]?.id || null;
    }
    this.persist();
    this.emitStatus();
    return this.listAccounts();
  }

  activate(id: string): boolean {
    if (!this.data.accounts.some((a) => a.id === id)) return false;
    this.data.activeAccountId = id;
    this.persist();
    this.emitStatus();
    return true;
  }

  setPaused(id: string, paused: boolean): boolean {
    const a = this.data.accounts.find((x) => x.id === id);
    if (!a) return false;
    a.paused = paused;
    // any manual pause action = fresh start: clear fail streak and cooldown
    a.failStreak = 0;
    a.cooldownUntil = null;
    this.persist();
    this.emitStatus();
    return true;
  }

  accountStatus(id: string): (WaStatus & { id: string }) | null {
    if (!this.data.accounts.some((a) => a.id === id)) return null;
    return { id, ...this.sessionFor(id).getStatus() };
  }

  connectAccount(id: string) {
    if (!this.data.accounts.some((a) => a.id === id)) throw new Error('الحساب غير موجود.');
    return this.sessionFor(id).start();
  }

  disconnectAccount(id: string) {
    if (!this.data.accounts.some((a) => a.id === id)) throw new Error('الحساب غير موجود.');
    return this.sessionFor(id).stop();
  }

  /** reconnect every account that has a saved session and isn't paused */
  autostartAll(): void {
    for (const rec of this.data.accounts) {
      if (rec.paused) continue;
      try {
        if (fs.existsSync(path.join(AUTH_ROOT, rec.id))) {
          this.sessionFor(rec.id)
            .start()
            .catch((err) => console.error(`[wa] auto-connect ${rec.name} failed:`, err?.message));
        }
      } catch (err: any) {
        console.error(`[wa] auto-connect ${rec.name} failed:`, err?.message);
      }
    }
  }

  // ---- compat surface (operates on the ACTIVE account) ----
  private activeSession(): WaSession | null {
    const id = this.data.activeAccountId || this.data.accounts[0]?.id;
    if (!id) return null;
    return this.sessionFor(id);
  }

  getStatus(): WaStatus {
    return this.activeSession()?.getStatus() || {
      state: 'disconnected',
      qr: null,
      user: null,
      lastError: null,
      startedAt: null,
      trace: [],
    };
  }

  isConnected() {
    return !!this.activeSession()?.isConnected();
  }

  start() {
    const s = this.activeSession();
    if (!s) throw new Error('لا توجد حسابات. أنشئ حساباً أولاً.');
    return s.start();
  }

  stop() {
    const s = this.activeSession();
    if (!s) throw new Error('لا توجد حسابات.');
    return s.stop();
  }

  sendText(phone: string, text: string) {
    const s = this.activeSession();
    if (!s) return Promise.resolve({ success: false as const, error: 'لا توجد حسابات.' });
    return s.sendText(phone, text);
  }

  sendMedia(
    phone: string,
    media: { type: 'image' | 'video' | 'audio' | 'document'; url: string; name?: string },
    caption: string,
  ) {
    const s = this.activeSession();
    if (!s) return Promise.resolve({ success: false as const, error: 'لا توجد حسابات.' });
    return s.sendMedia(phone, media, caption);
  }

  markRead(accountId: string, chatId: string) {
    return this.sessionFor(accountId).markRead(chatId);
  }

  /**
   * Check which phone numbers exist on WhatsApp (lightweight query, no message sent).
   * Throttled in small batches to stay safe. Returns per-number results.
   */
  async checkNumbers(
    phones: string[],
    accountId?: string | null,
    onProgress?: (done: number, total: number) => void,
  ): Promise<Array<{ phone: string; exists: boolean; jid: string }>> {
    const clean = [
      ...new Set(
        phones
          .map((p) => String(p || '').replace(/[^0-9]/g, ''))
          .filter((p) => p.length >= 9 && p.length <= 15),
      ),
    ];
    const picked = this.pickSession(undefined, accountId || null);
    if ('error' in picked) throw new Error(picked.error);
    const sock = picked.session.getSocket();
    if (!sock) throw new Error('جلسة الحساب غير متاحة.');
    const results: Array<{ phone: string; exists: boolean; jid: string }> = [];
    const BATCH = 20;
    for (let i = 0; i < clean.length; i += BATCH) {
      const batch = clean.slice(i, i + BATCH);
      try {
        const res: any[] = await sock.onWhatsApp(...batch.map((p) => `${p}@s.whatsapp.net`));
        const byJid = new Map(
          (res || []).map((r: any) => [String(r.jid || '').split('@')[0].split(':')[0], !!r.exists]),
        );
        for (const p of batch) {
          results.push({ phone: p, exists: byJid.get(p) ?? false, jid: `${p}@s.whatsapp.net` });
        }
      } catch (err: any) {
        console.error('[wa] onWhatsApp batch failed:', err?.message);
        for (const p of batch) results.push({ phone: p, exists: false, jid: `${p}@s.whatsapp.net` });
      }
      onProgress?.(results.length, clean.length);
      if (i + BATCH < clean.length) await new Promise((r) => setTimeout(r, 2500));
    }
    return results;
  }

  // ---- smart routing ----
  private touchHourWindow(rec: Persisted['accounts'][number]) {
    const now = Date.now();
    if (now - rec.hourWindowStart > 3600_000) {
      rec.hourWindowStart = now;
      rec.sentHour = 0;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (rec.sentDay !== today) {
      rec.sentDay = today;
      rec.sentToday = 0;
    }
  }

  /** effective hourly cap: new accounts (<7d) get half cap while warmup is on */
  private hourlyCapFor(rec: Persisted['accounts'][number]): number {
    const base = this.data.rotation.perAccountHourlyCap;
    let warmup = true;
    try {
      const cfg = readJSON<{ enableWarmupMode?: boolean }>('antiblock', { enableWarmupMode: true });
      warmup = cfg.enableWarmupMode !== false;
    } catch {
      /* default on */
    }
    if (!warmup) return base;
    const ageMs = Date.now() - Date.parse((rec as any).createdAt || '');
    if (!Number.isNaN(ageMs) && ageMs < 7 * 24 * 3600_000) return Math.max(5, Math.ceil(base / 2));
    return base;
  }

  eligibleAccounts(scopeIds?: string[]): Array<{ rec: Persisted['accounts'][number]; session: WaSession }> {
    const rot = this.data.rotation;
    const dailyCap = (rot as any).perAccountDailyCap || 300;
    const out: Array<{ rec: Persisted['accounts'][number]; session: WaSession }> = [];
    for (const rec of this.data.accounts) {
      if (rec.paused) continue;
      if (scopeIds && scopeIds.length && !scopeIds.includes('all') && !scopeIds.includes(rec.id)) continue;
      this.touchHourWindow(rec);
      if (rec.cooldownUntil && rec.cooldownUntil > Date.now()) continue;
      if (rec.sentHour >= this.hourlyCapFor(rec)) continue;
      if (rec.sentToday >= dailyCap) continue;
      const session = this.sessions.get(rec.id);
      if (!session?.isConnected()) continue;
      out.push({ rec, session });
    }
    return out;
  }

  pickSession(
    scopeIds?: string[],
    pinnedId?: string | null,
  ): { rec: Persisted['accounts'][number]; session: WaSession } | { error: string } {
    const rot = this.data.rotation;
    if (pinnedId) {
      const rec = this.data.accounts.find((a) => a.id === pinnedId);
      if (!rec) return { error: 'الحساب المحدد غير موجود.' };
      this.touchHourWindow(rec);
      const session = this.sessions.get(rec.id);
      if (!session?.isConnected()) return { error: `الحساب "${rec.name}" غير متصل.` };
      if (rec.paused) return { error: `الحساب "${rec.name}" موقوف مؤقتاً.` };
      return { rec, session };
    }
    if (rot.strategy === 'pinned') {
      const activeId = this.data.activeAccountId;
      return this.pickSession(scopeIds, activeId);
    }
    const eligible = this.eligibleAccounts(scopeIds);
    if (!eligible.length) {
      const anyConnected = this.data.accounts.some((a) => this.sessions.get(a.id)?.isConnected() && !a.paused);
      if (!anyConnected) return { error: 'لا توجد حسابات واتساب متصلة. اربط رقماً أولاً.' };
      return { error: 'كل الحسابات المتصلة بلغت سقف الإرسال أو في تبريد. انتظر قليلاً.' };
    }
    if (rot.strategy === 'least-used') {
      eligible.sort((x, y) => x.rec.sentHour - y.rec.sentHour);
      return eligible[0];
    }
    // round-robin
    const choice = eligible[this.rrIndex % eligible.length];
    this.rrIndex = (this.rrIndex + 1) % 1024;
    return choice;
  }

  recordSuccess(accountId: string) {
    const rec = this.data.accounts.find((a) => a.id === accountId);
    if (!rec) return;
    this.touchHourWindow(rec);
    rec.sentHour += 1;
    rec.sentToday += 1;
    rec.failStreak = 0;
    this.persist();
  }

  recordFailure(accountId: string, infra = true) {
    const rec = this.data.accounts.find((a) => a.id === accountId);
    if (!rec) return;
    // recipient-side errors (bad number, blocked) must NOT cool the account down
    if (!infra) {
      this.persist();
      this.emitStatus();
      return;
    }
    rec.failStreak += 1;
    if (rec.failStreak >= this.data.rotation.failStreakLimit) {
      rec.cooldownUntil = Date.now() + this.data.rotation.cooldownMinutes * 60_000;
      rec.failStreak = 0;
      console.log(`[wa] account ${rec.name} cooling down for ${this.data.rotation.cooldownMinutes}m`);
    }
    this.persist();
    this.emitStatus();
  }

  /** send with one automatic retry on a different account */
  async routeSend(
    phone: string,
    text: string,
    media: { type: 'image' | 'video' | 'audio' | 'document'; url: string; name?: string } | null,
    opts: { accountId?: string | null; scopeIds?: string[] } = {},
  ): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
    infra?: boolean;
    accountId?: string;
    accountName?: string;
  }> {
    const tried = new Set<string>();
    let last: { error?: string; infra?: boolean } | null = null;
    let lastAccount: { id: string; name: string } | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const picked = this.pickSession(opts.scopeIds, opts.accountId || null);
      if ('error' in picked) return { success: false, error: picked.error, infra: true };
      lastAccount = { id: picked.rec.id, name: picked.rec.name };
      if (tried.has(picked.rec.id) && attempt > 0) break;
      tried.add(picked.rec.id);
      const res = media
        ? await picked.session.sendMedia(phone, media, text)
        : await picked.session.sendText(phone, text);
      if (res.success) {
        this.recordSuccess(picked.rec.id);
        return { ...res, accountId: picked.rec.id, accountName: picked.rec.name };
      }
      last = res;
      this.recordFailure(picked.rec.id, res.infra !== false);
      // retry only infrastructure problems on another account; bad numbers fail fast
      if (attempt === 0 && res.infra !== false) continue;
      return {
        ...res,
        accountId: picked.rec.id,
        accountName: picked.rec.name,
      };
    }
    // preserve the REAL last error (account + reason) instead of a generic message
    return {
      success: false,
      error: last?.error || 'تعذر الإرسال عبر الحسابات المتاحة.',
      infra: last?.infra,
      accountId: lastAccount?.id,
      accountName: lastAccount?.name,
    };
  }
}

export const wa = new WaManager();
