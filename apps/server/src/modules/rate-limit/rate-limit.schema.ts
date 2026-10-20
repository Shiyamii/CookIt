import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Fixed-window counters (`key` = rule + client IP or account), shared by all requests. */
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
});
