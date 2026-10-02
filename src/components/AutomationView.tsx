import React, { useState, useEffect, useCallback } from 'react';
import { Zap, Plus, Trash2, Play, History } from 'lucide-react';
import { get, post, put, del } from '../api';
import { Button, Field, Input, Textarea, Select, Badge, Toggle, toast } from './kit';
import { Card, SectionHeader } from './ui';

interface Step {
  kind: string;
  text?: string;
  tag?: string;
  stage?: string;
  assignee?: string;
  minutes?: number;
  audience?: string;
}

interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
  trigger: { type: string; everyMinutes?: number };
  steps: Step[];
  createdAt: string;
}

interface RunEntry {
  id: string;
  workflowId: string;
  at: string;
  status: string;
  detail: string;
}

const STEP_KINDS = [
  { id: 'send_message', label: 'إرسال رسالة' },
  { id: 'add_tag', label: 'إضافة وسم' },
  { id: 'update_stage', label: 'نقل مرحلة CRM' },
  { id: 'assign', label: 'تعيين موظف' },
  { id: 'notify', label: 'تنبيه' },
  { id: 'wait', label: 'انتظار' },
];

const TRIGGERS = [
  { id: 'manual', label: 'يدوي' },
  { id: 'schedule', label: 'مجدول' },
  { id: 'new_conversation', label: 'محادثة جديدة' },
  { id: 'campaign_completed', label: 'اكتمال حملة' },
];

export const AutomationView: React.FC = () => {
  const [flows, setFlows] = useState<Workflow[]>([]);
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Workflow>({ id: '', name: '', enabled: true, trigger: { type: 'manual', everyMinutes: 60 }, steps: [], createdAt: '' });
  const [runsFor, setRunsFor] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setFlows((await get<Workflow[]>('/api/v2/automations')) || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openRuns = async (id: string) => {
    setRunsFor(id);
    try {
      setRuns((await get<RunEntry[]>(`/api/v2/automations/${id}/runs`)) || []);
    } catch {
      /* ignore */
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast('اسم workflow مطلوب.', 'error');
    try {
      await put('/api/v2/automations', form);
      setEditing(false);
      setForm({ id: '', name: '', enabled: true, trigger: { type: 'manual', everyMinutes: 60 }, steps: [], createdAt: '' });
      toast('تم حفظ workflow.');
      refresh();
    } catch (err: any) {
      toast(err?.message || 'تعذر الحفظ.', 'error');
    }
  };

  const runNow = async (id: string) => {
    try {
      await post(`/api/v2/automations/${id}/run`, {});
      toast('بدأ التنفيذ.');
      if (runsFor === id) openRuns(id);
    } catch (err: any) {
      toast(err?.message || 'تعذر التشغيل.', 'error');
    }
  };

  const toggle = async (w: Workflow) => {
    await put('/api/v2/automations', { ...w, enabled: !w.enabled });
    refresh();
  };

  const addStep = () => {
    if (form.steps.length >= 20) return;
    setForm({ ...form, steps: [...form.steps, { kind: 'send_message', text: '', audience: 'trigger' }] });
  };

  const setStep = (i: number, patch: Partial<Step>) => {
    setForm({ ...form, steps: form.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Zap className="w-5 h-5" />}
        title="محرك الأتمتة"
        hint="workflows: محفز → خطوات — معزول عن باقي نظام"
        action={
          <Button variant="soft" size="sm" onClick={() => { setForm({ id: '', name: '', enabled: true, trigger: { type: 'manual', everyMinutes: 60 }, steps: [], createdAt: '' }); setEditing(!editing); }}>
            <Plus className="w-3.5 h-3.5" />
            <span>{editing ? 'إغلاق' : 'workflow جديد'}</span>
          </Button>
        }
      />

      {editing && (
        <Card className="p-5">
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="الاسم *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="المحفز">
                <Select value={form.trigger.type} onChange={(e) => setForm({ ...form, trigger: { ...form.trigger, type: e.target.value } })}>
                  {TRIGGERS.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </Select>
              </Field>
              {form.trigger.type === 'schedule' && (
                <Field label="كل (دقيقة)"><Input type="number" min={5} value={form.trigger.everyMinutes || 60} onChange={(e) => setForm({ ...form, trigger: { ...form.trigger, everyMinutes: Number(e.target.value) } })} /></Field>
              )}
            </div>
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-slate-500">الخطوات ({form.steps.length}/20) — تنفذ بالترتيب</div>
              {form.steps.map((s, i) => (
                <div key={i} className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <Select value={s.kind} onChange={(e) => setStep(i, { kind: e.target.value })} className="!w-auto">
                      {STEP_KINDS.map((k) => (
                        <option key={k.id} value={k.id}>{k.label}</option>
                      ))}
                    </Select>
                    <Button type="button" variant="danger" size="sm" onClick={() => setForm({ ...form, steps: form.steps.filter((_, j) => j !== i) })}>حذف</Button>
                  </div>
                  {(s.kind === 'send_message' || s.kind === 'notify') && (
                    <Textarea rows={2} value={s.text || ''} onChange={(e) => setStep(i, { text: e.target.value })} placeholder={s.kind === 'send_message' ? 'نص الرسالة...' : 'نص التنبيه...'} />
                  )}
                  {s.kind === 'send_message' && (
                    <div className="flex gap-2">
                      <Select value={s.audience || 'trigger'} onChange={(e) => setStep(i, { audience: e.target.value })} className="!w-auto">
                        <option value="trigger">جمهور المحفز</option>
                        <option value="tag">وسم جهات</option>
                      </Select>
                      {s.audience === 'tag' && <Input value={s.tag || ''} onChange={(e) => setStep(i, { tag: e.target.value })} placeholder="اسم الوسم" className="!w-auto" />}
                    </div>
                  )}
                  {s.kind === 'add_tag' && <Input value={s.tag || ''} onChange={(e) => setStep(i, { tag: e.target.value })} placeholder="اسم الوسم" className="!w-48" />}
                  {s.kind === 'update_stage' && <Input value={s.stage || ''} onChange={(e) => setStep(i, { stage: e.target.value })} placeholder="lead/contacted/interested/negotiation/customer/closed" className="font-mono !w-72" dir="ltr" />}
                  {s.kind === 'assign' && <Input value={s.assignee || ''} onChange={(e) => setStep(i, { assignee: e.target.value })} placeholder="اسم الموظف" className="!w-48" />}
                  {s.kind === 'wait' && <Input type="number" min={0} max={120} value={s.minutes || 0} onChange={(e) => setStep(i, { minutes: Number(e.target.value) })} placeholder="دقائق" className="!w-32" />}
                </div>
              ))}
              <Button type="button" variant="soft" size="sm" onClick={addStep}>+ خطوة</Button>
            </div>
            <div className="flex justify-end"><Button type="submit">حفظ workflow</Button></div>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <Card className="p-2 space-y-1">
          {flows.length === 0 && <div className="p-4 text-[11px] text-slate-500 text-center">لا workflows — أنشئ أول واحد. مثال: محادثة جديدة → وسم + رسالة ترحيب.</div>}
          {flows.map((w) => (
            <div key={w.id} className="p-2.5 rounded-xl border border-transparent hover:border-slate-300 dark:hover:border-slate-700 transition">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold">{w.name}</span>
                  <Badge tone={w.enabled ? 'green' : 'gray'}>{TRIGGERS.find((t) => t.id === w.trigger.type)?.label}</Badge>
                  <span className="text-[10px] text-slate-500">{w.steps.length} خطوات</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="soft" size="sm" onClick={() => runNow(w.id)} title="تشغيل فوري"><Play className="w-3 h-3" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => openRuns(w.id)} title="سجل التنفيذ"><History className="w-3 h-3" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => toggle(w)}>{w.enabled ? 'إيقاف' : 'تفعيل'}</Button>
                  <Button variant="ghost" size="sm" onClick={() => { setForm(w); setEditing(true); }}>تعديل</Button>
                  <Button variant="danger" size="sm" onClick={async () => { if (window.confirm('حذف workflow؟')) { await del(`/api/v2/automations/${w.id}`); refresh(); } }}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            </div>
          ))}
        </Card>
        <Card className="p-4 space-y-2 h-fit">
          <div className="text-sm font-bold">سجل التنفيذ {runsFor ? '' : '(اختر workflow)'}</div>
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {runs.map((r) => (
              <div key={r.id} className="p-2 rounded-xl border text-[11px]">
                <div className="flex items-center justify-between">
                  <Badge tone={r.status === 'ok' ? 'green' : r.status === 'error' ? 'red' : 'amber'}>{r.status}</Badge>
                  <span className="text-[10px] text-slate-500">{new Date(r.at).toLocaleString('ar-EG')}</span>
                </div>
                <div className="mt-1 text-slate-600 dark:text-slate-300">{r.detail}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
