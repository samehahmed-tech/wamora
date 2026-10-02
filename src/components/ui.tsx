import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';

/** Animated page wrapper — wrap every tab view for a consistent soft entrance */
export const Page: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    className={`space-y-6 ${className}`}
  >
    {children}
  </motion.div>
);

/** Stagger container + items for grids */
export const Stagger: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <motion.div
    initial="hidden"
    animate="show"
    variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
    className={className}
  >
    {children}
  </motion.div>
);

export const StaggerItem: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => (
  <motion.div
    variants={{
      hidden: { opacity: 0, y: 14 },
      show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
    }}
    className={className}
  >
    {children}
  </motion.div>
);

/** Glass card */
export const Card: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({
  children,
  className = '',
  onClick,
}) => (
  <div
    onClick={onClick}
    className={`rounded-3xl bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800/80 backdrop-blur-sm ${onClick ? 'cursor-pointer' : ''} ${className}`}
  >
    {children}
  </div>
);

/** Animated number that counts up (Arabic numerals) */
export const CountUp: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className={className}>{display.toLocaleString('ar-EG')}</span>;
};

export const Spinner: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <Loader2 className={`${className} animate-spin`} />
);

export const StatusDot: React.FC<{ color: 'green' | 'amber' | 'red' | 'gray' }> = ({ color }) => {
  const map = {
    green: 'bg-emerald-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    gray: 'bg-slate-500',
  } as const;
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${map[color]}`}></span>
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${map[color]}`}></span>
    </span>
  );
};

/** Friendly empty state used across tabs */
export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ icon, title, hint, actionLabel, onAction }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.97 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.3 }}
    className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/40 dark:bg-slate-900/40 p-10 text-center space-y-3"
  >
    <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500">
      {icon}
    </div>
    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">{hint}</p>
    {actionLabel && onAction && (
      <button
        onClick={onAction}
        className="mt-1 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer active:scale-95"
      >
        {actionLabel}
      </button>
    )}
  </motion.div>
);

/** Section header shared by tabs */
export const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}> = ({ icon, title, hint, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
        <span className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
          {icon}
        </span>
        {title}
      </h1>
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 mr-[52px]">{hint}</p>}
    </div>
    {action}
  </div>
);
