/**
 * API client. The access token lives in memory only (never localStorage); the
 * refresh token is an httpOnly cookie. On 401 the client refreshes once and retries.
 */
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;

export const setAccessToken = (t: string | null) => {
  accessToken = t;
};
export const getAccessToken = () => accessToken;
export const setSessionLostHandler = (fn: () => void) => {
  onSessionLost = fn;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'x-requested-with': 'fetch' } })
      .then(async (r) => {
        if (!r.ok) {
          accessToken = null;
          return false;
        }
        const j = await r.json();
        accessToken = j.accessToken;
        return true;
      })
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  tenant?: string | null;
  form?: FormData;
  raw?: boolean;
  signal?: AbortSignal;
}

export async function request<T = unknown>(path: string, opts: RequestOptions = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = { 'x-requested-with': 'fetch' };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (opts.tenant) headers['x-tenant'] = opts.tenant;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
    headers,
    credentials: 'include',
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    signal: opts.signal,
  });
  if (res.status === 401 && retry && !path.startsWith('/auth/login') && !path.startsWith('/auth/refresh')) {
    if (await refreshSession()) return request<T>(path, opts, false);
    onSessionLost?.();
  }
  if (opts.raw) {
    if (!res.ok) throw new ApiError(res.status, 'Download failed');
    return res as unknown as T;
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, data.message ?? `Request failed (${res.status})`, data.details);
  return data as T;
}

export const api = {
  get: <T = any>(path: string, tenant?: string | null) => request<T>(path, { tenant }),
  post: <T = any>(path: string, body?: unknown, tenant?: string | null) => request<T>(path, { method: 'POST', body: body ?? {}, tenant }),
  put: <T = any>(path: string, body?: unknown, tenant?: string | null) => request<T>(path, { method: 'PUT', body: body ?? {}, tenant }),
  patch: <T = any>(path: string, body?: unknown, tenant?: string | null) => request<T>(path, { method: 'PATCH', body: body ?? {}, tenant }),
  del: <T = any>(path: string, tenant?: string | null) => request<T>(path, { method: 'DELETE', tenant }),
  upload: <T = any>(path: string, form: FormData, tenant?: string | null) => request<T>(path, { method: 'POST', form, tenant }),
};

/** Authenticated file download (CSV exports, calendar files) */
export async function download(path: string, filename: string, tenant?: string | null) {
  const res = await request<Response>(path, { tenant, raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong');
