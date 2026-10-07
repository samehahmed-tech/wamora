import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

// packaged app runs on Electron Node 20 (no native WebSocket); Supabase realtime needs one
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

const URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const isSupabaseEnabled = Boolean(URL && SERVICE_KEY);

let client: SupabaseClient | null = null;
if (isSupabaseEnabled) {
  client = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
} else {
  console.warn('[supabase] disabled: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

export function supa(): SupabaseClient | null {
  return client;
}

export const KV_KEYS = [
  'accounts', 'ai', 'antiblock', 'api-keys', 'bot-config', 'bot-rules',
  'campaigns', 'contact-groups', 'contacts', 'conversations', 'license-key', 'meta',
  'meta-conversations', 'team-users',
  'reports', 'sendlog', 'stats', 'templates',
] as const;

// ponytail: single kv table mirrors current JSON store, split to relational tables if queries need filtering
export async function kvGetAll(): Promise<Record<string, unknown>> {
  if (!client) return {};
  const { data, error } = await client.from('kv_store').select('key, value');
  if (error) {
    console.error('[supabase] kvGetAll:', error.message);
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const row of data || []) out[(row as any).key] = (row as any).value;
  return out;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  if (!client) return;
  const { error } = await client.from('kv_store').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) console.error(`[supabase] kvSet ${key}:`, error.message);
}
