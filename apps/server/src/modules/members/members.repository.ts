import type { MemberProfile, MemberSummary } from '@cookit/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db';
import { user } from '../auth/auth.schema';
import { recipes } from '../recipes/recipes.schema';

export type MemberRow = MemberProfile & { id: string };

export type MembersRepository = {
  /** Enabled accounts that appear in the members list, by name. */
  listListed(): Promise<MemberSummary[]>;
  /** An enabled account from its username (any case), listed or not. */
  findByUsername(username: string): Promise<MemberRow | undefined>;
  isListed(userId: string): Promise<boolean>;
  setListed(userId: string, listed: boolean): Promise<void>;
};

const MAX_MEMBERS = 1000;

/** `table.column`, spelled out: Drizzle leaves the table out of a one-table query's fields. */
const qualified = (table: string, column: string) =>
  sql`${sql.identifier(table)}.${sql.identifier(column)}`;

const columns = {
  username: sql<string>`coalesce(${user.displayUsername}, ${user.username}, '')`,
  name: user.name,
  image: user.image,
  // Unqualified, `id` would be the recipe's own id inside the subquery.
  publicRecipes: sql<number>`(select count(*) from ${recipes} where ${qualified('recipes', 'owner_id')} = ${qualified('user', 'id')} and ${qualified('recipes', 'visibility')} = 'public')::int`,
};

export function createMembersRepository(db: Database): MembersRepository {
  return {
    listListed() {
      return db
        .select(columns)
        .from(user)
        .where(and(eq(user.listed, true), isNull(user.disabledAt)))
        .orderBy(asc(user.name), asc(user.id))
        .limit(MAX_MEMBERS);
    },

    async findByUsername(username) {
      const [row] = await db
        .select({ ...columns, id: user.id, listed: user.listed })
        .from(user)
        .where(and(eq(user.username, username.toLowerCase()), isNull(user.disabledAt)));
      return row;
    },

    async isListed(userId) {
      const [row] = await db.select({ listed: user.listed }).from(user).where(eq(user.id, userId));
      return row?.listed ?? false;
    },

    async setListed(userId, listed) {
      await db.update(user).set({ listed }).where(eq(user.id, userId));
    },
  };
}
