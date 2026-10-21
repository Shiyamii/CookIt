import type { CookSessionResponse, CookState } from '@cookit/shared';
import { apiDelete, apiGet, apiPut } from '@/lib/api';
import { clockOffset } from './clock';

/** Every answer gives the server time: the clock offset is measured on each call. */
async function timed<T extends { serverNow: string }>(
  call: () => Promise<T>,
): Promise<T & { offset: number }> {
  const sentAt = Date.now();
  const result = await call();
  return { ...result, offset: clockOffset(sentAt, Date.now(), result.serverNow) };
}

export function fetchSession() {
  return timed(() => apiGet<CookSessionResponse>('/cook/session'));
}

/** Saves the whole state (an event happened); the server gives the next version. */
export function saveSession(state: CookState) {
  return timed(() => apiPut<{ version: number; serverNow: string }>('/cook/session', { state }));
}

export function endSession() {
  return timed(() => apiDelete<{ ok: true; serverNow: string }>('/cook/session'));
}
