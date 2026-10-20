import type { Locale, PasswordResetInput, RegisterInput } from '@cookit/shared';
import { apiGet, apiPost } from '@/lib/api';

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: 'admin' | 'user';
  locale: Locale;
};

export const SESSION_QUERY_KEY = ['session'] as const;

/**
 * The token of an invite, setup or reset link. It is in the URL fragment (`#token=…`), which
 * browsers never send to the server, so it stays out of proxy access logs.
 */
export function linkToken(hash: string): string {
  return new URLSearchParams(hash.replace(/^#/, '')).get('token') ?? '';
}

export async function fetchCurrentUser(): Promise<CurrentUser | null> {
  return (await apiGet<{ user: CurrentUser | null }>('/me')).user;
}

/** Sign-in with a username or an email (the field accepts both). */
export async function signIn(identifier: string, password: string): Promise<void> {
  const value = identifier.trim();
  if (value.includes('@')) await apiPost('/auth/sign-in/email', { email: value, password });
  else await apiPost('/auth/sign-in/username', { username: value, password });
}

export async function signOut(): Promise<void> {
  await apiPost('/auth/sign-out');
}

export async function saveLocale(locale: Locale): Promise<void> {
  await apiPost('/auth/update-user', { locale });
}

export type InviteCheck = { role: 'admin' | 'user'; email?: string };

export function checkInvite(token: string): Promise<InviteCheck> {
  return apiPost<InviteCheck>('/invites/check', { token });
}

export async function register(input: RegisterInput): Promise<void> {
  await apiPost('/register', input);
}

/** Resolves to true for a usable link (a query must not resolve to `undefined`). */
export async function checkPasswordReset(token: string): Promise<true> {
  await apiPost('/password-reset/check', { token });
  return true;
}

export async function resetPassword(input: PasswordResetInput): Promise<void> {
  await apiPost('/password-reset', input);
}
