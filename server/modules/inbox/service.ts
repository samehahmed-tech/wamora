import { readJSON, writeJSON } from '../../store';

export type InboxChannel = 'whatsapp' | 'messenger' | 'instagram';

export interface UnifiedThread {
  key: string;
  channel: InboxChannel;
  name: string;
  handle: string;
  lastMessage: string;
  ts: number;
  unread: number;
  assignedTo: string;
  tags: string[];
  notesCount: number;
}

export interface ThreadNote {
  at: string;
  author: string;
  text: string;
}

interface ThreadMeta {
  assignedTo: string;
  tags: string[];
  notes: ThreadNote[];
}

const KEY = 'inbox-meta';

function metaAll(): Record<string, ThreadMeta> {
  return readJSON<Record<string, ThreadMeta>>(KEY, {});
}

function blank(): ThreadMeta {
  return { assignedTo: '', tags: [], notes: [] };
}

function lastText(msgs: Array<{ text?: string; message?: string }>): string {
  for (let i = msgs.length - 1; i >= 0; i--) {
    const t = String(msgs[i]?.text ?? (msgs[i] as any)?.message ?? '').trim();
    if (t) return t.length > 120 ? `${t.slice(0, 120)}…` : t;
  }
  return '';
}

/** read-only merge of WhatsApp + Meta threads (no existing data touched) */
export function getUnifiedInbox(): UnifiedThread[] {
  const meta = metaAll();
  const out: UnifiedThread[] = [];

  const wa = readJSON<any[]>('conversations', []);
  for (const c of wa) {
    const key = `wa:${c.id}`;
    const m = meta[key] || blank();
    const msgs = Array.isArray(c.messages) ? c.messages : [];
    out.push({
      key,
      channel: 'whatsapp',
      name: String(c.contactName || c.contactPhone || ''),
      handle: String(c.contactPhone || ''),
      lastMessage: lastText(msgs),
      ts: msgs.length && msgs[msgs.length - 1]?.ts ? Number(msgs[msgs.length - 1].ts) : Date.parse(String(c.lastMessageTime || '')) || 0,
      unread: Number(c.unreadCount || 0),
      assignedTo: m.assignedTo,
      tags: m.tags,
      notesCount: m.notes.length,
    });
  }

  const mc = readJSON<any[]>('meta-conversations', []);
  for (const c of mc) {
    const key = `meta:${c.psid}`;
    const m = meta[key] || blank();
    out.push({
      key,
      channel: c.channel === 'instagram' ? 'instagram' : 'messenger',
      name: String(c.name || c.psid || ''),
      handle: String(c.psid || ''),
      lastMessage: lastText(Array.isArray(c.messages) ? c.messages : []),
      ts: Number(c.updatedAt || 0),
      unread: Number(c.unread || 0),
      assignedTo: m.assignedTo,
      tags: m.tags,
      notesCount: m.notes.length,
    });
  }

  // WA ChatMessage has no epoch ts and lastMessageTime is locale text:
  // keep engine untouched — sort unread first, then by recency where known
  return out.sort((a, b) => b.unread - a.unread || b.ts - a.ts).slice(0, 500);
}

export function assignThread(key: string, assignedTo: string) {
  const all = metaAll();
  const m = all[key] || blank();
  m.assignedTo = String(assignedTo || '');
  all[key] = m;
  void writeJSON(KEY, all);
}

export function tagThread(key: string, tags: string[]) {
  const all = metaAll();
  const m = all[key] || blank();
  m.tags = [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 20);
  all[key] = m;
  void writeJSON(KEY, all);
}

export function addThreadNote(key: string, author: string, text: string): ThreadNote {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('نص الملاحظة مطلوب.');
  const all = metaAll();
  const m = all[key] || blank();
  const note: ThreadNote = { at: new Date().toISOString(), author: String(author || 'موظف'), text: clean.slice(0, 1000) };
  m.notes.unshift(note);
  m.notes = m.notes.slice(0, 200);
  all[key] = m;
  void writeJSON(KEY, all);
  return note;
}

export function getThreadNotes(key: string): ThreadNote[] {
  return (metaAll()[key] || blank()).notes;
}
