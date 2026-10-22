import type { ShoppingState } from '@cookit/shared';
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '../auth/auth.schema';

/**
 * Shopping lists (phase 9e): one per user, the whole state as JSONB, saved at every change,
 * `version` incremented by each save (last change wins).
 */
export const shoppingLists = pgTable('shopping_lists', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  state: jsonb('state').$type<ShoppingState>().notNull(),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
