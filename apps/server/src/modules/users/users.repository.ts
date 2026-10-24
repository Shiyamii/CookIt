import { and, asc, count, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Database } from '../../db';
import { session, user } from '../auth/auth.schema';

export type UserRow = typeof user.$inferSelect;

/** `last_admin`: the change would leave no enabled admin, so nothing was changed. */
export type GuardedChange = 'done' | 'last_admin';

export type UsersRepository = {
  list(): Promise<UserRow[]>;
  findById(id: string): Promise<UserRow | undefined>;
  findByUsername(username: string): Promise<UserRow | undefined>;
  /**
   * Disables the account and deletes its sessions (signed out everywhere), unless it is the last
   * enabled admin. Atomic: two admins disabling each other cannot both succeed.
   */
  disable(id: string, now: Date): Promise<GuardedChange>;
  enable(id: string): Promise<void>;
  setListed(id: string, listed: boolean): Promise<void>;
  /**
   * Deletes the account unless it is the last enabled admin. Sessions, accounts and reset links
   * go with it (foreign keys `on delete cascade`).
   */
  delete(id: string): Promise<GuardedChange>;
};

// Serializes the changes that could remove the last enabled admin (any constant key works).
const ADMIN_CHANGES_LOCK = 4_242_001;

export function createUsersRepository(db: Database): UsersRepository {
  type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

  /** In a transaction holding the lock: would removing `id` leave no enabled admin? */
  async function isLastEnabledAdmin(tx: Tx, id: string): Promise<boolean> {
    await tx.execute(sql`select pg_advisory_xact_lock(${ADMIN_CHANGES_LOCK})`);
    const [target] = await tx
      .select({ role: user.role, disabledAt: user.disabledAt })
      .from(user)
      .where(eq(user.id, id));
    if (!target || target.role !== 'admin' || target.disabledAt) return false;
    const [others] = await tx
      .select({ value: count() })
      .from(user)
      .where(and(eq(user.role, 'admin'), isNull(user.disabledAt), ne(user.id, id)));
    return (others?.value ?? 0) === 0;
  }

  return {
    list() {
      return db.select().from(user).orderBy(asc(user.createdAt)).limit(1000);
    },

    async findById(id) {
      const [row] = await db.select().from(user).where(eq(user.id, id));
      return row;
    },

    async findByUsername(username) {
      const [row] = await db.select().from(user).where(eq(user.username, username.toLowerCase()));
      return row;
    },

    disable(id, now) {
      return db.transaction(async (tx): Promise<GuardedChange> => {
        if (await isLastEnabledAdmin(tx, id)) return 'last_admin';
        // Keeps the original date if the account was already disabled.
        await tx
          .update(user)
          .set({ disabledAt: now })
          .where(and(eq(user.id, id), isNull(user.disabledAt)));
        await tx.delete(session).where(eq(session.userId, id));
        return 'done';
      });
    },

    async enable(id) {
      await db.update(user).set({ disabledAt: null }).where(eq(user.id, id));
    },

    async setListed(id, listed) {
      await db.update(user).set({ listed }).where(eq(user.id, id));
    },

    delete(id) {
      return db.transaction(async (tx): Promise<GuardedChange> => {
        if (await isLastEnabledAdmin(tx, id)) return 'last_admin';
        await tx.delete(user).where(eq(user.id, id));
        return 'done';
      });
    },
  };
}
