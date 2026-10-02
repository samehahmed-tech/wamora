import React, { useState, useRef } from 'react';
import { EmojiPicker, insertAtCursor } from './EmojiPicker';
import {
  Plus,
  Search,
  Copy,
  Trash2,
  Check,
  Eye,
  CheckCheck,
  Image as ImageIcon,
  Video,
  FileText,
  Send,
  Zap,
  BookmarkCheck,
} from 'lucide-react';
import { MessageTemplate } from '../types';
import { calculateSpintaxPermutations, resolveSpintax } from '../utils/antiBlock';
import { Button, Field, Input, Textarea, Select, Badge, Modal, Tabs } from './kit';
import { SectionHeader, EmptyState, Stagger, StaggerItem, Card } from './ui';
import { MediaPicker } from './MediaPicker';

interface MessageTemplatesViewProps {
  templates: MessageTemplate[];
  onUpdateTemplates: (templates: MessageTemplate[]) => void;
  onUseTemplateInSender: (template: MessageTemplate) => void;
}

export const MessageTemplatesView: React.FC<MessageTemplatesViewProps> = ({
  templates,
  onUpdateTemplates,
  onUseTemplateInSender,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [previewTemplate, setPreviewTemplate] = useState<MessageTemplate | null>(null);
  // test values keyed by template id + variable, so each preview keeps its own values
  const [testVariableValues, setTestVariableValues] = useState<Record<string, string>>({});

  // Create form state
  const [newTitle, setNewTitle] = useState<string>('');
  const [newCategory, setNewCategory] = useState<'marketing' | 'utility' | 'authentication' | 'support'>('marketing');
  const [newBody, setNewBody] = useState<string>('');
  const [newMediaType, setNewMediaType] = useState<'none' | 'image' | 'video' | 'document'>('none');
  const [newMediaUrl, setNewMediaUrl] = useState<string>('');
  const [newMediaName, setNewMediaName] = useState<string>('');

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Extract variables like {{var_name}}
  const extractVariables = (text: string): string[] => {
    const matches = text.match(/\{\{([a-zA-Z0-9_-]+)\}\}/g) || [];
    return Array.from(new Set(matches.map((m) => m.slice(2, -2))));
  };

  const handleInsertVariable = (varName: string) => {
    setNewBody((prev) => prev + ` {{${varName}}}`);
  };

  const handleInsertSpintax = (spintax: string) => {
    setNewBody((prev) => prev + ' ' + spintax);
  };

  const handleCreateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newBody) return;

    const categoryNamesAr: Record<string, string> = {
      marketing: 'تسويق وعروض',
      utility: 'طلبات ومواعيد',
      authentication: 'تحقق وأمان',
      support: 'ترحيب وخدمة',
    };

    const vars = extractVariables(newBody);

    const newTpl: MessageTemplate = {
      id: `tpl-${Date.now()}`,
      title: newTitle,
      category: newCategory,
      categoryAr: categoryNamesAr[newCategory],
      body: newBody,
      variables: vars,
      mediaType: newMediaType,
      mediaUrl: newMediaUrl || undefined,
      mediaName: newMediaName || undefined,
      createdAt: new Date().toLocaleDateString('ar-EG'),
      usageCount: 0,
    };

    onUpdateTemplates([newTpl, ...templates]);
    setShowCreateModal(false);
    setNewTitle('');
    setNewBody('');
    setNewMediaType('none');
    setNewMediaUrl('');
    setNewMediaName('');
  };

  const handleDeleteTemplate = (id: string) => {
    onUpdateTemplates(templates.filter((t) => t.id !== id));
  };

  const handleCopyBody = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.variables.some((v) => v.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  // Resolve preview text with test variables and spintax
  const renderPreviewResolved = (tpl: MessageTemplate) => {
    let resolved = tpl.body;
    tpl.variables.forEach((v) => {
      const val = testVariableValues[v] || `[${v}]`;
      const reg = new RegExp(`\\{\\{${v}\\}\\}`, 'g');
      resolved = resolved.replace(reg, val);
    });
    return resolveSpintax(resolved);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<BookmarkCheck className="w-5 h-5" />}
        title="قوالب الرسائل الجاهزة والمتغيرات الذكية"
        hint="صمم واحفظ نصوص الرسائل المتكررة مع متغيرات التخصيص الديناميكية مثل {{name}} وصياغات Spintax"
        action={
          <Button variant="primary" size="md" onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4" />
            <span>إنشاء قالب رسالة جديد</span>
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div className="w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
            <Tabs
              value={selectedCategory}
              onChange={setSelectedCategory}
              options={[
                { id: 'all', label: `جميع القوالب (${templates.length})` },
                { id: 'marketing', label: 'عروض وتسويق 🔥' },
                { id: 'utility', label: 'طلبات ومواعيد 📦' },
                { id: 'authentication', label: 'تحقق وأمان (OTP) 🔒' },
                { id: 'support', label: 'ترحيب وخدمة 🌟' },
              ]}
            />
          </div>

          <div className="relative w-full sm:w-72 shrink-0">
            <Search className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في القوالب أو المتغيرات..."
              className="pr-9"
            />
          </div>
        </div>
      </Card>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <EmptyState
          icon={<FileText className="w-6 h-6" />}
          title="لا توجد قوالب مطابقة"
          hint="لم يتم العثور على قوالب مطابقة للبحث أو التصنيف الحالي. أنشئ قالب رسالة جديداً للبدء."
          actionLabel="إنشاء قالب رسالة جديد"
          onAction={() => setShowCreateModal(true)}
        />
      ) : (
        <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTemplates.map((tpl) => {
            const permutations = calculateSpintaxPermutations(tpl.body);

            return (
              <StaggerItem key={tpl.id}>
                <Card className="p-5 hover:border-slate-400 dark:hover:border-slate-700 transition flex flex-col justify-between gap-4 h-full group">
                  {/* Header */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-emerald-400 transition">
                        {tpl.title}
                      </h3>
                      <Badge tone="gray" className="shrink-0">
                        {tpl.categoryAr}
                      </Badge>
                    </div>

                    {/* Media and Spintax Indicators */}
                    <div className="flex items-center gap-2 text-[10px]">
                      {tpl.mediaType && tpl.mediaType !== 'none' && (
                        <Badge tone="blue">
                          {tpl.mediaType === 'image' && <ImageIcon className="w-3 h-3" />}
                          {tpl.mediaType === 'video' && <Video className="w-3 h-3" />}
                          {tpl.mediaType === 'document' && <FileText className="w-3 h-3" />}
                          مرفق {tpl.mediaType === 'image' ? 'صورة' : tpl.mediaType === 'video' ? 'فيديو' : 'مستند'}
                        </Badge>
                      )}
                      {permutations > 1 && (
                        <Badge tone="amber">• {permutations} صياغات Spintax</Badge>
                      )}
                    </div>

                    {/* Body Preview with Variable badges */}
                    <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-h-32 overflow-hidden whitespace-pre-wrap font-sans">
                      {tpl.body}
                    </div>

                    {/* Dynamic Variables tags */}
                    {tpl.variables.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] text-slate-500 font-bold">المتغيرات الديناميكية:</span>
                        <div className="flex flex-wrap gap-1">
                          {tpl.variables.map((v) => (
                            <Badge key={v} tone="green" className="font-mono">
                              {`{{${v}}}`}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer and Actions */}
                  <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-[10px] text-slate-500 font-mono">
                      تم الاستخدام: {tpl.usageCount.toLocaleString('ar-SA')} مرة
                    </span>

                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPreviewTemplate(tpl)}
                        title="معاينة حية في الواتساب"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyBody(tpl.body, tpl.id)}
                        title="نسخ نص القالب"
                      >
                        {copiedId === tpl.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>

                      <Button
                        variant="soft"
                        size="sm"
                        onClick={() => onUseTemplateInSender(tpl)}
                        title="إرسال عبر نافذة الإرسال الفوري"
                      >
                        <Send className="w-3 h-3" />
                        <span>إرسال</span>
                      </Button>

                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        title="حذف القالب"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}

      {/* Create Template Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="إنشاء قالب رسالة جديد"
        subtitle="صمم قالباً مع متغيرات ديناميكية وصياغات Spintax"
        wide
      >
        <form onSubmit={handleCreateTemplate} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="عنوان القالب:">
              <Input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="مثال: رسالة تذكير موعد الصيانة"
              />
            </Field>

            <Field label="تصنيف القالب:">
              <Select
                value={newCategory}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setNewCategory(e.target.value as typeof newCategory)}
              >
                <option value="marketing">تسويق وعروض ترويجية (Marketing)</option>
                <option value="utility">تأكيد طلبات ومواعيد (Utility)</option>
                <option value="authentication">رموز تحقق وأمان OTP (Authentication)</option>
                <option value="support">خدمة عملاء وترحيب (Support)</option>
              </Select>
            </Field>
          </div>

          {/* Variables Quick Insert Chips */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
              إدراج متغير ديناميكي سريع (يُستبدل تلقائياً لكل عميل):
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['name', 'discount_code', 'order_id', 'date', 'time', 'link', 'company'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleInsertVariable(v)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono cursor-pointer transition"
                >
                  + {`{{${v}}}`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleInsertSpintax('{مرحباً|أهلاً بكم|السلام عليكم}')}
                className="px-2.5 py-1 rounded-lg bg-amber-950/70 hover:bg-amber-900 text-amber-300 border border-amber-500/30 text-[11px] cursor-pointer transition"
              >
                + Spintax ترحيبي
              </button>
            </div>
          </div>

          {/* Template Body */}
          <Field
            label="نص القالب:"
            hint={`المتغيرات المكتشفة: ${extractVariables(newBody).join(', ') || 'لا توجد'}`}
          >
            <div className="flex justify-end mb-1.5">
              <EmojiPicker small onPick={(e) => insertAtCursor(bodyRef.current, e, setNewBody)} />
            </div>
            <Textarea
              ref={bodyRef as any}
              rows={5}
              required
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="اكتب نص القالب هنا..."
              className="leading-relaxed font-sans"
            />
          </Field>

          {/* Media selector */}
          <Field label="إرفاق وسائط مع القالب:">
            <div className="grid grid-cols-4 gap-2">
              {(['none', 'image', 'video', 'document'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setNewMediaType(m)}
                  className={`p-2 rounded-xl border text-center font-bold transition cursor-pointer ${
                    newMediaType === m
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                      : 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700'
                  }`}
                >
                  {m === 'none' && 'نص فقط'}
                  {m === 'image' && 'صورة'}
                  {m === 'video' && 'فيديو'}
                  {m === 'document' && 'مستند PDF'}
                </button>
              ))}
            </div>
          </Field>

          {newMediaType !== 'none' && (
            <MediaPicker
              label="ملف وسائط القالب"
              value={
                newMediaUrl
                  ? { type: newMediaType as 'image' | 'video' | 'document', url: newMediaUrl, name: newMediaName }
                  : null
              }
              onChange={(v) => {
                if (!v) {
                  setNewMediaUrl('');
                  setNewMediaName('');
                } else {
                  setNewMediaType(v.type);
                  setNewMediaUrl(v.url);
                  setNewMediaName(v.name);
                }
              }}
            />
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button type="button" variant="ghost" onClick={() => setShowCreateModal(false)}>
              إلغاء
            </Button>
            <Button type="submit" variant="primary">
              حفظ القالب
            </Button>
          </div>
        </form>
      </Modal>

      {/* Live Preview Modal */}
      <Modal
        open={previewTemplate !== null}
        onClose={() => setPreviewTemplate(null)}
        title={previewTemplate ? `معاينة تفاعلية: ${previewTemplate.title}` : 'معاينة تفاعلية'}
        wide
      >
        {previewTemplate && (
          <div className="space-y-4">
            {/* Test variables inputs */}
            {previewTemplate.variables.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
                <div className="font-bold text-slate-600 dark:text-slate-300">جرّب قيم المتغيرات للمعاينة الحية:</div>
                <div className="grid grid-cols-2 gap-2">
                  {previewTemplate.variables.map((v) => (
                    <Field key={v} label={`{{${v}}}:`}>
                      <Input
                        type="text"
                        value={testVariableValues[v] || ''}
                        onChange={(e) =>
                          setTestVariableValues({ ...testVariableValues, [v]: e.target.value })
                        }
                      />
                    </Field>
                  ))}
                </div>
              </div>
            )}

            {/* WhatsApp Phone Mockup Bubble */}
            <div
              className="p-4 rounded-2xl bg-[#0b141a] border border-slate-200 dark:border-slate-800 min-h-[180px] flex flex-col justify-end"
              style={{
                backgroundImage: 'radial-gradient(#1f2c34 1px, transparent 1px)',
                backgroundSize: '16px 16px',
              }}
            >
              <div className="bg-[#005c4b] text-white p-3.5 rounded-2xl rounded-tr-none max-w-[85%] self-end shadow-md space-y-2 border border-emerald-600/30 text-xs">
                {previewTemplate.mediaType === 'image' && previewTemplate.mediaUrl && (
                  <div className="rounded-xl overflow-hidden max-h-44 border border-emerald-500/20">
                    <img
                      src={previewTemplate.mediaUrl}
                      alt="Banner"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                {previewTemplate.mediaType === 'video' && previewTemplate.mediaUrl && (
                  <div className="rounded-xl overflow-hidden max-h-40 border border-emerald-500/20">
                    <video
                      src={previewTemplate.mediaUrl}
                      className="w-full h-full object-cover"
                      controls
                    />
                  </div>
                )}
                {previewTemplate.mediaType === 'document' && previewTemplate.mediaUrl && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-500/30 flex items-center gap-2">
                    <div className="text-[11px] overflow-hidden">
                      <div className="font-bold truncate" dir="ltr">{previewTemplate.mediaName || 'document'}</div>
                    </div>
                  </div>
                )}
                <div className="whitespace-pre-wrap leading-relaxed">
                  {renderPreviewResolved(previewTemplate)}
                </div>
                <div className="flex items-center justify-end gap-1 text-[10px] text-emerald-200/80 pt-1">
                  <span>{new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</span>
                  <CheckCheck className="w-3.5 h-3.5 text-sky-400" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  onUseTemplateInSender(previewTemplate);
                  setPreviewTemplate(null);
                }}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>استخدام هذا القالب في الإرسال السريع</span>
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
