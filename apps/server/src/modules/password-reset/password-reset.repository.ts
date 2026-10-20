import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db';
import { account, passwordResets, session } from '../auth/auth.schema';

export type PasswordResetRow = typeof passwordResets.$inferSelect;

export type PasswordResetRepository = {
  create(reset: typeof passwordResets.$inferInsert): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetRow | undefined>;
  /**
   * In one transaction: consumes the link (row locked), sets the new password and signs the user
   * out everywhere. False if the link is unknown, used or expired.
   */
  consume(tokenHash: string, passwordHash: string, now: Date): Promise<boolean>;
};

export function createPasswordResetRepository(db: Database): PasswordResetRepository {
  return {
    // Only the newest link of a user works: creating one invalidates the previous ones.
    async create(reset) {
      await db.transaction(async (tx) => {
        await tx
          .update(passwordResets)
          .set({ usedAt: sql`now()` })
          .where(and(eq(passwordResets.userId, reset.userId), isNull(passwordResets.usedAt)));
        await tx.insert(passwordResets).values(reset);
      });
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
