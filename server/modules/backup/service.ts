import fs from 'fs';
import path from 'path';
import { DATA_DIR, filePath, readJSON } from '../../store';

// Additive backup: versioned JSON bundles of every store key.
// Restore always snapshots current state first (rollback), never deletes.

export interface BackupMeta {
  id: string;
  at: string;
  keys: number;
  bytes: number;
  auto: boolean;
}

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KEEP_AUTO = 7;

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function bundlePath(id: string) {
  return path.join(BACKUP_DIR, `${id}.json`);
}

// all known store keys (core + additive modules; missing files skipped)
const KNOWN_KEYS = [
  'accounts', 'ai', 'antiblock', 'api-keys', 'bot-config', 'bot-rules',
  'campaigns', 'contact-groups', 'contacts', 'conversations', 'license-key',
  'meta', 'meta-conversations', 'meta-replied', 'reports', 'sendlog', 'stats', 'templates',
  'audit_log', 'notifications', 'crm-customers', 'tasks',
  'automations', 'automation-runs', 'automation-state', 'leads', 'inbox-meta', 'team-users',
];

export function createBackup(auto = false): BackupMeta {
  ensureDir();
  const id = `bk-${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36)}${auto ? '-auto' : ''}`;
  const data: Record<string, unknown> = {};
  for (const k of KNOWN_KEYS) {
    const f = filePath(k);
    if (!fs.existsSync(f)) continue;
    try {
      data[k] = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch {
      /* skip corrupt */
    }
  }
  const payload = JSON.stringify({ v: 1, id, at: new Date().toISOString(), data });
  fs.writeFileSync(bundlePath(id), payload, 'utf8');
  if (auto) pruneAuto();
  return { id, at: new Date().toISOString(), keys: Object.keys(data).length, bytes: payload.length, auto };
}

function pruneAuto() {
  const autos = listBackups()
    .filter((b) => b.auto)
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  for (const old of autos.slice(KEEP_AUTO)) {
    try {
      fs.unlinkSync(bundlePath(old.id));
    } catch {
      /* ignore */
    }
  }
}

export function listBackups(): BackupMeta[] {
  ensureDir();
  const out: BackupMeta[] = [];
  for (const f of fs.readdirSync(BACKUP_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, f), 'utf8'));
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      out.push({
        id: f.replace(/\.json$/, ''),
        at: raw.at || st.mtime.toISOString(),
        keys: Object.keys(raw.data || {}).length,
        bytes: st.size,
        auto: f.includes('-auto'),
      });
    } catch {
      /* skip */
    }
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function deleteBackup(id: string) {
  const p = bundlePath(String(id).replace(/[^a-zA-Z0-9-]/g, ''));
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function readBackup(id: string): { id: string; at: string; data: Record<string, unknown> } {
  const p = bundlePath(String(id).replace(/[^a-zA-Z0-9-]/g, ''));
  if (!fs.existsSync(p)) throw new Error('النسخة غير موجودة.');
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!raw || typeof raw.data !== 'object') throw new Error('نسخة تالفة.');
  return { id, at: raw.at, data: raw.data };
}

/** restore with automatic pre-restore snapshot (rollback point) */
export function restoreBackup(id: string): { restored: number; rollbackId: string } {
  const { data } = readBackup(id);
  const rollback = createBackup(false);
  let n = 0;
  for (const [k, v] of Object.entries(data)) {
    if (!KNOWN_KEYS.includes(k)) continue;
    try {
      fs.writeFileSync(filePath(k), JSON.stringify(v, null, 2), 'utf8');
      n++;
    } catch {
      /* skip */
    }
  }
  // refresh in-memory caches that some modules hold at import time
  void readJSON('campaigns', []);
  return { restored: n, rollbackId: rollback.id };
}

/** daily auto-backup tick (call from a 24h interval) */
export function autoBackupTick() {
  try {
    createBackup(true);
  } catch (err: any) {
    console.error('[backup] auto failed:', err?.message);
  }
}
