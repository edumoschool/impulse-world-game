import type { ApiResponse } from '@impulse/contracts';

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

const BASE = '/api/v1';
const SAFE_METHODS = new Set(['GET', 'HEAD']);

/** Held in memory only. A reload recovers it from GET /auth/session. */
let csrfToken: string | undefined;

export function setCsrfToken(token: string | undefined): void {
  csrfToken = token;
}

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (!SAFE_METHODS.has(method) && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK', 0);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
  if (!payload) {
    throw new ApiError('UNKNOWN', response.status);
  }
  if (!payload.success) {
    throw new ApiError(payload.error.code, response.status);
  }
  return payload.data;
}

/** One refresh at a time. Parallel requests share it, so a rotated token is never replayed. */
let refreshing: Promise<boolean> | undefined;

function refreshSession(): Promise<boolean> {
  refreshing ??= send<{ csrfToken?: string }>('/auth/refresh', 'POST', { transport: 'cookie' })
    .then((result) => {
      setCsrfToken(result.csrfToken);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = undefined;
    });
  return refreshing;
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  try {
    return await send<T>(path, method, body);
  } catch (error) {
    const expired =
      error instanceof ApiError && error.status === 401 && error.code === 'UNAUTHENTICATED';
    if (expired && !path.startsWith('/auth/refresh') && (await refreshSession())) {
      return send<T>(path, method, body);
    }
    throw error;
  }
}
