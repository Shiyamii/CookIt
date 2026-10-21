import type { AccountSecurity } from '@cookit/shared';
import {
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from '@simplewebauthn/browser';
import { ApiError, apiGet, apiPost } from '@/lib/api';
import { normalizeTotp, webAuthnErrorCode } from '@/features/auth/model/auth';

export const SECURITY_QUERY_KEY = ['me', 'security'] as const;

export function fetchSecurity(): Promise<AccountSecurity> {
  return apiGet<AccountSecurity>('/me/security');
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  // Other devices are signed out: a password change often follows a doubt about them.
  await apiPost('/auth/change-password', {
    currentPassword,
    newPassword,
    revokeOtherSessions: true,
  });
}

export type TwoFactorSetup = {
  /** `otpauth://` URI, shown as a QR code. */
  uri: string;
  /** The same secret for manual entry in the app. */
  secret: string;
  backupCodes: string[];
};

/** The secret of an `otpauth://totp/…?secret=…` URI, grouped by 4 for typing. */
export function totpSecret(uri: string): string {
  try {
    const secret = new URL(uri).searchParams.get('secret') ?? '';
    return secret.match(/.{1,4}/g)?.join(' ') ?? '';
  } catch {
    return '';
  }
}

/** Starts 2FA setup: nothing is enforced until a first code is confirmed. */
export async function startTwoFactor(password: string): Promise<TwoFactorSetup> {
  const result = await apiPost<{ totpURI: string; backupCodes: string[] }>(
    '/auth/two-factor/enable',
    { password },
  );
  return {
    uri: result.totpURI,
    secret: totpSecret(result.totpURI),
    backupCodes: result.backupCodes,
  };
}

/**
 * The first valid code turns 2FA on. Other devices are then signed out: 2FA is often turned on
 * after a doubt about the password, and an intruder's session must not outlive it.
 */
export async function confirmTwoFactor(code: string): Promise<void> {
  await apiPost('/auth/two-factor/verify-totp', { code: normalizeTotp(code) });
  await apiPost('/auth/revoke-other-sessions');
}

export async function disableTwoFactor(password: string): Promise<void> {
  await apiPost('/auth/two-factor/disable', { password });
}

/** New backup codes; the previous ones stop working. */
export async function regenerateBackupCodes(password: string): Promise<string[]> {
  return (
    await apiPost<{ backupCodes: string[] }>('/auth/two-factor/generate-backup-codes', {
      password,
    })
  ).backupCodes;
}

/**
 * Creates a passkey on this device (or a phone / security key chosen in the browser dialog). The
 * password is asked first: a passkey skips the 2FA step.
 */
export async function addPasskey(name: string, password: string): Promise<void> {
  const options = await apiPost<PublicKeyCredentialCreationOptionsJSON>(
    '/auth/passkey/generate-register-options',
    { password },
  );
  const response = await startRegistration({ optionsJSON: options }).catch((error: unknown) => {
    throw new ApiError(0, webAuthnErrorCode(error));
  });
  const label = name.trim();
  await apiPost('/auth/passkey/verify-registration', {
    response,
    ...(label && { name: label }),
  });
}

export async function renamePasskey(id: string, name: string): Promise<void> {
  await apiPost('/auth/passkey/update-passkey', { id, name: name.trim() });
}

export async function deletePasskey(id: string, password: string): Promise<void> {
  await apiPost('/auth/passkey/delete-passkey', { id, password });
}
