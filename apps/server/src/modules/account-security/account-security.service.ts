import type { AccountSecurity } from '@cookit/shared';
import type { AccountSecurityRepository } from './account-security.repository';

export type PasskeyRemoval = 'ok' | 'not_found' | 'last_sign_in_method';

/**
 * What the security settings page shows (2FA status, passkeys), and the rule that an account
 * always keeps a way to sign in (plan §5.1 bis). Enabling 2FA or adding a passkey goes through
 * Better Auth directly.
 */
export function createAccountSecurityService(deps: {
  repository: AccountSecurityRepository;
  verifyPassword: (input: { hash: string; password: string }) => Promise<boolean>;
  now?: () => Date;
}) {
  const { repository, verifyPassword } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    async get(userId: string): Promise<AccountSecurity> {
      const [twoFactorEnabled, passkeys] = await Promise.all([
        repository.twoFactorEnabled(userId),
        repository.listPasskeys(userId),
      ]);
      return {
        twoFactorEnabled,
        passkeys: passkeys.map((row) => ({
          id: row.id,
          name: row.name,
          createdAt: row.createdAt?.toISOString() ?? null,
          backedUp: row.backedUp,
        })),
      };
    },

    /** A passkey may go unless it is the account's only way to sign in (no password). */
    async canRemovePasskey(userId: string, passkeyId: string): Promise<PasskeyRemoval> {
      const passkeys = await repository.listPasskeys(userId);
      if (!passkeys.some((row) => row.id === passkeyId)) return 'not_found';
      if (passkeys.length > 1 || (await repository.passwordHash(userId))) return 'ok';
      return 'last_sign_in_method';
    },

    /**
     * Re-entering the password before adding or deleting a passkey: a passkey bypasses the 2FA
     * step and survives "sign out everywhere", so a stolen session must not be enough.
     */
    async confirmPassword(userId: string, password: string): Promise<boolean> {
      const hash = await repository.passwordHash(userId);
      return hash !== undefined && verifyPassword({ hash, password });
    },

    /** Hourly: expired Better Auth challenges are never read again. */
    purgeExpired(): Promise<void> {
      return repository.deleteExpiredVerifications(now());
    },
  };
}

export type AccountSecurityService = ReturnType<typeof createAccountSecurityService>;
