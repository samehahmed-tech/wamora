import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Send,
  Megaphone,
  MessageSquareText,
  Facebook,
  Users,
  BookmarkCheck,
  Bot,
  ShieldAlert,
  Code2,
  CreditCard,
  DatabaseBackup,
  Smartphone,
  QrCode,
  Check,
  ChevronDown,
} from 'lucide-react';
import { NavigationTab } from '../types';
import { Badge } from './kit';

export interface SidebarAccount {
  id: string;
  name: string;
  phone: string;
  state: string;
}

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  unreadCount?: number;
  metaUnreadCount?: number;
  activeCampaignsCount?: number;
  sentTotal?: number;
  waConnected?: boolean;
  waPhone?: string;
  onOpenConnect?: () => void;
  accounts?: SidebarAccount[];
  activeAccountId?: string | null;
  onSelectAccount?: (id: string) => void;
  onNavigate?: (tab: NavigationTab) => void;
}

interface Item {
  id: NavigationTab;
  labelAr: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  tone?: 'green' | 'amber' | 'blue' | 'gray';
}

const SECTIONS: { title: string; items: Item[] }[] = [
  {
    title: 'العمل اليومي',
    items: [
      { id: 'dashboard', labelAr: 'لوحة التحكم', icon: LayoutDashboard },
      { id: 'fast_sender', labelAr: 'إرسال سريع', icon: Send },
      { id: 'campaigns', labelAr: 'الحملات', icon: Megaphone },
      { id: 'inbox', labelAr: 'صندوق الوارد', icon: MessageSquareText },
      { id: 'meta', labelAr: 'ماسنجر وانستاجرام', icon: Facebook },
    ],
  },
  {
    title: 'الإدارة والأتمتة',
    items: [
      { id: 'contacts', labelAr: 'جهات الاتصال', icon: Users },
      { id: 'groups', labelAr: 'المجموعات', icon: Users },
      { id: 'templates', labelAr: 'القوالب', icon: BookmarkCheck },
      { id: 'accounts', labelAr: 'الأرقام والحسابات', icon: Smartphone },
      { id: 'bot_manager', labelAr: 'البوت الذكي', icon: Bot },
      { id: 'anti_block', labelAr: 'درع الحماية', icon: ShieldAlert },
    ],
  },
  {
    title: 'النظام',
    items: [
      { id: 'backup', labelAr: 'النسخ الاحتياطي', icon: DatabaseBackup },
      { id: 'api_docs', labelAr: 'API والمطورون', icon: Code2 },
      { id: 'billing', labelAr: 'الاستخدام', icon: CreditCard },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  unreadCount = 0,
  metaUnreadCount = 0,
  activeCampaignsCount = 0,
  sentTotal = 0,
  waConnected = false,
  waPhone = '',
  onOpenConnect,
  accounts = [],
  activeAccountId = null,
  onSelectAccount,
  onNavigate,
}) => {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const activeAccount = accounts.find((a) => a.id === activeAccountId) || null;
  const badgeFor = (id: NavigationTab): { badge?: string | number; tone?: Item['tone'] } => {
    if (id === 'campaigns' && activeCampaignsCount > 0)
      return { badge: `${activeCampaignsCount} نشطة`, tone: 'green' };
    if (id === 'inbox' && unreadCount > 0) return { badge: unreadCount, tone: 'green' };
    if (id === 'meta' && metaUnreadCount > 0) return { badge: metaUnreadCount, tone: 'blue' };
    if (id === 'bot_manager') return { badge: 'AI', tone: 'amber' };
    return {};
  };

  return (
    <aside className="w-[248px] shrink-0 flex flex-col bg-white/60 dark:bg-slate-900/60 border-l border-slate-200/70 dark:border-slate-800/70 backdrop-blur-md select-none max-md:hidden">
      {/* Brand */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-3">
        <img src="/logo.svg" alt="Wamora" className="w-10 h-10 rounded-2xl" />
        <div>
          <div className="font-black text-[17px] text-slate-900 dark:text-white leading-none">
            Wamora
          </div>
          <div className="text-[10px] text-slate-500 mt-1">By Coduis</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-4">
        {SECTIONS.map((sec) => (
          <div key={sec.title}>
            <div className="px-2.5 mb-1.5 text-[10px] font-bold text-slate-500">{sec.title}</div>
            <div className="space-y-0.5">
              {sec.items.map((item) => {
                const Icon = item.icon;
                const isSelected = currentTab === item.id;
                const { badge, tone } = badgeFor(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    className={`relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-bold transition-colors cursor-pointer ${
                      isSelected ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute inset-0 rounded-xl bg-gradient-to-l from-emerald-600/90 to-teal-600/70 shadow-lg shadow-emerald-950/50" />
                    )}
                    {!isSelected && (
                      <span className="absolute inset-0 rounded-xl hover:bg-slate-300/70 dark:hover:bg-slate-800/70 transition-colors" />
                    )}
                    <span className="relative flex items-center gap-2.5">
                      <Icon className="w-[18px] h-[18px]" />
                      {item.labelAr}
                    </span>
                    {badge !== undefined && (
                      <span className="relative">
                        <Badge tone={isSelected ? 'gray' : tone || 'gray'}>{badge}</Badge>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Connection card -> account switcher */}
      <div className="p-3 relative">
        <button
          onClick={() => (accounts.length > 0 ? setSwitcherOpen((v) => !v) : onOpenConnect?.())}
          className="w-full p-3.5 rounded-2xl bg-slate-100/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/30 transition text-right cursor-pointer group"
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`relative flex h-2.5 w-2.5 shrink-0 ${
                waConnected ? '' : 'soft-pulse'
              }`}
            >
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${
                  waConnected ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              ></span>
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  waConnected ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              ></span>
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-black text-slate-900 dark:text-slate-100 flex items-center gap-1">
                {waConnected ? (
                  <span dir="ltr">+{waPhone}</span>
                ) : activeAccount ? (
                  <span className="truncate">{activeAccount.name}</span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-300">
                    <QrCode className="w-3 h-3" />
                    اربط رقمك
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {waConnected ? (
                  <span>
                    <span className="text-emerald-400 font-bold">{sentTotal.toLocaleString('ar-EG')}</span> رسالة مرسلة
                  </span>
                ) : (
                  'اضغط للربط عبر QR'
                )}
              </div>
            </div>
            {accounts.length > 0 ? (
              <ChevronDown className={`w-4 h-4 text-slate-500 transition shrink-0 ${switcherOpen ? 'rotate-180' : ''}`} />
            ) : (
              <Smartphone className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition shrink-0" />
            )}
          </div>
        </button>
        <AnimatePresence>
          {switcherOpen && accounts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
              className="absolute bottom-full mb-2 right-3 left-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden z-30"
            >
              <div className="max-h-56 overflow-y-auto py-1">
                {accounts.map((a) => {
                  const isActive = a.id === activeAccountId;
                  return (
                    <button
                      key={a.id}
                      onClick={() => {
                        onSelectAccount?.(a.id);
                        setSwitcherOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-right text-[11px] transition cursor-pointer ${
                        isActive
                          ? 'bg-emerald-500/10 text-slate-900 dark:text-white font-bold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${a.state === 'connected' ? 'bg-emerald-500' : a.state === 'qr' || a.state === 'connecting' ? 'bg-amber-500' : 'bg-slate-500'}`} />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate font-bold">{a.name}</span>
                        <span className="block text-[10px] text-slate-500 font-mono" dir="ltr">
                          {a.phone ? `+${a.phone}` : a.state}
                        </span>
                      </span>
                      {isActive && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5 p-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => {
                    setSwitcherOpen(false);
                    (onNavigate || onSelectTab)('accounts');
                  }}
                  className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  إدارة الحسابات
                </button>
                <button
                  onClick={() => {
                    setSwitcherOpen(false);
                    onOpenConnect?.();
                  }}
                  className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer"
                >
                  ربط رقم جديد
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </aside>
  );
};
