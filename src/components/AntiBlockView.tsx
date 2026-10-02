import React, { useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  Flame,
  Clock,
  Copy,
  Check,
} from 'lucide-react';
import { AntiBlockConfig } from '../types';
import {
  calculateSpintaxPermutations,
  generateSpintaxSamples,
  assessBanRisk,
} from '../utils/antiBlock';
import { Button, Badge, Toggle, Textarea, ProgressBar, Field } from './kit';
import { SectionHeader, Stagger, StaggerItem, Card } from './ui';

interface AntiBlockViewProps {
  config: AntiBlockConfig;
  onUpdateConfig: (newConfig: AntiBlockConfig) => void;
  activeAudience?: number;
  sentToday?: number;
  sentThisHour?: number;
}

export const AntiBlockView: React.FC<AntiBlockViewProps> = ({
  config,
  onUpdateConfig,
  activeAudience = 0,
  sentToday = 0,
  sentThisHour = 0,
}) => {
  const [testTemplate, setTestTemplate] = useState<string>('');

  const [samplesCount, setSamplesCount] = useState<number>(6);
  const [generatedSamples, setGeneratedSamples] = useState<string[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const permutations = calculateSpintaxPermutations(testTemplate);
  const riskAssessment = assessBanRisk(config, testTemplate, Math.max(1, activeAudience));
  // real duplicate estimate: when audience exceeds available variants, repeats are inevitable
  const duplicateRate =
    permutations > 1 && activeAudience > permutations
      ? (((activeAudience - permutations) / activeAudience) * 100).toFixed(1)
      : '0.0';

  const handleGenerateSamples = () => {
    setGeneratedSamples(generateSpintaxSamples(testTemplate, samplesCount));
  };

  const handleCopySample = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  const healthTone: 'green' | 'amber' | 'red' =
    riskAssessment.healthScore >= 70 ? 'green' : riskAssessment.healthScore >= 40 ? 'amber' : 'red';

  const pillars = [
    {
      icon: <Sparkles className="w-4 h-4" />,
      iconClass: 'bg-emerald-500/10 text-emerald-400',
      title: '1. خوارزمية Spintax الذكية',
      desc: 'توليد رسائل فريدة ومختلفة في الصياغة لكل عميل، مما يمنع خوارزميات واتساب من رصد الرسائل المكررة (Spam).',
    },
    {
      icon: <Clock className="w-4 h-4" />,
      iconClass: 'bg-blue-500/10 text-blue-400',
      title: '2. التأخير الزمني البشري (Jitter)',
      desc: `فواصل زمنية عشوائية تتراوح بين ${config.minDelaySeconds} إلى ${config.maxDelaySeconds} ثانية تحاكي سرعة وسلوك الإنسان الفعلي.`,
    },
    {
      icon: <Flame className="w-4 h-4" />,
      iconClass: 'bg-amber-500/10 text-amber-400',
      title: '3. نظام تسخين الحساب التدريجي',
      desc: `سقف أمان ${config.enableWarmupMode ? 'مفعّل' : 'معطّل'}: ${config.enableWarmupMode ? '25 رسالة/ساعة + 300/يوم لكل حساب، والحسابات الجديدة نصف السقف أول 7 أيام' : 'بدون سقف ساعي — فعّله للأرقام الجديدة'}.`,
    },
    {
      icon: <ShieldAlert className="w-4 h-4" />,
      iconClass: 'bg-red-500/10 text-red-400',
      title: '4. مانع البلاغات التلقائي',
      desc: 'كشف فوري لكلمات (إلغاء، STOP) وإيقاف المراسلة فوراً لحماية الرقم من إبلاغ العميل عن محتوى مزعج.',
    },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<ShieldCheck className="w-5 h-5" />}
        title="درع مكافحة الحظر وخوارزميات الأمان (Anti-Block Engine)"
        hint="منظومة أمان ذكية متعددة الطبقات لتجاوز قيود خوارزميات واتساب وتفادي أي حظر للأرقام نهائياً"
        action={
          <Badge tone={healthTone} className="px-4 py-2 text-xs rounded-2xl">
            <span className="w-2.5 h-2.5 rounded-full bg-current animate-pulse" />
            <span>
              حالة الأمان الحالية: {riskAssessment.healthScore}% ({riskAssessment.statusAr})
            </span>
          </Badge>
        }
      />

      {/* 4 Pillars of Anti-Block in Wamora */}
      <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {pillars.map((p) => (
          <StaggerItem key={p.title}>
            <Card className="p-5 space-y-2 h-full">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${p.iconClass}`}>
                {p.icon}
              </div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">{p.title}</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{p.desc}</p>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      {/* Main Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Anti-Block Parameters Config (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <Card className="p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                إعدادات خوارزميات الإرسال الآمن
              </h2>
              <Badge tone="green" className="font-mono">
                جمهور نشط: {activeAudience.toLocaleString('ar-EG')}
              </Badge>
            </div>

            {/* Delay Range Sliders */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span>الحد الأدنى للتأخير بين الرسائل:</span>
                  <span className="text-emerald-400 font-mono">{config.minDelaySeconds} ثانية</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="30"
                  value={config.minDelaySeconds}
                  onChange={(e) =>
                    onUpdateConfig({ ...config, minDelaySeconds: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>5 ثوانٍ (سريع)</span>
                  <span>15 ثانية (موصى به)</span>
                  <span>30 ثانية (فائق الأمان)</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span>الحد الأقصى للتأخير مع التذبذب العشوائي:</span>
                  <span className="text-blue-400 font-mono">{config.maxDelaySeconds} ثانية</span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="60"
                  value={config.maxDelaySeconds}
                  onChange={(e) =>
                    onUpdateConfig({ ...config, maxDelaySeconds: parseInt(e.target.value, 10) })
                  }
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>

              {/* Batch Pause Settings (editable) */}
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                    <span>حجم الدفعة قبل الراحة:</span>
                    <span className="text-amber-400 font-mono">كل {config.batchSize} رسالة</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="200"
                    step="5"
                    value={config.batchSize}
                    onChange={(e) =>
                      onUpdateConfig({ ...config, batchSize: parseInt(e.target.value, 10) })
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                    <span>مدة الراحة بين الدفعات:</span>
                    <span className="text-amber-400 font-mono">{config.batchPauseMinutes} دقائق</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={config.batchPauseMinutes}
                    onChange={(e) =>
                      onUpdateConfig({ ...config, batchPauseMinutes: parseInt(e.target.value, 10) })
                    }
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Feature Toggles */}
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <Toggle
                checked={config.useSpintax}
                onChange={(v) => onUpdateConfig({ ...config, useSpintax: v })}
                label="تفعيل خوارزمية Spintax للتنويع"
                hint="تبديل الكلمات والعبارات لكل رسالة على حدة"
              />
              <Toggle
                checked={config.enableWarmupMode}
                onChange={(v) => onUpdateConfig({ ...config, enableWarmupMode: v })}
                label="وضع تسخين الحساب (Account Warm-up)"
                hint="جدولة تلقائية لزيادة حجم الرسائل تدريجياً"
              />
              <Toggle
                checked={config.randomizeSendOrder}
                onChange={(v) => onUpdateConfig({ ...config, randomizeSendOrder: v })}
                label="خلط ترتيب قائمة الأرقام عشوائياً"
                hint="تجنب الإرسال النمطي المتسلسل لأرقام متقاربة"
              />
              <Toggle
                checked={config.autoUnsubscribeKeyword}
                onChange={(v) => onUpdateConfig({ ...config, autoUnsubscribeKeyword: v })}
                label="تحييد أرقام الإلغاء فورياً (Opt-Out Shield)"
                hint="منع وصول أي حملة جديدة لمن أرسل كلمة إلغاء"
              />
            </div>
          </Card>
        </div>

        {/* Live Spintax Tester & Preview Generator (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  مختبر ومولّد صياغات Spintax التفاعلي
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  استخدم الصيغة <code className="text-emerald-400 font-mono">{`{خيار 1|خيار 2|خيار 3}`}</code> لصنع آلاف الرسائل المختلفة
                </p>
              </div>

              <div className="text-right">
                <div className="text-xs font-black text-emerald-400 font-mono">
                  {permutations.toLocaleString('ar-SA')} صياغة ممكنة
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">التكرار المتوقع على جمهورك: %{duplicateRate}</div>
              </div>
            </div>

            <Field label="نص الاختبار:">
              <Textarea
                rows={4}
                value={testTemplate}
                onChange={(e) => setTestTemplate(e.target.value)}
                placeholder="الصق نص رسالتك هنا لاختبار تنويعاتها... مثال: {مرحباً|أهلاً} {{name}}!"
                className="font-mono"
              />
            </Field>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                عينات رسائل حية كما يستلمها العملاء بشكل عشوائي:
              </span>
              <Button variant="primary" size="sm" onClick={handleGenerateSamples}>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>توليد عينات جديدة</span>
              </Button>
            </div>

            {/* Generated Samples Grid */}
            <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {generatedSamples.map((sample, idx) => (
                <StaggerItem key={idx}>
                  <Card className="p-3.5 rounded-2xl hover:border-slate-400 dark:hover:border-slate-700 transition flex flex-col justify-between gap-2 group !bg-slate-100 dark:bg-slate-950">
                    <div className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {sample}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <span className="font-mono text-emerald-400">عميل #{idx + 1} (نسخة فريدة)</span>
                      <button
                        onClick={() => handleCopySample(sample, idx)}
                        className="flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer transition"
                      >
                        {copiedIdx === idx ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">تم النسخ</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>نسخ</span>
                          </>
                        )}
                      </button>
                    </div>
                  </Card>
                </StaggerItem>
              ))}
            </Stagger>
          </Card>

          {/* Real Warm-up Throttle Status */}
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">حد التسخين الساعي (Warm-up Throttle)</h3>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">سقف الإرسال المطبق فعلياً على المحرك الآن</div>
                </div>
              </div>
              <Badge tone={config.enableWarmupMode ? 'green' : 'gray'}>
                {config.enableWarmupMode ? 'مفعّل: 25/ساعة + 300/يوم' : 'معطّل: بلا سقف'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-center text-xs">
              <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">مرسلة خلال الساعة الحالية</div>
                <div className="font-black text-slate-900 dark:text-white font-mono text-sm">
                  {sentThisHour.toLocaleString('ar-EG')} / {config.enableWarmupMode ? '25' : '∞'}
                </div>
                <ProgressBar
                  tone="amber"
                  value={config.enableWarmupMode ? (sentThisHour / 25) * 100 : 0}
                  className="mt-2 !h-1.5"
                />
              </div>
              <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">مرسلة اليوم</div>
                <div className="font-black text-emerald-400 font-mono text-sm">
                  {sentToday.toLocaleString('ar-EG')}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">من السجل الفعلي</div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">جمهور نشط</div>
                <div className="font-black text-blue-400 font-mono text-sm">
                  {activeAudience.toLocaleString('ar-EG')}
                </div>
                <div className="text-[10px] text-slate-500 mt-1">جهات اتصال غير ملغاة</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
