import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { filePath } from './store';
import fs from 'fs';

if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

export interface LicenseState {
  ok: boolean;
  status: 'active' | 'suspended' | 'expired' | 'unlicensed' | 'offline';
  planName?: string;
  maxAccounts: number;
  dailyMessages: number;
  expiresAt?: string | null;
  checkedAt: number;
}

const GRACE_MS = 48 * 3600_000;
let state: LicenseState = { ok: false, status: 'unlicensed', maxAccounts: 0, dailyMessages: 0, checkedAt: 0 };

function cacheFile() {
  return filePath('license-cache');
}
function loadCache(): LicenseState | null {
  try {
    const f = cacheFile();
    if (!fs.existsSync(f)) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
}
function saveCache(s: LicenseState) {
  try {
    fs.writeFileSync(cacheFile(), JSON.stringify(s), 'utf8');
  } catch {
    /* ignore */
  }
}

async function remoteCheck(fn: 'validate_license' | 'license_heartbeat', key: string) {
  const url = process.env.SUPABASE_URL || '';
  const anon = process.env.SUPABASE_ANON_KEY || '';
  if (!url || !anon) return null;
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await (c.rpc as any)(fn, { p_key: key });
  if (error) {
    console.error(`[license] ${fn}:`, error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

function applyRow(row: any): LicenseState {
  let status = (row?.status || 'expired') as LicenseState['status'];
  if (status === 'active' && row?.expires_at && new Date(row.expires_at).getTime() < Date.now()) status = 'expired';
  const s: LicenseState = {
    ok: status === 'active',
    status,
    planName: row?.plan_name,
    maxAccounts: Number(row?.max_accounts) || 0,
    dailyMessages: Number(row?.daily_messages) || 0,
    expiresAt: row?.expires_at || null,
    checkedAt: Date.now(),
  };
  state = s;
  saveCache(s);
  return s;
}

export async function checkLicense(): Promise<LicenseState> {
  let key = (process.env.LICENSE_KEY || '').trim();
  if (!key) {
    try {
      const f = filePath('license-key');
      if (fs.existsSync(f)) key = fs.readFileSync(f, 'utf8').trim();
    } catch {
      /* ignore */
    }
    if (key) process.env.LICENSE_KEY = key;
  }
  if (!key) {
    state = { ok: false, status: 'unlicensed', maxAccounts: 0, dailyMessages: 0, checkedAt: Date.now() };
    return state;
  }
  const row = await remoteCheck('validate_license', key);
  if (row) return applyRow(row);
  const cached = loadCache();
  if (cached && cached.ok && Date.now() - cached.checkedAt < GRACE_MS) {
    state = { ...cached, status: 'offline' as const, ok: true };
    console.log('[license] offline mode, cached license accepted.');
    return state;
  }
  state = { ok: false, status: 'expired', maxAccounts: 0, dailyMessages: 0, checkedAt: Date.now() };
  return state;
}

export function licenseHeartbeat() {
  const key = (process.env.LICENSE_KEY || '').trim();
  if (!key) return;
  setInterval(async () => {
    const row = await remoteCheck('license_heartbeat', key);
    if (row) applyRow(row);
  }, 15 * 60_000);
}

export function getLicense(): LicenseState {
  return state;
}

/** activate from UI: persist key locally (mirrored to Supabase kv) then re-validate */
export async function activateLicense(key: string): Promise<LicenseState> {
  const clean = String(key || '').trim();
  if (!clean) throw new Error('مفتاح الترخيص مطلوب.');
  process.env.LICENSE_KEY = clean;
  try {
    fs.writeFileSync(filePath('license-key'), clean, 'utf8');
    const { kvSet } = await import('./supabase');
    await kvSet('license-key', clean);
  } catch {
    /* local file enough */
  }
  return checkLicense();
}
export function requireLicensed(): { ok: boolean; error?: string } {
  if (state.ok) return { ok: true };
  const msg =
    state.status === 'unlicensed'
      ? 'النسخة غير مفعّلة. أدخل مفتاح الترخيص.'
      : state.status === 'suspended'
        ? 'الترخيص موقوف. تواصل مع مزود الخدمة.'
        : 'الترخيص منتهي. جدد اشتراكك للمتابعة.';
  return { ok: false, error: msg };
}
