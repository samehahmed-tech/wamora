import React, { useState, useEffect, useCallback } from 'react';
import { Inbox, StickyNote } from 'lucide-react';
import { get, post } from '../api';
import { Button, Field, Input, Select, Badge } from './kit';
import { Card, SectionHeader } from './ui';

interface Thread {
  key: string;
  channel: string;
  name: string;
  handle: string;
  lastMessage: string;
  unread: number;
  assignedTo: string;
  tags: string[];
  notesCount: number;
}

interface Note {
  at: string;
  author: string;
  text: string;
}

const CHANNEL_AR: Record<string, string> = { whatsapp: 'واتساب', messenger: 'مسنجر', instagram: 'IG' };

export const UnifiedInboxView: React.FC = () => {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [q, setQ] = useState('');
  const [channel, setChannel] = useState('all');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [assignee, setAssignee] = useState('');
  const [noteText, setNoteText] = useState('');

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (channel !== 'all') params.set('channel', channel);
      if (q.trim()) params.set('q', q.trim());
      setThreads((await get<Thread[]>(`/api/v2/inbox?${params.toString()}`)) || []);
    } catch {
      /* ignore */
    }
  }, [channel, q]);

  useEffect(() => {
    const t = setTimeout(refresh, 300);
    return () => clearTimeout(t);
  }, [refresh]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  const openThread = async (key: string, assigned: string) => {
    setActiveKey(key);
    setAssignee(assigned);
    try {
      setNotes((await get<Note[]>(`/api/v2/inbox/notes?key=${encodeURIComponent(key)}`)) || []);
    } catch {
      /* ignore */
    }
  };

  const saveAssign = async () => {
    if (!activeKey) return;
    await post('/api/v2/inbox/assign', { key: activeKey, assignedTo: assignee });
    refresh();
  };

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeKey || !noteText.trim()) return;
    await post('/api/v2/inbox/notes', { key: activeKey, text: noteText.trim() });
    setNoteText('');
    openThread(activeKey, assignee);
    refresh();
  };

  const active = threads.find((t) => t.key === activeKey) || null;

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Inbox className="w-5 h-5" />}
        title="صندوق موحد"
        hint="واتساب + ماسنجر + انستاجرام — قراءة وتعيين وملاحظات (الرد من شاشات قنوات)"
        action={<Badge tone="blue">{threads.length} محادثة</Badge>}
      />

      <div className="flex gap-2 flex-wrap">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث اسم / رقم / نص..." className="!w-64" />
        <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="!w-auto">
          <option value="all">كل قنوات</option>
          <option value="whatsapp">واتساب</option>
          <option value="messenger">مسنجر</option>
          <option value="instagram">انستاجرام</option>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-4">
        <Card className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
          {threads.length === 0 && <div className="p-4 text-[11px] text-slate-500 text-center">لا محادثات مطابقة.</div>}
          {threads.map((t) => (
            <button
              key={t.key}
              onClick={() => openThread(t.key, t.assignedTo)}
              className={`w-full text-right p-2.5 rounded-xl transition cursor-pointer ${t.key === activeKey ? 'bg-emerald-500/10 border border-emerald-500/30' : 'hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold truncate">{t.name}</span>
                <span className="flex items-center gap-1.5">
                  <Badge tone={t.channel === 'whatsapp' ? 'green' : t.channel === 'instagram' ? 'amber' : 'blue'}>{CHANNEL_AR[t.channel] || t.channel}</Badge>
                  {t.unread > 0 && <Badge tone="green">{t.unread}</Badge>}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 truncate mt-0.5">{t.lastMessage}</div>
              {(t.assignedTo || t.notesCount > 0) && (
                <div className="text-[10px] text-slate-400 mt-0.5">{t.assignedTo && `👤 ${t.assignedTo}`} {t.notesCount > 0 && `• 📝 ${t.notesCount}`}</div>
              )}
            </button>
          ))}
        </Card>

        <Card className="p-4 space-y-3 h-fit">
          {!active ? (
            <div className="text-[11px] text-slate-500 text-center">اختر محادثة للتعيين والملاحظات.</div>
          ) : (
            <>
              <div className="text-xs font-bold">{active.name}</div>
              <Field label="تعيين موظف">
                <div className="flex gap-2">
                  <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="اسم موظف..." />
                  <Button size="sm" onClick={saveAssign}>حفظ</Button>
                </div>
              </Field>
              <form onSubmit={addNote} className="space-y-2">
                <Field label="ملاحظة داخلية جديدة">
                  <Input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="اكتب ملاحظة..." />
                </Field>
                <Button type="submit" size="sm" className="w-full" disabled={!noteText.trim()}>
                  <StickyNote className="w-3.5 h-3.5" />
                  <span>إضافة ملاحظة</span>
                </Button>
              </form>
              <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
                {notes.map((n, i) => (
                  <div key={i} className="p-2 rounded-xl border text-[11px]">
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>{n.author}</span>
                      <span>{new Date(n.at).toLocaleString('ar-EG')}</span>
                    </div>
                    <div className="mt-0.5">{n.text}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
};
