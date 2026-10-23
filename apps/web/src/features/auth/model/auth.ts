import type { Locale, PasswordResetInput, RegisterInput } from '@cookit/shared';
import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  WebAuthnAbortService,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import { ApiError, apiGet, apiPost } from '@/lib/api';

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: 'admin' | 'user';
  locale: Locale;
  /** URL of the profile picture. */
  image: string | null;
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

export type SignInResult = 'signed_in' | 'two_factor';

/**
 * Sign-in with a username or an email (the field accepts both). With 2FA on, the password only
 * opens a short-lived challenge (`two_factor` cookie): a code is still needed.
 */
export async function signIn(identifier: string, password: string): Promise<SignInResult> {
  const value = identifier.trim();
  const result = value.includes('@')
    ? await apiPost<{ twoFactorRedirect?: boolean }>('/auth/sign-in/email', {
        email: value,
        password,
      })
    : await apiPost<{ twoFactorRedirect?: boolean }>('/auth/sign-in/username', {
        username: value,
        password,
      });
  return result.twoFactorRedirect ? 'two_factor' : 'signed_in';
}

/** Second sign-in step: a code from the authenticator app, or a single-use backup code. */
export async function verifySignInCode(kind: 'totp' | 'backup', code: string): Promise<void> {
  if (kind === 'totp') await apiPost('/auth/two-factor/verify-totp', { code: normalizeTotp(code) });
  else await apiPost('/auth/two-factor/verify-backup-code', { code: code.trim() });
}

/** Authenticator apps show `123 456`: only the digits count. */
export function normalizeTotp(code: string): string {
  return code.replace(/\s/g, '');
}

export function passkeysSupported(): boolean {
  return browserSupportsWebAuthn();
}

/** Passkeys suggested by the browser in the username field (conditional mediation). */
export function passkeyAutofillSupported(): Promise<boolean> {
  return browserSupportsWebAuthnAutofill();
}

/**
 * Sign-in with a passkey alone. With `autofill`, waits until the user picks a passkey suggested
 * in the username field; otherwise opens the browser's passkey dialog.
 */
export async function signInWithPasskey(autofill = false): Promise<void> {
  const options = await apiGet<PublicKeyCredentialRequestOptionsJSON>(
    '/auth/passkey/generate-authenticate-options',
  );
  const response = await startAuthentication({
    optionsJSON: options,
    useBrowserAutofill: autofill,
  }).catch((error: unknown) => {
    throw new ApiError(0, webAuthnErrorCode(error));
  });
  await apiPost('/auth/passkey/verify-authentication', { response });
}

/** Stops a pending passkey prompt (the autofill one, when leaving the login page). */
export function cancelPasskeyPrompt(): void {
  WebAuthnAbortService.cancelCeremony();
}

/** Browser WebAuthn failures, as error codes for `t('errors.<code>')`. */
export function webAuthnErrorCode(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  // `NotAllowedError`: dismissed, timed out or refused; `AbortError`: cancelled by the page.
  if (name === 'NotAllowedError' || name === 'AbortError') return 'passkey_cancelled';
  // `InvalidStateError` on registration: this authenticator already holds a passkey for us.
  if (name === 'InvalidStateError') return 'passkey_exists';
  return 'passkey_failed';
}

export async function signOut(): Promise<void> {
  await apiPost('/auth/sign-out');
}

export async function saveLocale(locale: Locale): Promise<void> {
  await apiPost('/auth/update-user', { locale });
}

export type InviteCheck = { role: 'admin' | 'user'; email?: string; locale?: Locale };

export function checkInvite(token: string): Promise<InviteCheck> {
  return apiPost<InviteCheck>('/invites/check', { token });
}

export async function register(input: RegisterInput): Promise<void> {
  await apiPost('/register', input);
}

/** The kind of a usable link: an `admin` one also turns 2FA off, an `email` one does not. */
export async function checkPasswordReset(token: string): Promise<'admin' | 'email'> {
  const { kind } = await apiPost<{ ok: true; kind: 'admin' | 'email' }>('/password-reset/check', {
    token,
  });
  return kind;
}

/** "Forgot your password?": the answer is the same whether the account exists or not. */
export async function requestPasswordReset(identifier: string, locale: Locale): Promise<void> {
  await apiPost('/password-reset/request', { identifier, locale });
}

export async function resetPassword(input: PasswordResetInput): Promise<void> {
  await apiPost('/password-reset', input);
}
