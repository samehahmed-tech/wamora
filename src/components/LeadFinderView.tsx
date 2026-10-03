import React, { useState, useEffect } from 'react';
import { Search, Download, Trash2, Save } from 'lucide-react';
import { get, post, del } from '../api';
import { Button, Field, Input, Select, Badge, toast } from './kit';
import { Card, SectionHeader } from './ui';

interface Lead {
  id: string;
  name: string;
  category: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  sourceUrl: string;
}

const CATEGORIES = [
  { id: 'restaurant', label: 'مطاعم' },
  { id: 'cafe', label: 'كافيهات' },
  { id: 'hotel', label: 'فنادق' },
  { id: 'pharmacy', label: 'صيدليات' },
  { id: 'clinic', label: 'عيادات' },
  { id: 'gym', label: 'جيم' },
  { id: 'salon', label: 'صالونات' },
  { id: 'car', label: 'سيارات' },
  { id: 'school', label: 'مدارس' },
  { id: 'shop', label: 'محلات' },
];

export const LeadFinderView: React.FC = () => {
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('restaurant');
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<Lead[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<Lead[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const refreshSaved = async () => {
    try {
      setSaved((await get<Lead[]>('/api/v2/leads')) || []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    refreshSaved();
  }, []);

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!city.trim() || searching) return;
    setSearching(true);
    try {
      const r = await post<Lead[]>('/api/v2/leads/search', { city: city.trim(), category, keyword: keyword.trim(), limit: 80 });
      setResults(r || []);
      setChecked(new Set());
      if (!r?.length) toast('لا نتائج — جرّب مدينة أو فئة أخرى.', 'error');
    } catch (err: any) {
      toast(err?.message || 'تعذر البحث.', 'error');
    } finally {
      setSearching(false);
    }
  };

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveSelected = async () => {
    const items = results.filter((r) => checked.has(r.id));
    if (!items.length) return toast('اختر نتائج أولاً.', 'error');
    try {
      const r = await post<{ saved: number; dupes: number }>('/api/v2/leads/save', { items, tags: [category] });
      toast(`حُفظ ${r.saved} (مكرر ${r.dupes}).`);
      setChecked(new Set());
      refreshSaved();
    } catch (err: any) {
      toast(err?.message || 'تعذر الحفظ.', 'error');
    }
  };

  const list = showSaved ? saved : results;

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Search className="w-5 h-5" />}
        title="مكتشف العملاء (Lead Finder)"
        hint="بيانات تجارية عامة من OpenStreetMap — مجاني، بدون تجاوز خصوصية"
        action={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowSaved(!showSaved)}>
              {showSaved ? `نتائج البحث (${results.length})` : `المحفوظ (${saved.length})`}
            </Button>
            <a href="/api/v2/leads/export.csv" download>
              <Button variant="soft" size="sm">
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </Button>
            </a>
          </div>
        }
      />

      <Card className="p-5">
        <form onSubmit={search} className="grid grid-cols-1 sm:grid-cols-[1fr_160px_1fr_auto] gap-3 items-end">
          <Field label="المدينة / المنطقة *"><Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="مثال: مدينة نصر، القاهرة" /></Field>
          <Field label="الفئة">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="كلمة (اختياري)"><Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="مثال: مشويات" /></Field>
          <Button type="submit" loading={searching} disabled={searching || !city.trim()}>
            <Search className="w-4 h-4" />
            <span>بحث</span>
          </Button>
        </form>
      </Card>

      {!showSaved && results.length > 0 && (
        <div className="flex items-center gap-2">
          <Button variant="soft" size="sm" onClick={saveSelected} disabled={checked.size === 0}>
            <Save className="w-3.5 h-3.5" />
            <span>حفظ المحدد ({checked.size})</span>
          </Button>
          <span className="text-[11px] text-slate-500">{results.length} نتيجة — أرقام فارغة تعني غير مسجل علناً</span>
        </div>
      )}

      <Card className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
        {list.length === 0 && <div className="p-4 text-[11px] text-slate-500 text-center">ابحث بكلمات مثل: مطاعم القاهرة، فنادق دبي.</div>}
        {list.map((l) => (
          <div key={l.id} className="flex items-start gap-2 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 transition">
            {!showSaved && (
              <input type="checkbox" checked={checked.has(l.id)} onChange={() => toggle(l.id)} className="mt-1 w-4 h-4 accent-emerald-500" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold">{l.name}</span>
                <Badge tone="gray">{l.category}</Badge>
                {l.phone && <span className="text-[11px] font-mono text-emerald-400" dir="ltr">{l.phone}</span>}
              </div>
              <div className="text-[10px] text-slate-500 truncate">{l.address} {l.city}</div>
            </div>
            {showSaved && (
              <Button variant="danger" size="sm" onClick={async () => { await del(`/api/v2/leads/${l.id}`); refreshSaved(); }}>
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
};
