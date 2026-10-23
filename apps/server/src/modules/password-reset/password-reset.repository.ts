import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '../../db';
import { account, passkey, passwordResets, session, twoFactor, user } from '../auth/auth.schema';

export type PasswordResetRow = typeof passwordResets.$inferSelect;

/** An account a reset can be emailed to. */
export type ResetAccount = {
  id: string;
  email: string;
  username: string;
  locale: string;
  disabled: boolean;
  /** Only a verified address gets reset links (see the invites service). */
  emailVerified: boolean;
};

export type PasswordResetRepository = {
  /**
   * Stores a new link. An admin link replaces every pending link of the user; an emailed one
   * only the previous emailed ones (asking by email must not cancel the link an admin gave).
   */
  create(reset: typeof passwordResets.$inferInsert): Promise<void>;
  /** The account with this email or username (case-insensitive). */
  findAccount(identifier: string): Promise<ResetAccount | undefined>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetRow | undefined>;
  /**
   * In one transaction: consumes the link (row locked), sets the new password and signs the user
   * out everywhere. An admin link also turns 2FA off and removes the passkeys (plan §5.1 bis: the
   * way back in after losing the second factor); an emailed one keeps them. False if the link is
   * unknown, used or expired.
   */
  consume(tokenHash: string, passwordHash: string, now: Date): Promise<boolean>;
};

export function createPasswordResetRepository(db: Database): PasswordResetRepository {
  return {
    async create(reset) {
      await db.transaction(async (tx) => {
        await tx
          .update(passwordResets)
          .set({ usedAt: sql`now()` })
          .where(
            and(
              eq(passwordResets.userId, reset.userId),
              isNull(passwordResets.usedAt),
              reset.kind === 'email' ? eq(passwordResets.kind, 'email') : undefined,
            ),
          );
        await tx.insert(passwordResets).values(reset);
      });
    },

    async findAccount(identifier) {
      const value = identifier.trim().toLowerCase();
      const [row] = await db
        .select({
          id: user.id,
          email: user.email,
          username: user.username,
          locale: user.locale,
          disabledAt: user.disabledAt,
          emailVerified: user.emailVerified,
        })
        .from(user)
        .where(or(sql`lower(${user.email}) = ${value}`, eq(user.username, value)))
        .limit(1);
      return row
        ? {
            id: row.id,
            email: row.email,
            username: row.username ?? '',
            locale: row.locale,
            disabled: row.disabledAt !== null,
            emailVerified: row.emailVerified,
          }
        : undefined;
    },

    async findByTokenHash(tokenHash) {
      const [row] = await db
        .select()
        .from(passwordResets)
        .where(eq(passwordResets.tokenHash, tokenHash));
      return row;
    },

    consume(tokenHash, passwordHash, now) {
      return db.transaction(async (tx) => {
        const [reset] = await tx
          .select()
          .from(passwordResets)
          .where(eq(passwordResets.tokenHash, tokenHash))
          .for('update');
        if (!reset || reset.usedAt || reset.expiresAt <= now) return false;

        const updated = await tx
          .update(account)
          .set({ password: passwordHash })
          .where(and(eq(account.userId, reset.userId), eq(account.providerId, 'credential')))
          .returning({ id: account.id });
        if (updated.length === 0) {
          await tx.insert(account).values({
            id: crypto.randomUUID(),
            accountId: reset.userId,
            providerId: 'credential',
            userId: reset.userId,
            password: passwordHash,
          });
        }
        if (reset.kind === 'admin') {
          await tx.delete(twoFactor).where(eq(twoFactor.userId, reset.userId));
          await tx.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, reset.userId));
          await tx.delete(passkey).where(eq(passkey.userId, reset.userId));
        }
        await tx.delete(session).where(eq(session.userId, reset.userId));
        // This link and any other pending one of the user.
        await tx
          .update(passwordResets)
          .set({ usedAt: now })
          .where(and(eq(passwordResets.userId, reset.userId), isNull(passwordResets.usedAt)));
        return true;
      });
    },
  };
}
