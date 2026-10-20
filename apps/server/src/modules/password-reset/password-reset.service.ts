import type { PasswordResetInput } from '@cookit/shared';
import { generateToken, hashToken } from '../../lib/tokens';
import type { PasswordResetRepository } from './password-reset.repository';

/** Reset links are handed over by an admin (no email): valid for 3 days. */
const RESET_LINK_MS = 3 * 24 * 3600 * 1000;

export type PasswordResetService = ReturnType<typeof createPasswordResetService>;

export function createPasswordResetService(deps: {
  repository: PasswordResetRepository;
  origin: string;
  hashPassword: (password: string) => Promise<string>;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());

  return {
    /** A one-time link to choose a new password; `createdBy` is null for the rescue CLI. */
    async createLink(userId: string, createdBy: string | null): Promise<{ url: string }> {
      const token = generateToken();
      await deps.repository.create({
        id: crypto.randomUUID(),
        tokenHash: hashToken(token),
        userId,
        createdBy,
        expiresAt: new Date(now().getTime() + RESET_LINK_MS),
      });
      return { url: `${deps.origin}/reset-password#token=${token}` };
    },

    async isValid(token: string): Promise<boolean> {
      const reset = await deps.repository.findByTokenHash(hashToken(token));
      return reset !== undefined && !reset.usedAt && reset.expiresAt > now();
    },

    async reset(input: PasswordResetInput): Promise<boolean> {
      // Hashing first keeps the transaction short; a bad token only wastes one hash.
      const passwordHash = await deps.hashPassword(input.password);
      return deps.repository.consume(hashToken(input.token), passwordHash, now());
    },
  };
}
