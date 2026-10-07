import crypto from 'crypto';
import { readJSON, writeJSON } from '../../store';

export type Role = 'super_admin' | 'admin' | 'manager' | 'sales' | 'marketing' | 'support';

/** tab → roles allowed. Tabs absent from this map are public. */
export const PERMISSIONS: Record<string, Role[]> = {
  dashboard: ['super_admin', 'admin', 'manager', 'sales', 'marketing', 'support'],
  fast_sender: ['super_admin', 'admin', 'manager', 'marketing'],
  campaigns: ['super_admin', 'admin', 'manager', 'marketing'],
  inbox: ['super_admin', 'admin', 'manager', 'sales', 'support'],
  meta: ['super_admin', 'admin', 'manager', 'sales', 'support'],
  unified: ['super_admin', 'admin', 'manager', 'sales', 'support'],
  lead_finder: ['super_admin', 'admin', 'manager', 'marketing', 'sales'],
  crm: ['super_admin', 'admin', 'manager', 'sales'],
  automation: ['super_admin', 'admin', 'manager'],
  contacts: ['super_admin', 'admin', 'manager', 'marketing', 'sales'],
  groups: ['super_admin', 'admin', 'manager', 'marketing'],
  templates: ['super_admin', 'admin', 'manager', 'marketing'],
  accounts: ['super_admin', 'admin'],
  bot_manager: ['super_admin', 'admin', 'manager'],
  anti_block: ['super_admin', 'admin'],
  api_docs: ['super_admin', 'admin'],
  billing: ['super_admin', 'admin'],
};

export interface TeamUser {
  id: string;
  name: string;
  role: Role;
  pinHash: string;
  salt: string;
  active: boolean;
  createdAt: string;
}

const KEY = 'team-users';
const ROLES: Role[] = ['super_admin', 'admin', 'manager', 'sales', 'marketing', 'support'];

function hashPin(pin: string, salt: string): string {
  return crypto.scryptSync(pin, salt, 32).toString('hex');
}

export function getUsers(): Array<Omit<TeamUser, 'pinHash' | 'salt'>> {
  return readJSON<TeamUser[]>(KEY, []).map(({ pinHash, salt, ...pub }) => pub);
}

function all(): TeamUser[] {
  return readJSON<TeamUser[]>(KEY, []);
}

export function teamEnabled(): boolean {
  return all().length > 0;
}

export function createUser(name: string, role: string, pin: string): Omit<TeamUser, 'pinHash' | 'salt'> {
  const clean = String(name || '').trim();
  if (!clean) throw new Error('اسم المستخدم مطلوب.');
  if (!(ROLES as string[]).includes(role)) throw new Error('دور غير صالح.');
  if (!/^\d{4,8}$/.test(String(pin || ''))) throw new Error('PIN من 4-8 أرقام.');
  const list = all();
  if (list.length >= 20) throw new Error('الحد الأقصى 20 مستخدم.');
  if (list.length === 0 && role !== 'super_admin') throw new Error('أول مستخدم يجب أن يكون super_admin.');
  const salt = crypto.randomBytes(16).toString('hex');
  const u: TeamUser = {
    id: `u-${Date.now().toString(36)}`,
    name: clean,
    role: role as Role,
    pinHash: hashPin(String(pin), salt),
    salt,
    active: true,
    createdAt: new Date().toISOString(),
  };
  list.push(u);
  void writeJSON(KEY, list);
  const { pinHash, salt: _s, ...pub } = u;
  return pub;
}

export function setUserActive(id: string, active: boolean) {
  const list = all();
  const u = list.find((x) => x.id === id);
  if (!u) throw new Error('المستخدم غير موجود.');
  const supers = list.filter((x) => x.role === 'super_admin' && x.active);
  if (u.role === 'super_admin' && !active && supers.length <= 1) throw new Error('لا يمكن تعطيل آخر super_admin.');
  u.active = active;
  void writeJSON(KEY, list);
}

export function deleteUser(id: string) {
  const list = all();
  const u = list.find((x) => x.id === id);
  if (!u) throw new Error('المستخدم غير موجود.');
  const supers = list.filter((x) => x.role === 'super_admin' && x.active);
  if (u.role === 'super_admin' && supers.length <= 1) throw new Error('لا يمكن حذف آخر super_admin.');
  void writeJSON(KEY, list.filter((x) => x.id !== id));
}

export function verifyPin(name: string, pin: string): Omit<TeamUser, 'pinHash' | 'salt'> | null {
  const u = all().find((x) => x.name === String(name || '').trim() && x.active);
  if (!u) return null;
  if (hashPin(String(pin || ''), u.salt) !== u.pinHash) return null;
  const { pinHash, salt, ...pub } = u;
  return pub;
}

export function can(role: Role, tab: string): boolean {
  const allowed = PERMISSIONS[tab];
  if (!allowed) return true;
  return allowed.includes(role);
}

const ALL_TABS = [
  'dashboard', 'fast_sender', 'campaigns', 'inbox', 'meta', 'unified', 'lead_finder',
  'crm', 'automation', 'contacts', 'groups', 'templates', 'accounts',
  'bot_manager', 'anti_block', 'api_docs', 'billing',
];

export function allowedTabs(token: string): string[] {
  if (!teamEnabled()) return ALL_TABS;
  const s = getSession(token);
  if (!s) return [];
  return ALL_TABS.filter((t) => can(s.role, t));
}

// ---- sessions (memory only, single-machine) ----
const sessions = new Map<string, { userId: string; role: Role; name: string; at: number }>();

export function createSession(userId: string): string {
  const u = all().find((x) => x.id === userId && x.active);
  if (!u) throw new Error('جلسة غير صالحة.');
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { userId: u.id, role: u.role, name: u.name, at: Date.now() });
  return token;
}

export function getSession(token: string): { userId: string; role: Role; name: string } | null {
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.at > 12 * 3600_000) {
    sessions.delete(token);
    return null;
  }
  return s;
}

export function destroySession(token: string) {
  sessions.delete(token);
}
