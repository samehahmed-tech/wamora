import React, { useState, useEffect, useCallback } from 'react';
import { Facebook, Send, Unplug, RefreshCw, MessageCircle } from 'lucide-react';
import { get, post } from '../api';
import { Button, Field, Input, Textarea, Badge, Toggle, toast } from './kit';
import { Card, SectionHeader } from './ui';

interface MetaStatus {
  connected: boolean;
  pageId: string;
  pageName: string;
  igConnected: boolean;
  hasToken: boolean;
  autoReplyComments: boolean;
}

export interface MetaConversation {
  psid: string;
  channel: 'messenger' | 'instagram';
  name: string;
  messages: Array<{ id: string; fromMe: boolean; text: string; ts: number }>;
  unread: number;
  updatedAt: number;
}

export const MetaView: React.FC<{ onUnread: (n: number) => void }> = ({ onUnread }) => {
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [convs, setConvs] = useState<MetaConversation[]>([]);
  const [activePsid, setActivePsid] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await get<MetaStatus>('/api/meta/status');
      setStatus(s);
      if (s.connected) {
        const c = await get<MetaConversation[]>('/api/meta/conversations');
        setConvs(c || []);
        onUnread((c || []).reduce((a, x) => a + (x.unread || 0), 0));
      }
    } catch {
      /* ignore */
    }
  }, [onUnread]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    try {
      const s = await post<MetaStatus>('/api/meta/connect', { token: token.trim() });
      setStatus(s);
      setToken('');
      toast('تم ربط الصفحة بنجاح.');
      refresh();
    } catch (err: any) {
      toast(err?.message || 'تعذر الربط.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('فك ربط صفحة فيسبوك؟')) return;
    await post('/api/meta/disconnect');
    setStatus(null);
    setConvs([]);
    onUnread(0);
    refresh();
  };

  const openConv = async (psid: string) => {
    setActivePsid(psid);
    await post('/api/meta/read', { psid }).catch(() => undefined);
    setConvs((prev) => {
      const total = prev.map((c) => (c.psid === psid ? { ...c, unread: 0 } : c));
      onUnread(total.reduce((a, x) => a + x.unread, 0));
      return total;
    });
  };

  const send = async () => {
    if (!activePsid || !draft.trim() || sending) return;
    setSending(true);
    try {
      await post('/api/meta/send', { psid: activePsid, text: draft.trim() });
      const text = draft.trim();
      setDraft('');
      setConvs((prev) =>
        prev.map((c) =>
          c.psid === activePsid
            ? { ...c, messages: [...c.messages, { id: `local-${Date.now()}`, fromMe: true, text, ts: Date.now() }] }
            : c,
        ),
      );
    } catch (err: any) {
      toast(err?.message || 'تعذر الإرسال.', 'error');
    } finally {
      setSending(false);
    }
  };

  const active = convs.find((c) => c.psid === activePsid) || null;

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Facebook className="w-5 h-5" />}
        title="ماسنجر وانستاجرام"
        hint="اربط صفحتك ورد على عملاء ماسنجر وانستاجرام من هنا"
        action={
          status?.connected ? (
            <Badge tone="green">{status.pageName} ✓ {status.igConnected ? '+ IG' : '(بدون IG)'}</Badge>
          ) : (
            <Badge tone="gray">غير مربوط</Badge>
          )
        }
      />

      {!status?.connected ? (
        <Card className="p-6 space-y-4 max-w-xl">
          <div className="text-sm font-bold text-slate-900 dark:text-white">ربط صفحة فيسبوك</div>
          <ol className="text-[11px] text-slate-500 space-y-1 list-decimal list-inside">
            <li>أنشئ App مجاني من <a className="text-emerald-400 underline" href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps</a> (نوع Business)</li>
            <li>أضف منتج Messenger وولّد Page Access Token لصفحتك (صلاحيات: pages_messaging, pages_read_engagement, instagram_manage_messages)</li>
            <li>للانستاجرام: حوّل حسابك Business من Instagram → الإعدادات → نوع الحساب، واربطه بالصفحة</li>
            <li>الصق التوكن هنا — مفتاحك لا يغادر سيرفرك، والتحقق فوري</li>
          </ol>
          <form onSubmit={connect} className="space-y-3">
            <Field label="Page Access Token">
              <Input type="password" dir="ltr" value={token} onChange={(e) => setToken(e.target.value)} placeholder="EAA..." className="font-mono" />
            </Field>
            <Button type="submit" loading={busy} disabled={busy || !token.trim()}>
              ربط الصفحة والتحقق
            </Button>
          </form>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => refresh()}>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث (تلقائي كل 30 ثانية)</span>
            </Button>
            <Button variant="danger" size="sm" onClick={disconnect}>
              <Unplug className="w-3.5 h-3.5" />
              <span>فك الربط</span>
            </Button>
          </div>
          <Toggle
            checked={!!status?.autoReplyComments}
            onChange={async (v) => {
              try {
                const s = await post<MetaStatus>('/api/meta/comments-toggle', { enabled: v });
                setStatus(s);
                toast(v ? 'رد تلقائي على تعليقات مفعّل.' : 'رد تلقائي على تعليقات متوقف.');
              } catch (err: any) {
                toast(err?.message || 'تعذر التبديل.', 'error');
              }
            }}
            label="رد تلقائي على تعليقات (فيسبوك + انستاجرام)"
            hint="نفس بوت وموديل واتساب. يرد على أسئلة حقيقية فقط (؟ أو جملة مفيدة)، تعليق واحد لكل مستخدم."
          />
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
            <Card className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
              {convs.length === 0 && (
                <div className="p-4 text-[11px] text-slate-500 text-center">لا محادثات بعد — تظهر هنا رسائل صفحتك.</div>
              )}
              {convs.map((c) => (
                <button
                  key={c.psid}
                  onClick={() => openConv(c.psid)}
                  className={`w-full text-right p-2.5 rounded-xl transition cursor-pointer ${c.psid === activePsid ? 'bg-emerald-500/10 border border-emerald-500/30' : 'hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{c.name}</span>
                    <Badge tone={c.channel === 'instagram' ? 'amber' : 'blue'}>{c.channel === 'instagram' ? 'IG' : 'مسنجر'}</Badge>
                  </div>
                  {c.unread > 0 && <div className="text-[10px] text-emerald-400 font-bold mt-1">{c.unread} جديدة</div>}
                </button>
              ))}
            </Card>
            <Card className="p-4 flex flex-col min-h-[50vh]">
              {!active ? (
                <div className="flex-1 flex items-center justify-center text-[11px] text-slate-500">
                  <span className="flex items-center gap-2"><MessageCircle className="w-4 h-4" /> اختر محادثة للرد عليها</span>
                </div>
              ) : (
                <>
                  <div className="flex-1 space-y-2 overflow-y-auto max-h-[45vh] mb-3">
                    {active.messages.map((m) => (
                      <div key={m.id} className={`flex ${m.fromMe ? 'justify-start flex-row-reverse' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-2.5 rounded-2xl text-[11px] leading-relaxed whitespace-pre-wrap ${m.fromMe ? 'bg-emerald-500/15 border border-emerald-500/25' : 'bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800'}`}>
                          {m.text || '(مرفق/غير نصي)'}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="اكتب ردك..." />
                    <Button onClick={send} loading={sending} disabled={sending || !draft.trim()}>
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
};
