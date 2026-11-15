/**
 * Typed API client for the Sentinel backend.
 *
 * Auth model:
 *  - Session cookie is forwarded automatically (same-origin fetch).
 *  - For mutating requests the backend requires the CSRF token header. The
 *    CSRF token is stored in a non-HttpOnly cookie (`sentinel_csrf`) by the
 *    auth login flow; we read it here and attach it to POST/PUT/PATCH/DELETE.
 */

const CSRF_COOKIE = 'sentinel_csrf';
export const TOKEN_KEY = 'sentinel_token';

export function getToken(): string {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore storage failures (private mode)
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

function csrfToken(): string {
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : '';
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export interface ApiConfig {
  baseUrl: string;
  onUnauthorized?: () => void;
}

export async function request<T>(path: string, config: ApiConfig, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const body = init?.body;
  const headers: Record<string, string> = {
    // DELETE with no body must not send Content-Type: application/json —
    // Fastify rejects a JSON content type with an empty body (400).
    ...(isMutating && body ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (isMutating) headers['x-csrf-token'] = csrfToken();

  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    method,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let body: { error?: string; code?: string } = {};
    try {
      body = (await res.json()) as { error?: string; code?: string };
    } catch {
      // non-JSON error body
    }
    if (res.status === 401 && config.onUnauthorized) config.onUnauthorized();
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body.code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function createApi(config: ApiConfig) {
  return {
    get: <T>(path: string) => request<T>(path, config),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, config, { method: 'POST', body: JSON.stringify(body ?? {}) }),
    put: <T>(path: string, body?: unknown) =>
      request<T>(path, config, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
    patch: <T>(path: string, body?: unknown) =>
      request<T>(path, config, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
    delete: <T>(path: string) => request<T>(path, config, { method: 'DELETE' }),
  };
}

export type Api = ReturnType<typeof createApi>;

/**
 * Build a WS URL for live activity.
 *
 * Prefers the configured API base (VITE_API_URL) so a dashboard hosted on a
 * different origin than the API — e.g. GitHub Pages + Render — connects to the
 * API's WebSocket endpoint. Falls back to the current origin for local dev.
 */
export function wsUrl(baseUrl: string, guildId?: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = baseUrl
    ? new URL(baseUrl).host
    : window.location.host;
  const token = getToken();
  const params = new URLSearchParams();
  if (guildId) params.set('guild', guildId);
  if (token) params.set('token', token);
  const qs = params.toString();
  return `${proto}://${host}/ws${qs ? `?${qs}` : ''}`;
}