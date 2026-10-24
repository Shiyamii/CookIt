/** An API failure: HTTP status and the `error` code (ours) or `code` (Better Auth) of the body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    /** The rest of the error body (e.g. `diagnostics` of an invalid recipe). */
    readonly details?: Record<string, unknown>,
  ) {
    super(`API error ${status}: ${code}`);
  }
}

/**
 * Sends an API request: to the server, or, in the demo build, to the API running in the page
 * (`src/demo/`, left out of the normal build).
 */
async function send(url: string, init: RequestInit): Promise<Response> {
  if (import.meta.env.VITE_DEMO === '1') {
    const { demoFetch } = await import('@/demo/server');
    return demoFetch(url, init);
  }
  return fetch(url, init);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // A form (file upload) sets its own multipart content type.
  const form = body instanceof FormData;
  const res = await send(`/api/v1${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && !form && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const { error, code } = (data ?? {}) as { error?: unknown; code?: unknown };
    const errorCode = typeof error === 'string' ? error : typeof code === 'string' ? code : '';
    throw new ApiError(
      res.status,
      errorCode || `http_${res.status}`,
      (data ?? undefined) as Record<string, unknown> | undefined,
    );
  }
  return data as T;
}

export const apiGet = <T>(path: string) => request<T>('GET', path);
export const apiPost = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);
export const apiPut = <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body);
export const apiDelete = <T>(path: string, body?: unknown) => request<T>('DELETE', path, body);
/** Reads a file answer (e.g. a zip). */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await send(`/api/v1${path}`, { method: 'GET', credentials: 'same-origin' });
  if (!res.ok) throw new ApiError(res.status, `http_${res.status}`);
  return res.blob();
}
/** Sends files (multipart form). */
export const apiUpload = <T>(method: 'POST' | 'PUT', path: string, form: FormData) =>
  request<T>(method, path, form);

/** The error code of a failed call, for `t('errors.<code>')`; `unknown` for anything else. */
export function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : 'unknown';
}
