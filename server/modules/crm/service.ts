import { readJSON, writeJSON } from '../../store';

export const PIPELINE = ['lead', 'contacted', 'interested', 'negotiation', 'customer', 'closed'] as const;
export type Stage = (typeof PIPELINE)[number];

export interface Customer {
  phone: string;
  name: string;
  email: string;
  company: string;
  source: string;
  tags: string[];
  notes: string;
  stage: Stage;
  assignedTo: string;
  updatedAt: string;
}

const KEY = 'crm-customers';

function cleanPhone(p: string): string {
  return String(p || '').replace(/[^0-9]/g, '');
}

export function getCustomers(): Customer[] {
  return readJSON<Customer[]>(KEY, []);
}

function save(list: Customer[]) {
  void writeJSON(KEY, list);
}

export function upsertCustomer(patch: Partial<Customer> & { phone: string }): Customer {
  const phone = cleanPhone(patch.phone);
  if (!phone) throw new Error('رقم الهاتف مطلوب.');
  const list = getCustomers();
  const i = list.findIndex((c) => c.phone === phone);
  const base: Customer = list[i] || {
    phone,
    name: '',
    email: '',
    company: '',
    source: 'manual',
    tags: [],
    notes: '',
    stage: 'lead',
    assignedTo: '',
    updatedAt: new Date().toISOString(),
  };
  const next: Customer = {
    ...base,
    ...patch,
    phone,
    tags: Array.isArray(patch.tags) ? patch.tags : base.tags,
    stage: patch.stage && (PIPELINE as readonly string[]).includes(patch.stage) ? patch.stage : base.stage,
    updatedAt: new Date().toISOString(),
  };
  if (i >= 0) list[i] = next;
  else list.unshift(next);
  save(list);
  return next;
}

export function moveStage(phone: string, stage: string): Customer | null {
  const p = cleanPhone(phone);
  if (!(PIPELINE as readonly string[]).includes(stage)) throw new Error('مرحلة غير صالحة.');
  const list = getCustomers();
  const c = list.find((x) => x.phone === p);
  if (!c) return null;
  c.stage = stage as Stage;
  c.updatedAt = new Date().toISOString();
  save(list);
  return c;
}

export function deleteCustomer(phone: string) {
  save(getCustomers().filter((c) => c.phone !== cleanPhone(phone)));
}

/** merge contacts + conversations context into a customer card (read-only join) */
export function customerCard(phone: string): (Customer & { inContacts: boolean; conversations: number }) | null {
  const p = cleanPhone(phone);
  const c = getCustomers().find((x) => x.phone === p);
  if (!c) return null;
  const contacts = readJSON<Array<{ phone: string }>>('contacts', []);
  const convs = readJSON<Array<{ contactPhone: string }>>('conversations', []);
  return {
    ...c,
    inContacts: contacts.some((x) => String(x.phone).replace(/[^0-9]/g, '') === p),
    conversations: convs.filter((x) => String(x.contactPhone).replace(/[^0-9]/g, '') === p).length,
  };
}
