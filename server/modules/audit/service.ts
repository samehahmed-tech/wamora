import { readJSON, writeJSON } from '../../store';

export type AuditAction =
  | 'campaign.created' | 'campaign.started' | 'campaign.completed' | 'campaign.deleted'
  | 'message.sent' | 'license.activated' | 'license.blocked'
  | 'meta.connected' | 'meta.disconnected'
  | 'contact.imported' | 'settings.updated';

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: AuditAction | string;
  module: string;
  entity?: string;
  result: 'ok' | 'error';
  detail?: string;
}

const CAP = 1000;

export function audit(action: string, opts: Partial<Omit<AuditEntry, 'id' | 'at' | 'action'>> = {}) {
  try {
    const list = readJSON<AuditEntry[]>('audit_log', []);
    list.unshift({
      id: `a-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      at: new Date().toISOString(),
      actor: opts.actor || 'system',
      action,
      module: opts.module || action.split('.')[0],
      entity: opts.entity,
      result: opts.result || 'ok',
      detail: opts.detail?.slice(0, 500),
    });
    void writeJSON('audit_log', list.slice(0, CAP));
  } catch {
    /* audit never breaks the app */
  }
}

export function getAudit(limit = 100, module?: string): AuditEntry[] {
  const list = readJSON<AuditEntry[]>('audit_log', []);
  const filtered = module ? list.filter((e) => e.module === module) : list;
  return filtered.slice(0, Math.max(1, Math.min(500, limit)));
}
