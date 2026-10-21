import type { LocalizedLabels } from '@cookit/shared';
import { boolean, index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

/** Tag categories (plan §3): labels are `{ lang: label }`, no translation tables. */
export const tagCategories = pgTable('tag_categories', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  position: integer('position').notNull(),
  multiple: boolean('multiple').notNull().default(false),
  labels: jsonb('labels').$type<LocalizedLabels>().notNull(),
});

/** Tags: slugs are unique across categories (exchanges reference a tag by its slug alone). */
export const tags = pgTable(
  'tags',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id')
      .notNull()
      .references(() => tagCategories.id, { onDelete: 'restrict' }),
    slug: text('slug').notNull().unique(),
    position: integer('position').notNull(),
    labels: jsonb('labels').$type<LocalizedLabels>().notNull(),
  },
  (table) => [index('tags_category_idx').on(table.categoryId, table.position)],
);
