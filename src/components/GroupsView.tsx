import React, { useState } from 'react';
import { Users, Plus, Trash2, MapPin } from 'lucide-react';
import { Contact, ContactGroup } from '../types';
import { Button, Field, Input, Modal, Badge } from './kit';
import { SectionHeader, EmptyState, Card } from './ui';

interface Props {
  groups: ContactGroup[];
  contacts: Contact[];
  onUpdateGroups: (g: ContactGroup[]) => void;
}

export function groupMemberPhones(g: ContactGroup, contacts: Contact[]): string[] {
  const set = new Set<string>();
  const norm = (p: string) => String(p || '').replace(/[^0-9]/g, '');
  (g.phones || []).forEach((p) => { const c = norm(p); if (c) set.add(c); });
  contacts.forEach((c) => {
    if (c.status !== 'active') return;
    const hitTag = g.tag && (c.tags || []).includes(g.tag);
    const hitRegion = g.region && ((c.region === g.region) || (c.tags || []).includes(g.region) || (c.tags || []).includes(`منطقة:${g.region}`));
    if ((g.tag || g.region) ? (hitTag || hitRegion) : true) {
      const cl = norm(c.phone);
      if (cl) set.add(cl);
    }
  });
  return [...set];
}

export const GroupsView: React.FC<Props> = ({ groups, contacts, onUpdateGroups }) => {
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [tag, setTag] = useState('');
  const [phones, setPhones] = useState('');

  const allTags = [...new Set(contacts.flatMap((c) => c.tags || []))];

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const list = phones.split(/[\n,;]+/).map((s) => s.replace(/[^0-9]/g, '')).filter((s) => s.length >= 9 && s.length <= 15);
    onUpdateGroups([...groups, {
      id: `g-${Date.now()}`,
      name: name.trim(),
      region: region.trim() || undefined,
      tag: tag.trim() || undefined,
      phones: [...new Set(list)],
      createdAt: new Date().toLocaleString('ar-EG'),
    }]);
    setShow(false); setName(''); setRegion(''); setTag(''); setPhones('');
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Users className="w-5 h-5" />}
        title="مجموعات جهات الاتصال"
        hint="اربط أسماء بمنطقة أو علامة، واختار المجموعة عند الإرسال"
        action={<Button size="sm" onClick={() => setShow(true)}><Plus className="w-4 h-4" /><span>مجموعة جديدة</span></Button>}
      />
      {!groups.length ? (
        <EmptyState icon={<Users className="w-6 h-6" />} title="لا توجد مجموعات" hint="أنشئ مجموعة منطقة أو علامة لاستخدامها في الإرسال." actionLabel="مجموعة جديدة" onAction={() => setShow(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groups.map((g) => {
            const members = groupMemberPhones(g, contacts);
            return (
              <Card key={g.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-900 dark:text-white">{g.name}</div>
                  <Button variant="danger" size="sm" onClick={() => onUpdateGroups(groups.filter((x) => x.id !== g.id))} title="حذف"><Trash2 className="w-4 h-4" /></Button>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <Badge tone="blue">{members.length} رقم</Badge>
                  {g.region && <Badge tone="gray"><MapPin className="w-3 h-3" />{g.region}</Badge>}
                  {g.tag && <Badge tone="gray">{g.tag}</Badge>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={show} onClose={() => setShow(false)} title="مجموعة جديدة" subtitle="عضوية تلقائية بالوسم/المنطقة + أرقام يدوية">
        <form onSubmit={create} className="space-y-3 text-xs">
          <Field label="اسم المجموعة:"><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="عملاء القاهرة" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="منطقة:"><Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="القاهرة" list="group-regions" />
              <datalist id="group-regions">{[...new Set(contacts.map((c) => c.region).filter(Boolean) as string[])].map((r) => <option key={r} value={r} />)}</datalist>
            </Field>
            <Field label="علامة مرتبطة:"><Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="عملاء VIP" list="group-tags" />
              <datalist id="group-tags">{allTags.map((t) => <option key={t} value={t} />)}</datalist>
            </Field>
          </div>
          <Field label="أرقام يدوية (اختياري):" hint="رقم في سطر"><Input value={phones} onChange={(e) => setPhones(e.target.value)} placeholder="01XXXXXXXXX" className="font-mono" dir="ltr" /></Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button type="button" variant="ghost" onClick={() => setShow(false)}>إلغاء</Button>
            <Button type="submit" variant="primary">حفظ المجموعة</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
