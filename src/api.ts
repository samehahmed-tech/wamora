export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data as T;
}

export const get = <T,>(path: string) => api<T>(path);
export const post = <T,>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const put = <T,>(path: string, body: unknown) =>
  api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const del = <T,>(path: string) => api<T>(path, { method: 'DELETE' });

export interface ServerEvent {
  type: 'wa-status' | 'conversations' | 'campaigns' | 'sendlog' | 'stats' | 'meta';
}

export function subscribeEvents(onEvent: (e: ServerEvent) => void): () => void {
  let src: EventSource | null = null;
  let closed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    try {
      src = new EventSource('/api/events');
    } catch {
      retryTimer = setTimeout(connect, 5000);
      return;
    }
    src.onmessage = (ev) => {
      try {
        onEvent(JSON.parse(ev.data) as ServerEvent);
      } catch {
        /* ignore */
      }
    };
    src.onerror = () => {
      try {
        src?.close();
      } catch {
        /* ignore */
      }
      src = null;
      if (!closed) retryTimer = setTimeout(connect, 5000);
    };
  };
  connect();

  return () => {
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    try {
      src?.close();
    } catch {
      /* ignore */
    }
  };
}
