import type { LocalizedLabels, UnitRounding } from '@cookit/shared';
import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

/**
 * Units (plan §3): data, not code. `aliases` are every way of writing the unit, per language;
 * a normalized alias is unique across the catalog (checked by the service).
 */
export const units = pgTable(
  'units',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    rounding: text('rounding').$type<UnitRounding>().notNull(),
    position: integer('position').notNull(),
    labels: jsonb('labels').$type<LocalizedLabels>().notNull(),
    aliases: jsonb('aliases').$type<Partial<Record<string, string[]>>>().notNull(),
  },
  (table) => [check('units_rounding_check', sql`${table.rounding} in ('decimal', 'fraction')`)],
);
