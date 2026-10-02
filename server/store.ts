import fs from 'fs';
import path from 'path';
import { APP_DIR } from './paths';
import { isSupabaseEnabled, kvGetAll, kvSet, supa } from './supabase';

const __dirname = APP_DIR;
export const DATA_DIR = process.env.WA_DATA_DIR || path.resolve(__dirname, '..', 'server-data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const writeQueue = new Map<string, Promise<void>>();

export function filePath(name: string) {
  return path.join(DATA_DIR, `${name}.json`);
}

export function readJSON<T>(name: string, fallback: T): T {
  try {
    const file = filePath(name);
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[store] failed reading ${name}:`, (err as Error).message);
    return fallback;
  }
}

export function writeJSON(name: string, value: unknown): Promise<void> {
  const prev = writeQueue.get(name) || Promise.resolve();
  const next = prev
    .then(() => {
      const target = filePath(name);
      const tmp = `${target}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
      fs.renameSync(tmp, target);
    })
    .then(() => {
      if (isSupabaseEnabled) return kvSet(name, value as any);
    })
    .catch((err) => {
      console.error(`[store] failed writing ${name}:`, (err as Error).message);
    });
  writeQueue.set(name, next);
  return next;
}

export function updateJSON<T>(name: string, fallback: T, mutate: (current: T) => T): T {
  const current = readJSON<T>(name, fallback);
  const next = mutate(current);
  writeJSON(name, next);
  return next;
}

/** pull Supabase -> local files on boot (Supabase wins if key exists) */
export async function syncFromSupabase(): Promise<void> {
  if (!isSupabaseEnabled || !supa()) return;
  try {
    const remote = await kvGetAll();
    const keys = Object.keys(remote);
    if (!keys.length) {
      console.log('[supabase] remote empty, keeping local files (run push to upload).');
      return;
    }
    for (const [k, v] of Object.entries(remote)) {
      fs.writeFileSync(filePath(k), JSON.stringify(v, null, 2), 'utf8');
    }
    console.log(`[supabase] pulled ${keys.length} keys to local cache.`);
  } catch (err) {
    console.error('[supabase] pull failed:', (err as Error).message);
  }
}

/** push local server-data/*.json -> Supabase (one-time migration) */
export async function pushToSupabase(): Promise<void> {
  if (!isSupabaseEnabled) throw new Error('Supabase not configured.');
  const { KV_KEYS } = await import('./supabase');
  let n = 0;
  for (const k of KV_KEYS) {
    const file = filePath(k);
    if (!fs.existsSync(file)) continue;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      if (!raw.trim()) continue;
      await kvSet(k, JSON.parse(raw));
      n++;
    } catch (err) {
      console.error(`[supabase] push ${k} failed:`, (err as Error).message);
    }
  }
  console.log(`[supabase] pushed ${n} keys.`);
}
