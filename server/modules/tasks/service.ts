import { readJSON, writeJSON } from '../../store';

export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskPriority = 'low' | 'normal' | 'high';

export interface Task {
  id: string;
  title: string;
  customerPhone: string;
  assignedTo: string;
  dueAt: string;
  priority: TaskPriority;
  status: TaskStatus;
  notes: string;
  createdAt: string;
}

const KEY = 'tasks';
const CAP = 1000;

export function getTasks(status?: string): Task[] {
  const list = readJSON<Task[]>(KEY, []);
  return status ? list.filter((t) => t.status === status) : list;
}

export function createTask(p: Partial<Task> & { title: string }): Task {
  if (!String(p.title || '').trim()) throw new Error('عنوان المهمة مطلوب.');
  const t: Task = {
    id: `task-${Date.now().toString(36)}${Math.floor(Math.random() * 999)}`,
    title: String(p.title).trim(),
    customerPhone: String(p.customerPhone || '').replace(/[^0-9]/g, ''),
    assignedTo: String(p.assignedTo || ''),
    dueAt: String(p.dueAt || ''),
    priority: p.priority === 'high' || p.priority === 'low' ? p.priority : 'normal',
    status: 'todo',
    notes: String(p.notes || ''),
    createdAt: new Date().toISOString(),
  };
  const list = getTasks();
  list.unshift(t);
  void writeJSON(KEY, list.slice(0, CAP));
  return t;
}

export function updateTask(id: string, patch: Partial<Task>): Task | null {
  const list = getTasks();
  const t = list.find((x) => x.id === id);
  if (!t) return null;
  if (patch.title !== undefined) t.title = String(patch.title);
  if (patch.status && ['todo', 'doing', 'done'].includes(patch.status)) t.status = patch.status as TaskStatus;
  if (patch.priority && ['low', 'normal', 'high'].includes(patch.priority)) t.priority = patch.priority as TaskPriority;
  if (patch.assignedTo !== undefined) t.assignedTo = String(patch.assignedTo);
  if (patch.dueAt !== undefined) t.dueAt = String(patch.dueAt);
  if (patch.notes !== undefined) t.notes = String(patch.notes);
  if (patch.customerPhone !== undefined) t.customerPhone = String(patch.customerPhone).replace(/[^0-9]/g, '');
  void writeJSON(KEY, list);
  return t;
}

export function deleteTask(id: string) {
  void writeJSON(KEY, getTasks().filter((t) => t.id !== id));
}

/** due within next N hours and not done (for notifications/automation later) */
export function dueSoon(hours = 24): Task[] {
  const now = Date.now();
  return getTasks().filter((t) => {
    if (t.status === 'done' || !t.dueAt) return false;
    const due = Date.parse(t.dueAt);
    return !Number.isNaN(due) && due - now < hours * 3600_000;
  });
}
