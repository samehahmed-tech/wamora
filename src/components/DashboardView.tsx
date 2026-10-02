import React, { useMemo } from 'react';
import {
  Send,
  CheckCircle2,
  Eye,
  MessageCircle,
  ShieldCheck,
  Zap,
  Sparkles,
  Megaphone,
  AlertTriangle,
  XCircle,
  Smartphone,
  Users,
  Plus,
  Activity,
  Inbox,
} from 'lucide-react';
import { Campaign, NavigationTab, AntiBlockConfig } from '../types';
import { StatsShape, SendLogShape } from '../defaults';
import { CountUp, Stagger, StaggerItem } from './ui';
import { Badge, ProgressBar, Button } from './kit';
import { PartyPopper, ListChecks } from 'lucide-react';

interface DashboardViewProps {
  campaigns: Campaign[];
  stats: StatsShape;
  antiBlock: AntiBlockConfig;
  waConnected: boolean;
  geminiReady: boolean;
  queuePending: number;
  contactsCount: number;
  sendLog: SendLogShape[];
  onNavigate: (tab: NavigationTab) => void;
  onOpenQuickSend: () => void;
  onOpenConnect: () => void;
}

function lastDays(daily: StatsShape['daily'], n: number) {
  const out: { key: string; day: string; sent: number; delivered: number; replied: number; failed: number }[] = [];
  const fmt = new Intl.DateTimeFormat('ar-EG', { weekday: 'long' });
  const short = new Intl.DateTimeFormat('ar-EG', { weekday: 'short' });
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const v = daily?.[key] || { sent: 0, delivered: 0, replied: 0, failed: 0 };
    out.push({
      key,
      day: i === 0 ? 'اليوم' : n > 8 ? short.format(d) : fmt.format(d),
      sent: v.sent,
      delivered: v.delivered,
      replied: v.replied || 0,
      failed: v.failed || 0,
    });
  }
  return out;
}

const Sparkline: React.FC<{ values: number[]; stroke?: string; fill?: string }> = ({
  values,
  stroke = '#34d399',
  fill = 'rgba(52,211,153,0.12)',
}) => {
  const w = 120;
  const h = 36;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`);
  const id = React.useId();
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-9" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${pts.join(' ')} ${w},${h}`} fill={`url(#${id})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <circle cx={w} cy={h - (values[values.length - 1] / max) * (h - 4) - 2} r="2.5" fill={stroke} />
    </svg>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  campaigns,
  stats,
  antiBlock,
  waConnected,
  geminiReady,
  queuePending,
  contactsCount,
  sendLog,
  onNavigate,
  onOpenQuickSend,
  onOpenConnect,
}) => {
  const activeCampaign = campaigns.find((c) => c.status === 'running') || campaigns[0];
  const weekly = useMemo(() => lastDays(stats.daily, 7), [stats.daily]);
  const spark = useMemo(() => lastDays(stats.daily, 14), [stats.daily]);

  const sent = stats.sent || 0;
  const delivered = stats.delivered || 0;
  const failed = stats.failed || 0;
  const replied = stats.replied || 0;
  // acceptance rate can never exceed 100%; engagement is capped too (bot replies
  // from inbox tests count without a matching queued send)
  const deliveryRate =
    delivered + failed > 0 ? Math.min(100, (delivered / (delivered + failed)) * 100).toFixed(1) : '0.0';
  const replyRate =
    delivered > 0 ? Math.min(100, (replied / delivered) * 100).toFixed(1) : '0.0';
  // max over EVERYTHING plotted (incl. bot replies) + hard clamp — otherwise a
  // tall series blows the bar to thousands of % and paints a full-page line
  const maxVal = Math.max(1, ...weekly.map((w) => Math.max(w.sent, w.delivered, w.replied)));
  const barH = (v: number) => Math.min(100, Math.max(2, (v / maxVal) * 100));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'صباح الخير' : 'مساء الخير';

  const kpis = [
    {
      label: 'إجمالي المرسلة',
      value: sent,
      icon: <Send className="w-4 h-4" />,
      tone: 'text-emerald-400 bg-emerald-500/10',
      values: spark.map((d) => d.sent),
      sub: (
        <span>
          في الطابور: <span className="text-emerald-400 font-bold">{queuePending.toLocaleString('ar-EG')}</span>
        </span>
      ),
    },
    {
      label: 'نجاح الإرسال',
      value: delivered,
      icon: <CheckCircle2 className="w-4 h-4" />,
      tone: 'text-blue-400 bg-blue-500/10',
      values: spark.map((d) => d.delivered),
      suffix: '%',
      rate: deliveryRate,
      sub: failed > 0 ? <span className="text-red-400">{failed.toLocaleString('ar-EG')} فاشلة</span> : <span>بدون إخفاقات</span>,
    },
    {
      label: 'ردود البوت',
      value: replied,
      icon: <Eye className="w-4 h-4" />,
      tone: 'text-indigo-400 bg-indigo-500/10',
      values: spark.map((d) => d.replied),
      sub: <span>معدل التفاعل %{replyRate}</span>,
    },
    {
      label: 'الحالة',
      value: null as number | null,
      icon: <ShieldCheck className="w-4 h-4" />,
      tone: 'text-amber-400 bg-amber-500/10',
      values: spark.map((d) => d.sent),
      sub: null,
    },
  ];

  return (
    <div className="space-y-5">
      <Checklist
        waConnected={waConnected}
        contactsCount={contactsCount}
        sent={sent}
        onOpenConnect={onOpenConnect}
        onNavigate={onNavigate}
        onOpenQuickSend={onOpenQuickSend}
      />

      {/* Hero strip */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-l from-emerald-950/80 via-slate-900 to-slate-900 p-5 md:p-6">
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-28 right-1/3 w-72 h-72 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col lg:flex-row lg:items-center gap-5">
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={waConnected ? 'green' : 'amber'}>
                <span className={`w-1.5 h-1.5 rounded-full ${waConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {waConnected ? 'متصل — الإرسال يعمل' : 'غير مرتبط'}
              </Badge>
              {geminiReady ? (
                <Badge tone="teal">Gemini نشط</Badge>
              ) : (
                <button
                  onClick={() => onNavigate('bot_manager')}
                  title="إعداد البوت الذكي"
                  className="cursor-pointer rounded-full"
                >
                  <Badge tone="amber">وضع القواعد</Badge>
                </button>
              )}
              {queuePending > 0 && <Badge tone="blue">{queuePending} في الطابور</Badge>}
            </div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {greeting} — كل شيء <span className="text-emerald-400">تحت السيطرة</span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              مرسلة اليوم <span className="text-slate-700 dark:text-slate-200 font-bold">{(stats.daily?.[new Date().toISOString().slice(0, 10)]?.sent || 0).toLocaleString('ar-EG')}</span>
              {' • '}جهات نشطة <span className="text-slate-700 dark:text-slate-200 font-bold">{contactsCount.toLocaleString('ar-EG')}</span>
              {' • '}تأخير <span className="text-slate-700 dark:text-slate-200 font-bold">{antiBlock.minDelaySeconds}-{antiBlock.maxDelaySeconds}ث</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onOpenQuickSend} size="md">
              <Zap className="w-4 h-4" />
              إرسال سريع
            </Button>
            <Button variant="ghost" onClick={() => onNavigate('campaigns')} size="md">
              <Plus className="w-4 h-4" />
              حملة جديدة
            </Button>
            {!waConnected && (
              <Button variant="soft" onClick={onOpenConnect} size="md">
                <Smartphone className="w-4 h-4" />
                ربط الرقم
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* KPI cards with sparklines */}
      <Stagger className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <StaggerItem key={i} className="p-4 rounded-3xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 hover:border-slate-400 dark:hover:border-slate-700 transition group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{k.label}</span>
              <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${k.tone}`}>{k.icon}</span>
            </div>
            {k.value !== null ? (
              <div className="text-[26px] leading-none font-black text-slate-900 dark:text-white font-mono mb-1.5">
                {sent === 0 ? '—' : <CountUp value={k.value} />}
                {k.suffix && sent > 0 && <span className="text-sm text-slate-500 dark:text-slate-400">{k.rate}%</span>}
              </div>
            ) : (
              <div className="text-[22px] leading-none font-black mb-1.5">
                <span className={waConnected ? 'text-emerald-400' : 'text-amber-400'}>
                  {waConnected ? 'متصل' : 'غير مرتبط'}
                </span>
              </div>
            )}
            {k.value === null ? (
              <div className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                <div>في الطابور: <span className="font-bold text-slate-700 dark:text-slate-200" dir="ltr">{queuePending}</span></div>
                <div>تأخير <span dir="ltr">{antiBlock.minDelaySeconds}-{antiBlock.maxDelaySeconds}</span> ثانية</div>
              </div>
            ) : sent === 0 ? (
              <div className="text-[11px] text-slate-500 dark:text-slate-500">لا بيانات بعد</div>
            ) : (
              <Sparkline values={k.values} stroke={i === 1 ? '#60a5fa' : i === 2 ? '#a5b4fc' : '#34d399'} />
            )}
            {k.value !== null && (
              <div className="text-[11px] text-slate-500 mt-1.5">{k.sub}</div>
            )}
          </StaggerItem>
        ))}
      </Stagger>

      {/* Chart + side column */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 p-5 rounded-3xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">الإرسال الفعلي — آخر 7 أيام</h2>
              <p className="text-[11px] text-slate-500">من سجل هذا الخادم</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> مرسلة</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-teal-300" /> ردود</span>
            </div>
          </div>
          <div className="h-56 flex items-end justify-between gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-hidden">
            {weekly.map((d) => (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group min-w-0">
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono opacity-0 group-hover:opacity-100 transition">
                  {d.sent.toLocaleString('ar-EG')}
                </div>
                <div className="w-full max-w-[40px] flex items-end gap-1 h-full min-h-0">
                  <div
                    className="flex-1 bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-md"
                    style={{ height: `${barH(d.sent)}%` }}
                    title={`مرسلة: ${d.sent}`}
                  />
                  <div
                    className="flex-1 bg-gradient-to-t from-teal-600 to-teal-300 rounded-t-md"
                    style={{ height: `${barH(d.replied)}%` }}
                    title={`ردود: ${d.replied}`}
                  />
                </div>
                <span className="text-[10px] font-bold text-slate-500 group-hover:text-emerald-400 transition">{d.day}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <MiniStat label="حملات نشطة" value={campaigns.filter((c) => c.status === 'running').length} tone="text-emerald-400" />
            <MiniStat label="إخفاقات" value={failed} tone="text-red-400" icon={<XCircle className="w-3.5 h-3.5" />} />
            <MiniStat label="تفاعل" value={`%${replyRate}`} tone="text-teal-400" />
            <MiniStat label="ردود البوت" value={replied} tone="text-amber-400" />
          </div>
        </div>

        <div className="space-y-4">
          {/* Active campaign */}
          <div className="p-5 rounded-3xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                {activeCampaign?.status === 'running' && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                )}
                الحملة النشطة
              </span>
              <button onClick={() => onNavigate('campaigns')} className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold cursor-pointer">
                كل الحملات
              </button>
            </div>
            {activeCampaign ? (
              <div className="space-y-2.5">
                <div className="text-[13px] font-bold text-slate-900 dark:text-slate-100 leading-snug">{activeCampaign.name}</div>
                <div className="flex justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  <span>{activeCampaign.sentCount} / {activeCampaign.totalRecipients}</span>
                  <span className="text-emerald-400 font-bold">{activeCampaign.progressPercent}%</span>
                </div>
                <ProgressBar value={activeCampaign.progressPercent} live={activeCampaign.status === 'running'} />
                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <MiniStat label="ناجحة" value={activeCampaign.deliveredCount} tone="text-emerald-400" />
                  <MiniStat label="فاشلة" value={activeCampaign.failedCount} tone="text-red-400" />
                  <MiniStat label="تفاعل" value={activeCampaign.repliedCount} tone="text-indigo-400" />
                </div>
              </div>
            ) : (
              <div className="text-center py-5">
                <p className="text-[11px] text-slate-500 mb-3">لا حملات بعد — ابدأ أول بث جماعي</p>
                <Button size="sm" onClick={() => onNavigate('campaigns')}>
                  <Megaphone className="w-3.5 h-3.5" />
                  إنشاء حملة
                </Button>
              </div>
            )}
          </div>

          {/* Live activity feed */}
          <div className="p-5 rounded-3xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                النشاط المباشر
              </span>
              <Badge tone="gray">مباشر</Badge>
            </div>
            {sendLog.length === 0 ? (
              <p className="text-[11px] text-slate-500 leading-relaxed">
                لا إرسالات بعد. أول رسالة ترسلها ستظهر هنا لحظياً.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {sendLog.slice(0, 8).map((l) => (
                  <div key={l.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-100/70 dark:bg-slate-950/70 border border-slate-200/60 dark:border-slate-800/60 text-[11px]">
                    {l.status === 'sent' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                    )}
                    <span className="font-mono text-slate-600 dark:text-slate-300" dir="ltr">+{l.phone}</span>
                    <span className="mr-auto text-[10px] text-slate-500 shrink-0">{l.timestamp}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Shortcuts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Shortcut
          icon={<Send className="w-5 h-5" />}
          tone="text-emerald-400 bg-emerald-500/10 group-hover:scale-110"
          title="إرسال مباشر"
          hint="أرقام + Spintax + وسائط — إرسال فوري"
          onClick={() => onNavigate('fast_sender')}
        />
        <Shortcut
          icon={<Sparkles className="w-5 h-5" />}
          tone="text-amber-400 bg-amber-500/10 group-hover:scale-110"
          title={geminiReady ? 'البوت + Gemini' : 'البوت الذكي'}
          hint="قواعد ترد على عملائك 24/7"
          onClick={() => onNavigate('bot_manager')}
        />
        <Shortcut
          icon={<Inbox className="w-5 h-5" />}
          tone="text-blue-400 bg-blue-500/10 group-hover:scale-110"
          title="صندوق الوارد"
          hint="رسائل العملاء الحقيقية لحظياً"
          onClick={() => onNavigate('inbox')}
        />
      </div>
    </div>
  );
};

function MiniStat({ label, value, tone, icon }: { label: string; value: React.ReactNode; tone: string; icon?: React.ReactNode }) {
  return (
    <div className="p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-950/70 border border-slate-200/60 dark:border-slate-800/60 text-center">
      <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
      <div className={`text-sm font-black font-mono flex items-center justify-center gap-1 ${tone}`}>
        {icon}
        {typeof value === 'number' ? <CountUp value={value} /> : value}
      </div>
    </div>
  );
}

function Shortcut({ icon, tone, title, hint, onClick }: { icon: React.ReactNode; tone: string; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group p-4 rounded-3xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 hover:border-emerald-500/30 transition text-right cursor-pointer"
    >
      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-transform mb-2.5 ${tone}`}>
        {icon}
      </div>
      <div className="text-[13px] font-black text-slate-900 dark:text-slate-100">{title}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>
    </button>
  );
}

function Checklist({
  waConnected,
  contactsCount,
  sent,
  onOpenConnect,
  onNavigate,
  onOpenQuickSend,
}: {
  waConnected: boolean;
  contactsCount: number;
  sent: number;
  onOpenConnect: () => void;
  onNavigate: (tab: NavigationTab) => void;
  onOpenQuickSend: () => void;
}) {
  const steps = [
    {
      done: waConnected,
      icon: <Smartphone className="w-4 h-4" />,
      title: 'اربط رقم الواتساب',
      hint: 'امسح رمز QR مرة واحدة',
      action: onOpenConnect,
      actionLabel: 'ربط الآن',
    },
    {
      done: contactsCount > 0,
      icon: <Users className="w-4 h-4" />,
      title: 'أضف جهات الاتصال',
      hint: 'يدوياً أو باستيراد CSV',
      action: () => onNavigate('contacts'),
      actionLabel: 'إضافة',
    },
    {
      done: sent > 0,
      icon: <Send className="w-4 h-4" />,
      title: 'أرسل أول رسالة',
      hint: 'جرب الإرسال السريع',
      action: onOpenQuickSend,
      actionLabel: 'إرسال',
    },
  ];
  const doneSteps = steps.filter((s) => s.done).length;

  if (doneSteps >= steps.length) {
    return (
      <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-300 text-xs font-bold anim-fade-up">
        <PartyPopper className="w-4 h-4 shrink-0" />
        <span>النظام جاهز بالكامل — رقم مرتبط وجهات اتصال وإرسال يعمل.</span>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-3xl glass border border-slate-300/60 dark:border-slate-700/60 anim-fade-up">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <ListChecks className="w-4 h-4 text-emerald-400" />
          <span>ابدأ في 3 خطوات</span>
        </div>
        <span dir="ltr" className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{doneSteps} / 3</span>
      </div>
      <ProgressBar value={(doneSteps / steps.length) * 100} className="mb-4 h-1.5" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {steps.map((s, i) => (
          <div
            key={i}
            className={`p-3.5 rounded-2xl border flex items-center gap-3 transition ${
              s.done ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-slate-100/60 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800'
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                s.done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
              }`}
            >
              {s.done ? <CheckCircle2 className="w-4 h-4" /> : s.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-xs font-bold ${s.done ? 'text-emerald-300' : 'text-slate-900 dark:text-white'}`}>{s.title}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">{s.hint}</div>
            </div>
            {!s.done && (
              <Button size="sm" onClick={s.action}>
                {s.actionLabel}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
