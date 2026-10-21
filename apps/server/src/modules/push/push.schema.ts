import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '../auth/auth.schema';

/**
 * Web Push subscriptions (plan §3, §5.4): one per browser, which may change hands (another account
 * signing in on the same browser takes it over). Deleted when the push service answers 404/410.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('push_subscriptions_user_idx').on(table.userId)],
);
