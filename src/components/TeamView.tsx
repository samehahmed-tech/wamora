import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Plus, Trash2, LogOut, Users } from 'lucide-react';
import { get, post, del, TEAM_TOKEN_KEY } from '../api';
import { Button, Field, Input, Select, Badge, toast } from './kit';
import { Card, SectionHeader } from './ui';

interface TeamUser {
  id: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
}

const ROLES = [
  { id: 'super_admin', label: 'Super Admin' },
  { id: 'admin', label: 'Admin' },
  { id: 'manager', label: 'Manager' },
  { id: 'sales', label: 'Sales' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'support', label: 'Support' },
];

export const TeamView: React.FC<{ onSession: () => void }> = ({ onSession }) => {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [me, setMe] = useState<{ name: string; role: string } | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('sales');
  const [pin, setPin] = useState('');
  const [loginName, setLoginName] = useState('');
  const [loginPin, setLoginPin] = useState('');

  const refresh = useCallback(async () => {
    try {
      setUsers((await get<TeamUser[]>('/api/v2/team/users')) || []);
    } catch {
      /* ignore */
    }
    try {
      setMe(await get<{ name: string; role: string }>('/api/v2/team/me'));
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await post<{ token: string; user: { name: string; role: string } }>('/api/v2/team/login', { name: loginName, pin: loginPin });
      try {
        localStorage.setItem(TEAM_TOKEN_KEY, r.token);
      } catch {
        /* ignore */
      }
      setMe({ name: r.user.name, role: r.user.role });
      setLoginName('');
      setLoginPin('');
      toast(`مرحباً ${r.user.name}.`);
      onSession();
    } catch (err: any) {
      toast(err?.message || 'تعذر الدخول.', 'error');
    }
  };

  const logout = async () => {
    await post('/api/v2/team/logout').catch(() => undefined);
    try {
      localStorage.removeItem(TEAM_TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setMe(null);
    onSession();
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await post('/api/v2/team/users', { name, role, pin });
      setName('');
      setPin('');
      toast('تم إنشاء المستخدم.');
      refresh();
    } catch (err: any) {
      toast(err?.message || 'تعذر الإنشاء.', 'error');
    }
  };

  const toggleActive = async (u: TeamUser) => {
    try {
      await post(`/api/v2/team/users/${u.id}/active`, { active: !u.active });
      refresh();
    } catch (err: any) {
      toast(err?.message || 'تعذر التعديل.', 'error');
    }
  };

  const remove = async (u: TeamUser) => {
    if (!window.confirm(`حذف ${u.name}؟`)) return;
    try {
      await del(`/api/v2/team/users/${u.id}`);
      refresh();
    } catch (err: any) {
      toast(err?.message || 'تعذر الحذف.', 'error');
    }
  };

  const isAdmin = me && (me.role === 'super_admin' || me.role === 'admin');

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Users className="w-5 h-5" />}
        title="الفريق والصلاحيات"
        hint="PIN لكل موظف + أدوار — فارغ = وضع فردي بدون قفل"
        action={
          me ? (
            <span className="flex items-center gap-2">
              <Badge tone="green">{me.name} • {me.role}</Badge>
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOut className="w-3.5 h-3.5" />
                <span>خروج</span>
              </Button>
            </span>
          ) : (
            <Badge tone="gray">غير مسجل</Badge>
          )
        }
      />

      {!me && users.length > 0 && (
        <Card className="p-6 max-w-md space-y-4">
          <div className="text-sm font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>دخول الموظفين (PIN)</span>
          </div>
          <form onSubmit={login} className="space-y-3">
            <Field label="الاسم"><Input value={loginName} onChange={(e) => setLoginName(e.target.value)} /></Field>
            <Field label="PIN"><Input type="password" inputMode="numeric" dir="ltr" value={loginPin} onChange={(e) => setLoginPin(e.target.value)} className="text-center font-mono" /></Field>
            <Button type="submit" className="w-full" disabled={!loginName.trim() || !loginPin}>دخول</Button>
          </form>
        </Card>
      )}

      {(isAdmin || users.length === 0) && (
        <Card className="p-5">
          <div className="text-sm font-bold mb-3">{users.length === 0 ? 'إنشاء أول مستخدم (Super Admin إجباري)' : 'مستخدم جديد'}</div>
          <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <Field label="الاسم"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="الدور">
              <Select value={users.length === 0 ? 'super_admin' : role} onChange={(e) => setRole(e.target.value)} disabled={users.length === 0}>
                {ROLES.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="PIN (4-8 أرقام)"><Input type="password" inputMode="numeric" dir="ltr" value={pin} onChange={(e) => setPin(e.target.value)} className="font-mono" /></Field>
            <Button type="submit"><Plus className="w-4 h-4" /><span>إنشاء</span></Button>
          </form>
        </Card>
      )}

      {users.length > 0 && (
        <Card className="p-2 space-y-1">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-900">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">{u.name}</span>
                <Badge tone="blue">{u.role}</Badge>
                {!u.active && <Badge tone="red">موقوف</Badge>}
              </div>
              {isAdmin && (
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(u)}>{u.active ? 'إيقاف' : 'تفعيل'}</Button>
                  <Button variant="danger" size="sm" onClick={() => remove(u)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};
