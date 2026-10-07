import React, { useState, useEffect, useCallback } from 'react';
import { DatabaseBackup, Plus, Trash2, RotateCcw, Download } from 'lucide-react';
import { get, post, del } from '../api';
import { Button, Badge, toast } from './kit';
import { Card, SectionHeader } from './ui';

interface Backup {
  id: string;
  at: string;
  keys: number;
  bytes: number;
  auto: boolean;
}

function fmtBytes(n: number): string {
  if (n > 1048576) return `${(n / 1048576).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(n / 1024))}KB`;
}

export const BackupView: React.FC = () => {
  const [list, setList] = useState<Backup[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setList((await get<Backup[]>('/api/v2/backups')) || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    setBusy(true);
    try {
      await post('/api/v2/backups', {});
      toast('تم إنشاء نسخة احتياطية.');
      refresh();
    } catch (err: any) {
      toast(err?.message || 'تعذر النسخ.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const restore = async (id: string) => {
    if (!window.confirm('استعادة هذه النسخة؟ تُحفظ الحالة الحالية كنقطة رجوع تلقائياً. أعد تشغيل السيستم بعدها.')) return;
    try {
      const r = await post<{ restored: number; rollbackId: string }>(`/api/v2/backups/${id}/restore`, {});
      toast(`تمت استعادة ${r.restored} ملف. نقطة الرجوع: ${r.rollbackId}. أعد التشغيل الآن.`);
      refresh();
    } catch (err: any) {
      toast(err?.message || 'تعذر الاستعادة.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<DatabaseBackup className="w-5 h-5" />}
        title="النسخ الاحتياطي"
        hint="نسخ يدوية + تلقائية يومية (آخر 7) — الاستعادة تحفظ نقطة رجوع أولاً"
        action={
          <Button variant="soft" size="sm" onClick={create} loading={busy} disabled={busy}>
            <Plus className="w-3.5 h-3.5" />
            <span>نسخة الآن</span>
          </Button>
        }
      />
      <Card className="p-2 space-y-1">
        {list.length === 0 && <div className="p-4 text-[11px] text-slate-500 text-center">لا نسخ بعد.</div>}
        {list.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold font-mono" dir="ltr">{b.id}</span>
              <Badge tone={b.auto ? 'gray' : 'green'}>{b.auto ? 'تلقائية' : 'يدوية'}</Badge>
              <span className="text-[10px] text-slate-500">{new Date(b.at).toLocaleString('ar-EG')} • {b.keys} ملف • {fmtBytes(b.bytes)}</span>
            </div>
            <div className="flex gap-1.5">
              <a href={`/api/v2/backups/${b.id}/download`} download>
                <Button variant="ghost" size="sm"><Download className="w-3 h-3" /></Button>
              </a>
              <Button variant="soft" size="sm" onClick={() => restore(b.id)}>
                <RotateCcw className="w-3 h-3" />
                <span>استعادة</span>
              </Button>
              <Button variant="danger" size="sm" onClick={async () => { if (window.confirm('حذف النسخة؟')) { await del(`/api/v2/backups/${b.id}`); refresh(); } }}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
};
