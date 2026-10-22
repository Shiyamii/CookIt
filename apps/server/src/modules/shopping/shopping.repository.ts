import type { ShoppingState } from '@cookit/shared';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../db';
import { shoppingLists } from './shopping.schema';

export type ShoppingListRow = { version: number; updatedAt: Date; state: ShoppingState };

export type ShoppingRepository = {
  find(userId: string): Promise<ShoppingListRow | undefined>;
  /** Saves the user's list (created on the first save); returns the new version. */
  save(userId: string, state: ShoppingState, now: Date): Promise<number>;
};

export function createShoppingRepository(db: Database): ShoppingRepository {
  return {
    async find(userId) {
      const [row] = await db
        .select({
          version: shoppingLists.version,
          updatedAt: shoppingLists.updatedAt,
          state: shoppingLists.state,
        })
        .from(shoppingLists)
        .where(eq(shoppingLists.userId, userId));
      return row;
    },

    async save(userId, state, now) {
      const [row] = await db
        .insert(shoppingLists)
        .values({ userId, state, version: 1, updatedAt: now })
        .onConflictDoUpdate({
          target: shoppingLists.userId,
          set: { state, version: sql`${shoppingLists.version} + 1`, updatedAt: now },
        })
        .returning({ version: shoppingLists.version });
      return row?.version ?? 1;
    },
  };
}
