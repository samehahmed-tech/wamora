import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Send,
  Megaphone,
  BookmarkCheck,
  ShieldAlert,
  Bot,
  MessageSquareText,
  Users,
  Code2,
  CreditCard,
  Search,
  Zap,
  Plus,
  Smartphone,
  CornerDownLeft,
} from 'lucide-react';
import { NavigationTab } from '../types';
import { get } from '../api';

interface CommandPaletteProps {
  onNavigate: (tab: NavigationTab) => void;
  onQuickSend: () => void;
  onConnect: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ onNavigate, onQuickSend, onConnect }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('wamora-open-palette', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wamora-open-palette', onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open ]);

  const commands = useMemo(
    () => [
      { id: 'go-dashboard', group: 'تنقل', label: 'لوحة التحكم', icon: <LayoutDashboard className="w-4 h-4" />, run: () => onNavigate('dashboard') },
      { id: 'go-sender', group: 'تنقل', label: 'الإرسال السريع', icon: <Send className="w-4 h-4" />, run: () => onNavigate('fast_sender') },
      { id: 'go-campaigns', group: 'تنقل', label: 'الحملات', icon: <Megaphone className="w-4 h-4" />, run: () => onNavigate('campaigns') },
      { id: 'go-inbox', group: 'تنقل', label: 'صندوق الوارد', icon: <MessageSquareText className="w-4 h-4" />, run: () => onNavigate('inbox') },
      { id: 'go-contacts', group: 'تنقل', label: 'جهات الاتصال', icon: <Users className="w-4 h-4" />, run: () => onNavigate('contacts') },
      { id: 'go-templates', group: 'تنقل', label: 'قوالب الرسائل', icon: <BookmarkCheck className="w-4 h-4" />, run: () => onNavigate('templates') },
      { id: 'go-bot', group: 'تنقل', label: 'بوت الرد الذكي', icon: <Bot className="w-4 h-4" />, run: () => onNavigate('bot_manager') },
      { id: 'go-anti', group: 'تنقل', label: 'درع الحماية', icon: <ShieldAlert className="w-4 h-4" />, run: () => onNavigate('anti_block') },
      { id: 'go-api', group: 'تنقل', label: 'واجهة API', icon: <Code2 className="w-4 h-4" />, run: () => onNavigate('api_docs') },
      { id: 'go-billing', group: 'تنقل', label: 'الاستخدام والخطة', icon: <CreditCard className="w-4 h-4" />, run: () => onNavigate('billing') },
      { id: 'act-send', group: 'إجراءات', label: 'إرسال رسالة سريعة الآن', icon: <Zap className="w-4 h-4" />, run: onQuickSend },
      { id: 'act-campaign', group: 'إجراءات', label: 'حملة جديدة', icon: <Plus className="w-4 h-4" />, run: () => onNavigate('campaigns') },
      { id: 'act-connect', group: 'إجراءات', label: 'ربط / إدارة رقم الواتساب', icon: <Smartphone className="w-4 h-4" />, run: onConnect },
      {
        id: 'act-backup',
        group: 'إجراءات',
        label: 'تنزيل نسخة احتياطية من البيانات',
        icon: <CornerDownLeft className="w-4 h-4" />,
        run: async () => {
          try {
            const data = await get('/api/bootstrap');
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `wamora-backup-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          } catch {
            /* ignore */
          }
        },
      },
    ],
    [onNavigate, onQuickSend, onConnect],
  );

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return commands;
    return commands.filter((c) => c.label.includes(q) || c.group.includes(q));
  }, [commands, query]);

  useEffect(() => setActiveIdx(0), [query]);

  const runActive = () => {
    const cmd = filtered[Math.min(activeIdx, filtered.length - 1)];
    if (!cmd) return;
    setOpen(false);
    void cmd.run();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[70] bg-slate-100/70 dark:bg-slate-950/70 backdrop-blur-sm flex items-start justify-center pt-[14vh] px-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-300/70 dark:border-slate-700/70 shadow-2xl shadow-black/60 overflow-hidden"
          >
            <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <Search className="w-4 h-4 text-emerald-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActiveIdx((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    runActive();
                  }
                }}
                placeholder="ابحث عن صفحة أو إجراء..."
                className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none"
              />
              <kbd className="text-[10px] font-mono text-slate-500 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5">
                ESC
              </kbd>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {filtered.length === 0 && (
                <div className="text-center text-xs text-slate-500 py-8">لا نتائج مطابقة</div>
              )}
              {filtered.map((c, i) => (
                <button
                  key={c.id}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => {
                    setOpen(false);
                    void c.run();
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                    i === activeIdx ? 'bg-emerald-600/20 text-white' : 'text-slate-300'
                  }`}
                >
                  <span className={i === activeIdx ? 'text-emerald-400' : 'text-slate-500'}>{c.icon}</span>
                  <span className="flex-1 text-right">{c.label}</span>
                  <span className="text-[10px] text-slate-500">{c.group}</span>
                </button>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 flex items-center gap-4 text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <kbd className="font-mono border border-slate-300 dark:border-slate-700 rounded px-1">↑↓</kbd> تنقل
              </span>
              <span className="flex items-center gap-1">
                <kbd className="font-mono border border-slate-300 dark:border-slate-700 rounded px-1">Enter</kbd> تنفيذ
              </span>
              <span className="mr-auto font-mono">Ctrl + K</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
