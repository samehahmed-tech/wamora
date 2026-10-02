import React, { useState, useEffect } from 'react';
import { KeyRound, FlaskConical } from 'lucide-react';
import { toast } from './kit';
import {
  Bot,
  Sparkles,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  Send,
  User,
  Sliders,
  FileText,
  Video,
  Image as ImageIcon,
  MessageSquare,
  RefreshCw,
  Power,
  ShieldCheck,
} from 'lucide-react';
import { BotRule, GeminiBotConfig } from '../types';
import { post, get, put } from '../api';
import { Button, Modal, Tabs, Field, Input, Textarea, Select, Badge } from './kit';
import { SectionHeader, EmptyState, Stagger, StaggerItem } from './ui';

interface BotManagerViewProps {
  rules: BotRule[];
  geminiConfig: GeminiBotConfig;
  geminiReady?: boolean;
  onUpdateRules: (newRules: BotRule[]) => void;
  onUpdateGeminiConfig: (newConfig: GeminiBotConfig) => void;
  onRefreshRules: () => void;
}

interface AiStatusShape {
  provider: 'auto' | 'nvidia';
  hasNvidiaKey: boolean;
  nvidiaModel: string;
  ready: boolean;
  active: string;
}

/** AI provider keys card — self-contained, keys never leave the server in full */
const AiSettingsCard: React.FC = () => {
  const [status, setStatus] = useState<AiStatusShape | null>(null);
  const [provider, setProvider] = useState<'auto' | 'nvidia'>('auto');
  const [nvidiaKey, setNvidiaKey] = useState('');
  const [nvidiaModel, setNvidiaModel] = useState('meta/llama-3.1-70b-instruct');
  const [nvidiaModels, setNvidiaModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const nvidiaModelRef = React.useRef(nvidiaModel);
  nvidiaModelRef.current = nvidiaModel;

  const persistModel = async (m: string) => {
    setNvidiaModel(m);
    nvidiaModelRef.current = m;
    try {
      await put('/api/settings/ai', { nvidiaModel: m });
    } catch (e: any) {
      toast(e?.message || 'تعذر حفظ الموديل.', 'error');
    }
  };
  const loadModels = async () => {
    setModelsLoading(true);
    try {
      const n = await get<{ models: string[] }>('/api/settings/ai/models?provider=nvidia').catch((): { models: string[] } => ({ models: [] }));
      if (n.models.length) {
        setNvidiaModels(n.models);
        // stale saved model (e.g. old function UUID) not in current list → reset + persist
        if (!n.models.includes(nvidiaModelRef.current)) {
          setNvidiaModel(n.models[0]);
          nvidiaModelRef.current = n.models[0];
          try {
            await put('/api/settings/ai', { nvidiaModel: n.models[0] });
          } catch {
            /* keep local selection */
          }
        }
      }
    } finally {
      setModelsLoading(false);
    }
  };
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('مرحبا، عندكم توصيل؟');
  const [testOut, setTestOut] = useState<string | null>(null);

  const load = async () => {
    try {
      const s = await get<AiStatusShape>('/api/settings/ai');
      setStatus(s);
      if (s.provider === 'nvidia') setProvider('nvidia');
      if (s.nvidiaModel) setNvidiaModel(s.nvidiaModel);
      if (s.hasNvidiaKey) void loadModels();
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      // server route is PUT /api/settings/ai (POST 404s)
      const s = await put<AiStatusShape>('/api/settings/ai', {
        provider,
        ...(nvidiaKey.trim() ? { nvidiaKey: nvidiaKey.trim() } : {}),
        nvidiaModel: nvidiaModel.trim(),
      });
      setStatus(s);
      setNvidiaKey('');
      toast('تم حفظ مفتاح NVIDIA.');
      void loadModels();
    } catch (e: any) {
      toast(e?.message || 'تعذر الحفظ.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    if (!testMsg.trim() || testing) return;
    setTesting(true);
    setTestOut(null);
    try {
      const r = await post<{ reply: string; provider: string }>('/api/ai/test', { message: testMsg.trim() });
      setTestOut(`[${r.provider}] ${r.reply}`);
    } catch (e: any) {
      setTestOut(`فشل: ${e?.message || 'تعذر الاتصال'}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-emerald-500" />
          <h3 className="text-sm font-black text-slate-900 dark:text-white">مفتاح NVIDIA المجاني</h3>
          {status && (
            <Badge tone={status.ready ? 'green' : 'gray'}>
              {status.ready ? `نشط: ${status.active}` : 'القواعد فقط'}
            </Badge>
          )}
        </div>
        <Tabs
          value={provider}
          onChange={(id) => setProvider(id as 'auto' | 'nvidia')}
          options={[
            { id: 'auto', label: 'تلقائي' },
            { id: 'nvidia', label: 'NVIDIA' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
        <Field
          label="مفتاح NVIDIA (build.nvidia.com — يبدأ بـ nvapi-)"
          hint={status?.hasNvidiaKey ? 'يوجد مفتاح محفوظ ✓' : 'رصيد تجريبي مجاني، متوافق مع OpenAI'}
        >
          <Input
            type="password"
            dir="ltr"
            value={nvidiaKey}
            onChange={(e) => setNvidiaKey(e.target.value)}
            placeholder="nvapi-..."
          />
        </Field>
        <Field label="الموديل" hint={nvidiaModels.length ? `${nvidiaModels.length} موديل متاح من حسابك` : 'احفظ المفتاح أولاً لعرض موديلاته'}>
          {nvidiaModels.length ? (
            <Select value={nvidiaModels.includes(nvidiaModel) ? nvidiaModel : nvidiaModels[0]} onChange={(e) => void persistModel(e.target.value)}>
              {nvidiaModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          ) : (
            <Input dir="ltr" value={nvidiaModel} onChange={(e) => setNvidiaModel(e.target.value)} className="font-mono" />
          )}
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
        <div className="text-[11px] text-slate-500">{modelsLoading ? 'جارٍ جلب موديلات حسابك...' : 'الموديلات تُجلب مباشرة من حساب NVIDIA بعد حفظ المفتاح.'}</div>
        <Button onClick={save} loading={saving} disabled={saving}>
          حفظ المفتاح
        </Button>
      </div>

      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300">
          <FlaskConical className="w-3.5 h-3.5 text-emerald-500" />
          اختبار حي للمحرك الذكي
        </div>
        <div className="flex gap-2">
          <Input value={testMsg} onChange={(e) => setTestMsg(e.target.value)} placeholder="اكتب رسالة عميل..." />
          <Button variant="soft" onClick={runTest} loading={testing} disabled={testing || !testMsg.trim()}>
            جرّب
          </Button>
        </div>
        {testOut && (
          <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
            {testOut}
          </div>
        )}
      </div>
    </div>
  );
};

export const BotManagerView: React.FC<BotManagerViewProps> = ({
  rules,
  geminiConfig,
  geminiReady = false,
  onUpdateRules,
  onUpdateGeminiConfig,
  onRefreshRules,
}) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'gemini_ai'>('gemini_ai');
  const [showAddRuleModal, setShowAddRuleModal] = useState<boolean>(false);

  // New rule form
  const [newRuleName, setNewRuleName] = useState<string>('');
  const [newRuleKeywords, setNewRuleKeywords] = useState<string>('');
  const [newRuleReply, setNewRuleReply] = useState<string>('');
  const [newRuleType, setNewRuleType] = useState<'contains' | 'exact'>('contains');
  const [newRuleAction, setNewRuleAction] = useState<'reply' | 'assign_agent' | 'opt_out'>('reply');

  // Interactive Bot Playground (starts empty — every reply below comes from the real engine)
  const [testInput, setTestInput] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<
    { sender: 'user' | 'bot'; text: string; time: string; source?: string }[]
  >([]);
  const [isBotThinking, setIsBotThinking] = useState<boolean>(false);
  const [testError, setTestError] = useState<string | null>(null);

  // Toggle Rule Status
  const handleToggleRule = (id: string) => {
    onUpdateRules(
      rules.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r))
    );
  };

  // Delete Rule
  const handleDeleteRule = (id: string) => {
    onUpdateRules(rules.filter((r) => r.id !== id));
  };

  // Add Rule
  const handleAddRuleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName || !newRuleKeywords || !newRuleReply) return;

    const keywords = newRuleKeywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const newRule: BotRule = {
      id: `rule-${Date.now()}`,
      name: newRuleName,
      triggerType: newRuleType,
      keywords,
      replyText: newRuleReply,
      isActive: true,
      matchCount: 0,
      action: newRuleAction,
    };

    onUpdateRules([newRule, ...rules]);
    setShowAddRuleModal(false);
    setNewRuleName('');
    setNewRuleKeywords('');
    setNewRuleReply('');
  };

  // Test Chat Send — hits the same engine that answers real customers
  const handleSendTestMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testInput.trim() || isBotThinking) return;

    const userMsg = testInput.trim();
    const time = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

    setChatMessages((prev) => [...prev, { sender: 'user', text: userMsg, time }]);
    setTestInput('');
    setIsBotThinking(true);
    setTestError(null);

    try {
      const history = chatMessages.slice(-6).map((m) => ({
        role: m.sender === 'bot' ? 'model' : 'user',
        text: m.text,
      }));
      const data = await post<{ reply: string; source: string; action: string }>(
        '/api/bot/chat',
        { message: userMsg, conversationHistory: history },
      );
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: data.reply,
          time: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
          source: data.source,
        },
      ]);
      // refresh rule hit counters from the server
      get<BotRule[]>('/api/bot-rules')
        .then((fresh) => onUpdateRules(fresh))
        .catch(() => onRefreshRules());
    } catch (err: any) {
      setTestError(err?.message || 'تعذر الاتصال بمحرك البوت.');
    } finally {
      setIsBotThinking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <SectionHeader
        icon={<Bot className="w-5 h-5" />}
        title="بوت الرد الآلي الذكي (Smart AI Chatbot)"
        hint={`قواعد الكلمات المفتاحية تعمل دائماً${geminiReady ? ' — وGemini متصل للردود الذكية' : ' — فعّل GEMINI_API_KEY في ملف .env لإضافة ردود Gemini الذكية'}. هذه نفس القواعد التي ترد على عملائك الحقيقيين.`}
        action={
          <Tabs
            value={activeTab}
            onChange={(id) => setActiveTab(id as 'rules' | 'gemini_ai')}
            options={[
              { id: 'gemini_ai', label: 'المساعد الذكي AI', icon: <Sparkles className="w-3.5 h-3.5" /> },
              { id: 'rules', label: `قواعد الكلمات المفتاحية (${rules.length})`, icon: <FileText className="w-3.5 h-3.5" /> },
            ]}
          />
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Configuration (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {activeTab === 'gemini_ai' ? (
            /* Gemini AI Configuration Tab */
            <>
            <AiSettingsCard />
            <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      إعدادات مساعد Gemini{' '}
                      <Badge tone={geminiReady ? 'green' : 'gray'}>{geminiReady ? 'متصل' : 'غير مفعّل'}</Badge>
                    </h2>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">تدريب المساعد على هويتك وبيانات عملك</div>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                  <span>تفعيل الرد الذكي:</span>
                  <input
                    type="checkbox"
                    checked={geminiConfig.enabled}
                    onChange={(e) =>
                      onUpdateGeminiConfig({ ...geminiConfig, enabled: e.target.checked })
                    }
                    className="w-4 h-4 accent-emerald-500 rounded"
                  />
                </label>
              </div>

              {/* Bot Persona Input */}
              <Field label="شخصية وهوية المساعد (System Prompt):">
                <Textarea
                  rows={3}
                  value={geminiConfig.persona}
                  onChange={(e) =>
                    onUpdateGeminiConfig({ ...geminiConfig, persona: e.target.value })
                  }
                />
              </Field>

              {/* Business Knowledge Base Input */}
              <Field
                label="قاعدة المعرفة والبيانات المرجعية (Knowledge Base):"
                hint="معلومات الأسعار، الشحن، الفروع والسياسات"
              >
                <Textarea
                  rows={6}
                  value={geminiConfig.knowledgeBase}
                  onChange={(e) =>
                    onUpdateGeminiConfig({ ...geminiConfig, knowledgeBase: e.target.value })
                  }
                  className="font-mono"
                />
              </Field>

              {/* Temperature & Creativity slider */}
              <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
                  <span>درجة الإبداع والدقة (Temperature):</span>
                  <span className="text-emerald-400 font-mono">{geminiConfig.temperature}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={geminiConfig.temperature}
                  onChange={(e) =>
                    onUpdateGeminiConfig({
                      ...geminiConfig,
                      temperature: parseFloat(e.target.value),
                    })
                  }
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>دقيق جداً ومحدد (0.1)</span>
                  <span>متوازن ومناسب للخدمة (0.7)</span>
                  <span>تعبيري وإبداعي (1.0)</span>
                </div>
              </div>
            </div>
            </>
          ) : (
            /* Keyword Rules Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">قواعد الردود التلقائية بالكلمات المفتاحية</h2>
                <Button size="sm" variant="primary" onClick={() => setShowAddRuleModal(true)}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة قاعدة رد جديدة</span>
                </Button>
              </div>

              {rules.length === 0 ? (
                <EmptyState
                  icon={<FileText className="w-6 h-6" />}
                  title="لا توجد قواعد بعد"
                  hint="أنشئ أول قاعدة رد تلقائي بالكلمات المفتاحية وستعمل فوراً على رسائل عملائك."
                  actionLabel="إضافة قاعدة رد جديدة"
                  onAction={() => setShowAddRuleModal(true)}
                />
              ) : (
              <Stagger className="space-y-3">
                {rules.map((rule) => (
                  <StaggerItem key={rule.id}>
                  <div
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/30 transition space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            rule.isActive ? 'bg-emerald-500' : 'bg-slate-600'
                          }`}
                        ></span>
                        <span className="font-bold text-xs text-slate-900 dark:text-white">{rule.name}</span>
                        <Badge tone="gray" className="font-mono">
                          {rule.triggerType === 'contains'
                            ? 'يحتوي على'
                            : rule.triggerType === 'exact'
                            ? 'مطابقة تامة'
                            : rule.triggerType === 'regex'
                            ? 'تعبير نمطي'
                            : 'رد افتراضي'}
                        </Badge>
                        {rule.action !== 'reply' && (
                          <Badge tone="amber" className="font-mono">
                            {rule.action === 'opt_out' ? 'إلغاء اشتراك' : rule.action === 'assign_agent' ? 'تحويل لموظف' : rule.action}
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={rule.isActive ? 'soft' : 'ghost'}
                          onClick={() => handleToggleRule(rule.id)}
                        >
                          {rule.isActive ? 'مفعلة' : 'معطلة'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteRule(rule.id)}
                          title="حذف القاعدة"
                          aria-label="حذف القاعدة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Keywords tags */}
                    <div className="flex flex-wrap gap-1.5">
                      {rule.keywords.map((kw, i) => (
                        <Badge key={i} tone="teal" className="font-mono">#{kw}</Badge>
                      ))}
                    </div>

                    {/* Reply text preview */}
                    <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 whitespace-pre-wrap leading-relaxed line-clamp-3">
                      {rule.replyText}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span>تم تشغيلها: {rule.matchCount} مرة</span>
                      {rule.mediaAttachment && (
                        <Badge tone="blue">
                          <ImageIcon className="w-3 h-3" /> مرفق وسائط
                        </Badge>
                      )}
                    </div>
                  </div>
                  </StaggerItem>
                ))}
              </Stagger>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Interactive Bot Sandbox / Test Playground (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-emerald-400" />
              مختبر واختبار البوت الحي (Live Sandbox)
            </span>
            <button
              onClick={() => {
                setChatMessages([]);
                setTestError(null);
              }}
              className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-emerald-400 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              مسح وتجربة جديدة
            </button>
          </div>

          {/* Chat Container */}
          <div className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[520px]">
            {/* Chat Header */}
            <div className="p-3.5 bg-slate-200 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white font-bold text-xs shadow-md">
                  AI
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">بوت خدمة العملاء (مختبر حي)</div>
                  <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    {geminiReady ? 'متصل بمحرك القواعد + Gemini' : 'يعمل بمحرك قواعد الكلمات المفتاحية'}
                  </div>
                </div>
              </div>

              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                Auto 24/7
              </span>
            </div>

            {/* Chat Bubbles Scroll Area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#0b141a]/60">
              {chatMessages.length === 0 && !isBotThinking && (
                <div className="text-center text-[11px] text-slate-500 py-10 leading-relaxed">
                  اكتب رسالة كأنك عميل لاختبار رد البوت الحقيقي
                  <br />
                  (نفس المحرك الذي يرد على واتساب)
                </div>
              )}
              {testError && (
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px]">
                  {testError}
                </div>
              )}
              {chatMessages.map((msg, i) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={i}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} space-y-1`}
                  >
                    <div
                      className={`p-3 rounded-2xl max-w-[85%] text-xs leading-relaxed whitespace-pre-wrap ${
                        isUser
                          ? 'bg-[#005c4b] text-white rounded-tr-none shadow'
                          : 'bg-[#1f2c34] text-slate-100 rounded-tl-none border border-slate-300/60 dark:border-slate-700/60 shadow'
                      }`}
                    >
                      {msg.text}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 px-1">
                      <span>{msg.time}</span>
                      {msg.source && (
                        <span className="text-emerald-400 font-mono">({msg.source})</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {isBotThinking && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-[#1f2c34] text-xs text-slate-300 w-fit">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span>الذكاء الاصطناعي يقوم بصياغة الرد الآن...</span>
                </div>
              )}
            </div>

            {/* Chat Input Bar */}
            <form
              onSubmit={handleSendTestMessage}
              className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
            >
              <Input
                type="text"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="اكتب استفساراً تجريبياً لاختبار رد البوت..."
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={isBotThinking || !testInput.trim()}
                aria-label="إرسال"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Add Rule Modal */}
      <Modal
        open={showAddRuleModal}
        onClose={() => setShowAddRuleModal(false)}
        title="إضافة قاعدة رد آلي جديدة"
        wide
      >
            <form onSubmit={handleAddRuleSubmit} className="space-y-3 text-xs">
              <Field label="اسم القاعدة التوضيحي:">
                <Input
                  type="text"
                  required
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  placeholder="مثال: الرد على استفسار طرق الدفع"
                />
              </Field>

              <Field label="الكلمات المفتاحية المشغلة (مفصولة بفواصل):">
                <Input
                  type="text"
                  required
                  value={newRuleKeywords}
                  onChange={(e) => setNewRuleKeywords(e.target.value)}
                  placeholder="دفع, مدى, فيزا, تحويل, paypal"
                />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="نوع التطابق:">
                  <Select
                    value={newRuleType}
                    onChange={(e: any) => setNewRuleType(e.target.value)}
                  >
                    <option value="contains">يحتوي على (Contains)</option>
                    <option value="exact">تطابق تام (Exact)</option>
                  </Select>
                </Field>
                <Field label="الإجراء بعد الرد:">
                  <Select
                    value={newRuleAction}
                    onChange={(e: any) => setNewRuleAction(e.target.value)}
                  >
                    <option value="reply">رد فقط</option>
                    <option value="assign_agent">رد + تحويل لموظف</option>
                    <option value="opt_out">رد + إلغاء اشتراك الرقم</option>
                  </Select>
                </Field>
              </div>

              <Field label="نص الرد التلقائي:">
                <Textarea
                  rows={4}
                  required
                  value={newRuleReply}
                  onChange={(e) => setNewRuleReply(e.target.value)}
                  placeholder="اكتب نص الرد هنا..."
                  className="leading-relaxed"
                />
              </Field>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAddRuleModal(false)}
                >
                  إلغاء
                </Button>
                <Button type="submit" variant="primary">
                  حفظ القاعدة
                </Button>
              </div>
            </form>
      </Modal>
    </div>
  );
};
