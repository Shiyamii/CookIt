import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '../../db';
import { uniqueViolation } from '../../db/errors';
import { account, user, type UserRole } from '../auth/auth.schema';
import { invites } from './invites.schema';

export type InviteRow = typeof invites.$inferSelect;
export type InviteWithUser = InviteRow & { usedByUsername: string | null };

export type NewAccount = {
  id: string;
  name: string;
  email: string;
  username: string;
  displayUsername: string;
  locale: string;
  passwordHash: string;
  /** The address is the one the invite was emailed to: receiving the link proved it. */
  emailVerified: boolean;
};

export type AcceptResult =
  | { ok: true; userId: string; role: UserRole }
  | { ok: false; error: 'invalid_token' | 'username_taken' | 'email_taken' };

export type InvitesRepository = {
  create(invite: typeof invites.$inferInsert): Promise<void>;
  list(): Promise<InviteWithUser[]>;
  findByTokenHash(tokenHash: string): Promise<InviteRow | undefined>;
  /** Revokes a pending invite; false if it does not exist or is no longer pending. */
  revoke(id: string, now: Date): Promise<boolean>;
  /** Revokes the unused first-admin setup links (a new one is created at each start). */
  revokePendingSetupLinks(now: Date): Promise<void>;
  /** Whether an account already uses this email (lowercase). */
  emailTaken(email: string): Promise<boolean>;
  /** Whether an enabled admin exists (if every admin got disabled, a setup link is the way back). */
  adminExists(): Promise<boolean>;
  /**
   * Consumes the invite and creates the account in one transaction: the invite row is locked, so
   * two requests with the same link cannot both succeed.
   */
  accept(tokenHash: string, newAccount: NewAccount, now: Date): Promise<AcceptResult>;
};

export function createInvitesRepository(db: Database): InvitesRepository {
  const usedBy = alias(user, 'used_by_user');

  return {
    async create(invite) {
      await db.insert(invites).values(invite);
    },

    async list() {
      const rows = await db
        .select({ invite: invites, usedByUsername: usedBy.displayUsername })
        .from(invites)
        .leftJoin(usedBy, eq(usedBy.id, invites.usedBy))
        .orderBy(desc(invites.createdAt))
        .limit(500);
      return rows.map((row) => ({ ...row.invite, usedByUsername: row.usedByUsername }));
    },

    async emailTaken(email) {
      const [row] = await db
        .select({ id: user.id })
        .from(user)
        .where(sql`lower(${user.email}) = ${email}`)
        .limit(1);
      return row !== undefined;
    },

    async findByTokenHash(tokenHash) {
      const [row] = await db.select().from(invites).where(eq(invites.tokenHash, tokenHash));
      return row;
    },

    async revoke(id, now) {
      const rows = await db
        .update(invites)
        .set({ revokedAt: now })
        .where(and(eq(invites.id, id), isNull(invites.usedAt), isNull(invites.revokedAt)))
        .returning({ id: invites.id });
      return rows.length > 0;
    },

    async revokePendingSetupLinks(now) {
      await db
        .update(invites)
        .set({ revokedAt: now })
        .where(
          and(
            eq(invites.role, 'admin'),
            isNull(invites.createdBy),
            isNull(invites.usedAt),
            isNull(invites.revokedAt),
          ),
        );
    },

    async adminExists() {
      const [row] = await db
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.role, 'admin'), isNull(user.disabledAt)))
        .limit(1);
      return row !== undefined;
    },

    async accept(tokenHash, newAccount, now) {
      try {
        return await acceptInTransaction(tokenHash, newAccount, now);
      } catch (error) {
        // Two sign-ups racing for the same username or email: the unique index decides.
        const constraint = uniqueViolation(error);
        if (constraint === 'user_username_unique') return { ok: false, error: 'username_taken' };
        if (constraint === 'user_email_unique') return { ok: false, error: 'email_taken' };
        throw error;
      }
    },
  };

  function acceptInTransaction(
    tokenHash: string,
    newAccount: NewAccount,
    now: Date,
  ): Promise<AcceptResult> {
    return db.transaction(async (tx): Promise<AcceptResult> => {
      const [invite] = await tx
        .select()
        .from(invites)
        .where(eq(invites.tokenHash, tokenHash))
        .for('update');
      const usable = invite && !invite.usedAt && !invite.revokedAt && invite.expiresAt > now;
      if (!usable) return { ok: false, error: 'invalid_token' };

      // A setup link only works while there is no enabled admin.
      if (invite.role === 'admin' && invite.createdBy === null) {
        const [admin] = await tx
          .select({ id: user.id })
          .from(user)
          .where(and(eq(user.role, 'admin'), isNull(user.disabledAt)))
          .limit(1);
        if (admin) return { ok: false, error: 'invalid_token' };
      }

      const [taken] = await tx
        .select({ username: user.username, email: user.email })
        .from(user)
        .where(
          sql`${user.username} = ${newAccount.username} or lower(${user.email}) = ${newAccount.email}`,
        )
        .limit(1);
      if (taken) {
        return {
          ok: false,
          error: taken.username === newAccount.username ? 'username_taken' : 'email_taken',
        };
      }

      await tx.insert(user).values({
        id: newAccount.id,
        name: newAccount.name,
        email: newAccount.email,
        username: newAccount.username,
        displayUsername: newAccount.displayUsername,
        locale: newAccount.locale,
        emailVerified: newAccount.emailVerified,
        role: invite.role,
      });
      // Same shape as Better Auth's email/password accounts.
      await tx.insert(account).values({
        id: crypto.randomUUID(),
        accountId: newAccount.id,
        providerId: 'credential',
        userId: newAccount.id,
        password: newAccount.passwordHash,
      });
      await tx
        .update(invites)
        .set({ usedBy: newAccount.id, usedAt: now })
        .where(eq(invites.id, invite.id));
      return { ok: true, userId: newAccount.id, role: invite.role };
    });
  }
}

/** The violated unique constraint of a Postgres error (code 23505), if that is what it is. */
