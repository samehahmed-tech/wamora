import React, { useState, useEffect, useRef } from 'react';
import { EmojiPicker, insertAtCursor } from './EmojiPicker';
import {
  Send,
  Image as ImageIcon,
  Video,
  FileText,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Copy,
  Trash2,
  RefreshCw,
  Phone,
  Eye,
  Check,
  CheckCheck,
  BookmarkCheck,
  Sparkles as SparklesIcon,
} from 'lucide-react';
import {
  sanitizePhoneNumber,
  resolveSpintax,
  calculateSpintaxPermutations,
  generateSpintaxSamples,
  assessBanRisk,
} from '../utils/antiBlock';
import { MediaAttachment, MessageTemplate, AntiBlockConfig, ContactGroup, Contact } from '../types';
import { DEFAULT_ANTIBLOCK, SendLogShape } from '../defaults';
import { post } from '../api';
import { Button, Field, Input, Textarea, Select, Badge, ProgressBar, Toggle, toast } from './kit';
import { SectionHeader, Card } from './ui';
import { MediaPicker } from './MediaPicker';

export interface FastSenderAccount {
  id: string;
  name: string;
  state: string;
}

interface FastSenderViewProps {
  templates?: MessageTemplate[];
  initialTemplate?: MessageTemplate | null;
  antiBlock?: AntiBlockConfig;
  waConnected?: boolean;
  sendLog?: SendLogShape[];
  queuePending?: number;
  onRequestConnect?: () => void;
  accounts?: FastSenderAccount[];
  groups?: ContactGroup[];
  contacts?: Contact[];
}

/** extract {{var}} / {var} / [var] placeholders, excluding {a|b} spintax groups */
function extractVariables(text: string): string[] {
  const found = new Set<string>();
  const re = /\{\{\s*([A-Za-z0-9_\u0600-\u06FF]+)\s*\}\}|\[\s*([A-Za-z0-9_\u0600-\u06FF]+)\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const v = m[1] || m[2];
    if (v && !v.includes('|')) found.add(v);
  }
  const single = /\{\s*([A-Za-z0-9_\u0600-\u06FF][^|{}]*?)\s*\}/g;
  while ((m = single.exec(text))) {
    const v = (m[1] || '').trim();
    if (v && !v.includes('|') && !v.startsWith('{')) found.add(v);
  }
  return [...found];
}

export const FastSenderView: React.FC<FastSenderViewProps> = ({
  templates = [],
  initialTemplate = null,
  antiBlock = DEFAULT_ANTIBLOCK,
  waConnected = false,
  sendLog = [],
  queuePending = 0,
  onRequestConnect,
  accounts = [],
  groups = [],
  contacts = [],
}) => {
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [defaultCountryCode, setDefaultCountryCode] = useState<string>('966');
  const [messageText, setMessageText] = useState<string>(initialTemplate ? initialTemplate.body : '');

  const [selectedMediaType, setSelectedMediaType] = useState<'none' | 'image' | 'video' | 'document'>(
    initialTemplate?.mediaType || 'none'
  );
  const [mediaAttachment, setMediaAttachment] = useState<MediaAttachment>({
    type: initialTemplate?.mediaType && initialTemplate.mediaType !== 'none' ? initialTemplate.mediaType : 'image',
    url: initialTemplate?.mediaUrl || '',
    name: initialTemplate?.mediaName || '',
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(initialTemplate?.id || '');
  const [loadedTemplateTitle, setLoadedTemplateTitle] = useState<string>(initialTemplate?.title || '');

  // Variable values — editable, derived from the detected placeholders
  const detectedVars = extractVariables(messageText);
  const [varValues, setVarValues] = useState<Record<string, string>>({});

  // Sync when initialTemplate changes from parent (e.g. from MessageTemplatesView)
  useEffect(() => {
    if (initialTemplate) {
      setMessageText(initialTemplate.body);
      setSelectedTemplateId(initialTemplate.id);
      setLoadedTemplateTitle(initialTemplate.title);
      if (initialTemplate.mediaType && initialTemplate.mediaType !== 'none') {
        setSelectedMediaType(initialTemplate.mediaType);
        setMediaAttachment({
          type: initialTemplate.mediaType,
          url: initialTemplate.mediaUrl || '',
          name: initialTemplate.mediaName || '',
        });
      } else {
        setSelectedMediaType('none');
      }
    }
  }, [initialTemplate]);

  // When a template is chosen from dropdown
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const found = templates.find((t) => t.id === templateId);
    if (!found) return;

    setMessageText(found.body);
    setLoadedTemplateTitle(found.title);

    if (found.mediaType && found.mediaType !== 'none') {
      setSelectedMediaType(found.mediaType);
      setMediaAttachment({
        type: found.mediaType,
        url: found.mediaUrl || '',
        name: found.mediaName || '',
      });
    } else {
      setSelectedMediaType('none');
    }
  };

  const [isSending, setIsSending] = useState<boolean>(false);
  const [forceSend, setForceSend] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const [accountScope, setAccountScope] = useState<string>('auto');
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [batchPhones, setBatchPhones] = useState<{ phone: string; formatted: string }[]>([]);
  const [aiVariants, setAiVariants] = useState<string[]>([]);
  const [aiProvider, setAiProvider] = useState<string>('');
  const [variantCount, setVariantCount] = useState<number>(20);
  const [generating, setGenerating] = useState(false);

  const handleGenerateVariants = async () => {
    if (!messageText.trim() || generating) return;
    setGenerating(true);
    try {
      const res = await post<{ variants: string[]; provider: string }>('/api/ai/variants', {
        text: messageText,
        count: variantCount,
      });
      setAiVariants(res.variants || []);
      setAiProvider(res.provider || '');
      if (!res.variants?.length) toast('لم ينتج أي صياغة.', 'error');
    } catch (e: any) {
      toast(e?.message || 'تعذر التوليد.', 'error');
    } finally {
      setGenerating(false);
    }
  };
  const [showPreviewVariation, setShowPreviewVariation] = useState<number>(0);

  // Parse phone numbers
  const rawLines = phoneInput
    .split(/[\n,;]+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsedNumbers = rawLines.map((num) => sanitizePhoneNumber(num, defaultCountryCode));
  const validNumbers = parsedNumbers.filter((p) => p.isValid);
  const invalidNumbers = parsedNumbers.filter((p) => !p.isValid);

  // Spintax calculations
  const permutations = calculateSpintaxPermutations(messageText);
  const sampleVariations = generateSpintaxSamples(messageText, 3);
  const rawPreview = sampleVariations[showPreviewVariation % sampleVariations.length] || resolveSpintax(messageText);
  const previewText = resolveSpintax(rawPreview, varValues);

  // Ban risk (real config from the Anti-Block settings)
  const riskAssessment = assessBanRisk(antiBlock, messageText, validNumbers.length);

  // Insert Spintax helper tag
  const insertTag = (tag: string) => {
    setMessageText((prev) => prev + ' ' + tag);
  };

  // Results of the current batch, matched by job id (arrive live via the server log)
  const batchResults = batchIds.length
    ? sendLog.filter((l) => l.jobId && batchIds.includes(l.jobId))
    : [];
  const batchDoneCount = batchResults.length;

  // Real dispatch: enqueue on the server, results stream back through the live log
  const handleStartSending = async () => {
    if (validNumbers.length === 0 || isSending) {
      if (validNumbers.length === 0 && !isSending) {
        setSendError('أدخل رقم هاتف صالحاً واحداً على الأقل قبل الإرسال.');
        toast('أدخل رقم هاتف صالحاً واحداً على الأقل قبل الإرسال.', 'error');
      }
      return;
    }
    if (!waConnected) {
      setSendError('لا توجد جلسة واتساب متصلة. اربط رقمك أولاً ثم أعد المحاولة.');
      toast('لا توجد جلسة واتساب متصلة. اربط رقمك أولاً ثم أعد المحاولة.', 'error');
      onRequestConnect?.();
      return;
    }
    if (!messageText.trim() && (selectedMediaType === 'none' || !mediaAttachment.url)) {
      setSendError('اكتب نص الرسالة أو أرفق وسائط برابط صالح.');
      toast('اكتب نص الرسالة أو أرفق وسائط برابط صالح.', 'error');
      return;
    }
    setIsSending(true);
    setSendError(null);
    try {
      const chk = forceSend
        ? null
        : await post<{ alreadySent: string[]; dupesInList: string[]; unique: string[] }>('/api/send-check', {
            phones: validNumbers.map((v) => v.phone),
            message: messageText,
          }).catch(() => null);
      if (chk && (chk.alreadySent.length || chk.dupesInList.length)) {
        toast(`تخطي ${chk.alreadySent.length + chk.dupesInList.length} مكرر/مُرسل له من قبل.`, 'error');
        if (!chk.unique.length) { setIsSending(false); return; }
      }
      const res = await post<{ accepted: boolean; jobCount: number; jobIds: string[]; skipped?: number }>('/api/whatsapp/send', {
        phones: validNumbers.map((v) => v.phone),
        message: messageText,
        accountId: accountScope,
        mediaType: selectedMediaType !== 'none' ? selectedMediaType : undefined,
        mediaUrl: selectedMediaType !== 'none' ? mediaAttachment.url : undefined,
        mediaName: selectedMediaType !== 'none' ? mediaAttachment.name : undefined,
        variables: varValues,
        force: forceSend,
      });
      setBatchIds(res.jobIds || []);
      setBatchPhones(validNumbers.map((v) => ({ phone: v.phone, formatted: v.formatted })));
    } catch (e: any) {
      setSendError(e?.message || 'فشل إرسال الطلب إلى الخادم.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <SectionHeader
        icon={<Send className="w-5 h-5" />}
        title="الإرسال المباشر والفوري للأرقام"
        hint="أرسل رسائل مخصصة مدعومة بالوسائط وصياغات Spintax الذكية لأي قائمة أرقام فوراً"
        action={
          <Badge tone={riskAssessment.status === 'high_risk' ? 'red' : riskAssessment.status === 'moderate' ? 'amber' : 'green'}>
            <ShieldCheck className="w-4 h-4" />
            <span>درع مكافحة الحظر: نشط ({riskAssessment.statusAr})</span>
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left / Input Column (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Numbers Input Box */}
          <Card className="p-5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-emerald-400" />
                أرقام الهواتف المستهدفة (الصق أو اكتب الأرقام)
              </label>

              {/* Country Code Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">مفتاح الدولة الافتراضي:</span>
                <Select
                  value={defaultCountryCode}
                  onChange={(e) => setDefaultCountryCode(e.target.value)}
                  className="w-auto px-2 py-1 text-xs font-bold text-emerald-300 rounded-lg"
                >
                  <option value="966">السعودية (+966)</option>
                  <option value="20">مصر (+20)</option>
                  <option value="971">الإمارات (+971)</option>
                  <option value="965">الكويت (+965)</option>
                  <option value="974">قطر (+974)</option>
                  <option value="968">عمان (+968)</option>
                  <option value="962">الأردن (+962)</option>
                </Select>
              </div>
            </div>

            <Field label="أرقام الهواتف المستهدفة" hint="كل رقم في سطر أو مفصولة بفواصل">
              {groups.length > 0 && (
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  <Select
                    value=""
                    onChange={(e) => {
                      const g = groups.find((x) => x.id === e.target.value);
                      if (!g) return;
                      const norm = (p: string) => String(p || '').replace(/[^0-9]/g, '');
                      const set = new Set(phoneInput.split(/[\n,;]+/).map(norm).filter(Boolean));
                      [...(g.phones || []).map(norm), ...contacts.filter((c) => {
                        if (c.status !== 'active') return false;
                        const hitTag = g.tag && (c.tags || []).includes(g.tag);
                        const hitRegion = g.region && (c.region === g.region || (c.tags || []).includes(g.region) || (c.tags || []).includes(`منطقة:${g.region}`));
                        return (g.tag || g.region) ? (hitTag || hitRegion) : false;
                      }).map((c) => norm(c.phone))].forEach((p) => { if (p) set.add(p); });
                      setPhoneInput([...set].join('\n'));
                    }}
                    className="text-[11px]"
                  >
                    <option value="">+ إضافة مجموعة...</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.region ? ` — ${g.region}` : ''}</option>)}
                  </Select>
                </div>
              )}
              <Textarea
                rows={4}
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="اكتب أو الصق الأرقام هنا (كل رقم في سطر أو مفصولة بفواصل)&#10;مثال: 0501234567 أو 966501234567"
                className="font-mono"
                dir="ltr"
              />
            </Field>

            {/* Validation Ticker */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-emerald-400 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {validNumbers.length} رقم صالح وجاهز للإرسال
                </span>
                {invalidNumbers.length > 0 && (
                  <span className="flex items-center gap-1 text-rose-400 font-bold">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {invalidNumbers.length} غير صالح (سيتم تخطيه)
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPhoneInput('')}
              >
                <Trash2 className="w-3 h-3" />
                مسح القائمة
              </Button>
            </div>
          </Card>

          {/* Message Content & Spintax Box */}
          <Card className="p-5 space-y-4">
            {/* Quick Template Picker Bar */}
            <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <BookmarkCheck className="w-4 h-4 text-emerald-400" />
                  <span>تحميل من قوالب الرسائل الجاهزة:</span>
                </label>

                <Select
                  value={selectedTemplateId}
                  onChange={(e) => handleSelectTemplate(e.target.value)}
                  className="sm:w-64 text-emerald-300 font-bold"
                >
                  <option value="">-- اختر قالباً محفوظاً للاستخدام --</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.categoryAr})
                    </option>
                  ))}
                </Select>
              </div>

              {loadedTemplateTitle && (
                <div className="flex items-center justify-between text-[11px] text-emerald-400 pt-1 border-t border-slate-900">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    تم تحميل القالب: <strong>{loadedTemplateTitle}</strong>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedTemplateId('');
                      setLoadedTemplateTitle('');
                    }}
                  >
                    تفريغ
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-emerald-400" />
                نص الرسالة (يدعم Spintax والمتغيرات الديناميكية)
              </label>

              {/* Permutations count */}
              <Badge tone="blue">
                {permutations > 1 ? `${permutations} صياغة فريدة للرسالة` : 'صياغة واحدة (نص ثابت)'}
              </Badge>
            </div>

            {/* Quick Spintax Insert Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1">إضافة Spintax ذكي:</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => insertTag('{مرحباً|أهلاً بكم|السلام عليكم}')}
              >
                + الترحيب التبادلي
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => insertTag('{عزيزنا العميل|مشتركنا الكريم|صديقنا}')}
              >
                + صفة العميل
              </Button>
              <Button
                type="button"
                variant="soft"
                size="sm"
                className="font-mono"
                onClick={() => insertTag('{{name}}')}
              >
                + {'{{name}}'}
              </Button>
              <Button
                type="button"
                variant="soft"
                size="sm"
                className="font-mono"
                onClick={() => insertTag('{{discount_code}}')}
              >
                + {'{{discount_code}}'}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => insertTag('\nللإلغاء أرسل "إلغاء"')}
              >
                + كود الإلغاء (STOP)
              </Button>
            </div>

            <Field label="نص الرسالة (يدعم Spintax والمتغيرات الديناميكية)">
              <div className="flex justify-end mb-1.5">
                <EmojiPicker small onPick={(e) => insertAtCursor(messageRef.current, e, setMessageText)} />
              </div>
              <Textarea
                ref={messageRef as any}
                rows={6}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="اكتب نص الرسالة هنا... مثال: {مرحباً|أهلاً} {{name}}! كودك: {{discount_code}}"
              />
            </Field>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button variant="soft" size="sm" onClick={handleGenerateVariants} loading={generating} disabled={generating || !messageText.trim()}>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>توليد صياغات بالذكاء الاصطناعي</span>
                </Button>
                <Select value={String(variantCount)} onChange={(e) => setVariantCount(Number(e.target.value))} className="!w-auto">
                  {[4, 8, 12, 20, 30].map((n) => (
                    <option key={n} value={n}>{n} صياغة</option>
                  ))}
                </Select>
              </div>
              {aiProvider && <Badge tone="teal">عبر {aiProvider}</Badge>}
            </div>

            {aiVariants.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  اختر صياغة لاستبدال النص:
                </div>
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {aiVariants.map((v, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setMessageText(v);
                        setAiVariants([]);
                        toast('تم اعتماد الصياغة.');
                      }}
                      className="w-full text-right p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 text-[11px] text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap transition cursor-pointer"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Dynamic variable values */}
            {detectedVars.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  قيم المتغيرات المكتشفة في النص (تُستخدم في المعاينة والإرسال):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {detectedVars.map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-emerald-400 shrink-0 min-w-[90px]" dir="ltr">
                        {`{{${v}}}`}
                      </span>
                      <Input
                        type="text"
                        value={varValues[v] || ''}
                        onChange={(e) => setVarValues((prev) => ({ ...prev, [v]: e.target.value }))}
                        placeholder="القيمة..."
                        className="flex-1 text-[11px]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Media Attachment Selector */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">إرفاق وسائط متعددة مع الرسالة:</label>
              <div className="grid grid-cols-4 gap-2">
                <Button
                  type="button"
                  variant={selectedMediaType === 'none' ? 'soft' : 'ghost'}
                  size="sm"
                  onClick={() => setSelectedMediaType('none')}
                >
                  <span>نص فقط</span>
                </Button>
                <Button
                  type="button"
                  variant={selectedMediaType === 'image' ? 'soft' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setSelectedMediaType('image');
                    setMediaAttachment((prev) => ({ ...prev, type: 'image' }));
                  }}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>صورة عريضة</span>
                </Button>
                <Button
                  type="button"
                  variant={selectedMediaType === 'video' ? 'soft' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setSelectedMediaType('video');
                    setMediaAttachment((prev) => ({ ...prev, type: 'video' }));
                  }}
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>فيديو دعائي</span>
                </Button>
                <Button
                  type="button"
                  variant={selectedMediaType === 'document' ? 'soft' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setSelectedMediaType('document');
                    setMediaAttachment((prev) => ({ ...prev, type: 'document' }));
                  }}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>ملف PDF</span>
                </Button>
              </div>

              {selectedMediaType !== 'none' && (
                <MediaPicker
                  label="ملف الوسائط"
                  value={
                    mediaAttachment.url
                      ? { type: selectedMediaType as 'image' | 'video' | 'document', url: mediaAttachment.url, name: mediaAttachment.name }
                      : null
                  }
                  onChange={(v) => {
                    if (!v) {
                      setMediaAttachment((prev) => ({ ...prev, url: '', name: '' }));
                    } else {
                      setSelectedMediaType(v.type);
                      setMediaAttachment((prev) => ({ ...prev, type: v.type, url: v.url, name: v.name }));
                    }
                  }}
                />
              )}
            </div>

            {/* Account scope */}
            <Field label="نطاق الإرسال" hint="التدوير الذكي يوزع الحمل على الأرقام النشطة في Wamora.">
              <Select value={accountScope} onChange={(e) => setAccountScope(e.target.value)}>
                <option value="auto">تدوير ذكي تلقائي (موصى به)</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.state})
                  </option>
                ))}
              </Select>
            </Field>

            {/* Dispatch Action Button */}
            <div className="pt-2 space-y-2">
              <Toggle
                checked={forceSend}
                onChange={setForceSend}
                label="إرسال بالقوة (تجاوز فحص تكرار)"
                hint="يرسل حتى لمن استلم نفس نص قبل. استخدمه عند إعادة حملة عن قصد."
              />
              <Button
                type="button"
                variant="primary"
                size="lg"
                loading={isSending}
                disabled={isSending || validNumbers.length === 0}
                onClick={handleStartSending}
                className="w-full"
              >
                {isSending ? (
                  <span>جارٍ الإرسال والتسليم الذكي مع فواصل الحماية...</span>
                ) : (
                  <>
                    <Send className="w-4 h-4 fill-white" />
                    <span>إرسال فوري إلى ({validNumbers.length}) عميل الآن</span>
                  </>
                )}
              </Button>
            </div>
          </Card>

          {sendError && (
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{sendError}</span>
              {!waConnected && onRequestConnect && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={onRequestConnect}
                >
                  ربط الرقم
                </Button>
              )}
            </div>
          )}

          {/* Live batch progress (streams from the server send log) */}
          {batchPhones.length > 0 && (
            <Card className="p-5 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  تقدم الدفعة الحالية ({batchDoneCount} / {batchPhones.length})
                </span>
                <span className="text-emerald-400 text-[11px] font-mono">
                  {batchDoneCount >= batchPhones.length ? 'اكتملت' : `في الطابور: ${queuePending}`}
                </span>
              </div>
              <ProgressBar
                value={batchPhones.length ? Math.round((batchDoneCount / batchPhones.length) * 100) : 0}
                tone="green"
                live={batchDoneCount < batchPhones.length}
              />
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {batchPhones.map((item) => {
                  const result = batchResults.find((l) => l.phone === item.phone);
                  return (
                    <div
                      key={item.phone}
                      className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-850 flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center gap-2">
                        {result?.status === 'sent' ? (
                          <CheckCheck className="w-4 h-4 text-emerald-400" />
                        ) : result?.status === 'failed' ? (
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        ) : (
                          <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
                        )}
                        <span className="text-slate-700 dark:text-slate-200 font-bold" dir="ltr">
                          {item.formatted}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        {result?.status === 'sent' && result.delaySeconds !== undefined && (
                          <span className="text-[11px] text-blue-400">تأخير أمان: {result.delaySeconds}ث</span>
                        )}
                        {result?.status === 'failed' && (
                          <span className="text-[11px] text-red-400 max-w-[220px] truncate" title={result.error}>
                            {result.error}
                          </span>
                        )}
                        {!result && <span className="text-[10px] text-amber-400">بانتظار الدور...</span>}
                        {result ? (
                          <Badge tone={result.status === 'sent' ? 'green' : 'red'}>
                            {result.status === 'sent' ? 'تم الإرسال' : 'فشل'}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Right / Live Phone Simulation (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <Eye className="w-4 h-4 text-emerald-400" />
              معاينة حية على شاشة الواتساب للعميل
            </span>
            {sampleVariations.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreviewVariation((prev) => prev + 1)}
              >
                <RefreshCw className="w-3 h-3" />
                تبديل صياغة Spintax
              </Button>
            )}
          </div>

          {/* WhatsApp Phone Mockup */}
          <div className="w-full max-w-sm mx-auto rounded-[36px] bg-slate-100 dark:bg-slate-950 border-[6px] border-slate-200 dark:border-slate-800 p-3 shadow-2xl relative overflow-hidden">
            {/* Phone Speaker & Camera Notch */}
            <div className="w-28 h-4 rounded-full bg-slate-200 dark:bg-slate-850 mx-auto mb-3"></div>

            {/* WhatsApp Chat Header */}
            <div className="bg-[#1f2c34] p-3 rounded-t-2xl flex items-center justify-between text-white border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-xs">
                  WM
                </div>
                <div>
                  <div className="text-xs font-bold flex items-center gap-1">
                    <span>معاينة الرسالة</span>
                  </div>
                  <div className="text-[10px] text-emerald-400">هكذا ستظهر للعميل</div>
                </div>
              </div>
            </div>

            {/* WhatsApp Chat Wallpaper Area */}
            <div
              className="p-3 bg-[#0b141a] min-h-[360px] flex flex-col justify-end space-y-2 rounded-b-2xl relative"
              style={{
                backgroundImage:
                  'radial-gradient(#1f2c34 1px, transparent 1px)',
                backgroundSize: '16px 16px',
              }}
            >
              {/* WhatsApp Message Bubble */}
              <div className="bg-[#005c4b] text-white p-3 rounded-2xl rounded-tr-none max-w-[90%] self-end shadow-md space-y-2 border border-emerald-600/30">
                {/* Media preview */}
                {selectedMediaType === 'image' && mediaAttachment && (
                  <div className="rounded-xl overflow-hidden max-h-40 border border-emerald-500/20">
                    <img
                      src={mediaAttachment.url}
                      alt={mediaAttachment.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {selectedMediaType === 'video' && mediaAttachment && (
                  <div className="rounded-xl overflow-hidden bg-black/40 border border-emerald-500/20 relative">
                    <video
                      src={mediaAttachment.url}
                      className="w-full max-h-36 object-cover"
                      controls
                    />
                  </div>
                )}

                {selectedMediaType === 'document' && mediaAttachment && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-emerald-300 shrink-0" />
                    <div className="text-[11px] overflow-hidden">
                      <div className="font-bold truncate">{mediaAttachment.name}</div>
                      <div className="text-[9px] text-emerald-200/70">{mediaAttachment.size} • PDF Document</div>
                    </div>
                  </div>
                )}

                {/* Message text with formatting */}
                <div className="text-xs leading-relaxed whitespace-pre-wrap">
                  {previewText}
                </div>

                {/* Timestamp and Double blue checkmarks */}
                <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-200/80 pt-0.5">
                  <span>{new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                  <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Anti-Block Tips Box */}
          <Card className="p-4 space-y-2">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              نصائح خوارزمية الأمان لمنع الحظر
            </div>
            <ul className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1.5 list-disc list-inside leading-relaxed">
              <li>
                خوارزمية <span className="text-emerald-400 font-bold">Spintax</span> تضمن أن كل عميل يستلم نصاً مختلفاً في الكلمات، مما يمنع تصنيف الرسائل كـ Spam.
              </li>
              <li>
                يتم تطبيق تأخير عشوائي بين{' '}
                <span className="text-blue-400 font-bold">
                  {antiBlock.minDelaySeconds} و {antiBlock.maxDelaySeconds} ثانية
                </span>{' '}
                بين كل رسالة ورسالة لمحاكاة سرعة الكتابة البشرية (يُضبط من صفحة الحماية).
              </li>
              <li>
                تم تضمين كلمة إلغاء الاشتراك لتفادي إبلاغ المستلمين عن رقمك لدى واتساب.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
};
