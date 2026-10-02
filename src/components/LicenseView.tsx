import React, { useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { post } from '../api';
import { Button, Field, Input, toast } from './kit';
import { Card } from './ui';

export interface LicenseInfo {
  ok: boolean;
  status: 'active' | 'suspended' | 'expired' | 'unlicensed' | 'offline';
  planName?: string;
  maxAccounts: number;
  dailyMessages: number;
  expiresAt?: string | null;
}

const STATUS_AR: Record<string, string> = {
  unlicensed: 'النسخة غير مفعّلة',
  expired: 'الترخيص منتهي',
  suspended: 'الترخيص موقوف',
  offline: 'وضع عدم الاتصال (ترخيص محفوظ)',
  active: 'مفعّل',
};

export const LicenseView: React.FC<{ license: LicenseInfo; onActivated: (l: LicenseInfo) => void }> = ({
  license,
  onActivated,
}) => {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || busy) return;
    setBusy(true);
    try {
      const data = await post<LicenseInfo>('/api/license/activate', { key: key.trim() });
      if (data.ok) {
        toast('تم تفعيل النسخة بنجاح.');
        onActivated(data);
      } else {
        toast('المفتاح غير صالح أو الترخيص غير ساري.', 'error');
        onActivated(data);
      }
    } catch (err: any) {
      toast(err?.message || 'تعذر التفعيل.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950">
      <Card className="w-full max-w-md p-8 space-y-5 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
          <KeyRound className="w-7 h-7" />
        </div>
        <div>
          <div className="text-lg font-black text-slate-900 dark:text-white">تفعيل نسخة Wamora</div>
          <div className="text-xs text-slate-500 mt-1">
            الحالة: {STATUS_AR[license.status] || license.status}
            {license.status === 'suspended' && ' — تواصل مع مزود الخدمة.'}
            {license.status === 'expired' && ' — جدد اشتراكك للمتابعة.'}
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3 text-right">
          <Field label="مفتاح الترخيص" hint="مثال: WMP-XXXX-XXXX — تحصل عليه من مزود الخدمة.">
            <Input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="WMP-XXXX-XXXX"
              className="text-center font-mono"
              dir="ltr"
            />
          </Field>
          <Button type="submit" loading={busy} disabled={busy || !key.trim()} className="w-full">
            <ShieldCheck className="w-4 h-4" />
            <span>تفعيل</span>
          </Button>
        </form>
      </Card>
    </div>
  );
};
