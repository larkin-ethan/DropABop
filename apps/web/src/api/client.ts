// Calls our API with the signed-in user's access token (spec §9: in the Authorization header, never the URL).
// On 401 it refreshes the token once and retries; if that still fails, it signs the person out.

import type { ApiErrorBody, ErrorCode } from '@dropabop/shared';
import type { AuthService } from '../auth/auth-service';

/** A failed API call, carrying the API's friendly message (safe to show to people as-is). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK';

  constructor(status: number, code: ErrorCode | 'NETWORK', message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

interface ClientOptions {
  baseUrl: string;
  auth: AuthService;
  /** Called after the session can't be recovered (e.g. sends the user to the sign-in screen). */
  onSignedOut: () => void;
  fetchImpl?: typeof fetch;
}

const GENERIC = 'Something went wrong. Please try again.';
export const RATE_LIMITED_MESSAGE = 'Lots of requests right now. Please wait a few seconds and try again.';

export function createApiClient({ baseUrl, auth, onSignedOut, fetchImpl = fetch }: ClientOptions): ApiClient {
  async function send(method: string, path: string, body: unknown, forceRefresh: boolean): Promise<Response> {
    const token = await auth.getAccessToken({ forceRefresh });
    const headers: Record<string, string> = { accept: 'application/json' };
    if (token !== null) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    try {
      return await fetchImpl(`${baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'NETWORK', 'We couldn’t reach the server. Check your connection and try again.');
    }
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response = await send(method, path, body, false);
    if (response.status === 401) {
      response = await send(method, path, body, true); // the token may just have expired
      if (response.status === 401) {
        await auth.signOut().catch(() => undefined);
        onSignedOut();
        throw new ApiError(401, 'UNAUTHENTICATED', 'Please sign in again.');
      }
    }
    if (response.status === 204) {
      return undefined as T;
    }
    const data: unknown = await response.json().catch(() => null);
    if (response.status === 429) {
      // API Gateway's own throttle (P9.1) answers before our code runs, without our error format.
      throw new ApiError(429, 'RATE_LIMITED', RATE_LIMITED_MESSAGE);
    }
    if (!response.ok) {
      const error = (data as Partial<ApiErrorBody> | null)?.error;
      throw new ApiError(response.status, error?.code ?? 'INTERNAL', error?.message ?? GENERIC);
    }
    return data as T;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
  };
}
