import { readJSON, writeJSON } from './store';
import { aiChat, aiStatus } from './ai';
import { wa, IncomingMessage } from './wa';
import { resolveSpintax } from '../src/utils/antiBlock';
import type {
  AntiBlockConfig,
  ApiKeyItem,
  BotRule,
  Campaign,
  ChatMessage,
  Contact,
  ContactGroup,
  Conversation,
  GeminiBotConfig,
  MessageTemplate,
} from '../src/types';

// ---------------------------------------------------------------- persistence helpers
export const DEFAULT_ANTIBLOCK: AntiBlockConfig = {
  useSpintax: true,
  minDelaySeconds: 15,
  maxDelaySeconds: 28,
  batchSize: 30,
  batchPauseMinutes: 5,
  enableWarmupMode: true,
  autoUnsubscribeKeyword: true,
  filterInvalidNumbers: true,
  randomizeSendOrder: true,
};

export const DEFAULT_BOT_CONFIG: GeminiBotConfig = {
  enabled: true,
  persona: 'أنت مساعد خدمة عملاء ذكي يتحدث بأسلوب مهني وودود باللغة العربية ويجيب على استفسارات العملاء بدقة وإيجاز يناسب رسائل الواتساب.',
  businessName: '',
  knowledgeBase: 'الخدمات متاحة 24/7، الشحن سريع خلال 48 ساعة، إمكانية الدفع عند الاستلام أو بالبطاقات.',
  temperature: 0.7,
  autoHandoverKeywords: ['موظف', 'إنسان', 'مدير', 'شكوى', 'كلمني شخص'],
};

export interface Stats {
  sent: number;
  delivered: number;
  failed: number;
  read: number;
  replied: number;
  daily: Record<string, { sent: number; delivered: number; failed: number; read: number; replied: number }>;
}

const EMPTY_STATS: Stats = { sent: 0, delivered: 0, failed: 0, read: 0, replied: 0, daily: {} };

export function getContacts() {
  return readJSON<Contact[]>('contacts', []);
}
export function getGroups() {
  return readJSON<ContactGroup[]>('contact-groups', []);
}
/** normalize message -> stable hash لمنع إعادة نفس النص */
export function messageHash(text: string): string {
  const norm = String(text || '').replace(/\s+/g, ' ').trim();
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) >>> 0;
  return `mh-${h.toString(36)}-${norm.length}`;
}
export function hasBeenSent(phone: string, hash: string): boolean {
  const clean = String(phone || '').replace(/[^0-9]/g, '');
  const log = readJSON<SendLogEntry[]>('sendlog', []);
  return log.some((e) => e.phone === clean && e.messageHash === hash && e.status === 'sent');
}
/** فحص تكرار قبل إرسال: مكرر داخل قائمة + مبعوت له نفس رسالة قبل كده */
export function checkDuplicates(phones: string[], text: string): { alreadySent: string[]; dupesInList: string[]; unique: string[] } {
  const hash = messageHash(text);
  const seen = new Set<string>();
  const dupesInList: string[] = [];
  const unique: string[] = [];
  for (const raw of phones) {
    const clean = String(raw || '').replace(/[^0-9]/g, '');
    if (!clean) continue;
    if (seen.has(clean)) { if (!dupesInList.includes(clean)) dupesInList.push(clean); continue; }
    seen.add(clean);
    unique.push(clean);
  }
  const alreadySent = unique.filter((p) => hasBeenSent(p, hash));
  return { alreadySent, dupesInList, unique: unique.filter((p) => !alreadySent.includes(p)) };
}
function sendLogCache(): SendLogEntry[] {
  return readJSON<SendLogEntry[]>('sendlog', []);
}
export function getCampaigns() {
  return readJSON<Campaign[]>('campaigns', []);
}
export function getTemplates() {
  return readJSON<MessageTemplate[]>('templates', []);
}
export function getBotRules() {
  return readJSON<BotRule[]>('bot-rules', []);
}
export function getBotConfig() {
  return readJSON<GeminiBotConfig>('bot-config', DEFAULT_BOT_CONFIG);
}
export function getAntiBlock() {
  return readJSON<AntiBlockConfig>('antiblock', DEFAULT_ANTIBLOCK);
}
export function getApiKeys() {
  return readJSON<ApiKeyItem[]>('api-keys', []);
}
export function getConversations() {
  return readJSON<Conversation[]>('conversations', []);
}
export function getStats() {
  return readJSON<Stats>('stats', EMPTY_STATS);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function bumpStat(field: 'sent' | 'delivered' | 'failed' | 'read' | 'replied') {
  const stats = getStats();
  stats[field] += 1;
  const day = todayKey();
  stats.daily[day] = stats.daily[day] || { sent: 0, delivered: 0, failed: 0, read: 0, replied: 0 };
  stats.daily[day][field] += 1;
  void writeJSON('stats', stats);
}

// ---------------------------------------------------------------- event bus (SSE)
export type AppEvent =
  | { type: 'wa-status' }
  | { type: 'conversations' }
  | { type: 'campaigns' }
  | { type: 'sendlog' }
  | { type: 'stats' }
  | { type: 'meta' };

const eventListeners = new Set<(e: AppEvent) => void>();
export function emit(e: AppEvent) {
  eventListeners.forEach((fn) => fn(e));
}
export function onEvent(fn: (e: AppEvent) => void) {
  eventListeners.add(fn);
  return () => eventListeners.delete(fn);
}

// ---------------------------------------------------------------- AI providers (Gemini + Groq, keys lazy)
export function isGeminiReady() {
  return aiStatus().ready;
}
export function isAiReady() {
  return aiStatus().ready;
}
export function initGemini() {
  const s = aiStatus();
  console.log(`[ai] providers ready=${s.ready} active=${s.active} (gemini=${s.hasGeminiKey}, groq=${s.hasGroqKey})`);
}

// ---------------------------------------------------------------- bot engine
export interface BotAnswer {
  reply: string;
  action: 'bot_reply' | 'opt_out' | 'assign_agent' | 'trigger_webhook';
  source: string;
  ruleId?: string;
  isOptOut: boolean;
}

const OPT_OUT_KEYWORDS = ['إلغاء', 'الغاء', 'stop', 'unsubscribe', 'إيقاف', 'الغاء الاشتراك'];

export function ruleMatches(rule: BotRule, message: string): boolean {
  const lower = message.trim().toLowerCase();
  if (rule.triggerType === 'fallback') return true;
  if (rule.triggerType === 'exact') {
    return rule.keywords.some((k) => k.trim().toLowerCase() === lower);
  }
  if (rule.triggerType === 'regex') {
    return rule.keywords.some((k) => {
      try {
        return new RegExp(k, 'i').test(message);
      } catch {
        return false;
      }
    });
  }
  return rule.keywords.some((k) => k && lower.includes(k.trim().toLowerCase()));
}

function bumpRuleMatch(ruleId: string) {
  const rules = getBotRules();
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) return;
  rule.matchCount = (rule.matchCount || 0) + 1;
  void writeJSON('bot-rules', rules);
}

export async function answerBot(
  message: string,
  history: Array<{ role: string; text: string }> = [],
): Promise<BotAnswer> {
  const rules = getBotRules();
  const config = getBotConfig();

  // hard opt-out path first (spam compliance)
  const lower = message.trim().toLowerCase();
  if (OPT_OUT_KEYWORDS.includes(lower)) {
    const optRule = rules.find((r) => r.action === 'opt_out' && r.isActive);
    if (optRule) bumpRuleMatch(optRule.id);
    return {
      reply:
        optRule?.replyText ||
        'تم إلغاء اشتراكك بنجاح من قوائم الرسائل الترويجية لدينا. لن تتلقى أي رسائل جديدة. إذا رغبت بالاشتراك مجدداً أرسل "اشتراك".',
      action: 'opt_out',
      source: 'rule-engine',
      ruleId: optRule?.id,
      isOptOut: true,
    };
  }

  // keyword rules
  for (const rule of rules) {
    if (!rule.isActive || rule.triggerType === 'fallback') continue;
    if (ruleMatches(rule, message)) {
      bumpRuleMatch(rule.id);
      return {
        reply: rule.replyText,
        action: rule.action === 'reply' ? 'bot_reply' : rule.action,
        source: 'keyword-rules',
        ruleId: rule.id,
        isOptOut: false,
      };
    }
  }

  // Smart AI (Gemini -> Groq auto-fallback, if enabled + configured)
  if (config.enabled) {
    const system = `${config.persona}\nقواعد هامة:\n1. حافظ على الإيجاز والوضوح المناسب لرسائل الواتساب (فقرات قصيرة).\n2. معلومات العمل: ${config.knowledgeBase || 'لا توجد معلومات إضافية'}.\n3. الرد باللغة العربية حصراً ما لم يتحدث العميل بلغة أخرى.`;
    const reply = await aiChat(
      system,
      [...history, { role: 'user', text: message }],
      config.temperature ?? 0.7,
    );
    if (reply) return { reply: reply.text, action: 'bot_reply', source: reply.provider, isOptOut: false };
  }

  // fallback rule or generic reply
  const fallback = rules.find((r) => r.isActive && r.triggerType === 'fallback');
  if (fallback) {
    bumpRuleMatch(fallback.id);
    return {
      reply: fallback.replyText,
      action: fallback.action === 'reply' ? 'bot_reply' : fallback.action,
      source: 'keyword-rules',
      ruleId: fallback.id,
      isOptOut: false,
    };
  }

  return {
    reply: 'أهلاً بك! 👋\nتم استلام رسالتك وسيقوم فريقنا بالرد عليك في أقرب وقت. كيف يمكننا خدمتك اليوم؟',
    action: 'bot_reply',
    source: 'generic-fallback',
    isOptOut: false,
  };
}

// ---------------------------------------------------------------- conversations
function nowIso() {
  return new Date().toISOString();
}

function saveConversations(list: Conversation[]) {
  void writeJSON('conversations', list);
  emit({ type: 'conversations' });
}

export function findOrCreateConversation(msg: IncomingMessage): { list: Conversation[]; conv: Conversation } {
  const list = getConversations();
  // one thread per (account, customer) — each number is a separate WhatsApp identity
  let conv = list.find((c) => c.accountId === msg.accountId && c.contactPhone === msg.phone);
  if (!conv) {
    // legacy threads created before multi-account: adopt them into this account
    conv = list.find((c) => !c.accountId && c.contactPhone === msg.phone);
    if (conv) conv.accountId = msg.accountId;
  }
  if (!conv) {
    conv = {
      id: `conv-${msg.accountId}-${msg.phone}`,
      accountId: msg.accountId,
      contactId: '',
      contactName: msg.name || msg.phone,
      contactPhone: msg.phone,
      avatar: '',
      unreadCount: 0,
      lastMessageTime: new Date().toLocaleString('ar-EG'),
      botActive: getBotConfig().enabled,
      tags: [],
      messages: [],
    };
    list.unshift(conv);
  }
  return { list, conv };
}

export async function handleIncomingMessage(msg: IncomingMessage) {
  const { list, conv } = findOrCreateConversation(msg);

  const chatMsg: ChatMessage = {
    id: `m-${msg.id}`,
    sender: 'user',
    text: msg.text,
    timestamp: new Date(msg.timestamp).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    status: 'delivered',
    media: msg.media,
  };
  conv.messages.push(chatMsg);
  conv.unreadCount += 1;
  conv.lastMessageTime = chatMsg.timestamp;
  if (msg.name && (!conv.contactName || conv.contactName === conv.contactPhone)) conv.contactName = msg.name;

  // link to a known contact when possible
  if (!conv.contactId) {
    const contact = getContacts().find((c) => c.phone.replace(/[^0-9]/g, '') === msg.phone);
    if (contact) {
      conv.contactId = contact.id;
      conv.contactName = contact.name;
    }
  }

  saveConversations(list);
  emit({ type: 'stats' });

  // auto-reply path
  if (!conv.botActive) return;

  const config = getBotConfig();
  const autoHandover = (config.autoHandoverKeywords || []).some(
    (k) => k && msg.text.toLowerCase().includes(k.toLowerCase()),
  );
  if (autoHandover) {
    conv.botActive = false;
    saveConversations(list);
    return;
  }

  const history = conv.messages.slice(-8).map((m) => ({
    role: m.sender === 'user' ? 'user' : 'model',
    text: m.text,
  }));
  const answer = await answerBot(msg.text, history);

  if (answer.isOptOut) {
    // mark contact opted out
    const contacts = getContacts();
    const contact = contacts.find((c) => c.phone.replace(/[^0-9]/g, '') === msg.phone);
    if (contact) {
      contact.status = 'opt_out';
      void writeJSON('contacts', contacts);
    }
  }
  if (answer.action === 'assign_agent') conv.botActive = false;

  // reply from the same account the customer wrote to
  const res = await wa.routeSend(msg.phone, answer.reply, null, { accountId: msg.accountId });
  const botMsg: ChatMessage = {
    id: `m-bot-${Date.now()}`,
    sender: 'bot',
    text: answer.reply,
    timestamp: new Date().toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    status: res.success ? 'sent' : 'failed',
    isAiGenerated: answer.source === 'gemini',
  };
  const fresh = getConversations();
  const target = fresh.find((c) => c.id === conv.id);
  if (target) {
    target.messages.push(botMsg);
    target.lastMessageTime = botMsg.timestamp;
    if (answer.action === 'assign_agent') target.botActive = false;
    saveConversations(fresh);
  }
  if (res.success) {
    bumpStat('sent');
    bumpStat('delivered');
    bumpStat('replied');
  }
}

// ---------------------------------------------------------------- send queue + campaign worker
export interface SendJob {
  id: string;
  phone: string;
  text: string;
  mediaType?: 'none' | 'image' | 'video' | 'document' | 'audio';
  mediaUrl?: string;
  mediaName?: string;
  variables?: Record<string, string>;
  campaignId?: string | null;
  /** pinned account id, or null = smart auto rotation */
  accountId?: string | null;
  /** campaign account scope */
  scopeIds?: string[];
  fast?: boolean;
  createdAt: number;
  /** user-approved resend: skip all duplicate guards for this job */
  force?: boolean;
  /** park-and-retry attempts for infrastructure hiccups */
  attempts?: number;
  /** hash نص الرسالة — لمنع إعادة نفس الرسالة */
  messageHash?: string;
}

/** park the job and wait instead of burning it when WhatsApp infra hiccups */
const MAX_PARK_ATTEMPTS = 40; // ~10 minutes of 15s waits
const PARK_WAIT_MS = 15_000;

export interface SendLogEntry {
  id: string;
  jobId?: string;
  phone: string;
  accountName?: string;
  campaignId?: string | null;
  status: 'sent' | 'failed';
  messageId?: string;
  error?: string;
  delaySeconds?: number;
  timestamp: string;
  /** epoch ms — for report timelines */
  ts: number;
  /** hash نص الرسالة — لمنع إعادة نفس الرسالة */
  messageHash?: string;
}

const queue: SendJob[] = [];
let sendLog: SendLogEntry[] = readJSON<SendLogEntry[]>('sendlog', []);
let workerRunning = false;
let campaignsFlushTimer: NodeJS.Timeout | null = null;

// hourly throttle state
let hourWindowStart = Date.now();
let sentThisHour = 0;
// batch state per campaign
const batchState = new Map<string, { sent: number; pausedUntil: number }>();

function campaignsDirty() {
  if (campaignsFlushTimer) return;
  campaignsFlushTimer = setTimeout(() => {
    campaignsFlushTimer = null;
    emit({ type: 'campaigns' });
    emit({ type: 'stats' });
  }, 1500);
}

function saveCampaigns(camps: Campaign[]) {
  void writeJSON('campaigns', camps);
  campaignsDirty();
}

function pushLog(entry: Omit<SendLogEntry, 'ts'> & { ts?: number }) {
  const full: SendLogEntry = { ts: Date.now(), ...entry };
  sendLog.unshift(full);
  sendLog = sendLog.slice(0, 300);
  void writeJSON('sendlog', sendLog);
  emit({ type: 'sendlog' });
}

export function getQueueStatus() {
  return {
    pending: queue.length,
    sentThisHour,
    hourWindowStart,
    log: sendLog.slice(0, 60),
    jobs: queue.slice(0, 50).map((j) => ({
      phone: j.phone,
      hasMedia: !!j.mediaUrl,
      mediaType: j.mediaType,
      attempts: j.attempts || 0,
      campaignId: j.campaignId,
      accountId: j.accountId,
      waitingSec: Math.round((Date.now() - j.createdAt) / 1000),
    })),
  };
}

export function enqueueJobs(jobs: SendJob[]) {
  queue.push(...jobs);
  void startWorker();
  return jobs.map((j) => j.id);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function jitterDelayMs(minSec: number, maxSec: number) {
  const lo = Math.max(1, Math.min(minSec, maxSec));
  const hi = Math.max(lo, maxSec);
  const base = lo + Math.random() * (hi - lo);
  const jitter = (Math.random() - 0.5) * 0.7; // ±0.35s human jitter
  return Math.max(1000, (base + jitter) * 1000);
}

async function startWorker() {
  if (workerRunning) return;
  workerRunning = true;
  void workerLoop().finally(() => {
    workerRunning = false;
  });
}

async function workerLoop() {
  while (queue.length > 0) {
    const job = queue[0];

    // drop jobs for finished/cancelled campaigns
    let campaign: Campaign | undefined;
    if (job.campaignId) {
      const camps = getCampaigns();
      campaign = camps.find((c) => c.id === job.campaignId);
      if (!campaign || campaign.status === 'completed' || campaign.status === 'draft') {
        queue.shift();
        continue;
      }
      if (campaign.status === 'paused' || campaign.status === 'scheduled') {
        await sleep(1500);
        continue;
      }
    }

    const cfg: AntiBlockConfig = campaign?.antiBlockConfig || getAntiBlock();

    // display counter window (per-account caps are enforced by the smart router)
    const now = Date.now();
    if (now - hourWindowStart > 3600_000) {
      hourWindowStart = now;
      sentThisHour = 0;
    }

    // batch pause
    if (job.campaignId && cfg.batchSize > 0) {
      const bs = batchState.get(job.campaignId) || { sent: 0, pausedUntil: 0 };
      if (Date.now() < bs.pausedUntil) {
        await sleep(2000);
        continue;
      }
      if (bs.sent >= cfg.batchSize) {
        bs.sent = 0;
        bs.pausedUntil = Date.now() + Math.max(0, cfg.batchPauseMinutes) * 60_000;
        batchState.set(job.campaignId, bs);
        await sleep(2000);
        continue;
      }
    }

    // inter-message delay (hard floor 12s even if user lowers settings)
    const delayMs = job.fast
      ? jitterDelayMs(1, 2.5)
      : jitterDelayMs(Math.max(12, cfg.minDelaySeconds), Math.max(15, cfg.maxDelaySeconds));
    await sleep(delayMs);

    const consumed = queue.shift();
    if (!consumed) continue;

    // resolve first, then dedupe on the FINAL text: two recipients getting
    // different names/spintax resolutions are never counted as duplicates
    const text = resolveSpintax(consumed.text, consumed.variables || {});
    const resolvedHash = messageHash(text);
    if (!consumed.force && hasBeenSent(consumed.phone, resolvedHash)) continue;

    const media =
      consumed.mediaType && consumed.mediaType !== 'none' && consumed.mediaUrl
        ? {
            type: consumed.mediaType as 'image' | 'video' | 'audio' | 'document',
            url: consumed.mediaUrl,
            name: consumed.mediaName,
          }
        : null;
    // smart routing: pinned account or auto rotation with retry + cooldown
    let result = await wa.routeSend(consumed.phone, text, media, {
      accountId: consumed.accountId || null,
      scopeIds: consumed.scopeIds,
    });

    if (!result.success && result.infra !== false) {
      // infrastructure hiccup (reconnecting / capped / cooling / timeout):
      // park the job and wait instead of burning the recipient as failed
      const attempts = (consumed.attempts || 0) + 1;
      if (attempts < MAX_PARK_ATTEMPTS) {
        consumed.attempts = attempts;
        queue.unshift(consumed);
        if (attempts === 1) console.log(`[queue] parking ${consumed.phone}, waiting for accounts...`);
        await sleep(PARK_WAIT_MS);
        continue;
      }
      result = {
        ...result,
        error: 'تعذر الإرسال بعد عدة محاولات. تحقق من اتصال حسابات الواتساب ثم أعد المحاولة.',
      };
    }

    if (result.success) {
      sentThisHour += 1;
      bumpStat('sent');
      bumpStat('delivered'); // accepted by WhatsApp server = delivered to server
      if (job.campaignId) {
        const bs = batchState.get(job.campaignId) || { sent: 0, pausedUntil: 0 };
        bs.sent += 1;
        batchState.set(job.campaignId, bs);
        const camps = getCampaigns();
        const cmp = camps.find((c) => c.id === job.campaignId);
        if (cmp) {
          cmp.sentCount += 1;
          cmp.deliveredCount += 1;
          cmp.progressPercent = cmp.totalRecipients > 0 ? Math.min(100, Math.round((cmp.sentCount / cmp.totalRecipients) * 100)) : 100;
          if (cmp.sentCount >= cmp.totalRecipients && queue.every((j) => j.campaignId !== job.campaignId)) {
            cmp.status = 'completed';
            cmp.progressPercent = 100;
            cmp.completedAt = new Date().toISOString();
            saveCampaigns(camps);
            saveCampaignSnapshot({ ...cmp });
            // foundation hooks (additive: notify + audit, never throw)
            try {
              const { notify } = await import('./modules/notifications/service');
              const { audit } = await import('./modules/audit/service');
              notify('campaign.completed', `اكتملت حملة ${cmp.name}`, `${cmp.sentCount} مرسلة / ${cmp.failedCount} فاشلة`);
              audit('campaign.completed', { module: 'campaigns', entity: cmp.id, detail: cmp.name });
            } catch {
              /* ignore */
            }
          } else {
            saveCampaigns(camps);
          }
        }
      }
      pushLog({
        id: `log-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
        jobId: consumed.id,
        phone: consumed.phone,
        accountName: result.accountName,
        campaignId: consumed.campaignId,
        status: 'sent',
        messageId: result.messageId,
        delaySeconds: Math.round(delayMs / 100) / 10,
        timestamp: new Date().toLocaleString('ar-EG'),
        messageHash: resolvedHash,
      });
    } else {
      bumpStat('failed');
      if (job.campaignId) {
        const camps = getCampaigns();
        const cmp = camps.find((c) => c.id === job.campaignId);
        if (cmp) {
          cmp.failedCount += 1;
          saveCampaigns(camps);
        }
      }
      pushLog({
        id: `log-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
        jobId: consumed.id,
        phone: consumed.phone,
        campaignId: consumed.campaignId,
        status: 'failed',
        error: result.error,
        timestamp: new Date().toLocaleString('ar-EG'),
      });
    }
  }
}

// ---------------------------------------------------------------- campaigns
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function resolveRecipients(campaign: Campaign): string[] {
  const contacts = getContacts().filter((c) => c.status === 'active');
  let phones: string[];
  const tag = campaign.audienceTag;
  if (tag && tag.startsWith('group:')) {
    const g = getGroups().find((x) => x.id === tag.slice(6));
    if (g) {
      const set = new Set<string>();
      (g.phones || []).forEach((p) => set.add(p));
      contacts.forEach((c) => {
        const hitTag = g.tag && c.tags.includes(g.tag);
        const hitRegion = g.region && (c.region === g.region || c.tags.includes(g.region) || c.tags.includes(`منطقة:${g.region}`));
        if ((g.tag || g.region) ? (hitTag || hitRegion) : false) set.add(c.phone);
      });
      phones = [...set];
    } else phones = [];
  } else if (tag && tag !== 'all') {
    phones = contacts.filter((c) => c.tags.includes(tag as string)).map((c) => c.phone);
  } else {
    phones = contacts.map((c) => c.phone);
  }
  if (campaign.manualPhones?.length) phones = [...phones, ...campaign.manualPhones];

  // normalize + dedupe + validate
  const seen = new Set<string>();
  const cfg = campaign.antiBlockConfig || getAntiBlock();
  const out: string[] = [];
  for (const raw of phones) {
    const clean = String(raw || '').replace(/[^0-9]/g, '');
    if (clean.length < 9 || clean.length > 15) {
      if (!cfg.filterInvalidNumbers) {
        /* keep anyway */
      } else continue;
    }
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return cfg.randomizeSendOrder ? shuffle(out) : out;
}

export function startCampaign(id: string, force = false): { ok: boolean; error?: string; skipped?: number } {
  const camps = getCampaigns();
  const cmp = camps.find((c) => c.id === id);
  if (!cmp) return { ok: false, error: 'الحملة غير موجودة.' };
  const scopeIds = cmp.accountIds && cmp.accountIds.length ? cmp.accountIds : undefined;
  const usable = wa
    .listAccounts()
    .filter((a) => !a.paused && (!scopeIds || scopeIds.includes('all') || scopeIds.includes(a.id)));
  if (!usable.length) {
    return { ok: false, error: 'لا توجد حسابات متاحة لهذه الحملة. فعّل حساباً أولاً.' };
  }
  // NOTE: sessions may be reconnecting right now — jobs park in the queue
  // and send automatically once an account is back instead of failing

  const recipients = resolveRecipients(cmp);
  if (recipients.length === 0)
    return { ok: false, error: 'لا توجد أرقام صالحة في الجمهور المستهدف. أضف جهات اتصال أولاً.' };

  // message rotation: template + variants distributed round-robin over
  // (already shuffled) recipients so no two consecutive sends look alike
  const texts = [cmp.messageTemplate, ...((cmp.messageVariants || []).filter((t) => t && t.trim()))];
  const hashes = texts.map((t) => messageHash(t));
  const fresh =
    force || texts.length > 1
      ? recipients
      : recipients.filter((p) => !hasBeenSent(p, hashes[0]));
  const skipped = recipients.length - fresh.length;

  cmp.recipientPhones = fresh;
  cmp.totalRecipients = fresh.length;
  if (!fresh.length)
    return { ok: false, error: `كل الأرقام (${recipients.length}) استلمت نفس الرسالة من قبل. غيّر النص أو اختر جمهوراً جديداً.` };
  cmp.sentCount = 0;
  cmp.deliveredCount = 0;
  cmp.readCount = 0;
  cmp.repliedCount = 0;
  cmp.failedCount = 0;
  cmp.progressPercent = 0;
  cmp.status = 'running';
  cmp.scheduledFor = undefined;
  cmp.scheduledAt = undefined;
  saveCampaigns(camps);

  const jobs: SendJob[] = fresh.map((phone, i) => {
    const contact = getContacts().find((c) => c.phone.replace(/[^0-9]/g, '') === phone);
    const variantIdx = texts.length > 1 ? i % texts.length : 0;
    return {
      id: `job-${Date.now()}-${phone}-${Math.floor(Math.random() * 99999)}`,
      phone,
      text: texts[variantIdx],
      messageHash: hashes[variantIdx],
      mediaType: cmp.media?.type === 'audio' ? 'audio' : cmp.media?.type,
      mediaUrl: cmp.media?.url,
      mediaName: cmp.media?.name,
      variables: { name: contact?.name || '' } as Record<string, string>,
      campaignId: cmp.id,
      force,
      scopeIds: cmp.accountIds && cmp.accountIds.length ? cmp.accountIds : undefined,
      createdAt: Date.now(),
    };
  });
  enqueueJobs(jobs);
  return { ok: true, skipped };
}

export function setCampaignStatus(id: string, status: Campaign['status']): boolean {
  const camps = getCampaigns();
  const cmp = camps.find((c) => c.id === id);
  if (!cmp) return false;
  if (status === 'draft' || status === 'completed') {
    // stop: drop queued jobs
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].campaignId === id) queue.splice(i, 1);
    }
  }
  cmp.status = status;
  if (status === 'completed') {
    if (!cmp.completedAt) cmp.completedAt = new Date().toISOString();
    saveCampaigns(camps);
    saveCampaignSnapshot({ ...cmp });
  } else {
    saveCampaigns(camps);
  }
  return true;
}

// ---------------------------------------------------------------- campaign reports
export interface RecipientReport {
  phone: string;
  status: 'sent' | 'failed' | 'pending';
  accountName?: string;
  error?: string;
  ts?: number;
}

export interface CampaignReport {
  campaignId: string;
  campaignName: string;
  generatedAt: string;
  final: boolean;
  summary: {
    total: number;
    sent: number;
    failed: number;
    pending: number;
    replied: number;
    deliveryRate: number;
    failRate: number;
    startedAt?: string;
    completedAt?: string;
    durationMinutes?: number;
  };
  recipients: RecipientReport[];
}

function buildRecipientStatuses(cmp: Campaign): RecipientReport[] {
  const latest = new Map<string, SendLogEntry>();
  for (const entry of sendLog) {
    if (entry.campaignId !== cmp.id) continue;
    if (!latest.has(entry.phone)) latest.set(entry.phone, entry);
  }
  const phones = cmp.recipientPhones?.length
    ? cmp.recipientPhones
    : latest.size
      ? [...latest.keys()]
      : [];
  return phones.map((phone) => {
    const e = latest.get(phone);
    if (!e) return { phone, status: 'pending' as const };
    return {
      phone,
      status: e.status,
      accountName: e.accountName,
      error: e.error,
      ts: e.ts,
    };
  });
}

export function saveCampaignSnapshot(cmp: Campaign) {
  const report = buildReport(cmp, true);
  const all = readJSON<Record<string, CampaignReport>>('reports', {});
  all[cmp.id] = report;
  void writeJSON('reports', all);
}

export function buildReport(cmp: Campaign, final: boolean): CampaignReport {
  const recipients = buildRecipientStatuses(cmp);
  const sent = recipients.filter((r) => r.status === 'sent').length;
  const failed = recipients.filter((r) => r.status === 'failed').length;
  const pending = recipients.filter((r) => r.status === 'pending').length;
  const total = cmp.totalRecipients || recipients.length;
  let durationMinutes: number | undefined;
  if (cmp.completedAt && cmp.createdAt) {
    const start = new Date(cmp.createdAt).getTime();
    // createdAt is a locale string; fall back to first log entry
    const firstTs = recipients.map((r) => r.ts || 0).filter(Boolean).sort((a, b) => a - b)[0];
    const base = Number.isNaN(start) ? firstTs : Math.min(Number.isNaN(start) ? Infinity : start, firstTs || Infinity);
    if (base && Number.isFinite(base)) {
      durationMinutes = Math.max(0, Math.round((new Date(cmp.completedAt).getTime() - base) / 60000));
    }
  }
  return {
    campaignId: cmp.id,
    campaignName: cmp.name,
    generatedAt: new Date().toISOString(),
    final,
    summary: {
      total,
      sent,
      failed,
      pending,
      replied: cmp.repliedCount || 0,
      deliveryRate: total > 0 ? Math.round((sent / total) * 1000) / 10 : 0,
      failRate: total > 0 ? Math.round((failed / total) * 1000) / 10 : 0,
      startedAt: cmp.createdAt,
      completedAt: cmp.completedAt,
      durationMinutes,
    },
    recipients,
  };
}

/** saved snapshot if the campaign finished, otherwise a live report */
export function getCampaignReport(id: string): CampaignReport | null {
  const cmp = getCampaigns().find((c) => c.id === id);
  if (!cmp) return null;
  if (cmp.status === 'completed') {
    const all = readJSON<Record<string, CampaignReport>>('reports', {});
    if (all[id]) return all[id];
  }
  return buildReport(cmp, cmp.status === 'completed');
}

// scheduler: fires scheduled campaigns whose time arrived
export function startScheduler() {
  setInterval(() => {
    const camps = getCampaigns();
    let changed = false;
    for (const cmp of camps) {
      if (cmp.status === 'scheduled' && cmp.scheduledAt) {
        const when = new Date(cmp.scheduledAt).getTime();
        const anyConnected = wa.listAccounts().some((a) => a.state === 'connected');
        if (!Number.isNaN(when) && when <= Date.now() && anyConnected) {
          console.log(`[scheduler] firing campaign ${cmp.id}`);
          const res = startCampaign(cmp.id);
          if (!res.ok) {
            cmp.status = 'paused';
            changed = true;
          }
          // startCampaign already saved; reload
          return;
        }
      }
    }
    if (changed) saveCampaigns(camps);
  }, 30_000);
}

// ---------------------------------------------------------------- WhatsApp number checker (background jobs)
export interface CheckJob {
  id: string;
  total: number;
  done: number;
  status: 'running' | 'done' | 'error';
  results: Array<{ phone: string; exists: boolean }>;
  error?: string;
  accountName?: string;
  appliedInvalid?: number;
}

const checkJobs = new Map<string, CheckJob>();

function applyCheckResults(results: Array<{ phone: string; exists: boolean }>): number {
  const contacts = getContacts();
  const byPhone = new Map(contacts.map((c) => [c.phone.replace(/[^0-9]/g, ''), c]));
  const now = new Date().toISOString();
  let marked = 0;
  for (const r of results) {
    const c = byPhone.get(r.phone);
    if (!c) continue;
    c.lastChecked = now;
    c.onWhatsapp = r.exists;
    if (!r.exists && c.status === 'active') {
      c.status = 'invalid';
      marked++;
    } else if (r.exists && c.status === 'invalid') {
      c.status = 'active';
    }
  }
  void writeJSON('contacts', contacts);
  return marked;
}

export function startCheckJob(phones: string[], accountId?: string | null, autoApply = true): string {
  const clean = [...new Set(phones.map((p) => String(p || '').replace(/[^0-9]/g, '')).filter((p) => p.length >= 9 && p.length <= 15))].slice(0, 2000);
  const id = `chk-${Date.now().toString(36)}`;
  const job: CheckJob = { id, total: clean.length, done: 0, status: 'running', results: [] };
  checkJobs.set(id, job);
  if (checkJobs.size > 20) {
    const oldest = [...checkJobs.keys()][0];
    checkJobs.delete(oldest);
  }
  void (async () => {
    try {
      const results = await wa.checkNumbers(clean, accountId || null, (done, total) => {
        job.done = done;
        job.total = total;
      });
      job.results = results.map((r) => ({ phone: r.phone, exists: r.exists }));
      job.done = results.length;
      job.total = results.length;
      job.status = 'done';
      if (autoApply) job.appliedInvalid = applyCheckResults(job.results);
      emit({ type: 'stats' });
    } catch (err: any) {
      job.status = 'error';
      job.error = err?.message || 'فشل الفحص.';
    }
  })();
  return id;
}

export function getCheckJob(id: string): CheckJob | null {
  return checkJobs.get(id) || null;
}

// ---------------------------------------------------------------- api keys
export function validateApiKey(raw?: string): ApiKeyItem | null {
  if (!raw) return null;
  const key = String(raw).replace(/^Bearer\s+/i, '').trim();
  const found = getApiKeys().find((k) => k.fullKey === key && k.status === 'active');
  return found || null;
}

export function touchApiKey(id: string) {
  const keys = getApiKeys();
  const k = keys.find((x) => x.id === id);
  if (!k) return;
  k.lastUsedDate = new Date().toLocaleString('ar-EG');
  void writeJSON('api-keys', keys);
}
