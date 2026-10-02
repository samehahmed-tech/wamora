import { readJSON, writeJSON } from './store';

const GRAPH = 'https://graph.facebook.com/v21.0';

export interface MetaSettings {
  connected: boolean;
  pageId: string;
  pageName: string;
  igId: string;
  /** Page Access Token — server-side only, never sent to frontend in full */
  token: string;
  /** auto-reply to public comments with the same bot engine (off by default) */
  autoReplyComments: boolean;
  updatedAt: string;
}

export interface MetaMessage {
  id: string;
  fromMe: boolean;
  text: string;
  ts: number;
}

export interface MetaConversation {
  psid: string;
  channel: 'messenger' | 'instagram';
  name: string;
  messages: MetaMessage[];
  unread: number;
  updatedAt: number;
}

const EMPTY: MetaSettings = { connected: false, pageId: '', pageName: '', igId: '', token: '', autoReplyComments: false, updatedAt: '' };

/** incoming texts seen by the last poll, consumed once by the bot loop */
let pendingIncoming: Array<{ psid: string; channel: 'messenger' | 'instagram'; text: string }> = [];
export function takePendingIncoming() {
  const out = pendingIncoming;
  pendingIncoming = [];
  return out;
}

export function getMetaSettings(): MetaSettings {
  return { ...EMPTY, ...readJSON<Partial<MetaSettings>>('meta', {}) };
}

function saveSettings(s: MetaSettings) {
  void writeJSON('meta', { ...s, token: s.token });
}

async function gGet(path: string, token: string, params: Record<string, string> = {}) {
  const q = new URLSearchParams({ access_token: token, ...params }).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`${GRAPH}${path}?${q}`, { signal: controller.signal });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Meta ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** validate a pasted Page Access Token: page identity + linked IG business account */
export async function validateMetaToken(token: string): Promise<{ pageId: string; pageName: string; igId: string }> {
  const me: any = await gGet('/me', token, { fields: 'id,name' });
  if (!me?.id) throw new Error('توكن غير صالح.');
  let igId = '';
  try {
    const page: any = await gGet(`/${me.id}`, token, { fields: 'instagram_business_account' });
    igId = page?.instagram_business_account?.id || '';
  } catch {
    /* page without IG link */
  }
  return { pageId: String(me.id), pageName: String(me.name || 'صفحة'), igId };
}

export async function connectMeta(token: string): Promise<MetaSettings> {
  const clean = String(token || '').trim();
  if (!clean) throw new Error('الصق Page Access Token أولاً.');
  const v = await validateMetaToken(clean);
  const prev = getMetaSettings();
  const s: MetaSettings = { connected: true, token: clean, autoReplyComments: prev.autoReplyComments, updatedAt: new Date().toISOString(), ...v };
  saveSettings(s);
  return s;
}

export function disconnectMeta(): MetaSettings {
  const s: MetaSettings = { ...EMPTY, updatedAt: new Date().toISOString() };
  void writeJSON('meta', s);
  void writeJSON('meta-conversations', []);
  return s;
}

/** public status — token masked */
export function metaStatus() {
  const s = getMetaSettings();
  return {
    connected: s.connected,
    pageId: s.pageId,
    pageName: s.pageName,
    igConnected: !!s.igId,
    igId: s.igId,
    hasToken: !!s.token,
    autoReplyComments: !!s.autoReplyComments,
    updatedAt: s.updatedAt,
  };
}

export function setAutoReplyComments(enabled: boolean) {
  const s = getMetaSettings();
  s.autoReplyComments = enabled === true;
  s.updatedAt = new Date().toISOString();
  saveSettings(s);
  // return from memory: file write is async, re-read would be stale
  return {
    connected: s.connected,
    pageId: s.pageId,
    pageName: s.pageName,
    igConnected: !!s.igId,
    igId: s.igId,
    hasToken: !!s.token,
    autoReplyComments: !!s.autoReplyComments,
    updatedAt: s.updatedAt,
  };
}

export function getMetaConversations(): MetaConversation[] {
  return readJSON<MetaConversation[]>('meta-conversations', []);
}

function saveConversations(list: MetaConversation[]) {
  void writeJSON('meta-conversations', list.slice(0, 200));
}

/** send text to a PSID via the Page (works for messenger + instagram) */
export async function metaSend(psid: string, text: string): Promise<{ messageId: string }> {
  const s = getMetaSettings();
  if (!s.connected || !s.token) throw new Error('اربط صفحة فيسبوك أولاً من إعدادات Meta.');
  const clean = String(text || '').trim();
  if (!clean) throw new Error('النص فارغ.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(`${GRAPH}/${s.pageId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: String(psid) },
        messaging_type: 'RESPONSE',
        message: { text: clean.slice(0, 1900) },
        access_token: s.token,
      }),
      signal: controller.signal,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Meta ${res.status}`);
    return { messageId: String(data?.message_id || '') };
  } finally {
    clearTimeout(timer);
  }
}

/** one polling pass: pull latest threads + messages, merge into local store.
 *  Returns number of NEW incoming messages (for bot auto-reply). */
export async function metaPoll(): Promise<MetaConversation[]> {
  const s = getMetaSettings();
  if (!s.connected || !s.token) return getMetaConversations();
  const list = getMetaConversations();
  const byPsid = new Map(list.map((c) => [c.psid, c]));
  const fresh: MetaConversation[] = [];

  for (const platform of ['messenger', 'instagram'] as const) {
    if (platform === 'instagram' && !s.igId) continue;
    let threads: any[] = [];
    try {
      const data: any = await gGet(`/${s.pageId}/conversations`, s.token, {
        platform,
        fields: 'participants,messages{id,message,from,to,created_time}',
        limit: '25',
      });
      threads = data?.data || [];
    } catch (err: any) {
      console.error(`[meta] poll ${platform}:`, err?.message);
      continue;
    }
    for (const t of threads) {
      const parts: any[] = t?.participants?.data || [];
      // the other side = participant that is not our page/IG account
      const other = parts.find((p) => p.id !== s.pageId && p.id !== s.igId) || parts[0];
      if (!other?.id) continue;
      const psid = String(other.id);
      const msgs: any[] = t?.messages?.data || [];
      let conv = byPsid.get(psid);
      if (!conv) {
        conv = { psid, channel: platform, name: other.name || other.username || psid, messages: [], unread: 0, updatedAt: Date.now() };
        byPsid.set(psid, conv);
      }
      conv.channel = platform;
      if (other.name || other.username) conv.name = other.name || other.username;
      const known = new Set(conv.messages.map((m) => m.id));
      let newCount = 0;
      for (const m of [...msgs].reverse()) {
        if (!m?.id || known.has(m.id)) continue;
        const fromId = String(m?.from?.id || '');
        const fromMe = fromId === s.pageId || fromId === s.igId;
        conv.messages.push({
          id: String(m.id),
          fromMe,
          text: String(m?.message || ''),
          ts: m?.created_time ? Date.parse(m.created_time) : Date.now(),
        });
        if (!fromMe) {
          newCount++;
          if (String(m?.message || '').trim())
            pendingIncoming.push({ psid, channel: platform, text: String(m.message) });
        }
      }
      if (newCount) {
        conv.unread += newCount;
        conv.updatedAt = Date.now();
      }
      fresh.push(conv);
    }
  }
  const merged = [...byPsid.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 200);
  void writeJSON('meta-conversations', merged);
  return merged;
}

export function markMetaRead(psid: string) {
  const list = getMetaConversations();
  const c = list.find((x) => x.psid === psid);
  if (c) {
    c.unread = 0;
    saveConversations(list);
  }
}

export function pushMetaOutgoing(psid: string, text: string) {
  const list = getMetaConversations();
  const c = list.find((x) => x.psid === psid);
  if (c) {
    c.messages.push({ id: `local-${Date.now()}`, fromMe: true, text, ts: Date.now() });
    c.updatedAt = Date.now();
    saveConversations(list);
  }
}

// ---------------------------------------------------------------- comments
export interface MetaComment {
  id: string;
  channel: 'facebook' | 'instagram';
  text: string;
  author: string;
}

function getRepliedComments(): string[] {
  return readJSON<string[]>('meta-replied', []);
}

export function markCommentReplied(id: string) {
  const list = getRepliedComments();
  if (!list.includes(id)) {
    list.unshift(id);
    void writeJSON('meta-replied', list.slice(0, 500));
  }
}

/** spam-safe gate: question mark or a real sentence (not emoji/sticker noise) */
export function commentWorthReply(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (/[؟?]/.test(t)) return true;
  return t.split(/\s+/).filter(Boolean).length > 4;
}

/** one pass over recent FB posts + IG media; returns new unreplied comments */
export async function metaPollComments(): Promise<MetaComment[]> {
  const s = getMetaSettings();
  if (!s.connected || !s.token) return [];
  const replied = new Set(getRepliedComments());
  const out: MetaComment[] = [];

  // Facebook page posts → comments
  try {
    const feed: any = await gGet(`/${s.pageId}/posts`, s.token, {
      fields: 'comments{id,message,from,created_time}',
      limit: '10',
    });
    for (const post of feed?.data || []) {
      for (const c of post?.comments?.data || []) {
        if (!c?.id || replied.has(c.id)) continue;
        if (String(c?.from?.id || '') === s.pageId) continue;
        const text = String(c?.message || '').trim();
        if (!text) continue;
        out.push({ id: String(c.id), channel: 'facebook', text, author: String(c?.from?.name || '') });
      }
    }
  } catch (err: any) {
    console.error('[meta] poll fb comments:', err?.message);
  }

  // Instagram media → comments
  if (s.igId) {
    try {
      const media: any = await gGet(`/${s.igId}/media`, s.token, {
        fields: 'comments{id,text,username,timestamp}',
        limit: '10',
      });
      for (const m of media?.data || []) {
        for (const c of m?.comments?.data || []) {
          if (!c?.id || replied.has(c.id)) continue;
          const text = String(c?.text || '').trim();
          if (!text) continue;
          out.push({ id: String(c.id), channel: 'instagram', text, author: String(c?.username || '') });
        }
      }
    } catch (err: any) {
      console.error('[meta] poll ig comments:', err?.message);
    }
  }
  return out;
}

/** public reply under a comment (FB: comments edge, IG: replies edge) */
export async function metaReplyComment(commentId: string, channel: 'facebook' | 'instagram', text: string): Promise<void> {
  const s = getMetaSettings();
  if (!s.connected || !s.token) throw new Error('اربط صفحة فيسبوك أولاً من إعدادات Meta.');
  const endpoint =
    channel === 'instagram' ? `${GRAPH}/${commentId}/replies` : `${GRAPH}/${commentId}/comments`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: String(text).slice(0, 900), access_token: s.token }),
      signal: controller.signal,
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || `Meta ${res.status}`);
    markCommentReplied(commentId);
  } finally {
    clearTimeout(timer);
  }
}
