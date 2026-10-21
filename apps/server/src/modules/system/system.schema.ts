import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Starting data inserted once (units catalog, tag categories): a seed listed here never runs
 * again, even if the admin deleted what it created.
 */
export const seeds = pgTable('seeds', {
  name: text('name').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});
