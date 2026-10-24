import { RECIPE_VISIBILITIES } from '@cookit/shared';
import { sql, type SQL } from 'drizzle-orm';
import {
  boolean,
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
import { bytea } from '../../db/types';
import { user } from '../auth/auth.schema';
import { tags } from '../tags/tags.schema';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

/**
 * A recipe: what does not depend on the language. Part 1's title and description live in the
 * translations; servings and source here (plan §3). Photos are in `recipe_images`.
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
    // "Make a copy in my recipes": the recipe this one was copied from (kept if the original
    // goes) and its author (null once their account is gone).
    copiedFromId: text('copied_from_id'),
    copiedFromOwnerId: text('copied_from_owner_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    // No step yet: "to complete" in lists, cannot be cooked (derived from the body on save).
    hasSteps: boolean('has_steps').notNull().default(false),
    // The author's public note (plain text, not part of the markdown nor translated).
    authorNote: text('author_note').notNull().default(''),
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
    check('recipes_base_lang_check', sql`${table.baseLang} in ('fr', 'en', 'hu')`),
    check('recipes_servings_check', sql`${table.servings} between 1 and 1000`),
  ],
);

/** Search configuration of a translation's language (stemming: `pâtes` finds `pâte`, `tojást` finds `tojás`). */
const searchConfig = (lang: SQL) =>
  sql`(case ${lang} when 'fr' then 'french'::regconfig when 'hu' then 'hungarian'::regconfig else 'english'::regconfig end)`;

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
    // The `summary:` line (one line for the cards), '' without one.
    summary: text('summary').notNull().default(''),
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
    check('recipe_translations_lang_check', sql`${table.lang} in ('fr', 'en', 'hu')`),
  ],
);

/** Tags belong to the recipe, not to a translation (plan §3). */
export const recipeTags = pgTable(
  'recipe_tags',
  {
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.recipeId, table.tagId] }),
    index('recipe_tags_tag_idx').on(table.tagId),
  ],
);

/**
 * Photos of a recipe (phase 9c), the lowest `position` first: that one is the cover. The full
 * picture and its thumbnail are both resized by the browser; same type for both.
 */
export const recipeImages = pgTable(
  'recipe_images',
  {
    id: text('id').primaryKey(),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    contentType: text('content_type').notNull(),
    data: bytea('data').notNull(),
    thumb: bytea('thumb').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('recipe_images_recipe_idx').on(table.recipeId, table.position),
    check('recipe_images_type_check', sql`${table.contentType} in ('image/webp', 'image/jpeg')`),
  ],
);

/** A reader's private note on a recipe (only they see it). Deleted with the recipe or the user. */
export const recipeNotes = pgTable(
  'recipe_notes',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.recipeId] })],
);

/**
 * "Add to my recipes": a link to someone else's recipe, not a copy (the reader always sees the
 * author's current version). An unlisted recipe keeps the share token it was added with: the link
 * works while that token is the recipe's (a new share link or another visibility cuts it off).
 */
export const savedRecipes = pgTable(
  'saved_recipes',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    shareToken: text('share_token'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.recipeId] }),
    index('saved_recipes_recipe_idx').on(table.recipeId),
  ],
);
