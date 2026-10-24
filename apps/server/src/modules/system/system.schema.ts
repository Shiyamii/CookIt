import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Starting data inserted once (units catalog, tag categories): a seed listed here never runs
 * again, even if the admin deleted what it created.
 */
export const seeds = pgTable('seeds', {
  name: text('name').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});

/** The instance's settings, changed by an admin: one row (`id` 1), the defaults until saved. */
export const instanceSettings = pgTable(
  'instance_settings',
  {
    id: integer('id').primaryKey().default(1),
    // Public recipes and the gallery without an account (off: members only).
    publicGallery: boolean('public_gallery').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('instance_settings_single_row', sql`${table.id} = 1`)],
);
