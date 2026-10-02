import { readJSON, writeJSON } from '../../store';
import { enqueueJobs, getContacts, type SendJob } from '../../engine';
import { getLicense } from '../../license';

export type TriggerType = 'manual' | 'schedule' | 'new_conversation' | 'campaign_completed';
export type StepKind = 'send_message' | 'add_tag' | 'update_stage' | 'assign' | 'notify' | 'wait';

export interface Trigger {
  type: TriggerType;
  /** schedule: every N minutes */
  everyMinutes?: number;
}

export interface Step {
  kind: StepKind;
  text?: string;
  tag?: string;
  stage?: string;
  assignee?: string;
  minutes?: number;
  /** send_message audience: trigger phones or contacts having tag */
  audience?: 'trigger' | 'tag';
}

export interface Workflow {
  id: string;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  steps: Step[];
  createdAt: string;
}

export interface RunEntry {
  id: string;
  workflowId: string;
  at: string;
  status: 'ok' | 'error' | 'running';
  detail: string;
}

const WF_KEY = 'automations';
const RUN_KEY = 'automation-runs';
const STATE_KEY = 'automation-state';
const RUN_CAP = 200;

export function getWorkflows(): Workflow[] {
  return readJSON<Workflow[]>(WF_KEY, []);
}

export function saveWorkflow(w: Workflow): Workflow {
  const list = getWorkflows();
  const i = list.findIndex((x) => x.id === w.id);
  if (i >= 0) list[i] = w;
  else list.unshift(w);
  void writeJSON(WF_KEY, list);
  return w;
}

export function deleteWorkflow(id: string) {
  void writeJSON(WF_KEY, getWorkflows().filter((w) => w.id !== id));
}

export function getRuns(workflowId?: string, limit = 50): RunEntry[] {
  const list = readJSON<RunEntry[]>(RUN_KEY, []);
  const f = workflowId ? list.filter((r) => r.workflowId === workflowId) : list;
  return f.slice(0, Math.max(1, Math.min(200, limit)));
}

function logRun(workflowId: string, status: RunEntry['status'], detail: string) {
  const list = readJSON<RunEntry[]>(RUN_KEY, []);
  list.unshift({ id: `run-${Date.now()}`, workflowId, at: new Date().toISOString(), status, detail: detail.slice(0, 300) });
  void writeJSON(RUN_KEY, list.slice(0, RUN_CAP));
}

function state(): Record<string, any> {
  return readJSON<Record<string, any>>(STATE_KEY, {});
}
function saveState(s: Record<string, any>) {
  void writeJSON(STATE_KEY, s);
}

async function auditSafe(action: string, detail: string) {
  try {
    // @ts-ignore - optional module (foundation branch)
    const { audit } = await import('../audit/service');
    audit(action, { module: 'automation', detail });
  } catch {
    /* audit module optional (foundation branch) */
  }
}

async function notifySafe(title: string, body?: string) {
  try {
    // @ts-ignore - optional module (foundation branch)
    const { notify } = await import('../notifications/service');
    notify('automation', title, body);
  } catch {
    /* notifications module optional */
  }
}

function licenseOk(): boolean {
  try {
    return !!getLicense()?.ok;
  } catch {
    return true;
  }
}

async function execStep(w: Workflow, step: Step, phones: string[]): Promise<string> {
  switch (step.kind) {
    case 'wait': {
      const ms = Math.max(0, Math.min(120, Number(step.minutes) || 0)) * 60_000;
      if (ms > 0) await new Promise((r) => setTimeout(r, ms));
      return `waited ${step.minutes || 0}m`;
    }
    case 'send_message': {
      const text = String(step.text || '').trim();
      if (!text) return 'skipped: empty text';
      if (!licenseOk()) return 'skipped: license blocked';
      let targets = phones;
      if (step.audience === 'tag' && step.tag) {
        targets = getContacts()
          .filter((c) => (c.tags || []).includes(step.tag as string) && c.status === 'active')
          .map((c) => String(c.phone).replace(/[^0-9]/g, ''))
          .filter(Boolean);
      }
      targets = [...new Set(targets)].filter((p) => p.length >= 9 && p.length <= 15);
      if (!targets.length) return 'skipped: no recipients';
      const jobs: SendJob[] = targets.map((p) => ({
        id: `job-auto-${Date.now()}-${p}-${Math.floor(Math.random() * 99999)}`,
        phone: p,
        text,
        fast: false,
        createdAt: Date.now(),
      }));
      enqueueJobs(jobs);
      return `queued ${jobs.length}`;
    }
    case 'add_tag': {
      const tag = String(step.tag || '').trim();
      if (!tag || !phones.length) return 'skipped';
      const list = getContacts();
      let n = 0;
      for (const c of list) {
        if (phones.includes(String(c.phone).replace(/[^0-9]/g, '')) && !(c.tags || []).includes(tag)) {
          c.tags = [...(c.tags || []), tag];
          n++;
        }
      }
      if (n) void writeJSON('contacts', list);
      return `tagged ${n}`;
    }
    case 'update_stage':
    case 'assign': {
      try {
        // @ts-ignore - optional module (crm branch)
        const crm = await import('../crm/service');
        let n = 0;
        for (const p of phones) {
          if (step.kind === 'update_stage' && step.stage) {
            if (crm.moveStage(p, step.stage)) n++;
          } else if (step.kind === 'assign') {
            crm.upsertCustomer({ phone: p, assignedTo: String(step.assignee || '') });
            n++;
          }
        }
        return `${step.kind} ${n}`;
      } catch {
        return 'skipped: crm module missing';
      }
    }
    case 'notify': {
      await notifySafe(`أتمتة ${w.name}`, step.text || 'تنبيه workflow');
      return 'notified';
    }
    default:
      return 'skipped: unknown step';
  }
}

export async function runWorkflow(id: string, phones: string[] = [], source = 'manual'): Promise<RunEntry> {
  const w = getWorkflows().find((x) => x.id === id);
  if (!w) throw new Error('workflow غير موجود.');
  logRun(id, 'running', `started by ${source}`);
  const parts: string[] = [];
  try {
    for (const step of w.steps || []) {
      parts.push(`${step.kind}: ${await execStep(w, step, phones)}`);
    }
    logRun(id, 'ok', parts.join(' | ') || 'no steps');
    void auditSafe('automation.run', `${w.name}: ${parts.join(' | ')}`);
  } catch (err: any) {
    logRun(id, 'error', err?.message || 'failed');
  }
  return getRuns(id, 1)[0];
}

/** background tick (every minute): schedule + event triggers */
export async function automationTick() {
  const st = state();
  let dirty = false;
  for (const w of getWorkflows()) {
    if (!w.enabled) continue;
    try {
      if (w.trigger.type === 'schedule') {
        const every = Math.max(5, Number(w.trigger.everyMinutes) || 60) * 60_000;
        const last = Number(st[`sched:${w.id}`] || 0);
        if (Date.now() - last >= every) {
          st[`sched:${w.id}`] = Date.now();
          dirty = true;
          void runWorkflow(w.id, [], 'schedule');
        }
      } else if (w.trigger.type === 'new_conversation') {
        const convs = readJSON<Array<{ id: string; contactPhone: string }>>('conversations', []);
        const seen: string[] = st[`conv:${w.id}`] || [];
        const fresh = convs.filter((c) => !seen.includes(c.id));
        if (fresh.length) {
          st[`conv:${w.id}`] = convs.map((c) => c.id).slice(0, 500);
          dirty = true;
          const phones = [...new Set(fresh.map((c) => String(c.contactPhone).replace(/[^0-9]/g, '')))];
          void runWorkflow(w.id, phones, 'new_conversation');
        }
      } else if (w.trigger.type === 'campaign_completed') {
        const camps = readJSON<Array<{ id: string; status: string; completedAt?: string }>>('campaigns', []);
        const seen: string[] = st[`camp:${w.id}`] || [];
        const done = camps.filter((c) => c.status === 'completed' && !seen.includes(c.id));
        if (done.length) {
          st[`camp:${w.id}`] = camps.filter((c) => c.status === 'completed').map((c) => c.id);
          dirty = true;
          void runWorkflow(w.id, [], 'campaign_completed');
        }
      }
    } catch (err: any) {
      console.error(`[automation] tick ${w.id}:`, err?.message);
    }
  }
  if (dirty) saveState(st);
}
