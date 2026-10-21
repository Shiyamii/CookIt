import { RECIPE_VISIBILITIES } from '@cookit/shared';
import { sql, type SQL } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { user } from '../auth/auth.schema';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

/**
 * A recipe: what does not depend on the language. Part 1's title and description live in the
 * translations; servings and source here (plan §3). No cover image yet (later phase).
 */
export const recipes = pgTable(
  'recipes',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    baseLang: text('base_lang').notNull(),
    servings: integer('servings').notNull(),
    visibility: text('visibility', { enum: RECIPE_VISIBILITIES }).notNull().default('private'),
    // Plain text: the owner can copy the share link again at any time. Only works while unlisted.
    shareToken: text('share_token').unique(),
    sourceUrl: text('source_url'),
    // "Add to my library": the recipe this one was copied from (kept if the original goes).
    copiedFromId: text('copied_from_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('recipes_owner_slug_unique').on(table.ownerId, table.slug),
    index('recipes_owner_idx').on(table.ownerId, table.updatedAt),
    index('recipes_public_idx')
      .on(table.updatedAt)
      .where(sql`${table.visibility} = 'public'`),
    check(
      'recipes_visibility_check',
      sql`${table.visibility} in ('private', 'unlisted', 'public')`,
    ),
    check('recipes_base_lang_check', sql`${table.baseLang} in ('fr', 'en')`),
    check('recipes_servings_check', sql`${table.servings} between 1 and 1000`),
  ],
);

/** Search configuration of a translation's language (stemming: `pâtes` finds `pâte`). */
const searchConfig = (lang: SQL) =>
  sql`(case ${lang} when 'fr' then 'french'::regconfig else 'english'::regconfig end)`;

/**
 * The language-dependent part of a recipe. `bodyMarkdown` holds parts 2 and 3 (ingredients and
 * steps, canonical form); `searchText` is title + description + ingredients without accents
 * (computed by the service), indexed by the generated `search` column.
 */
export const recipeTranslations = pgTable(
  'recipe_translations',
  {
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    lang: text('lang').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    extraMeta: jsonb('extra_meta').$type<Record<string, string>>().notNull().default({}),
    bodyMarkdown: text('body_markdown').notNull().default(''),
    searchText: text('search_text').notNull().default(''),
    search: tsvector('search').generatedAlwaysAs(
      (): SQL => sql`to_tsvector(${searchConfig(sql`lang`)}, search_text)`,
    ),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.recipeId, table.lang] }),
    index('recipe_translations_search_idx').using('gin', table.search),
    check('recipe_translations_lang_check', sql`${table.lang} in ('fr', 'en')`),
  ],
);
