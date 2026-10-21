import { and, asc, eq, lt } from 'drizzle-orm';
import type { Database } from '../../db';
import { account, passkey, user, verification } from '../auth/auth.schema';

export type PasskeyRow = Pick<
  typeof passkey.$inferSelect,
  'id' | 'name' | 'createdAt' | 'backedUp'
>;

export type AccountSecurityRepository = {
  twoFactorEnabled(userId: string): Promise<boolean>;
  listPasskeys(userId: string): Promise<PasskeyRow[]>;
  /** The argon2 hash of the user's password, if any. */
  passwordHash(userId: string): Promise<string | undefined>;
  /** Better Auth challenges (2FA sign-in, passkey ceremonies) that expired. */
  deleteExpiredVerifications(now: Date): Promise<void>;
};

export function createAccountSecurityRepository(db: Database): AccountSecurityRepository {
  return {
    async twoFactorEnabled(userId) {
      const [row] = await db
        .select({ enabled: user.twoFactorEnabled })
        .from(user)
        .where(eq(user.id, userId));
      return row?.enabled ?? false;
    },

    listPasskeys(userId) {
      return db
        .select({
          id: passkey.id,
          name: passkey.name,
          createdAt: passkey.createdAt,
          backedUp: passkey.backedUp,
        })
        .from(passkey)
        .where(eq(passkey.userId, userId))
        .orderBy(asc(passkey.createdAt));
    },

    async passwordHash(userId) {
      const [row] = await db
        .select({ password: account.password })
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')));
      return row?.password ?? undefined;
    },

    async deleteExpiredVerifications(now) {
      await db.delete(verification).where(lt(verification.expiresAt, now));
    },
  };
}
