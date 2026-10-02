import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  Plus,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Clock,
  Send,
  Users,
  Eye,
  MessageCircle,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  Video,
  ShieldCheck,
  Sparkles,
  Filter,
  Search,
  Calendar,
  Zap,
  Edit3,
  CalendarCheck,
  X,
  BookmarkCheck,
} from 'lucide-react';
import { Campaign, Contact, ContactGroup, MessageTemplate, AntiBlockConfig } from '../types';
import { DEFAULT_ANTIBLOCK } from '../defaults';
import { calculateSpintaxPermutations } from '../utils/antiBlock';
import { post, del, get } from '../api';
import { Button, Field, Input, Textarea, Select, Badge, Modal, Tabs, ProgressBar, toast } from './kit';
import { SectionHeader, EmptyState, Card, Stagger, StaggerItem } from './ui';

interface RecipientReport {
  phone: string;
  status: 'sent' | 'failed' | 'pending';
  accountName?: string;
  error?: string;
  ts?: number;
}

interface CampaignReportData {
  campaignId: string;
  campaignName: string;
  generatedAt: string;
  final: boolean;
  summary: {
    total: number;
    sent: number;
    failed: number;
    pending: number;
    replied: number;
    deliveryRate: number;
    failRate: number;
    startedAt?: string;
    completedAt?: string;
    durationMinutes?: number;
  };
  recipients: RecipientReport[];
}

interface CampaignsViewProps {
  campaigns: Campaign[];
  templates?: MessageTemplate[];
  contacts?: Contact[];
  groups?: ContactGroup[];
  antiBlock?: AntiBlockConfig;
  onRefreshCampaigns: () => void;
  accounts?: { id: string; name: string; state: string }[];
}

export const CampaignsView: React.FC<CampaignsViewProps> = ({
  campaigns,
  templates = [],
  contacts = [],
  groups = [],
  antiBlock = DEFAULT_ANTIBLOCK,
  onRefreshCampaigns,
  accounts = [],
}) => {
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'running' | 'completed' | 'scheduled'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Campaign report (saved snapshot when finished, live otherwise)
  const [reportId, setReportId] = useState<string | null>(null);
  const [report, setReport] = useState<CampaignReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSearch, setReportSearch] = useState('');
  const [reportFilter, setReportFilter] = useState<'all' | 'sent' | 'failed' | 'pending'>('all');

  const openReport = async (id: string) => {
    setReportId(id);
    setReport(null);
    setReportSearch('');
    setReportFilter('all');
    setReportLoading(true);
    try {
      const data = await get<CampaignReportData>(`/api/campaigns/${id}/report`);
      setReport(data);
    } catch (e: any) {
      toast(e?.message || 'تعذر تحميل التقرير.', 'error');
      setReportId(null);
    } finally {
      setReportLoading(false);
    }
  };

  const filteredRecipients = (report?.recipients || []).filter((r) => {
    const okStatus = reportFilter === 'all' || r.status === reportFilter;
    const okSearch = !reportSearch.trim() || r.phone.includes(reportSearch.trim());
    return okStatus && okSearch;
  });

  // Form state for creating a new campaign
  const [newCampaignName, setNewCampaignName] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [audienceTag, setAudienceTag] = useState<string>('all');
  const [manualPhones, setManualPhones] = useState<string>('');
  const [newMessageTemplate, setNewMessageTemplate] = useState<string>('');
  const [newMessageVariants, setNewMessageVariants] = useState<string[]>([]);
  const [newMediaType, setNewMediaType] = useState<'none' | 'image' | 'video'>('none');
  const [newMediaUrl, setNewMediaUrl] = useState<string>('');
  const [newMediaName, setNewMediaName] = useState<string>('');
  const [scopeAll, setScopeAll] = useState<boolean>(true);
  const [scopeAccountIds, setScopeAccountIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const allTags = [...new Set(contacts.flatMap((c) => c.tags || []))];
  const activeContacts = contacts.filter((c) => c.status === 'active');
  const norm = (p: string) => String(p || '').replace(/[^0-9]/g, '');
  const groupPhones = (gid: string): string[] => {
    const g = groups.find((x) => x.id === gid);
    if (!g) return [];
    const set = new Set<string>();
    (g.phones || []).forEach((p) => { const c = norm(p); if (c) set.add(c); });
    activeContacts.forEach((c) => {
      const hitTag = g.tag && (c.tags || []).includes(g.tag);
      const hitRegion = g.region && (c.region === g.region || (c.tags || []).includes(g.region) || (c.tags || []).includes(`منطقة:${g.region}`));
      if ((g.tag || g.region) ? (hitTag || hitRegion) : false) { const cl = norm(c.phone); if (cl) set.add(cl); }
    });
    return [...set];
  };
  const estimateRecipients = () => {
    if (audienceTag.startsWith('group:')) return groupPhones(audienceTag.slice(6)).length + manualPhones
      .split(/[\n,;]+/)
      .map((s) => s.replace(/[^0-9]/g, ''))
      .filter((s) => s.length >= 9 && s.length <= 15).length;
    const fromContacts =
      audienceTag === 'all'
        ? activeContacts.length
        : activeContacts.filter((c) => (c.tags || []).includes(audienceTag)).length;
    const manual = manualPhones
      .split(/[\n,;]+/)
      .map((s) => s.replace(/[^0-9]/g, ''))
      .filter((s) => s.length >= 9 && s.length <= 15).length;
    return fromContacts + manual;
  };

  // Scheduling states
  const [dispatchType, setDispatchType] = useState<'instant' | 'scheduled'>('instant');
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<string>('18:00');
  const [scheduledTimezone, setScheduledTimezone] = useState<string>('Asia/Riyadh');

  // Quick Reschedule Modal for existing scheduled campaigns
  const [rescheduleCampaignId, setRescheduleCampaignId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editTime, setEditTime] = useState<string>('18:00');

  // Set default scheduled date to tomorrow's date
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    setScheduledDate(`${yyyy}-${mm}-${dd}`);
    setEditDate(`${yyyy}-${mm}-${dd}`);
  }, []);

  // Quick Presets helper
  const handleApplyPreset = (preset: 'today_evening' | 'tomorrow_morning' | 'weekend' | 'in_3_hours') => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    if (preset === 'today_evening') {
      const yyyy = now.getFullYear();
      const mm = pad(now.getMonth() + 1);
      const dd = pad(now.getDate());
      setScheduledDate(`${yyyy}-${mm}-${dd}`);
      setScheduledTime('18:30');
    } else if (preset === 'tomorrow_morning') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yyyy = tomorrow.getFullYear();
      const mm = pad(tomorrow.getMonth() + 1);
      const dd = pad(tomorrow.getDate());
      setScheduledDate(`${yyyy}-${mm}-${dd}`);
      setScheduledTime('10:00');
    } else if (preset === 'weekend') {
      const d = new Date();
      const daysUntilFriday = (5 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + daysUntilFriday);
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      setScheduledDate(`${yyyy}-${mm}-${dd}`);
      setScheduledTime('15:00');
    } else if (preset === 'in_3_hours') {
      const in3h = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      const yyyy = in3h.getFullYear();
      const mm = pad(in3h.getMonth() + 1);
      const dd = pad(in3h.getDate());
      setScheduledDate(`${yyyy}-${mm}-${dd}`);
      setScheduledTime(`${pad(in3h.getHours())}:${pad(in3h.getMinutes())}`);
    }
    setDispatchType('scheduled');
  };

  const runAction = async (campaignId: string, action: 'start' | 'pause' | 'resume' | 'stop' | 'delete', body?: unknown) => {
    setBusyId(campaignId);
    setActionError(null);
    try {
      if (action === 'delete') {
        await del(`/api/campaigns/${campaignId}`);
      } else {
        await post(`/api/campaigns/${campaignId}/${action}`, body);
      }
      onRefreshCampaigns();
    } catch (e: any) {
      setActionError(e?.message || 'تعذر تنفيذ العملية.');
    } finally {
      setBusyId(null);
    }
  };

  // Pause / resume a live campaign on the server worker
  const handleTogglePlayPause = (campaignId: string) => {
    const camp = campaigns.find((c) => c.id === campaignId);
    if (!camp) return;
    if (camp.status === 'running') runAction(campaignId, 'pause');
    else if (camp.status === 'paused') runAction(campaignId, 'resume');
    else if (camp.status === 'scheduled') runAction(campaignId, 'start');
  };

  // Launch scheduled campaign immediately (real start on the worker)
  const handleLaunchImmediately = (campaignId: string) => runAction(campaignId, 'start');

  // Save rescheduled date/time — persisted to the server; the scheduler fires it
  const handleSaveReschedule = async () => {
    if (!rescheduleCampaignId) return;
    const when = new Date(`${editDate}T${editTime}:00`);
    if (Number.isNaN(when.getTime())) {
      setActionError('التاريخ أو الوقت غير صالح.');
      return;
    }
    const formatted = `${editDate} في تمام ${editTime} (توقيت مكة)`;
    try {
      const res = await fetch('/api/campaigns', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          campaigns.map((c) =>
            c.id === rescheduleCampaignId
              ? { ...c, scheduledFor: formatted, scheduledAt: when.toISOString(), status: 'scheduled' as const }
              : c,
          ),
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || 'تعذر حفظ الموعد.');
      setRescheduleCampaignId(null);
      onRefreshCampaigns();
    } catch (e: any) {
      setActionError(e?.message || 'تعذر حفظ الموعد.');
    }
  };

  // Load template into campaign
  const handleLoadTemplateForCampaign = (tId: string) => {
    setSelectedTemplateId(tId);
    const found = templates.find((t) => t.id === tId);
    if (!found) return;
    setNewMessageTemplate(found.body);
    if (!newCampaignName) {
      setNewCampaignName(`حملة ${found.title}`);
    }
    if (found.mediaType && (found.mediaType === 'image' || found.mediaType === 'video')) {
      setNewMediaType(found.mediaType);
      setNewMediaUrl(found.mediaUrl || '');
      setNewMediaName(found.mediaName || '');
    } else {
      setNewMediaType('none');
    }
  };

  // Create Campaign Submit — real creation on the server, then start or schedule
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignName.trim() || !newMessageTemplate.trim() || creating) return;
    setCreating(true);
    setActionError(null);
    try {
      const isScheduled = dispatchType === 'scheduled';
      const when = isScheduled ? new Date(`${scheduledDate}T${scheduledTime}:00`) : null;
      if (isScheduled && (!when || Number.isNaN(when.getTime()))) {
        throw new Error('التاريخ أو الوقت غير صالح.');
      }
      const label =
        audienceTag === 'all'
          ? `كل جهات الاتصال النشطة`
          : `وسم: ${audienceTag}`;
      const manualList = manualPhones
        .split(/[\n,;]+/)
        .map((s) => s.replace(/[^0-9]/g, ''))
        .filter((s) => s.length >= 9 && s.length <= 15);

      const created = await post<Campaign>('/api/campaigns', {
        name: newCampaignName.trim(),
        targetAudience: manualList.length ? `${label} + ${manualList.length} رقم إضافي` : label,
        audienceTag,
        manualPhones: manualList,
        accountIds: scopeAll ? ['all'] : scopeAccountIds,
        messageTemplate: newMessageTemplate,
        messageVariants: newMessageVariants.map((v) => v.trim()).filter(Boolean),
        media:
          newMediaType !== 'none' && newMediaUrl
            ? { type: newMediaType, url: newMediaUrl, name: newMediaName || 'campaign_media' }
            : undefined,
        scheduledFor: isScheduled
          ? `${scheduledDate} في تمام ${scheduledTime}`
          : undefined,
        scheduledAt: when ? when.toISOString() : undefined,
        antiBlockConfig: antiBlock,
      });

      if (!isScheduled) {
        await post(`/api/campaigns/${created.id}/start`);
      }
      setShowCreateModal(false);
      setNewCampaignName('');
      setNewMessageTemplate('');
      setNewMessageVariants([]);
      setManualPhones('');
      setSelectedTemplateId('');
      setScopeAll(true);
      setScopeAccountIds([]);
      onRefreshCampaigns();
    } catch (e: any) {
      setActionError(e?.message || 'تعذر إنشاء الحملة.');
    } finally {
      setCreating(false);
    }
  };

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesFilter = selectedFilter === 'all' || c.status === selectedFilter;
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.targetAudience.includes(searchQuery);
    return matchesFilter && matchesSearch;
  });

  const scheduledCount = campaigns.filter((c) => c.status === 'scheduled').length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <SectionHeader
        icon={<Megaphone className="w-5 h-5" />}
        title="إدارة الحملات التسويقية والجدولة التلقائية"
        hint="إطلاق وجدولة وتتبع حملات البث الجماعي في مواعيد محددة بدقة مع خوارزميات الحماية ومكافحة الحظر"
        action={
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4" />
            <span>إنشاء وجدولة حملة جديدة</span>
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <Tabs
          value={selectedFilter}
          onChange={(id) => setSelectedFilter(id as 'all' | 'running' | 'completed' | 'scheduled')}
          options={[
            { id: 'all', label: `جميع الحملات (${campaigns.length})` },
            { id: 'running', label: 'الحملات النشطة' },
            { id: 'scheduled', label: `المجدولة تلقائياً (${scheduledCount})`, icon: <Clock className="w-3.5 h-3.5" /> },
            { id: 'completed', label: 'المكتملة' },
          ]}
        />

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في أسماء الحملات..."
            className="pr-9"
          />
        </div>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Campaigns Cards Grid */}
      {filteredCampaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="w-6 h-6" />}
          title="لا توجد حملات مطابقة"
          hint="لم يتم العثور على حملات تطابق البحث أو التصفية الحالية. أنشئ حملة جديدة للبدء."
          actionLabel="إنشاء وجدولة حملة جديدة"
          onAction={() => setShowCreateModal(true)}
        />
      ) : (
      <Stagger className="space-y-4">
        {filteredCampaigns.map((camp) => {
          const isRunning = camp.status === 'running';
          const isCompleted = camp.status === 'completed';
          const isScheduled = camp.status === 'scheduled';
          const permutations = calculateSpintaxPermutations(camp.messageTemplate);

          return (
            <StaggerItem key={camp.id}>
            <Card
              className={`p-5 md:p-6 space-y-4 ${
                isScheduled
                  ? 'border-amber-500/30'
                  : ''
              }`}
            >
              {/* Top Row: Name, Status & Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{camp.name}</h3>
                    {isRunning && (
                      <Badge tone="green">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        نشطة وقيد الإرسال
                      </Badge>
                    )}
                    {isCompleted && (
                      <Badge tone="blue">
                        <CheckCircle2 className="w-3 h-3" />
                        اكتملت بنجاح
                      </Badge>
                    )}
                    {isScheduled && (
                      <Badge tone="amber">
                        <Clock className="w-3.5 h-3.5" />
                        <span>مجدولة للإرسال التلقائي: {camp.scheduledFor}</span>
                      </Badge>
                    )}
                    {camp.status === 'paused' && (
                      <Badge tone="gray">
                        متوقفة مؤقتاً
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-emerald-400" />
                      {camp.targetAudience}
                    </span>
                    <span>• تاريخ الإنشاء: {camp.createdAt}</span>
                    <span className="text-blue-400 font-mono">
                      Spintax: {permutations > 1 ? `${permutations} تنويعات` : 'نص عادي'}
                    </span>
                  </div>
                </div>

                {/* Live engine controls */}
                <div className="flex items-center gap-2">
                  {isScheduled ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRescheduleCampaignId(camp.id);
                        }}
                        disabled={busyId === camp.id}
                        title="تعديل وقت وتاريخ الجدولة"
                      >
                        <Calendar className="w-3.5 h-3.5 text-amber-400" />
                        <span>تعديل الموعد</span>
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => handleLaunchImmediately(camp.id)}
                        disabled={busyId === camp.id}
                        title="تجاوز الجدولة والبدء فوراً"
                      >
                        <Zap className="w-3.5 h-3.5 fill-white" />
                        <span>{busyId === camp.id ? 'جارٍ الإطلاق...' : 'إطلاق فوري الآن'}</span>
                      </Button>
                    </>
                  ) : (
                    <>
                      {!isCompleted && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTogglePlayPause(camp.id)}
                          disabled={busyId === camp.id}
                        >
                          {isRunning ? (
                            <>
                              <Pause className="w-3.5 h-3.5 text-amber-400" />
                              <span>إيقاف مؤقت</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 text-emerald-400" />
                              <span>{camp.status === 'paused' ? 'استئناف الإرسال' : 'تشغيل الحملة'}</span>
                            </>
                          )}
                        </Button>
                      )}

                      {(isRunning || camp.status === 'paused') && (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => runAction(camp.id, 'stop')}
                          disabled={busyId === camp.id}
                          title="إنهاء الحملة نهائياً"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>إنهاء</span>
                        </Button>
                      )}

                      {(isCompleted || camp.status === 'draft') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => runAction(camp.id, 'delete')}
                          disabled={busyId === camp.id}
                          title="حذف الحملة"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </Button>
                      )}
                      {isCompleted && (
                        <Button
                          variant="soft"
                          size="sm"
                          onClick={() => {
                            if (window.confirm('إعادة إرسال الحملة للكل متجاهلا فحص تكرار؟')) runAction(camp.id, 'start', { force: true });
                          }}
                          disabled={busyId === camp.id}
                          title="إعادة إرسال نفس الحملة للجميع بدون فحص تكرار"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>إعادة للكل</span>
                        </Button>
                      )}

                      {(isRunning || isCompleted || camp.status === 'paused') && (
                        <Button
                          variant="soft"
                          size="sm"
                          onClick={() => openReport(camp.id)}
                          title={isCompleted ? 'عرض التقرير النهائي المحفوظ' : 'عرض تقرير حي'}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>التقرير</span>
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-600 dark:text-slate-300">
                    {isScheduled
                      ? `الحملة جاهزة ومجدولة لـ ${camp.totalRecipients.toLocaleString('ar-SA')} عميل`
                      : `تم إرسال ${camp.sentCount.toLocaleString('ar-SA')} من إجمالي ${camp.totalRecipients.toLocaleString('ar-SA')} مستلم`}
                  </span>
                  <span className="text-emerald-400 font-bold">{camp.progressPercent}%</span>
                </div>
                  <ProgressBar value={camp.progressPercent} tone="green" live={isRunning} />
              </div>

              {/* Delivery Stats Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-850">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                    {isScheduled ? 'المستهدفون' : 'تم التسليم بنجاح'}
                  </div>
                  <div className="text-base font-black text-emerald-400 font-mono">
                    {isScheduled ? camp.totalRecipients.toLocaleString('ar-SA') : camp.deliveredCount.toLocaleString('ar-SA')}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {isScheduled ? 'جاهزون للبث الآلي' : camp.sentCount > 0 ? `${Math.round((camp.deliveredCount / camp.sentCount) * 100)}% معدل التسليم` : '0%'}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-850">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">
                    {isScheduled ? 'موعد الانطلاق' : 'تمت القراءة (Read)'}
                  </div>
                  <div className="text-base font-black text-teal-400 font-mono truncate">
                    {isScheduled ? 'تلقائي بالوقت' : camp.readCount.toLocaleString('ar-SA')}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {isScheduled ? 'نظام الجدولة الذكي' : camp.deliveredCount > 0 ? `${Math.round((camp.readCount / camp.deliveredCount) * 100)}% نسبة القراءة` : '0%'}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-850">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">ردود وتفاعل العملاء</div>
                  <div className="text-base font-black text-blue-400 font-mono">
                    {camp.repliedCount.toLocaleString('ar-SA')}
                  </div>
                  <div className="text-[10px] text-slate-500">محادثات بدأت مباشرة</div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-850">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">إخفاقات الإرسال</div>
                  <div className="text-base font-black text-red-400 font-mono">
                    {camp.failedCount.toLocaleString('ar-SA')}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    تأخير {camp.antiBlockConfig?.minDelaySeconds ?? antiBlock.minDelaySeconds}-
                    {camp.antiBlockConfig?.maxDelaySeconds ?? antiBlock.maxDelaySeconds}ث •{' '}
                    {camp.antiBlockConfig?.useSpintax ?? antiBlock.useSpintax ? 'Spintax نشط' : 'بدون Spintax'}
                  </div>
                </div>
              </div>
            </Card>
            </StaggerItem>
          );
        })}
      </Stagger>
      )}

      {/* Create & Schedule Campaign Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="إنشاء وجدولة حملة تسويقية"
        subtitle="حدد محتوى الحملة ووقت إطلاقها التلقائي أو الفوري"
        wide
      >
            <form onSubmit={handleCreateCampaign} className="space-y-4">
              {/* Campaign Name */}
              <Field label="اسم الحملة التسويقية:">
                <Input
                  type="text"
                  required
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  placeholder="مثال: عروض نهاية الأسبوع الكبرى - فرع الرياض"
                />
              </Field>

              {/* Real Target Audience */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="الجمهور المستهدف (من جهات الاتصال):">
                  <Select
                    value={audienceTag}
                    onChange={(e) => setAudienceTag(e.target.value)}
                  >
                    <option value="all">كل جهات الاتصال النشطة ({activeContacts.length})</option>
                    {groups.map((g) => (
                      <option key={g.id} value={`group:${g.id}`}>
                        مجموعة: {g.name} ({groupPhones(g.id).length})
                      </option>
                    ))}
                    {allTags.map((tag) => (
                      <option key={tag} value={tag}>
                        وسم: {tag} ({activeContacts.filter((c) => (c.tags || []).includes(tag)).length})
                      </option>
                    ))}
                  </Select>
                  <div className="text-[11px] text-emerald-400 font-bold">
                    الإجمالي التقديري للمستلمين: {estimateRecipients().toLocaleString('ar-EG')} رقم
                  </div>
                </Field>

                <Field label="الوسائط المرفقة:">
                  <Select
                    value={newMediaType}
                    onChange={(e: any) => setNewMediaType(e.target.value)}
                  >
                    <option value="none">نص فقط بدون وسائط</option>
                    <option value="image">صورة (Image)</option>
                    <option value="video">فيديو (Video)</option>
                  </Select>
                  {newMediaType !== 'none' && (
                    <>
                      <Input
                        type="url"
                        dir="ltr"
                        value={newMediaUrl}
                        onChange={(e) => setNewMediaUrl(e.target.value)}
                        placeholder="رابط الملف المباشر https://..."
                        className="font-mono text-[11px]"
                      />
                      <Input
                        type="text"
                        dir="ltr"
                        value={newMediaName}
                        onChange={(e) => setNewMediaName(e.target.value)}
                        placeholder="اسم الملف (اختياري)"
                        className="text-[11px]"
                      />
                    </>
                  )}
                </Field>
              </div>

              <Field label="أرقام إضافية يدوية (اختياري — رقم في كل سطر):">
                <Textarea
                  rows={2}
                  dir="ltr"
                  value={manualPhones}
                  onChange={(e) => setManualPhones(e.target.value)}
                  placeholder="9665XXXXXXXX"
                  className="font-mono"
                />
              </Field>

              {/* Account scope */}
              <Field label="نطاق حسابات الإرسال:" hint="اختر الأرقام المسموح لها بإرسال هذه الحملة عبر Wamora.">
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scopeAll}
                      onChange={(e) => setScopeAll(e.target.checked)}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    كل الحسابات النشطة
                  </label>
                  {!scopeAll && (
                    <div className="space-y-1.5 pl-1">
                      {accounts.map((a) => (
                        <label key={a.id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={scopeAccountIds.includes(a.id)}
                            onChange={(e) =>
                              setScopeAccountIds((prev) =>
                                e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id),
                              )
                            }
                            className="w-4 h-4 accent-emerald-600"
                          />
                          {a.name} ({a.state})
                        </label>
                      ))}
                      {accounts.length === 0 && (
                        <div className="text-[11px] text-slate-500">لا توجد حسابات متاحة.</div>
                      )}
                    </div>
                  )}
                </div>
              </Field>

              {/* Template Picker */}
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <BookmarkCheck className="w-4 h-4 text-emerald-400" />
                    <span>تحميل من قوالب الرسائل الجاهزة:</span>
                  </label>
                  {selectedTemplateId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedTemplateId('');
                      }}
                    >
                      إلغاء التحديد
                    </Button>
                  )}
                </div>
                <Select
                  value={selectedTemplateId}
                  onChange={(e) => handleLoadTemplateForCampaign(e.target.value)}
                  className="text-emerald-300 font-bold"
                >
                  <option value="">-- اختر قالباً محفوظاً لملء المحتوى والإعدادات تلقائياً --</option>
                  {templates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.title} ({tpl.categoryAr})
                    </option>
                  ))}
                </Select>
              </div>

              {/* Message Template with Spintax */}
              <Field label="نص الرسالة (Spintax والمتغيرات):">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200">نص الرسالة (Spintax والمتغيرات):</label>
                  <span className="text-[11px] text-emerald-400">
                    {calculateSpintaxPermutations(newMessageTemplate)} صياغات متوفرة
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1 pb-1">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-1">إدراج متغير:</span>
                  <Button
                    type="button"
                    variant="soft"
                    size="sm"
                    className="font-mono text-[10px]"
                    onClick={() => setNewMessageTemplate((prev) => prev + ' {{name}}')}
                  >
                    + {'{{name}}'}
                  </Button>
                  <Button
                    type="button"
                    variant="soft"
                    size="sm"
                    className="font-mono text-[10px]"
                    onClick={() => setNewMessageTemplate((prev) => prev + ' {{discount_code}}')}
                  >
                    + {'{{discount_code}}'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-[10px]"
                    onClick={() => setNewMessageTemplate((prev) => prev + ' {مرحباً|أهلاً بكم|السلام عليكم}')}
                  >
                    + Spintax ترحيب
                  </Button>
                </div>
                <Textarea
                  rows={4}
                  required
                  value={newMessageTemplate}
                  onChange={(e) => setNewMessageTemplate(e.target.value)}
                />
              </Field>

              {/* Extra message variants rotated across recipients (anti-block) */}
              <Field label={`رسائل بديلة للتدوير (${newMessageVariants.length}/10):`}>
                <div className="space-y-2">
                  {newMessageVariants.map((v, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Textarea
                        rows={2}
                        value={v}
                        onChange={(e) =>
                          setNewMessageVariants((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                        }
                        placeholder={`صياغة بديلة ${i + 1}...`}
                      />
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => setNewMessageVariants((prev) => prev.filter((_, j) => j !== i))}
                      >
                        حذف
                      </Button>
                    </div>
                  ))}
                  {newMessageVariants.length < 10 && (
                    <Button
                      type="button"
                      variant="soft"
                      size="sm"
                      onClick={() => setNewMessageVariants((prev) => [...prev, ''])}
                    >
                      + إضافة رسالة بديلة (توزع بالتناوب على مستقبلين)
                    </Button>
                  )}
                </div>
              </Field>

              {/* Scheduling Section */}
              <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-emerald-400" />
                    <span>توقيت إرسال الحملة (Scheduling Mode):</span>
                  </label>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">بدء تلقائي في الوقت المحدد</span>
                </div>

                {/* Dispatch Type Toggle (Instant vs Scheduled) */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={dispatchType === 'instant' ? 'soft' : 'ghost'}
                    onClick={() => setDispatchType('instant')}
                  >
                    <Zap className="w-4 h-4 text-emerald-400" />
                    <span>إرسال فوري الآن</span>
                  </Button>

                  <Button
                    type="button"
                    variant={dispatchType === 'scheduled' ? 'soft' : 'ghost'}
                    onClick={() => setDispatchType('scheduled')}
                  >
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span>جدولة لوقت لاحق (Auto-Schedule)</span>
                  </Button>
                </div>

                {/* Scheduled details when chosen */}
                {dispatchType === 'scheduled' && (
                  <div className="pt-2 space-y-3 border-t border-slate-200/80 dark:border-slate-800/80">
                    {/* Quick presets buttons */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">أوقات مقترحة سريعة:</span>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleApplyPreset('today_evening')}
                        >
                          اليوم في المساء (18:30)
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleApplyPreset('tomorrow_morning')}
                        >
                          غداً صباحاً (10:00)
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleApplyPreset('weekend')}
                        >
                          عطلة نهاية الأسبوع (الجمعة 15:00)
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleApplyPreset('in_3_hours')}
                        >
                          بعد 3 ساعات من الآن
                        </Button>
                      </div>
                    </div>

                    {/* Date and Time pickers */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <Field label="تاريخ الإرسال:">
                        <Input
                          type="date"
                          required
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                        />
                      </Field>

                      <Field label="الوقت المحدد:">
                        <Input
                          type="time"
                          required
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                        />
                      </Field>

                      <Field label="المنطقة الزمنية:">
                        <Select
                          value={scheduledTimezone}
                          onChange={(e) => setScheduledTimezone(e.target.value)}
                        >
                          <option value="Asia/Riyadh">توقيت مكة والرياض (GMT+3)</option>
                          <option value="Africa/Cairo">توقيت القاهرة (GMT+2)</option>
                          <option value="Asia/Dubai">توقيت دبي وأبوظبي (GMT+4)</option>
                        </Select>
                      </Field>
                    </div>

                    <div className="text-[11px] text-amber-400/90 flex items-center gap-1.5 pt-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        سيقوم النظام بتفعيل الحملة تلقائياً يوم{' '}
                        <strong className="text-slate-900 dark:text-white">{scheduledDate}</strong> في تمام الساعة{' '}
                        <strong className="text-slate-900 dark:text-white">{scheduledTime}</strong> بتأخيرات أمان عشوائية.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Anti-Block Safeguard Badge in Modal */}
              <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                  <div className="font-bold text-emerald-400">الحماية التلقائية مفعلة لهذه الحملة:</div>
                  <div>
                    سيتم تطبيق تأخير عشوائي ({antiBlock.minDelaySeconds}-{antiBlock.maxDelaySeconds} ثانية) بين
                    الرسائل{antiBlock.useSpintax ? '، مع صياغات Spintax بديلة لكل عميل' : ''}، ودفعات من{' '}
                    {antiBlock.batchSize} رسالة مع راحة {antiBlock.batchPauseMinutes} دقائق.
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowCreateModal(false)}
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  loading={creating}
                  disabled={creating || !newCampaignName.trim() || !newMessageTemplate.trim()}
                >
                  {creating ? (
                    <span>جارٍ الإنشاء...</span>
                  ) : dispatchType === 'scheduled' ? (
                    <>
                      <CalendarCheck className="w-4 h-4" />
                      <span>تأكيد وجدولة الحملة</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 fill-white" />
                      <span>إطلاق الحملة فوراً</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
      </Modal>

      {/* Quick Reschedule Modal */}
      <Modal
        open={rescheduleCampaignId !== null}
        onClose={() => setRescheduleCampaignId(null)}
        title="تعديل موعد الجدولة التلقائية"
      >
            <div className="space-y-3 text-xs">
              <Field label="تاريخ البدء الجديد:">
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </Field>

              <Field label="الوقت المحدد (توقيت مكة):">
                <Input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                />
              </Field>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRescheduleCampaignId(null)}
                >
                  إلغاء
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveReschedule}
                >
                  حفظ الموعد الجديد
                </Button>
              </div>
            </div>
      </Modal>

      {/* Campaign report: saved snapshot when finished, live otherwise */}
      <Modal
        open={reportId !== null}
        onClose={() => {
          setReportId(null);
          setReport(null);
        }}
        title={report ? `تقرير الحملة: ${report.campaignName}` : 'تقرير الحملة'}
        subtitle={
          report
            ? report.final
              ? `تقرير نهائي محفوظ • ${new Date(report.generatedAt).toLocaleString('ar-EG')}`
              : 'تقرير حي — يتحدث مع تقدم الإرسال'
            : undefined
        }
        wide
      >
        {reportLoading || !report ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500">
            <span className="w-5 h-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
            جارٍ تحميل التقرير...
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <ReportStat label="المستهدف" value={report.summary.total} tone="text-slate-900 dark:text-white" />
              <ReportStat label="ناجحة" value={report.summary.sent} tone="text-emerald-400" />
              <ReportStat label="فاشلة" value={report.summary.failed} tone="text-red-400" />
              <ReportStat label="بانتظار" value={report.summary.pending} tone="text-amber-400" />
              <ReportStat label="ردود العملاء" value={report.summary.replied} tone="text-indigo-400" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-slate-600 dark:text-slate-300">معدل النجاح</span>
                  <span className="text-emerald-400 font-mono">%{report.summary.deliveryRate}</span>
                </div>
                <ProgressBar value={report.summary.deliveryRate} />
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between font-bold">
                  <span className="text-slate-600 dark:text-slate-300">معدل الفشل</span>
                  <span className="text-red-400 font-mono">%{report.summary.failRate}</span>
                </div>
                <ProgressBar value={report.summary.failRate} tone="amber" />
              </div>
            </div>

            {(report.summary.durationMinutes !== undefined || report.summary.completedAt) && (
              <div className="text-[11px] text-slate-500">
                بدأت: {report.summary.startedAt || '—'}
                {report.summary.completedAt &&
                  ` • انتهت: ${new Date(report.summary.completedAt).toLocaleString('ar-EG')}`}
                {report.summary.durationMinutes !== undefined &&
                  ` • المدة: ${report.summary.durationMinutes} دقيقة`}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute right-3 top-2.5 pointer-events-none" />
                <Input
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                  placeholder="بحث برقم الهاتف..."
                  className="pr-9"
                />
              </div>
              <Tabs
                value={reportFilter}
                onChange={(id) => setReportFilter(id as 'all' | 'sent' | 'failed' | 'pending')}
                options={[
                  { id: 'all', label: `الكل (${report.recipients.length})` },
                  { id: 'sent', label: 'ناجحة' },
                  { id: 'failed', label: 'فاشلة' },
                  { id: 'pending', label: 'بانتظار' },
                ]}
              />
              <a href={`/api/campaigns/${report.campaignId}/report.csv`} download>
                <Button variant="ghost" size="sm" type="button">
                  <span>تصدير CSV</span>
                </Button>
              </a>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <table className="w-full text-right text-[11px]">
                <thead className="bg-slate-100 dark:bg-slate-950 text-slate-500 font-bold sticky top-0">
                  <tr>
                    <th className="p-2.5">الرقم</th>
                    <th className="p-2.5">الحالة</th>
                    <th className="p-2.5">الحساب المرسل</th>
                    <th className="p-2.5">الوقت / الخطأ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                  {filteredRecipients.slice(0, 500).map((r) => (
                    <tr key={r.phone} className="hover:bg-slate-200/40 dark:hover:bg-slate-800/40">
                      <td className="p-2.5 font-mono" dir="ltr">
                        +{r.phone}
                      </td>
                      <td className="p-2.5">
                        {r.status === 'sent' ? (
                          <Badge tone="green">تم الإرسال</Badge>
                        ) : r.status === 'failed' ? (
                          <Badge tone="red">فشل</Badge>
                        ) : (
                          <Badge tone="amber">بانتظار</Badge>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-500">{r.accountName || '—'}</td>
                      <td className="p-2.5 text-slate-500 max-w-[200px] truncate" title={r.error || ''}>
                        {r.ts ? new Date(r.ts).toLocaleString('ar-EG') : r.error || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRecipients.length === 0 && (
                <div className="text-center text-slate-500 py-6">لا نتائج مطابقة.</div>
              )}
              {filteredRecipients.length > 500 && (
                <div className="text-center text-[11px] text-slate-500 py-2">
                  عرض أول 500 — صدّر CSV للقائمة الكاملة.
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

function ReportStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center">
      <div className={`text-lg font-black font-mono ${tone}`}>{value.toLocaleString('ar-EG')}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}
