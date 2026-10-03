/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { NavigationTab, Campaign, Contact, ContactGroup, Conversation, BotRule, GeminiBotConfig, AntiBlockConfig, ApiKeyItem, MessageTemplate, WaAccount, RotationSettings } from './types';
import { groupMemberPhones } from './components/GroupsView';
import { DEFAULT_ANTIBLOCK, DEFAULT_BOT_CONFIG, EMPTY_STATS, WA_DISCONNECTED, SendLogShape, StatsShape, WaPublic } from './defaults';
import { get, put, post, subscribeEvents } from './api';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { FastSenderView } from './components/FastSenderView';
import { CampaignsView } from './components/CampaignsView';
import { MessageTemplatesView } from './components/MessageTemplatesView';
import { AntiBlockView } from './components/AntiBlockView';
import { BotManagerView } from './components/BotManagerView';
import { LiveChatView } from './components/LiveChatView';
import { MetaView } from './components/MetaView';
import { LeadFinderView } from './components/LeadFinderView';
import { ContactsView } from './components/ContactsView';
import { GroupsView } from './components/GroupsView';
import { AccountsView } from './components/AccountsView';
import { ApiGatewayView } from './components/ApiGatewayView';
import { BillingView } from './components/BillingView';
import { ConnectionModal } from './components/ConnectionModal';
import { CommandPalette } from './components/CommandPalette';
import { LicenseView, LicenseInfo } from './components/LicenseView';
import { Toaster } from './components/kit';

interface Bootstrap {
  contacts: Contact[];
  groups: ContactGroup[];
  campaigns: Campaign[];
  templates: MessageTemplate[];
  botRules: BotRule[];
  botConfig: GeminiBotConfig;
  antiBlock: AntiBlockConfig;
  apiKeys: ApiKeyItem[];
  conversations: Conversation[];
  stats: StatsShape;
  sendLog: SendLogShape[];
  wa: WaPublic;
  queue: { pending: number; sentThisHour: number };
  geminiReady: boolean;
  license: LicenseInfo;
}

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [activeLanguage, setActiveLanguage] = useState<'ar' | 'en'>('ar');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return (localStorage.getItem('wamora-theme') as 'dark' | 'light') || 'dark';
    } catch {
      return 'dark';
    }
  });
  const [showConnectModal, setShowConnectModal] = useState<boolean>(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // App Central States (server is the source of truth)
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [botRules, setBotRules] = useState<BotRule[]>([]);
  const [geminiConfig, setGeminiConfig] = useState<GeminiBotConfig>(DEFAULT_BOT_CONFIG);
  const [antiBlockConfig, setAntiBlockConfig] = useState<AntiBlockConfig>(DEFAULT_ANTIBLOCK);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selectedTemplateForSender, setSelectedTemplateForSender] = useState<MessageTemplate | null>(null);

  // Live server state
  const [wa, setWa] = useState<WaPublic>(WA_DISCONNECTED);
  const [stats, setStats] = useState<StatsShape>(EMPTY_STATS);
  const [sendLog, setSendLog] = useState<SendLogShape[]>([]);
  const [queuePending, setQueuePending] = useState(0);
  const [metaUnread, setMetaUnread] = useState(0);
  const [sentThisHour, setSentThisHour] = useState(0);
  const [geminiReady, setGeminiReady] = useState(false);
  const [license, setLicense] = useState<LicenseInfo | null>(null);

  // Multi-account state
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [rotation, setRotation] = useState<RotationSettings>({ strategy: 'least-used', perAccountHourlyCap: 25, perAccountDailyCap: 300, failStreakLimit: 2, cooldownMinutes: 45 });
  const [connectAccount, setConnectAccount] = useState<{ id: string; name: string } | null>(null);

  const refreshAccounts = useCallback(() => {
    get<{ accounts: WaAccount[]; activeAccountId: string | null; rotation: RotationSettings }>('/api/accounts')
      .then((d) => {
        setAccounts(d.accounts || []);
        setActiveAccountId(d.activeAccountId || null);
        if (d.rotation) setRotation(d.rotation);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  // Sync dark class + persisted theme (matches index.html boot script)
  useEffect(() => {
    try {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      localStorage.setItem('wamora-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Initial bootstrap from the server
  useEffect(() => {
    let cancelled = false;
    get<Bootstrap>('/api/bootstrap')
      .then((data) => {
        if (cancelled) return;
        setCampaigns(data.campaigns || []);
        setContacts(data.contacts || []);
        setGroups((data as any).groups || []);
        setConversations(data.conversations || []);
        setBotRules(data.botRules || []);
        setGeminiConfig(data.botConfig || DEFAULT_BOT_CONFIG);
        setAntiBlockConfig(data.antiBlock || DEFAULT_ANTIBLOCK);
        setApiKeys(data.apiKeys || []);
        setTemplates(data.templates || []);
        setStats(data.stats || EMPTY_STATS);
        setSendLog(data.sendLog || []);
        setWa(data.wa || WA_DISCONNECTED);
        setQueuePending(data.queue?.pending || 0);
        setSentThisHour(data.queue?.sentThisHour || 0);
        setGeminiReady(!!data.geminiReady);
        if ((data as any).license) setLicense((data as any).license as LicenseInfo);
        setLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err?.message || 'تعذر الاتصال بالخادم');
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime sync (SSE) — server pushes change notifications
  useEffect(() => {
    const off = subscribeEvents((e) => {
      if (e.type === 'wa-status') {
        get<WaPublic>('/api/whatsapp/status').then(setWa).catch(() => undefined);
        refreshAccounts();
      } else if (e.type === 'conversations') {
        get<Conversation[]>('/api/conversations').then(setConversations).catch(() => undefined);
      } else if (e.type === 'campaigns') {
        get<Campaign[]>('/api/campaigns').then(setCampaigns).catch(() => undefined);
        get<StatsShape>('/api/stats').then(setStats).catch(() => undefined);
      } else if (e.type === 'sendlog') {
        get<{ pending: number; sentThisHour: number; log: SendLogShape[] }>('/api/queue')
          .then((q) => {
            setSendLog(q.log || []);
            setQueuePending(q.pending || 0);
            setSentThisHour(q.sentThisHour || 0);
          })
          .catch(() => undefined);
      } else if (e.type === 'stats') {
        get<StatsShape>('/api/stats').then(setStats).catch(() => undefined);
      }
    });
    return off;
  }, [refreshAccounts]);

  const openConnectFor = useCallback((id: string, name: string) => {
    setConnectAccount({ id, name });
    setShowConnectModal(true);
  }, []);

  const persist = useCallback((path: string, value: unknown) => {
    put(path, value).catch((err) => console.error(`[persist] ${path} failed:`, err?.message));
  }, []);

  const toggleLanguage = () => {
    setActiveLanguage((prev) => (prev === 'ar' ? 'en' : 'ar'));
  };

  const activeCampaignsCount = campaigns.filter((c) => c.status === 'running').length;
  const totalUnreadCount = conversations.reduce((acc, c) => acc + c.unreadCount, 0);
  const isCloudConnected = wa.state === 'connected';

  const refreshWa = useCallback(() => {
    get<WaPublic>('/api/whatsapp/status').then(setWa).catch(() => undefined);
  }, []);

  // stable identity — the connection modal must not re-fire connect on renders
  const refreshAll = useCallback(() => {
    refreshWa();
    refreshAccounts();
  }, [refreshWa, refreshAccounts]);

  // license gate: unlicensed installs see activation only
  if (loaded && license && !license.ok) {
    return (
      <div dir={activeLanguage === 'ar' ? 'rtl' : 'ltr'}>
        <LicenseView license={license} onActivated={setLicense} />
        <Toaster />
      </div>
    );
  }

  return (
    <div
      dir={activeLanguage === 'ar' ? 'rtl' : 'ltr'}
      className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white"
    >
      {/* Top Application Header */}
      <Header
        onOpenConnectModal={() => { setConnectAccount(null); setShowConnectModal(true); }}
        onOpenQuickSend={() => setCurrentTab('fast_sender')}
        onOpenInbox={() => setCurrentTab('inbox')}
        unreadCount={totalUnreadCount}
        isCloudConnected={isCloudConnected}
        waPhone={wa.user?.phone || ''}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />

      {/* Main Container: Sidebar + Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          unreadCount={totalUnreadCount}
          metaUnreadCount={metaUnread}
          activeCampaignsCount={activeCampaignsCount}
          sentTotal={stats.sent}
          waConnected={isCloudConnected}
          waPhone={wa.user?.phone || ''}
          onOpenConnect={() => { setConnectAccount(null); setShowConnectModal(true); }}
          accounts={accounts}
          activeAccountId={activeAccountId}
          onSelectAccount={(id) => {
            post(`/api/accounts/${id}/activate`).then(() => refreshAccounts()).catch(() => undefined);
          }}
          onNavigate={setCurrentTab}
        />

        {/* Viewport Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-100 dark:bg-slate-950">
          {/* Mobile nav (sidebar is hidden on small screens) */}
          <div className="md:hidden mb-4 -mx-1 px-1 flex gap-1.5 overflow-x-auto pb-1">
            {(
              [
                ['dashboard', 'الرئيسية'],
                ['fast_sender', 'إرسال'],
                ['campaigns', 'الحملات'],
                ['inbox', 'الوارد'],
                ['contacts', 'الجهات'],
                ['groups', 'المجموعات'],
                ['accounts', 'الحسابات'],
                ['bot_manager', 'البوت'],
                ['templates', 'القوالب'],
                ['anti_block', 'الحماية'],
                ['api_docs', 'API'],
                ['billing', 'الاستخدام'],
              ] as [NavigationTab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setCurrentTab(id)}
                className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  currentTab === id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="max-w-7xl mx-auto">
            {!loaded && (
              <div className="space-y-4" dir={activeLanguage === 'ar' ? 'rtl' : 'ltr'}>
                <div className="skeleton h-36 rounded-3xl" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="skeleton h-28 rounded-2xl" />
                  <div className="skeleton h-28 rounded-2xl" />
                  <div className="skeleton h-28 rounded-2xl" />
                  <div className="skeleton h-28 rounded-2xl" />
                </div>
                <div className="skeleton h-64 rounded-3xl" />
                <p className="text-center text-xs text-slate-500 pt-2">جارٍ تحميل البيانات من الخادم...</p>
              </div>
            )}

            {loaded && loadError && (
              <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                تعذر الاتصال بالخادم: {loadError} — تأكد أن الخادم يعمل ثم حدّث الصفحة.
              </div>
            )}

            <AnimatePresence mode="wait">
              <motion.div
                key={currentTab}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
            {loaded && currentTab === 'dashboard' && (
              <DashboardView
                campaigns={campaigns}
                stats={stats}
                antiBlock={antiBlockConfig}
                waConnected={isCloudConnected}
                geminiReady={geminiReady}
                queuePending={queuePending}
                contactsCount={contacts.length}
                sendLog={sendLog}
                onNavigate={setCurrentTab}
                onOpenQuickSend={() => setCurrentTab('fast_sender')}
                onOpenConnect={() => setShowConnectModal(true)}
              />
            )}

            {loaded && currentTab === 'fast_sender' && (
              <FastSenderView
                templates={templates}
                initialTemplate={selectedTemplateForSender}
                antiBlock={antiBlockConfig}
                waConnected={isCloudConnected}
                sendLog={sendLog}
                queuePending={queuePending}
                onRequestConnect={() => { setConnectAccount(null); setShowConnectModal(true); }}
                accounts={accounts}
                groups={groups}
                contacts={contacts}
              />
            )}

            {loaded && currentTab === 'campaigns' && (
              <CampaignsView
                campaigns={campaigns}
                templates={templates}
                contacts={contacts}
                groups={groups}
                antiBlock={antiBlockConfig}
                accounts={accounts}
                onRefreshCampaigns={() => {
                  get<Campaign[]>('/api/campaigns').then(setCampaigns).catch(() => undefined);
                }}
              />
            )}

            {loaded && currentTab === 'templates' && (
              <MessageTemplatesView
                templates={templates}
                onUpdateTemplates={(updated) => {
                  setTemplates(updated);
                  persist('/api/templates', updated);
                }}
                onUseTemplateInSender={(tpl) => {
                  setSelectedTemplateForSender(tpl);
                  setCurrentTab('fast_sender');
                }}
              />
            )}

            {loaded && currentTab === 'anti_block' && (
              <AntiBlockView
                config={antiBlockConfig}
                onUpdateConfig={(updated) => {
                  setAntiBlockConfig(updated);
                  persist('/api/settings/antiblock', updated);
                }}
                activeAudience={contacts.filter((c) => c.status === 'active').length}
                sentToday={stats.daily?.[new Date().toISOString().slice(0, 10)]?.sent || 0}
                sentThisHour={sentThisHour}
              />
            )}

            {loaded && currentTab === 'bot_manager' && (
              <BotManagerView
                rules={botRules}
                geminiConfig={geminiConfig}
                geminiReady={geminiReady}
                onUpdateRules={(updated) => {
                  setBotRules(updated);
                  persist('/api/bot-rules', updated);
                }}
                onUpdateGeminiConfig={(updated) => {
                  setGeminiConfig(updated);
                  persist('/api/bot-config', updated);
                }}
                onRefreshRules={() => {
                  get<BotRule[]>('/api/bot-rules').then(setBotRules).catch(() => undefined);
                }}
              />
            )}

            {loaded && currentTab === 'inbox' && (
              <LiveChatView conversations={conversations} />
            )}

            {loaded && currentTab === 'meta' && (
              <MetaView onUnread={setMetaUnread} />
            )}

            {loaded && currentTab === 'lead_finder' && (
              <LeadFinderView />
            )}

            {loaded && currentTab === 'contacts' && (
              <ContactsView
                contacts={contacts}
                onUpdateContacts={(updated) => {
                  setContacts(updated);
                  persist('/api/contacts', updated);
                }}
              />
            )}

            {loaded && currentTab === 'groups' && (
              <GroupsView
                groups={groups}
                contacts={contacts}
                onUpdateGroups={(updated) => {
                  setGroups(updated);
                  persist('/api/groups', updated);
                }}
              />
            )}

            {loaded && currentTab === 'accounts' && (
              <AccountsView
                accounts={accounts}
                activeAccountId={activeAccountId}
                rotation={rotation}
                onRefresh={refreshAccounts}
                onConnectAccount={openConnectFor}
              />
            )}

            {loaded && currentTab === 'api_docs' && (
              <ApiGatewayView
                apiKeys={apiKeys}
                onUpdateApiKeys={setApiKeys}
              />
            )}

            {loaded && currentTab === 'billing' && (
              <BillingView
                stats={stats}
                contactsCount={contacts.length}
                campaignsCount={campaigns.length}
                conversationsCount={conversations.length}
              />
            )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* WhatsApp Device Connection Modal */}
      <ConnectionModal
        isOpen={showConnectModal}
        onClose={() => { setShowConnectModal(false); setConnectAccount(null); }}
        wa={wa}
        onRefresh={refreshAll}
        accountId={connectAccount?.id || null}
        accountName={connectAccount?.name || ''}
      />

      {/* Command palette + toasts */}
      <CommandPalette
        onNavigate={setCurrentTab}
        onQuickSend={() => setCurrentTab('fast_sender')}
        onConnect={() => { setConnectAccount(null); setShowConnectModal(true); }}
      />
      <Toaster />
    </div>
  );
}
