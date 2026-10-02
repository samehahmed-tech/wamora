import React, { useState, useRef, useEffect } from 'react';
import {
  Users,
  Plus,
  Upload,
  Download,
  Search,
  Trash2,
  CheckCircle2,
  ShieldAlert,
  FileSpreadsheet,
  AlertCircle,
  Check,
  PhoneCall,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { get, post } from '../api';
import { toast, ProgressBar } from './kit';
import { Contact } from '../types';
import { parseExcelFile, extractRegion } from '../utils/excel';
import {
  validatePhoneNumberWithCountry,
  parseCSVContent,
  ParsedCsvRow,
  SUPPORTED_COUNTRIES,
} from '../utils/antiBlock';
import { Button, Field, Input, Textarea, Select, Badge, Modal } from './kit';
import { SectionHeader, EmptyState, Card } from './ui';

interface ContactsViewProps {
  contacts: Contact[];
  onUpdateContacts: (contacts: Contact[]) => void;
}

export const ContactsView: React.FC<ContactsViewProps> = ({
  contacts,
  onUpdateContacts,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showBulkModal, setShowBulkModal] = useState<boolean>(false);

  // Single contact form
  const [newName, setNewName] = useState<string>('');
  const [newPhone, setNewPhone] = useState<string>('');
  const [newTag, setNewTag] = useState<string>('عملاء جدد');
  const [newNotes, setNewNotes] = useState<string>('');

  // Bulk CSV import states
  const [importMode, setImportMode] = useState<'file' | 'paste'>('file');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [rawCsvText, setRawCsvText] = useState<string>('');
  const [defaultImportCountry, setDefaultImportCountry] = useState<string>('20');
  const [bulkTag, setBulkTag] = useState<string>('استيراد CSV');
  const [parsedData, setParsedData] = useState<{
    rows: ParsedCsvRow[];
    totalRows: number;
    validCount: number;
    invalidCount: number;
    headers: string[];
  } | null>(null);
  const [filterPreviewMode, setFilterPreviewMode] = useState<'all' | 'valid' | 'invalid'>('all');
  const [ignoreInvalid, setIgnoreInvalid] = useState<boolean>(true);

  // WhatsApp existence checker (background job with progress)
  const [showCheckModal, setShowCheckModal] = useState(false);
  const [checkJobId, setCheckJobId] = useState<string | null>(null);
  const [checkJob, setCheckJob] = useState<{
    total: number;
    done: number;
    status: string;
    results: Array<{ phone: string; exists: boolean }>;
    error?: string;
    appliedInvalid?: number;
  } | null>(null);

  useEffect(() => {
    if (!showCheckModal || !checkJobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const job = await get<{
          total: number;
          done: number;
          status: string;
          results: Array<{ phone: string; exists: boolean }>;
          error?: string;
          appliedInvalid?: number;
        }>(`/api/contacts/check/${checkJobId}`);
        if (cancelled) return;
        setCheckJob(job);
        if (job.status === 'done') {
          // sync auto-applied marks (invalid flags + lastChecked) into the UI
          try {
            const fresh = await get<Contact[]>('/api/contacts');
            onUpdateContacts(fresh);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    };
    poll();
    const timer = setInterval(() => {
      if (checkJob?.status === 'done' || checkJob?.status === 'error') {
        clearInterval(timer);
        return;
      }
      poll();
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [showCheckModal, checkJobId, checkJob?.status, onUpdateContacts]);

  const handleStartCheck = async () => {
    const targets = contacts.filter((c) => c.status === 'active');
    if (!targets.length) {
      toast('لا توجد جهات نشطة للفحص.', 'error');
      return;
    }
    setCheckJob(null);
    setShowCheckModal(true);
    try {
      const { jobId } = await post<{ jobId: string }>('/api/contacts/check', {});
      setCheckJobId(jobId);
    } catch (e: any) {
      toast(e?.message || 'تعذر بدء الفحص. تأكد من ربط رقم واتساب.', 'error');
      setShowCheckModal(false);
    }
  };

  const handleDeleteInvalid = () => {
    const invalid = contacts.filter((c) => c.status === 'invalid');
    if (!invalid.length) return;
    if (!window.confirm(`حذف ${invalid.length} جهة غير صالحة نهائياً؟`)) return;
    onUpdateContacts(contacts.filter((c) => c.status !== 'invalid'));
    toast(`تم حذف ${invalid.length} جهة.`);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Collect all unique tags
  const allTags = Array.from(new Set(contacts.flatMap((c) => c.tags)));

  const filteredContacts = contacts.filter((c) => {
    const matchesTag = selectedTag === 'all' || c.tags.includes(selectedTag);
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTag && matchesSearch;
  });

  const handleAddSingleContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPhone) return;

    const validation = validatePhoneNumberWithCountry(newPhone, defaultImportCountry);
    const newContact: Contact = {
      id: `c-${Date.now()}`,
      name: newName,
      phone: validation.phone || newPhone,
      tags: [newTag],
      lastActive: 'الآن',
      status: 'active',
      notes: newNotes,
      messagesSentCount: 0,
    };

    onUpdateContacts([newContact, ...contacts]);
    setShowAddModal(false);
    setNewName('');
    setNewPhone('');
    setNewNotes('');
  };

  // Handle CSV/Excel file selection
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (isExcel) {
      parseExcelFile(file, defaultImportCountry)
        .then((parsed) => {
          setRawCsvText(`excel:${file.name}`);
          setParsedData(parsed);
        })
        .catch(() => toast('تعذر قراءة ملف Excel.', 'error'));
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        setRawCsvText(content);
        const parsed = parseCSVContent(content, defaultImportCountry);
        setParsedData(parsed);
      }
    };
    reader.readAsText(file);
  };

  // Re-run parser when default country code changes
  const handleCountryChange = (code: string) => {
    setDefaultImportCountry(code);
    if (rawCsvText) {
      const parsed = parseCSVContent(rawCsvText, code);
      setParsedData(parsed);
    }
  };

  // Handle raw text paste change
  const handlePasteChange = (text: string) => {
    setRawCsvText(text);
    if (text.trim()) {
      const parsed = parseCSVContent(text, defaultImportCountry);
      setParsedData(parsed);
    } else {
      setParsedData(null);
    }
  };

  // Confirm Import — region auto-tag + dedupe vs existing + within batch
  const handleConfirmImport = () => {
    if (!parsedData || parsedData.rows.length === 0) return;

    const targetRows = ignoreInvalid
      ? parsedData.rows.filter((r) => r.validation.isValid)
      : parsedData.rows;

    const existing = new Set(contacts.map((c) => String(c.phone || '').replace(/[^0-9]/g, '')));
    const seen = new Set<string>();
    let dupes = 0;
    const newContacts: Contact[] = [];
    targetRows.forEach((r, idx) => {
      const clean = String(r.phone || '').replace(/[^0-9]/g, '');
      if (!clean || seen.has(clean) || existing.has(clean)) {
        dupes++;
        return;
      }
      seen.add(clean);
      const region = extractRegion(r.raw || {});
      const tags = [r.tag || bulkTag];
      if (region) {
        tags.push(`منطقة:${region}`);
        if (!tags.includes(region)) tags.push(region);
      }
      newContacts.push({
        id: `c-${Date.now()}-${idx}`,
        name: r.name,
        phone: r.phone,
        tags,
        region: region || undefined,
        lastActive: 'الآن',
        status: r.validation.isValid ? 'active' : 'invalid',
        notes: r.notes || (r.validation.isValid ? undefined : r.validation.errorReason),
        messagesSentCount: 0,
      });
    });

    onUpdateContacts([...newContacts, ...contacts]);
    toast(`تم استيراد ${newContacts.length} جهة.${dupes ? ` تم تخطي ${dupes} مكرر.` : ''}`);
    setShowBulkModal(false);
    setParsedData(null);
    setRawCsvText('');
    setUploadedFileName('');
  };

  const handleDeleteContact = (id: string) => {
    onUpdateContacts(contacts.filter((c) => c.id !== id));
  };

  // Export to CSV simulation with proper UTF-8 BOM
  const handleExportCSV = () => {
    const headers = 'الاسم,رقم الهاتف,التصنيف,الحالة,الرسائل المرسلة\n';
    const rows = contacts
      .map((c) => `${c.name},${c.phone},${c.tags.join(' - ')},${c.status},${c.messagesSentCount}`)
      .join('\n');
    const blob = new Blob(['\uFEFF' + headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'wamora_contacts.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download Sample CSV Template
  const handleDownloadSampleCSV = () => {
    const sampleHeaders = 'الاسم,رقم الهاتف,التصنيف,ملاحظات\n';
    const sampleRows = [
      'سعد بن فهد القحطاني,0501234567,عملاء VIP,مهتم بالعروض الكبرى',
      'د. منى محمود حسن,201019283746,عيادات ومراكز,تذكير مواعيد أسبوعية',
      'م. خالد العبدالله,971508273645,متجر إلكتروني,عميل دائم',
      'فاطمة إبراهيم الشمري,0549988776,مشتركين جدد,طلب استفسار عبر واتساب',
    ].join('\n');

    const blob = new Blob(['\uFEFF' + sampleHeaders + sampleRows], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'sample_contacts_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const closeBulkModal = () => {
    setShowBulkModal(false);
    setParsedData(null);
    setRawCsvText('');
    setUploadedFileName('');
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Users className="w-5 h-5" />}
        title="إدارة جهات الاتصال واستيراد ملفات CSV"
        hint="إدارة الأرقام وتصنيفها مع معالج ذكي لاستيراد ملفات CSV والتحقق التلقائي من مفاتيح الدول"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDownloadSampleCSV}
              title="تحميل ملف CSV تجريبي للتعرف على التنسيق المطلوب"
            >
              <FileSpreadsheet className="w-4 h-4 text-amber-400" />
              <span>تحميل نموذج CSV تجريبي</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExportCSV}>
              <Download className="w-4 h-4 text-emerald-400" />
              <span>تصدير CSV</span>
            </Button>
            <Button variant="soft" size="sm" onClick={() => setShowBulkModal(true)}>
              <Upload className="w-4 h-4" />
              <span>استيراد ملف CSV</span>
            </Button>
            <Button variant="soft" size="sm" onClick={handleStartCheck} title="التحقق من وجود الأرقام على واتساب">
              <PhoneCall className="w-4 h-4" />
              <span>فحص أرقام الواتساب</span>
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>
              <Plus className="w-4 h-4" />
              <span>إضافة رقم جديد</span>
            </Button>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setSelectedTag('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                selectedTag === 'all'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-200'
              }`}
            >
              جميع الأرقام ({contacts.length})
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer shrink-0 ${
                  selectedTag === tag
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم، الرقم، أو التصنيف..."
              className="pr-9"
            />
          </div>
        </div>
      </Card>

      {/* Contacts Table */}
      {filteredContacts.length === 0 ? (
        <EmptyState
          icon={<Users className="w-6 h-6" />}
          title="لا توجد جهات اتصال مطابقة"
          hint="لم يتم العثور على جهات مطابقة للبحث أو التصفية الحالية. أضف رقماً جديداً أو عدّل البحث."
          actionLabel="إضافة رقم جديد"
          onAction={() => setShowAddModal(true)}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 font-bold">
                <tr>
                  <th className="p-4">اسم العميل</th>
                  <th className="p-4">الدولة والرقم الدولي</th>
                  <th className="p-4">التصنيفات والوسوم</th>
                  <th className="p-4">حالة الحماية والأمان</th>
                  <th className="p-4">الرسائل المرسلة</th>
                  <th className="p-4 text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-slate-700 dark:text-slate-200">
                {filteredContacts.map((contact) => {
                  const isOptOut = contact.status === 'opt_out';
                  const isInvalid = contact.status === 'invalid';
                  const validation = validatePhoneNumberWithCountry(contact.phone);

                  return (
                    <tr key={contact.id} className="hover:bg-slate-300/40 dark:hover:bg-slate-800/40 transition">
                      <td className="p-4 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-xs shrink-0">
                            {contact.name.slice(0, 1)}
                          </div>
                          <div>
                            <div>{contact.name}</div>
                            {contact.notes && (
                              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal truncate max-w-xs">
                                {contact.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-base" title={validation.countryName}>
                            {validation.countryFlag}
                          </span>
                          <span className="font-mono text-emerald-400 font-bold" dir="ltr">
                            +{contact.phone}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            ({validation.countryName})
                          </span>
                        </div>
                        {contact.lastChecked && (
                          <div className="mt-1">
                            {contact.onWhatsapp ? (
                              <Badge tone="green">
                                <Check className="w-3 h-3" />
                                عليه واتساب
                              </Badge>
                            ) : (
                              <Badge tone="red">
                                <XCircle className="w-3 h-3" />
                                ليس عليه واتساب
                              </Badge>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {contact.tags.map((t, idx) => (
                            <Badge key={idx} tone="gray">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </td>

                      <td className="p-4">
                        {isOptOut ? (
                          <Badge tone="red">
                            <ShieldAlert className="w-3 h-3" />
                            محيد تلقائياً (إلغاء اشتراك)
                          </Badge>
                        ) : isInvalid ? (
                          <Badge tone="amber">
                            <AlertCircle className="w-3 h-3" />
                            رقم غير مكتمل
                          </Badge>
                        ) : (
                          <Badge tone="green">
                            <CheckCircle2 className="w-3 h-3" />
                            نشط وموثق
                          </Badge>
                        )}
                      </td>

                      <td className="p-4 font-mono text-slate-600 dark:text-slate-300">
                        {contact.messagesSentCount} رسالة
                      </td>

                      <td className="p-4 text-left">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDeleteContact(contact.id)}
                          title="حذف الرقم"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add Single Contact Modal */}
      <Modal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="إضافة جهة اتصال جديدة"
        subtitle="أضف رقماً واحداً مع التحقق التلقائي من مفتاح الدولة"
      >
        <form onSubmit={handleAddSingleContact} className="space-y-3 text-xs">
          <Field label="الاسم الكامل:">
            <Input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="مثال: تركي بن عبدالرحمن"
            />
          </Field>

          <Field label="رقم الواتساب:" hint="يدعم الصيغ المحلية والدولية">
            <Input
              type="text"
              required
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="05XXXXXXXX أو 9665XXXXXXXX"
              className="font-mono"
              dir="ltr"
            />
          </Field>

          <Field label="التصنيف أو الوسم:">
            <Input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="عملاء VIP, مشتركون جدد"
            />
          </Field>

          <Field label="ملاحظات إضافية:">
            <Textarea
              rows={2}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="معلومات عن اهتمامات العميل..."
            />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button type="button" variant="ghost" onClick={() => setShowAddModal(false)}>
              إلغاء
            </Button>
            <Button type="submit" variant="primary">
              إضافة الرقم
            </Button>
          </div>
        </form>
      </Modal>

      {/* Advanced CSV Bulk Import Modal with Country Prefix Validation */}
      <Modal
        open={showBulkModal}
        onClose={closeBulkModal}
        title="معالج استيراد ملفات CSV والتحقق من الأرقام"
        subtitle="استيراد قوائم كبيرة مع التعرف التلقائي على بادئات الدول وتنظيف الأرقام"
        wide
      >
        <div className="space-y-5">
          {/* Step 1: Input method & Country Prefix selector */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="طريقة الاستيراد:">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setImportMode('file')}
                  className={`py-1.5 rounded-lg transition cursor-pointer text-center ${
                    importMode === 'file'
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  رفع ملف CSV
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('paste')}
                  className={`py-1.5 rounded-lg transition cursor-pointer text-center ${
                    importMode === 'paste'
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  لصق نص مباشر
                </button>
              </div>
            </Field>

            {/* Default Country Prefix Selector */}
            <Field label="بادئة الدولة الافتراضية:" hint="للأرقام المحلية">
              <Select
                value={defaultImportCountry}
                onChange={(e) => handleCountryChange(e.target.value)}
                className="font-bold"
              >
                {Object.entries(SUPPORTED_COUNTRIES).map(([code, info]) => (
                  <option key={code} value={code}>
                    {info.flag} {info.name} (+{code})
                  </option>
                ))}
              </Select>
            </Field>

            {/* Tag for imported contacts */}
            <Field label="وسم / تصنيف جهات الاتصال:">
              <Input
                type="text"
                value={bulkTag}
                onChange={(e) => setBulkTag(e.target.value)}
                placeholder="حملة عروض الصيف"
              />
            </Field>
          </div>

          {/* Step 2: File Upload Box OR Text Paste */}
          {importMode === 'file' ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-6 md:p-8 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500/60 bg-slate-100/60 dark:bg-slate-950/60 flex flex-col items-center justify-center text-center gap-2.5 cursor-pointer transition group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center group-hover:scale-110 transition">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  {uploadedFileName ? (
                    <span className="text-emerald-400 font-mono">{uploadedFileName}</span>
                  ) : (
                    'اضغط هنا لاختيار ملف CSV أو اسحب الملف وأفلته'
                  )}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  يدعم أعمدة: الاسم، رقم الهاتف، التصنيف، الملاحظات (UTF-8)
                </div>
              </div>
            </div>
          ) : (
            <Field
              label="الصق محتوى CSV أو الأرقام هنا:"
              hint="يفصل بين الحقول بفاصلة (,) أو فاصل منقوط (;)"
            >
              <Textarea
                rows={5}
                value={rawCsvText}
                onChange={(e) => handlePasteChange(e.target.value)}
                placeholder="الاسم, رقم الهاتف, التصنيف&#10;محمد العتيبي, 0501234567, عملاء VIP&#10;أحمد محمود, +201019283746, متجر مصر"
                className="font-mono"
                dir="ltr"
              />
            </Field>
          )}

          {/* Step 3: Live Validation & Parsing Summary */}
          {parsedData && parsedData.totalRows > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              {/* Stats Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge tone="blue">إجمالي السجلات: {parsedData.totalRows}</Badge>
                  <Badge tone="green">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {parsedData.validCount} أرقام صالحة ومؤكدة
                  </Badge>
                  {parsedData.invalidCount > 0 && (
                    <Badge tone="red">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {parsedData.invalidCount} أرقام غير صالحة
                    </Badge>
                  )}
                </div>

                {/* Filter preview selector */}
                <div className="flex items-center gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setFilterPreviewMode('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                      filterPreviewMode === 'all'
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    الكل ({parsedData.totalRows})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterPreviewMode('valid')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                      filterPreviewMode === 'valid'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    الصالح فقط ({parsedData.validCount})
                  </button>
                  {parsedData.invalidCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterPreviewMode('invalid')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                        filterPreviewMode === 'invalid'
                          ? 'bg-red-950 text-red-300 border border-red-500/30'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      بها أخطاء ({parsedData.invalidCount})
                    </button>
                  )}
                </div>
              </div>

              {/* Parsed Preview Table */}
              <div className="max-h-48 overflow-y-auto rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                <table className="w-full text-right text-xs">
                  <thead className="bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 text-[11px] border-b border-slate-200 dark:border-slate-800 sticky top-0 font-bold">
                    <tr>
                      <th className="p-2.5">الاسم</th>
                      <th className="p-2.5">الرقم المستخرج</th>
                      <th className="p-2.5">الدولة والبادئة</th>
                      <th className="p-2.5">حالة التحقق</th>
                      <th className="p-2.5">التصنيف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60 text-slate-700 dark:text-slate-200">
                    {parsedData.rows
                      .filter((r) => {
                        if (filterPreviewMode === 'valid') return r.validation.isValid;
                        if (filterPreviewMode === 'invalid') return !r.validation.isValid;
                        return true;
                      })
                      .map((row, idx) => (
                        <tr key={idx} className="hover:bg-white/60 dark:bg-slate-900/60 transition">
                          <td className="p-2.5 font-bold text-slate-900 dark:text-white">{row.name}</td>
                          <td className="p-2.5 font-mono" dir="ltr">
                            {row.validation.isValid ? (
                              <span className="text-emerald-400 font-bold">+{row.phone}</span>
                            ) : (
                              <span className="text-red-400 line-through">{row.phone || '(فارغ)'}</span>
                            )}
                          </td>
                          <td className="p-2.5">
                            <span className="flex items-center gap-1.5">
                              <span>{row.validation.countryFlag}</span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                +{row.validation.countryCode} ({row.validation.countryName})
                              </span>
                            </span>
                          </td>
                          <td className="p-2.5">
                            {row.validation.isValid ? (
                              <Badge tone="green">✓ صالح ومعتمد</Badge>
                            ) : (
                              <Badge tone="red">✕ {row.validation.errorReason}</Badge>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-500 dark:text-slate-400 text-[11px]">
                            {row.tag || bulkTag}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              {/* Option to automatically ignore invalid numbers */}
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={ignoreInvalid}
                  onChange={(e) => setIgnoreInvalid(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <span>
                  استبعاد الأرقام غير الصالحة تلقائياً واستيراد الأرقام الصحيحة فقط ({parsedData.validCount} رقم) لحماية حسابك من الحظر
                </span>
              </label>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button type="button" variant="ghost" onClick={closeBulkModal}>
              إلغاء
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!parsedData || parsedData.totalRows === 0}
              onClick={handleConfirmImport}
            >
              <Check className="w-4 h-4" />
              <span>
                تأكيد واستيراد{' '}
                {parsedData
                  ? ignoreInvalid
                    ? `(${parsedData.validCount}) أرقام صالحة`
                    : `(${parsedData.totalRows}) جهات اتصال`
                  : ''}
              </span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* WhatsApp existence check */}
      <Modal
        open={showCheckModal}
        onClose={() => {
          if (checkJob?.status === 'running') return;
          setShowCheckModal(false);
          setCheckJobId(null);
          setCheckJob(null);
        }}
        title="فحص وجود الأرقام على واتساب"
        subtitle="استعلام خفيف بدون إرسال أي رسالة — دفعات صغيرة بفواصل آمنة"
      >
        <div className="space-y-4 text-xs">
          {!checkJob || checkJob.status === 'running' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-500" />
                <span>
                  جارٍ الفحص... {checkJob ? `${checkJob.done} / ${checkJob.total}` : 'بدء المهمة'}
                </span>
              </div>
              <ProgressBar
                value={checkJob && checkJob.total > 0 ? (checkJob.done / checkJob.total) * 100 : 0}
                live
              />
              <p className="text-[11px] text-slate-500">
                لا تغلق النافذة أثناء الفحص. الأرقام غير الموجودة ستُعلَّم تلقائياً كغير صالحة.
              </p>
            </div>
          ) : checkJob.status === 'error' ? (
            <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{checkJob.error || 'فشل الفحص.'}</span>
            </div>
          ) : (
            <div className="space-y-3">
              {(() => {
                const ok = checkJob.results.filter((r) => r.exists).length;
                const missing = checkJob.results.length - ok;
                return (
                  <>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-center">
                        <div className="text-xl font-black text-emerald-400 font-mono">{ok}</div>
                        <div className="text-[11px] text-slate-500">عليها واتساب ✓</div>
                      </div>
                      <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/25 text-center">
                        <div className="text-xl font-black text-red-400 font-mono">{missing}</div>
                        <div className="text-[11px] text-slate-500">ليست على واتساب</div>
                      </div>
                    </div>
                    {typeof checkJob.appliedInvalid === 'number' && checkJob.appliedInvalid > 0 && (
                      <div className="text-[11px] text-amber-300">
                        تم تعليم {checkJob.appliedInvalid} رقم كغير صالح تلقائياً.
                      </div>
                    )}
                    {missing > 0 && (
                      <div className="max-h-44 overflow-y-auto space-y-1.5">
                        {checkJob.results
                          .filter((r) => !r.exists)
                          .slice(0, 100)
                          .map((r) => (
                            <div
                              key={r.phone}
                              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-600 dark:text-slate-300"
                              dir="ltr"
                            >
                              +{r.phone}
                            </div>
                          ))}
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                      <Button variant="ghost" onClick={() => {
                        setShowCheckModal(false);
                        setCheckJobId(null);
                        setCheckJob(null);
                      }}>
                        إغلاق
                      </Button>
                      <Button variant="danger" size="sm" onClick={handleDeleteInvalid}>
                        <Trash2 className="w-3.5 h-3.5" />
                        حذف الأرقام غير الصالحة
                      </Button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
