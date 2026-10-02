import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Trash2, CheckSquare } from 'lucide-react';
import { get, post, put, del } from '../api';
import { Button, Field, Input, Textarea, Select, Badge, toast } from './kit';
import { Card, SectionHeader } from './ui';

export const STAGES: Array<{ id: string; label: string }> = [
  { id: 'lead', label: 'عميل محتمل' },
  { id: 'contacted', label: 'تم التواصل' },
  { id: 'interested', label: 'مهتم' },
  { id: 'negotiation', label: 'تفاوض' },
  { id: 'customer', label: 'عميل' },
  { id: 'closed', label: 'مغلق' },
];

interface Customer {
  phone: string;
  name: string;
  email: string;
  company: string;
  source: string;
  tags: string[];
  notes: string;
  stage: string;
  assignedTo: string;
}

interface Task {
  id: string;
  title: string;
  customerPhone: string;
  assignedTo: string;
  dueAt: string;
  priority: string;
  status: string;
  notes: string;
}

const emptyCustomer: Customer = { phone: '', name: '', email: '', company: '', source: 'manual', tags: [], notes: '', stage: 'lead', assignedTo: '' };

export const CRMView: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stageFilter, setStageFilter] = useState('all');
  const [form, setForm] = useState<Customer>(emptyCustomer);
  const [editing, setEditing] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPhone, setTaskPhone] = useState('');
  const [taskDue, setTaskDue] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([get<Customer[]>('/api/v2/customers'), get<Task[]>('/api/v2/tasks')]);
      setCustomers(c || []);
      setTasks(t || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const saveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone.replace(/[^0-9]/g, '')) return toast('رقم الهاتف مطلوب.', 'error');
    try {
      await put('/api/v2/customers', { ...form, tags: form.tags });
      setForm(emptyCustomer);
      setEditing(false);
      toast('تم حفظ العميل.');
      refresh();
    } catch (err: any) {
      toast(err?.message || 'تعذر الحفظ.', 'error');
    }
  };

  const moveStage = async (phone: string, stage: string) => {
    try {
      await post(`/api/v2/customers/${phone}/stage`, { stage });
      refresh();
    } catch (err: any) {
      toast(err?.message || 'تعذر النقل.', 'error');
    }
  };

  const removeCustomer = async (phone: string) => {
    if (!window.confirm('حذف العميل من CRM؟ (لا يمس جهات الاتصال)')) return;
    await del(`/api/v2/customers/${phone}`);
    refresh();
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    try {
      await post('/api/v2/tasks', { title: taskTitle.trim(), customerPhone: taskPhone, dueAt: taskDue });
      setTaskTitle('');
      setTaskPhone('');
      setTaskDue('');
      toast('تمت إضافة المهمة.');
      refresh();
    } catch (err: any) {
      toast(err?.message || 'تعذر الإضافة.', 'error');
    }
  };

  const toggleTask = async (t: Task) => {
    await put(`/api/v2/tasks/${t.id}`, { status: t.status === 'done' ? 'todo' : 'done' });
    refresh();
  };

  const filtered = stageFilter === 'all' ? customers : customers.filter((c) => c.stage === stageFilter);
  const openTasks = tasks.filter((t) => t.status !== 'done');

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Users className="w-5 h-5" />}
        title="إدارة العملاء (CRM)"
        hint="ملفات عملاء ومراحل بيع ومهام — منفصل عن جهات الاتصال"
        action={<Badge tone="blue">{customers.length} عميل / {openTasks.length} مهمة مفتوحة</Badge>}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="!w-auto">
          <option value="all">كل المراحل</option>
          {STAGES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </Select>
        <Button variant="soft" size="sm" onClick={() => { setForm(emptyCustomer); setEditing(!editing); }}>
          <Plus className="w-3.5 h-3.5" />
          <span>{editing ? 'إغلاق' : 'عميل جديد'}</span>
        </Button>
      </div>

      {editing && (
        <Card className="p-5">
          <form onSubmit={saveCustomer} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="الهاتف *"><Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="الاسم"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="الشركة"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label="البريد"><Input dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="المصدر"><Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></Field>
            <Field label="مسؤول"><Input value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} /></Field>
            <Field label="المرحلة">
              <Select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="وسوم (فاصلة)"><Input value={form.tags.join(', ')} onChange={(e) => setForm({ ...form, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} /></Field>
            <div className="sm:col-span-2"><Field label="ملاحظات"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field></div>
            <div className="sm:col-span-2 flex justify-end"><Button type="submit">حفظ العميل</Button></div>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <Card className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
          {filtered.length === 0 && <div className="p-4 text-[11px] text-slate-500 text-center">لا عملاء — أضف أول عميل.</div>}
          {filtered.map((c) => (
            <div key={c.phone} className="p-2.5 rounded-xl border border-transparent hover:border-slate-300 dark:hover:border-slate-700 transition">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{c.name || c.phone}</span>
                  <span className="text-[10px] text-slate-500 font-mono mr-2" dir="ltr">{c.phone}</span>
                  {c.company && <Badge tone="gray">{c.company}</Badge>}
                </div>
                <div className="flex items-center gap-1.5">
                  <Select value={c.stage} onChange={(e) => moveStage(c.phone, e.target.value)} className="!w-auto !py-1 !text-[11px]">
                    {STAGES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </Select>
                  <Button variant="ghost" size="sm" onClick={() => { setForm(c); setEditing(true); }}>تعديل</Button>
                  <Button variant="danger" size="sm" onClick={() => removeCustomer(c.phone)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            </div>
          ))}
        </Card>

        <Card className="p-4 space-y-3 h-fit">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <CheckSquare className="w-4 h-4 text-emerald-400" />
            <span>المهام ({openTasks.length})</span>
          </div>
          <form onSubmit={addTask} className="space-y-2">
            <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="مهمة جديدة..." />
            <div className="flex gap-2">
              <Input dir="ltr" value={taskPhone} onChange={(e) => setTaskPhone(e.target.value)} placeholder="هاتف عميل" className="!w-1/2" />
              <Input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className="!w-1/2" />
            </div>
            <Button type="submit" size="sm" className="w-full">إضافة مهمة</Button>
          </form>
          <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
            {tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => toggleTask(t)}
                className={`w-full text-right p-2 rounded-xl border text-[11px] transition cursor-pointer ${t.status === 'done' ? 'opacity-50 line-through' : 'hover:border-emerald-500/40'}`}
              >
                <div className="font-bold">{t.title}</div>
                <div className="text-[10px] text-slate-500">{t.customerPhone} {t.dueAt ? `• ${t.dueAt}` : ''} • {t.priority}</div>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
