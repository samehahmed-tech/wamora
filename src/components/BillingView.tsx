import React, { useMemo } from 'react';
import {
  CreditCard,
  Send,
  Users,
  Megaphone,
  MessageSquareText,
  CheckCircle2,
  XCircle,
  Download,
  ShieldCheck,
  Server,
} from 'lucide-react';
import { StatsShape } from '../defaults';
import { get } from '../api';
import { Button } from './kit';
import { Stagger, StaggerItem, CountUp } from './ui';

interface BillingViewProps {
  stats: StatsShape;
  contactsCount: number;
  campaignsCount: number;
  conversationsCount: number;
}

export const BillingView: React.FC<BillingViewProps> = ({
  stats,
  contactsCount,
  campaignsCount,
  conversationsCount,
}) => {
  const todayKey = new Date().toISOString().slice(0, 10);
  const sentToday = stats.daily?.[todayKey]?.sent || 0;

  const last7 = useMemo(() => {
    const out: { key: string; day: string; sent: number }[] = [];
    const fmt = new Intl.DateTimeFormat('ar-EG', { weekday: 'short' });
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push({
        key,
        day: i === 0 ? 'اليوم' : fmt.format(d),
        sent: stats.daily?.[key]?.sent || 0,
      });
    }
    return out;
  }, [stats.daily]);

  const maxDay = Math.max(1, ...last7.map((d) => d.sent));

  const handleBackup = async () => {
    try {
      const data = await get('/api/bootstrap');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wamora-backup-${todayKey}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  const cards = [
    { label: 'إجمالي الرسائل المرسلة', value: stats.sent, icon: Send, color: 'text-emerald-400 bg-emerald-500/10' },
    { label: 'ناجحة', value: stats.delivered, icon: CheckCircle2, color: 'text-blue-400 bg-blue-500/10' },
    { label: 'فاشلة', value: stats.failed, icon: XCircle, color: 'text-red-400 bg-red-500/10' },
    { label: 'ردود البوت التلقائية', value: stats.replied, icon: MessageSquareText, color: 'text-amber-400 bg-amber-500/10' },
    { label: 'جهات الاتصال', value: contactsCount, icon: Users, color: 'text-teal-400 bg-teal-500/10' },
    { label: 'الحملات', value: campaignsCount, icon: Megaphone, color: 'text-teal-400 bg-teal-500/10' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-emerald-400" />
            الاستخدام والخطة
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            كل الأرقام أدناه حقيقية — من سجل هذا الخادم فقط، ولا توجد أي رسوم
          </p>
        </div>
        <Button variant="ghost" onClick={handleBackup}>
          <Download className="w-4 h-4 text-emerald-400" />
          <span>تنزيل نسخة احتياطية من البيانات</span>
        </Button>
      </div>

      {/* Current plan */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border border-emerald-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Server className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="text-base font-black text-slate-900 dark:text-white">الخطة الذاتية — مجانية للأبد</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              استضافة محلية • إرسال غير محدود • بدون WhatsApp Cloud API وبدون اشتراكات
            </div>
          </div>
        </div>
        <div className="text-left">
          <div className="text-2xl font-black text-emerald-400 font-mono">$0<span className="text-xs text-slate-500 dark:text-slate-400">/شهرياً</span></div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">مرسلة اليوم: {sentToday.toLocaleString('ar-EG')}</div>
        </div>
      </div>

      {/* Real usage cards */}
      <Stagger className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <StaggerItem key={c.label}>
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/25 transition">
              <div className={`w-8 h-8 rounded-xl ${c.color} flex items-center justify-center mb-2`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-xl font-black text-slate-900 dark:text-white font-mono"><CountUp value={c.value} /></div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{c.label}</div>
            </div>
            </StaggerItem>
          );
        })}
      </Stagger>

      {/* 7-day chart */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">الإرسال اليومي — آخر 7 أيام</h2>
        <div className="h-40 flex items-end justify-between gap-3">
          {last7.map((d) => (
            <div key={d.key} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono opacity-0 group-hover:opacity-100 transition">
                {d.sent.toLocaleString('ar-EG')}
              </div>
              <div
                className="w-full max-w-[48px] bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-md transition-all"
                style={{ height: `${Math.max(3, (d.sent / maxDay) * 100)}%` }}
                title={`${d.sent}`}
              ></div>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{d.day}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Why free */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            لماذا هذا النظام مجاني؟
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            الإرسال يتم عبر جلسة WhatsApp Web مباشرة من جهازك (بروتوكول Baileys مفتوح المصدر)،
            وليس عبر WhatsApp Cloud API الرسمية مدفوعة الأجر. لا توجد رسوم لكل رسالة ولا اشتراك شهري —
            فقط التزم بحدود الحماية (التأخير والدفعات) لتفادي تقييد الرقم.
          </p>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquareText className="w-4 h-4 text-blue-400" />
            المحادثات النشطة
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            لديك حالياً <span className="text-slate-900 dark:text-white font-bold">{conversationsCount.toLocaleString('ar-EG')}</span> محادثة
            في صندوق الوارد. كل رسالة واردة تُحفظ على الخادم ويرد عليها البوت تلقائياً حسب قواعدك.
          </p>
        </div>
      </div>
    </div>
  );
};
