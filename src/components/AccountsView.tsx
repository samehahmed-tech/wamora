import React, { useState } from 'react';
import { Smartphone, Plus, Pause, Play, Trash2, QrCode, LogOut, Check } from 'lucide-react';
import { WaAccount, RotationSettings, RotationStrategy } from '../types';
import { get, post, put, del } from '../api';
import { Button, Field, Input, Select, Badge, toast } from './kit';
import { SectionHeader, Card, Stagger, StaggerItem, StatusDot } from './ui';

interface AccountsViewProps {
  accounts: WaAccount[];
  activeAccountId: string | null;
  rotation: RotationSettings;
  onRefresh: () => void;
  onConnectAccount: (id: string, name: string) => void;
}

function stateTone(state: string): { tone: 'green' | 'amber' | 'red' | 'gray'; label: string; dot: 'green' | 'amber' | 'red' | 'gray' } {
  if (state === 'connected') return { tone: 'green', label: 'متصل', dot: 'green' };
  if (state === 'qr') return { tone: 'amber', label: 'بانتظار المسح', dot: 'amber' };
  if (state === 'connecting') return { tone: 'amber', label: 'جارٍ الاتصال', dot: 'amber' };
  return { tone: 'gray', label: 'غير متصل', dot: 'gray' };
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  accounts,
  activeAccountId,
  rotation,
  onRefresh,
  onConnectAccount,
}) => {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [strategy, setStrategy] = useState<RotationStrategy>(rotation.strategy);
  const [perAccountHourlyCap, setPerAccountHourlyCap] = useState<number>(rotation.perAccountHourlyCap);
  const [perAccountDailyCap, setPerAccountDailyCap] = useState<number>(rotation.perAccountDailyCap || 300);
  const [failStreakLimit, setFailStreakLimit] = useState<number>(rotation.failStreakLimit);
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(rotation.cooldownMinutes);
  const [savingRotation, setSavingRotation] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      await post('/api/accounts', { name });
      const fresh = await get<{ accounts: WaAccount[]; activeAccountId: string | null }>('/api/accounts');
      onRefresh();
      const found = fresh.accounts.find((a) => a.name === name);
      if (found) onConnectAccount(found.id, found.name);
      setNewName('');
      toast('تم إنشاء الحساب بنجاح.');
    } catch (err: any) {
      toast(err?.message || 'تعذر إنشاء الحساب.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleActivate = async (id: string) => {
    setBusyId(id);
    try {
      await post(`/api/accounts/${id}/activate`);
      onRefresh();
      toast('تم تفعيل الحساب.');
    } catch (e: any) {
      toast(e?.message || 'تعذر تفعيل الحساب.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDisconnect = async (id: string) => {
    setBusyId(id);
    try {
      await post(`/api/accounts/${id}/disconnect`);
      onRefresh();
      toast('تم فك ربط الحساب.');
    } catch (e: any) {
      toast(e?.message || 'تعذر فك الربط.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleClearCooldown = async (acc: WaAccount) => {
    setBusyId(acc.id);
    try {
      await post(`/api/accounts/${acc.id}/pause`, { paused: !!acc.paused });
      onRefresh();
      toast('تم إلغاء التهدئة — الحساب جاهز للإرسال.');
    } catch (e: any) {
      toast(e?.message || 'تعذر إلغاء التهدئة.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handlePauseToggle = async (acc: WaAccount) => {
    setBusyId(acc.id);
    try {
      await post(`/api/accounts/${acc.id}/pause`, { paused: !acc.paused });
      onRefresh();
      toast(acc.paused ? 'تم استئناف الحساب.' : 'تم إيقاف الحساب مؤقتا.');
    } catch (e: any) {
      toast(e?.message || 'تعذر تغيير حالة الإيقاف.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`حذف الحساب "${name}" نهائيا؟`)) return;
    setBusyId(id);
    try {
      await del(`/api/accounts/${id}`);
      onRefresh();
      toast('تم حذف الحساب.');
    } catch (e: any) {
      toast(e?.message || 'تعذر حذف الحساب.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveRotation = async () => {
    setSavingRotation(true);
    try {
      await put('/api/settings/rotation', {
        strategy,
        perAccountHourlyCap: Number(perAccountHourlyCap),
        perAccountDailyCap: Number(perAccountDailyCap),
        failStreakLimit: Number(failStreakLimit),
        cooldownMinutes: Number(cooldownMinutes),
      });
      onRefresh();
      toast('تم حفظ إعدادات التدوير.');
    } catch (e: any) {
      toast(e?.message || 'تعذر حفظ الإعدادات.', 'error');
    } finally {
      setSavingRotation(false);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Smartphone className="w-5 h-5" />}
        title="الأرقام والحسابات"
        hint="أدر أرقام واتساب المربوطة في Wamora وتحكم في التدوير الذكي بينها"
        action={
          <form onSubmit={handleCreate} className="flex items-center gap-2">
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="اسم الرقم الجديد..."
              className="w-44"
            />
            <Button type="submit" loading={creating} disabled={creating || !newName.trim()}>
              <Plus className="w-4 h-4" />
              <span>إضافة رقم</span>
            </Button>
          </form>
        }
      />

      {accounts.length === 0 ? (
        <Card className="p-8 text-center space-y-2">
          <Smartphone className="w-8 h-8 mx-auto text-slate-500" />
          <div className="text-sm font-bold text-slate-900 dark:text-white">لا توجد حسابات بعد</div>
          <div className="text-xs text-slate-500">أضف رقمك الأول من الأعلى ثم اربطه عبر رمز QR.</div>
        </Card>
      ) : (
        <Stagger className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((acc) => {
            const s = stateTone(acc.state);
            const isActive = acc.id === activeAccountId;
            const cooling = acc.cooldownUntil && acc.cooldownUntil > Date.now();
            return (
              <StaggerItem key={acc.id}>
                <Card className={`p-4 space-y-3 ${isActive ? 'border-emerald-500/40' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot color={s.dot} />
                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{acc.name}</span>
                      {isActive && (
                        <Badge tone="green">
                          <Check className="w-3 h-3" />
                          نشط
                        </Badge>
                      )}
                    </div>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono" dir="ltr">
                    {acc.phone ? `+${acc.phone}` : '—'}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>الساعة: <strong className="text-slate-900 dark:text-white font-mono">{acc.sentHour}</strong></span>
                    <span>اليوم: <strong className="text-slate-900 dark:text-white font-mono">{acc.sentToday}</strong></span>
                    {acc.failStreak > 0 && <span className="text-red-300">إخفاقات: {acc.failStreak}</span>}
                  </div>
                  {cooling && (
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
                      <span className="text-[11px] text-amber-300">الحساب في فترة تهدئة مؤقتة.</span>
                      <Button
                        variant="soft"
                        size="sm"
                        disabled={busyId === acc.id}
                        onClick={() => handleClearCooldown(acc)}
                        title="تجاوز التهدئة — مفيد أثناء التجارب"
                      >
                        إلغاء التهدئة
                      </Button>
                    </div>
                  )}
                  {acc.paused && (
                    <div className="text-[11px] text-amber-300">موقوف مؤقتا ومستبعد من التدوير.</div>
                  )}
                  {acc.lastError && (
                    <div className="text-[11px] text-red-300 truncate" title={acc.lastError}>{acc.lastError}</div>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-800">
                    {!isActive && (
                      <Button variant="ghost" size="sm" disabled={busyId === acc.id} onClick={() => handleActivate(acc.id)}>
                        تفعيل
                      </Button>
                    )}
                    {acc.state === 'connected' ? (
                      <Button variant="ghost" size="sm" disabled={busyId === acc.id} onClick={() => handleDisconnect(acc.id)}>
                        <LogOut className="w-3 h-3" />
                        <span>فك</span>
                      </Button>
                    ) : (
                      <Button variant="soft" size="sm" disabled={busyId === acc.id} onClick={() => onConnectAccount(acc.id, acc.name)}>
                        <QrCode className="w-3 h-3" />
                        <span>ربط</span>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" disabled={busyId === acc.id} onClick={() => handlePauseToggle(acc)}>
                      {acc.paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                      <span>{acc.paused ? 'استئناف' : 'إيقاف'}</span>
                    </Button>
                    <Button variant="danger" size="sm" disabled={busyId === acc.id} onClick={() => handleDelete(acc.id, acc.name)}>
                      <Trash2 className="w-3 h-3" />
                      <span>حذف</span>
                    </Button>
                  </div>
                </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}

      <Card className="p-5 space-y-4">
        <div className="text-sm font-bold text-slate-900 dark:text-white">إعدادات التدوير الذكي</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="استراتيجية التدوير"
            hint={
              strategy === 'round-robin'
                ? 'تدوير بالتساوي بين كل الحسابات النشطة.'
                : strategy === 'least-used'
                  ? 'الأولوية للحساب الأقل إرسالا لتوزيع الحمل.'
                  : 'تثبيت الإرسال على الحساب النشط المحدد.'
            }
          >
            <Select value={strategy} onChange={(e) => setStrategy(e.target.value as RotationStrategy)}>
              <option value="round-robin">تدوير متساوٍ</option>
              <option value="least-used">الأقل استخداما (موصى به)</option>
              <option value="pinned">مثبت على الحساب النشط</option>
            </Select>
          </Field>
          <Field label="الحد الأقصى لكل حساب في الساعة" hint="سقف الإحماء لحماية الأرقام من الحظر. الحسابات الجديدة (<7 أيام) تأخذ النصف تلقائيا.">
            <Input type="number" min={1} value={perAccountHourlyCap} onChange={(e) => setPerAccountHourlyCap(Number(e.target.value))} />
          </Field>
          <Field label="الحد الأقصى لكل حساب في اليوم" hint="سقف يومي صلب — الحساب المستنفد يخرج من التدوير حتى اليوم التالي.">
            <Input type="number" min={50} value={perAccountDailyCap} onChange={(e) => setPerAccountDailyCap(Number(e.target.value))} />
          </Field>
          <Field label="حد الإخفاقات المتتالية" hint="عدد الإخفاقات قبل دخول الحساب في تهدئة.">
            <Input type="number" min={1} value={failStreakLimit} onChange={(e) => setFailStreakLimit(Number(e.target.value))} />
          </Field>
          <Field label="مدة التهدئة (دقائق)" hint="مدة استبعاد الحساب بعد تجاوز حد الإخفاقات.">
            <Input type="number" min={1} value={cooldownMinutes} onChange={(e) => setCooldownMinutes(Number(e.target.value))} />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSaveRotation} loading={savingRotation} disabled={savingRotation}>
            حفظ إعدادات التدوير
          </Button>
        </div>
      </Card>
    </div>
  );
};
