import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

/* ------------------------------------------------------------------ buttons */
type BtnVariant = 'primary' | 'soft' | 'ghost' | 'danger' | 'dark';
type BtnSize = 'sm' | 'md' | 'lg';

const btnVariants: Record<BtnVariant, string> = {
  primary:
    'bg-gradient-to-l from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-950/40',
  soft: 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25',
  ghost: 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700',
  danger: 'bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/25',
  dark: 'bg-slate-100 dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800',
};

const btnSizes: Record<BtnSize, string> = {
  sm: 'px-3 py-1.5 text-[11px] rounded-lg gap-1.5',
  md: 'px-4 py-2.5 text-xs rounded-xl gap-2',
  lg: 'px-6 py-3.5 text-sm rounded-2xl gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: BtnSize;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  disabled,
  ...rest
}) => (
  <button
    disabled={disabled || loading}
    className={`inline-flex items-center justify-center font-bold transition active:scale-[0.97] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${btnVariants[variant]} ${btnSizes[size]} ${className}`}
    {...rest}
  >
    {loading && (
      <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
    )}
    {children}
  </button>
);

/* ------------------------------------------------------------------ fields */
const fieldClass =
  'w-full rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/15 transition text-xs';

export const Field: React.FC<{
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}> = ({ label, hint, error, children, className = '' }) => (
  <div className={`space-y-1.5 ${className}`}>
    <label className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}</label>
    {children}
    {hint && !error && <div className="text-[11px] text-slate-500">{hint}</div>}
    {error && <div className="text-[11px] text-red-300">{error}</div>}
  </div>
);

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className = '', ...rest }, ref) => (
  <input ref={ref} className={`${fieldClass} p-2.5 ${className}`} {...rest} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className = '', ...rest }, ref) => (
  <textarea ref={ref} className={`${fieldClass} p-3 leading-relaxed ${className}`} {...rest} />
));
Textarea.displayName = 'Textarea';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className = '', children, ...rest }, ref) => (
  <select ref={ref} className={`${fieldClass} p-2.5 cursor-pointer ${className}`} {...rest}>
    {children}
  </select>
));
Select.displayName = 'Select';

/* ------------------------------------------------------------------ badge */
type Tone = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'teal';
const toneClass: Record<Tone, string> = {
  green: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  amber: 'bg-amber-500/10 text-amber-300 border-amber-500/25',
  red: 'bg-red-500/10 text-red-300 border-red-500/25',
  blue: 'bg-blue-500/10 text-blue-300 border-blue-500/25',
  gray: 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700',
  teal: 'bg-teal-500/10 text-teal-300 border-teal-500/25',
};

export const Badge: React.FC<{ tone?: Tone; className?: string; children: React.ReactNode }> = ({
  tone = 'gray',
  className = '',
  children,
}) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${toneClass[tone]} ${className}`}
  >
    {children}
  </span>
);

/* ------------------------------------------------------------------ toggle */
export const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}> = ({ checked, onChange, label, hint }) => (
  <label className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer hover:border-slate-400 dark:hover:border-slate-700 transition">
    <div className="space-y-0.5">
      <div className="text-xs font-bold text-slate-900 dark:text-white">{label}</div>
      {hint && <div className="text-[10px] text-slate-500 dark:text-slate-400">{hint}</div>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.preventDefault();
        onChange(!checked);
      }}
      className={`relative w-10 h-[22px] rounded-full transition-colors shrink-0 ${
        checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <motion.span
        animate={{ x: checked ? -18 : -2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className="absolute top-[3px] right-0 w-4 h-4 rounded-full bg-white shadow"
      />
    </button>
  </label>
);

/* ------------------------------------------------------------------ tabs */
export const Tabs: React.FC<{
  options: { id: string; label: string; icon?: React.ReactNode }[];
  value: string;
  onChange: (id: string) => void;
}> = ({ options, value, onChange }) => (
  <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800" role="tablist">
    {options.map((o) => {
      const active = o.id === value;
      return (
        <button
          key={o.id}
          role="tab"
          aria-selected={active}
          onClick={() => onChange(o.id)}
          className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
            active ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {active && (
            <span className="absolute inset-0 rounded-xl bg-slate-300/70 dark:bg-slate-700/80" />
          )}
          <span className="relative flex items-center gap-1.5">
            {o.icon}
            {o.label}
          </span>
        </button>
      );
    })}
  </div>
);

/* ------------------------------------------------------------------ modal */
export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  wide?: boolean;
}> = ({ open, onClose, title, subtitle, children, wide = false }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-100/75 dark:bg-slate-950/75 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} bg-white dark:bg-slate-900 border border-slate-300/70 dark:border-slate-700/70 rounded-3xl p-6 space-y-4 shadow-2xl shadow-black/60 max-h-[90vh] overflow-y-auto`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-black text-slate-900 dark:text-white">{title}</h2>
                {subtitle && <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</div>}
              </div>
              <button
                onClick={onClose}
                aria-label="إغلاق"
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-300 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/* ------------------------------------------------------------------ progress */
export const ProgressBar: React.FC<{
  value: number;
  tone?: 'green' | 'blue' | 'amber';
  live?: boolean;
  className?: string;
}> = ({ value, tone = 'green', live = false, className = '' }) => {
  const grad =
    tone === 'green'
      ? 'from-emerald-500 to-teal-400'
      : tone === 'blue'
      ? 'from-blue-500 to-cyan-400'
      : 'from-amber-500 to-orange-400';
  return (
    <div className={`w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden ${className}`}>
      <div
        className={`h-full bg-gradient-to-l ${grad} rounded-full transition-all duration-700 ${
          live ? 'progress-live' : ''
        }`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      ></div>
    </div>
  );
};

/* ------------------------------------------------------------------ toasts */
export type ToastKind = 'success' | 'error' | 'info';
export interface ToastMsg {
  id: number;
  kind: ToastKind;
  text: string;
}

let toastSeq = 1;
export function toast(text: string, kind: ToastKind = 'success') {
  window.dispatchEvent(new CustomEvent<ToastMsg>('wamora-toast', { detail: { id: toastSeq++, kind, text } }));
}

export const Toaster: React.FC = () => {
  const [items, setItems] = React.useState<ToastMsg[]>([]);

  React.useEffect(() => {
    const onToast = (e: Event) => {
      const msg = (e as CustomEvent<ToastMsg>).detail;
      setItems((prev) => [...prev.slice(-3), msg]);
      setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== msg.id)), 4200);
    };
    window.addEventListener('wamora-toast', onToast);
    return () => window.removeEventListener('wamora-toast', onToast);
  }, []);

  const icon =
    (kind: ToastKind) =>
      kind === 'success' ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      ) : kind === 'error' ? (
        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
      ) : (
        <Info className="w-4 h-4 text-blue-400 shrink-0" />
      );

  const border =
    (kind: ToastKind) =>
      kind === 'success'
        ? 'border-emerald-500/30'
        : kind === 'error'
        ? 'border-red-500/30'
        : 'border-blue-500/30';

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[80] flex flex-col items-center gap-2 pointer-events-none px-4 w-full max-w-md">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl glass border ${border(
              t.kind,
            )} shadow-2xl shadow-black/50 text-xs font-bold text-slate-900 dark:text-slate-100 w-full`}
          >
            {icon(t.kind)}
            <span className="flex-1">{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
