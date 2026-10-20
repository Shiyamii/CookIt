/** An API failure: HTTP status and the `error` code (ours) or `code` (Better Auth) of the body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`API error ${status}: ${code}`);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const { error, code } = (data ?? {}) as { error?: unknown; code?: unknown };
    const errorCode = typeof error === 'string' ? error : typeof code === 'string' ? code : '';
    throw new ApiError(res.status, errorCode || `http_${res.status}`);
  }
  return data as T;
}

export const apiGet = <T>(path: string) => request<T>('GET', path);
export const apiPost = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);
export const apiDelete = <T>(path: string) => request<T>('DELETE', path);

/** The error code of a failed call, for `t('errors.<code>')`; `unknown` for anything else. */
export function errorCode(error: unknown): string {
  return error instanceof ApiError ? error.code : 'unknown';
}
