import React from 'react';
import {
  Zap,
  QrCode,
  Bell,
  CheckCircle2,
  AlertCircle,
  Search,
  Sun,
  Moon,
} from 'lucide-react';
import { Button } from './kit';

interface HeaderProps {
  onOpenConnectModal: () => void;
  onOpenQuickSend: () => void;
  onOpenInbox: () => void;
  isCloudConnected: boolean;
  waPhone?: string;
  unreadCount?: number;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenConnectModal,
  onOpenQuickSend,
  onOpenInbox,
  isCloudConnected,
  waPhone = '',
  unreadCount = 0,
  theme,
  onToggleTheme,
}) => {
  return (
    <header className="h-18 border-b border-slate-200/70 dark:border-slate-800/70 glass sticky top-0 z-30 px-4 md:px-8 flex items-center justify-between shadow-lg shadow-black/20">
      {/* Left (or Right in RTL): System Status & Badges */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenConnectModal}
          title={isCloudConnected ? `متصل: +${waPhone}` : 'اضغط لربط رقم الواتساب'}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition cursor-pointer ${
            isCloudConnected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isCloudConnected ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isCloudConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
          </span>
          <span className="flex items-center gap-1.5">
            {isCloudConnected ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {isCloudConnected ? `واتساب متصل: +${waPhone}` : 'واتساب غير مرتبط — اضغط للربط'}
          </span>
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-2.5">
        {/* Quick Send Button */}
        <Button
          size="sm"
          onClick={onOpenQuickSend}
          title="إرسال رسالة فورية لرقم"
          className="px-3.5 py-2"
        >
          <Zap className="w-4 h-4 fill-white" />
          <span className="hidden sm:inline">إرسال سريع</span>
        </Button>

        {/* Device / Cloud API connect button */}
        <Button
          size="sm"
          variant="ghost"
          onClick={onOpenConnectModal}
          className="py-2"
        >
          <QrCode className="w-4 h-4 text-emerald-400" />
          <span className="hidden md:inline">ربط الحساب / QR</span>
        </Button>

        {/* Search / palette trigger */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('wamora-open-palette'))}
          title="بحث وأوامر (Ctrl K)"
          className="flex items-center gap-2 p-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer active:scale-95"
        >
          <Search className="w-4 h-4" />
          <kbd className="hidden md:inline text-[10px] font-mono text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5">
            Ctrl K
          </kbd>
        </button>

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'}
          className="p-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer active:scale-95"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notifications -> inbox */}
        <button
          onClick={onOpenInbox}
          title={unreadCount > 0 ? `${unreadCount} رسائل غير مقروءة` : 'صندوق الوارد'}
          className="relative p-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer active:scale-95"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* User avatar */}
        <div className="flex items-center gap-2.5 pr-2 pl-1 border-r border-slate-200 dark:border-slate-800 mr-1">
          <img src="/logo.svg" className="w-8 h-8" alt="Wamora" />
          <div className="hidden 2xl:block text-right">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200" dir="ltr">
              {waPhone ? `+${waPhone}` : 'غير مرتبط'}
            </div>
            <div className="text-[10px] text-emerald-400 font-mono">استضافة ذاتية</div>
          </div>
        </div>
      </div>
    </header>
  );
};
