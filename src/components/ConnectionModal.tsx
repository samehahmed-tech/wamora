import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Smartphone,
  RefreshCw,
  X,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Terminal,
} from 'lucide-react';
import { WaPublic, WA_DISCONNECTED } from '../defaults';
import { get, post } from '../api';

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  wa: WaPublic;
  onRefresh: () => void;
  accountId?: string | null;
  accountName?: string;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  isOpen,
  onClose,
  wa,
  onRefresh,
  accountId = null,
  accountName = '',
}) => {
  const [local, setLocal] = useState<WaPublic>(WA_DISCONNECTED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasQr, setHasQr] = useState(false);
  const handleQr = useCallback((q: string | null) => setHasQr(!!q), []);

  const statusPath = accountId ? `/api/accounts/${accountId}/status` : '/api/whatsapp/status';
  const connectPath = accountId ? `/api/accounts/${accountId}/connect` : '/api/whatsapp/connect';
  const disconnectPath = accountId ? `/api/accounts/${accountId}/disconnect` : '/api/whatsapp/disconnect';

  const refresh = useCallback(async () => {
    try {
      const s = await get<WaPublic & { qr?: string | null }>(statusPath);
      setLocal({ state: s.state, user: s.user, lastError: s.lastError, trace: s.trace || [] });
      return s;
    } catch {
      return null;
    }
  }, [statusPath]);

  // open session + poll while the modal is open.
  // Guarded by ref: fires ONCE per (open, account) — parent re-renders must NOT
  // re-trigger connect, otherwise the session handshake restarts in a loop.
  const startedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen) {
      startedKey.current = null;
      return;
    }
    const key = accountId || 'active';
    if (startedKey.current === key) return;
    startedKey.current = key;
    setError(null);
    setBusy(true);
    let cancelled = false;
    post(connectPath)
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        setBusy(false);
        refresh().then(() => undefined);
        onRefresh();
      });
    const timer = setInterval(async () => {
      const s = await refresh();
      if (cancelled) return;
      if (s?.state === 'connected') onRefresh();
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOpen, accountId, refresh, onRefresh, connectPath]);

  // legacy mode only: mirror the active account from the parent.
  // With accountId set, NEVER overwrite — polling owns `local`, otherwise the
  // new account's QR gets clobbered by the already-connected active account.
  useEffect(() => {
    if (!accountId) setLocal(wa);
  }, [wa, accountId]);

  return (
    <AnimatePresence>
      {isOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-100/80 dark:bg-slate-950/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 md:p-8 space-y-5 shadow-2xl shadow-black/50">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">{accountId ? `ربط الرقم: ${accountName || accountId}` : 'ربط رقم الواتساب بمنصة Wamora'}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-xs cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {local.state === 'connected' && local.user ? (
          <div className="text-center space-y-4 py-2">
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <div className="text-slate-900 dark:text-white font-bold">متصل الآن</div>
              <div className="text-sm text-slate-600 dark:text-slate-300 mt-1" dir="ltr">
                +{local.user.phone}
              </div>
              {local.user.name && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{local.user.name}</div>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              الجلسة محفوظة على هذا الخادم — لن تحتاج لمسح الرمز مجدداً إلا بعد تسجيل الخروج.
            </p>
            <button
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await post(disconnectPath);
                } catch (e: any) {
                  setError(e?.message || 'تعذر قطع الاتصال.');
                } finally {
                  setBusy(false);
                  await refresh();
                  onRefresh();
                }
              }}
              disabled={busy}
              className="px-6 py-2.5 rounded-xl bg-red-600/90 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer flex items-center gap-2 mx-auto"
            >
              <LogOut className="w-4 h-4" />
              تسجيل الخروج وفك الربط
            </button>
          </div>
        ) : (
          <div className="text-center space-y-4 py-2">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              افتح تطبيق واتساب على هاتفك &gt; الأجهزة المرتبطة &gt; ربط جهاز &gt; امسح الرمز التالي:
            </div>

            <QrDisplay onQr={handleQr} statusPath={statusPath} />

            <div className="flex items-center justify-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
              <span className="text-amber-300 font-bold">
                {local.state === 'qr' ? 'بانتظار مسح الرمز من هاتفك...' : busy ? 'جارٍ تجهيز الجلسة...' : 'جارٍ توليد رمز جديد...'}
              </span>
            </div>

            {local.lastError && (
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-red-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                {local.lastError}
              </div>
            )}
            {error && <div className="text-[11px] text-red-300">{error}</div>}
            {hasQr && (
              <div className="text-[11px] text-slate-500">الرمز يتجدد تلقائياً كل ~30 ثانية</div>
            )}

            <button
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await post(connectPath);
                } catch (e: any) {
                  setError(e?.message || 'تعذر بدء الجلسة.');
                } finally {
                  setBusy(false);
                  await refresh();
                  onRefresh();
                }
              }}
              disabled={busy}
              className="px-6 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-900 dark:text-white text-xs font-bold transition cursor-pointer flex items-center gap-2 mx-auto"
            >
              <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
              توليد رمز جديد
            </button>
          </div>
        )}

        <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          الربط يتم عبر بروتوكول WhatsApp Web مباشرة من هذا الخادم — مجاني بالكامل ولا يحتاج WhatsApp Cloud API أو أي اشتراك مدفوع.
        </div>

        {(local.lastError || (local.trace && local.trace.length > 0)) && local.state !== 'connected' && (
          <details className="rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] overflow-hidden">
            <summary className="p-2.5 cursor-pointer text-slate-500 dark:text-slate-400 hover:text-slate-200 flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5" />
              سجل الاتصال التشخيصي (انسخه عند طلب الدعم)
            </summary>
            <div className="px-3 pb-3 font-mono text-[10px] leading-relaxed text-slate-500 max-h-32 overflow-y-auto" dir="ltr">
              {(local.trace || []).map((t, i) => (
                <div key={i}>{t}</div>
              ))}
            </div>
          </details>
        )}
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>
  );
};

function QrDisplay({ onQr, statusPath }: { onQr: (qr: string | null) => void; statusPath: string }) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchQr = async () => {
      try {
        const s = await get<{ state: string; qr: string | null }>(statusPath);
        if (!cancelled) {
          setQr(s.qr || null);
          onQr(s.qr || null);
        }
      } catch {
        /* ignore */
      }
    };
    fetchQr(); // immediate — no 2s of spinner when a QR is already waiting
    const timer = setInterval(fetchQr, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [onQr, statusPath]);

  if (!qr) {
    return (
      <div className="w-52 h-52 mx-auto rounded-2xl bg-white p-3 shadow-xl flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-slate-900">
          <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
          <span className="text-xs font-bold">جارٍ توليد الرمز...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-52 h-52 mx-auto rounded-2xl bg-white p-3 shadow-xl flex items-center justify-center">
      <img src={qr} alt="WhatsApp QR Code" className="w-full h-full object-contain" />
    </div>
  );
}
