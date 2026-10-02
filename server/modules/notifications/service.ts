import { readJSON, writeJSON } from '../../store';

export type NoticeKind =
  | 'campaign.completed' | 'campaign.failed'
  | 'new.conversation' | 'task.due'
  | 'account.disconnected' | 'license.warning'
  | 'system.update';

export interface Notice {
  id: string;
  at: string;
  kind: NoticeKind | string;
  title: string;
  body?: string;
  read: boolean;
}

const CAP = 300;

export function notify(kind: string, title: string, body?: string) {
  try {
    const list = readJSON<Notice[]>('notifications', []);
    list.unshift({
      id: `n-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
      at: new Date().toISOString(),
      kind,
      title,
      body: body?.slice(0, 500),
      read: false,
    });
    void writeJSON('notifications', list.slice(0, CAP));
  } catch {
    /* notifications never break the app */
  }
}

export function getNotifications(unreadOnly = false): Notice[] {
  const list = readJSON<Notice[]>('notifications', []);
  return unreadOnly ? list.filter((n) => !n.read) : list;
}

export function markNoticeRead(id: string) {
  const list = readJSON<Notice[]>('notifications', []);
  const n = list.find((x) => x.id === id);
  if (n) {
    n.read = true;
    void writeJSON('notifications', list);
  }
}

export function unreadCount(): number {
  return readJSON<Notice[]>('notifications', []).filter((n) => !n.read).length;
}
