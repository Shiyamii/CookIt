import type { Locale, RecipeVisibility } from '@cookit/shared';
import { and, desc, eq, exists, like, ne, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../../db';
import { uniqueViolation } from '../../db/errors';
import { user } from '../auth/auth.schema';
import { recipes, recipeTags, recipeTranslations } from './recipes.schema';

/** The language-dependent part of a recipe (plan §3), as stored. */
export type TranslationContent = {
  title: string;
  description: string;
  extraMeta: Record<string, string>;
  bodyMarkdown: string;
  searchText: string;
};

/** A translation other than the base language. */
export type TranslationRow = TranslationContent & { lang: Locale };

/**
 * A recipe with its base-language translation, its other translations and its owner's display
 * name.
 */
export type RecipeRow = {
  id: string;
  ownerId: string;
  ownerName: string;
  slug: string;
  lang: Locale;
  servings: number;
  visibility: RecipeVisibility;
  shareToken: string | null;
  sourceUrl: string | null;
  copiedFromId: string | null;
  title: string;
  description: string;
  extraMeta: Record<string, string>;
  bodyMarkdown: string;
  tagIds: string[];
  translations: TranslationRow[];
  hasSteps: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type RecipeListRow = Pick<
  RecipeRow,
  | 'id'
  | 'lang'
  | 'title'
  | 'description'
  | 'servings'
  | 'visibility'
  | 'ownerName'
  | 'hasSteps'
  | 'updatedAt'
>;

/** What a save writes: the columns of part 1 and the body. */
export type RecipeContent = {
  slug: string;
  servings: number;
  sourceUrl: string | null;
  title: string;
  description: string;
  extraMeta: Record<string, string>;
  bodyMarkdown: string;
  searchText: string;
  hasSteps: boolean;
};

export type NewRecipe = RecipeContent & {
  id: string;
  tagIds: string[];
  ownerId: string;
  lang: Locale;
  copiedFromId?: string | null;
  /** Other languages, stored as given (a copy keeps the original's translations). */
  translations?: (TranslationContent & { lang: Locale })[];
  now: Date;
};

export type ListQuery = {
  /** A `to_tsquery` expression (built by the service from the words searched), if any. */
  tsquery?: string;
  /** Recipes having all these tags. */
  tagIds?: string[];
  limit: number;
  offset: number;
};

export type RecipesRepository = {
  /** `slug_taken` when another recipe of the owner got the slug meanwhile. */
  create(recipe: NewRecipe): Promise<'ok' | 'slug_taken'>;
  findById(id: string): Promise<RecipeRow | undefined>;
  findByShareToken(token: string): Promise<RecipeRow | undefined>;
  /** Slugs of the owner's recipes starting with `base` (to pick a free one). */
  slugsStartingWith(ownerId: string, base: string): Promise<string[]>;
  /**
   * Saves part 1 and the body. With `baseVersion`, only if the recipe was not saved since
   * (`conflict` otherwise).
   */
  update(
    id: string,
    content: RecipeContent,
    options: { baseVersion?: Date; now: Date; tagIds?: string[] },
  ): Promise<'ok' | 'conflict' | 'not_found'>;
  setVisibility(id: string, visibility: RecipeVisibility, shareToken: string | null): Promise<void>;
  delete(id: string): Promise<void>;
  listByOwner(ownerId: string, query: ListQuery): Promise<RecipeListRow[]>;
  listPublic(query: ListQuery): Promise<RecipeListRow[]>;
  /** Every recipe of the owner in its base language (export of all recipes), oldest first. */
  listAllByOwner(ownerId: string): Promise<Omit<RecipeRow, 'translations'>[]>;
  /** Creates or replaces a translation (never the base language: the service checks it). */
  saveTranslation(
    recipeId: string,
    lang: Locale,
    content: TranslationContent,
    now: Date,
  ): Promise<void>;
  /** False when there was no such translation. */
  deleteTranslation(recipeId: string, lang: Locale): Promise<boolean>;
};

/** The base-language translation of each recipe. */
const baseTranslation = and(
  eq(recipeTranslations.recipeId, recipes.id),
  eq(recipeTranslations.lang, recipes.baseLang),
);

const rowColumns = {
  id: recipes.id,
  ownerId: recipes.ownerId,
  ownerName: user.name,
  slug: recipes.slug,
  lang: sql<Locale>`${recipes.baseLang}`,
  servings: recipes.servings,
  visibility: recipes.visibility,
  shareToken: recipes.shareToken,
  sourceUrl: recipes.sourceUrl,
  copiedFromId: recipes.copiedFromId,
  hasSteps: recipes.hasSteps,
  title: recipeTranslations.title,
  description: recipeTranslations.description,
  extraMeta: recipeTranslations.extraMeta,
  bodyMarkdown: recipeTranslations.bodyMarkdown,
  createdAt: recipes.createdAt,
  updatedAt: recipes.updatedAt,
};

const listColumns = {
  id: recipes.id,
  lang: sql<Locale>`${recipes.baseLang}`,
  title: recipeTranslations.title,
  description: recipeTranslations.description,
  servings: recipes.servings,
  visibility: recipes.visibility,
  ownerName: user.name,
  hasSteps: recipes.hasSteps,
  updatedAt: recipes.updatedAt,
};

const searchConfig = sql`(case ${recipeTranslations.lang} when 'fr' then 'french'::regconfig when 'hu' then 'hungarian'::regconfig else 'english'::regconfig end)`;

export function createRecipesRepository(db: Database): RecipesRepository {
  const findOne = async (where: SQL): Promise<RecipeRow | undefined> => {
    const [row] = await db
      .select(rowColumns)
      .from(recipes)
      .innerJoin(recipeTranslations, baseTranslation)
      .innerJoin(user, eq(user.id, recipes.ownerId))
      .where(where);
    if (!row) return undefined;
    const tagRows = await db
      .select({ tagId: recipeTags.tagId })
      .from(recipeTags)
      .where(eq(recipeTags.recipeId, row.id));
    const translations = await db
      .select({
        lang: sql<Locale>`${recipeTranslations.lang}`,
        title: recipeTranslations.title,
        description: recipeTranslations.description,
        extraMeta: recipeTranslations.extraMeta,
        bodyMarkdown: recipeTranslations.bodyMarkdown,
        searchText: recipeTranslations.searchText,
      })
      .from(recipeTranslations)
      .where(and(eq(recipeTranslations.recipeId, row.id), ne(recipeTranslations.lang, row.lang)))
      .orderBy(recipeTranslations.lang);
    return { ...row, tagIds: tagRows.map((tag) => tag.tagId), translations };
  };

  /** Replaces the tags of a recipe (inside the save's transaction). */
  const setTags = async (
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    recipeId: string,
    tagIds: string[],
  ) => {
    await tx.delete(recipeTags).where(eq(recipeTags.recipeId, recipeId));
    if (tagIds.length) {
      await tx.insert(recipeTags).values(tagIds.map((tagId) => ({ recipeId, tagId })));
    }
  };

  const list = (where: SQL | undefined, query: ListQuery) => {
    const matches = query.tsquery
      ? sql`${recipeTranslations.search} @@ to_tsquery(${searchConfig}, ${query.tsquery})`
      : undefined;
    const tagged = (query.tagIds ?? []).map((tagId) =>
      exists(
        db
          .select({ one: sql`1` })
          .from(recipeTags)
          .where(and(eq(recipeTags.recipeId, recipes.id), eq(recipeTags.tagId, tagId))),
      ),
    );
    const order = query.tsquery
      ? [
          desc(
            sql`ts_rank(${recipeTranslations.search}, to_tsquery(${searchConfig}, ${query.tsquery}))`,
          ),
          desc(recipes.updatedAt),
        ]
      : [desc(recipes.updatedAt)];
    return db
      .select(listColumns)
      .from(recipes)
      .innerJoin(recipeTranslations, baseTranslation)
      .innerJoin(user, eq(user.id, recipes.ownerId))
      .where(and(where, matches, ...tagged))
      .orderBy(...order, recipes.id)
      .limit(query.limit)
      .offset(query.offset);
  };

  const insert = (recipe: NewRecipe) =>
    db.transaction(async (tx) => {
      await tx.insert(recipes).values({
        id: recipe.id,
        ownerId: recipe.ownerId,
        slug: recipe.slug,
        baseLang: recipe.lang,
        servings: recipe.servings,
        sourceUrl: recipe.sourceUrl,
        copiedFromId: recipe.copiedFromId ?? null,
        hasSteps: recipe.hasSteps,
        createdAt: recipe.now,
        updatedAt: recipe.now,
      });
      await tx.insert(recipeTranslations).values({
        recipeId: recipe.id,
        lang: recipe.lang,
        title: recipe.title,
        description: recipe.description,
        extraMeta: recipe.extraMeta,
        bodyMarkdown: recipe.bodyMarkdown,
        searchText: recipe.searchText,
        updatedAt: recipe.now,
      });
      for (const translation of recipe.translations ?? []) {
        await tx
          .insert(recipeTranslations)
          .values({ ...translation, recipeId: recipe.id, updatedAt: recipe.now });
      }
      await setTags(tx, recipe.id, recipe.tagIds);
    });

  return {
    async create(recipe) {
      try {
        await insert(recipe);
        return 'ok';
      } catch (error) {
        if (uniqueViolation(error) === 'recipes_owner_slug_unique') return 'slug_taken';
        throw error;
      }
    },

    findById: (id) => findOne(eq(recipes.id, id)),

    findByShareToken: (token) => findOne(eq(recipes.shareToken, token)),

    async slugsStartingWith(ownerId, base) {
      const rows = await db
        .select({ slug: recipes.slug })
        .from(recipes)
        .where(
          and(
            eq(recipes.ownerId, ownerId),
            like(recipes.slug, `${base.replace(/[\\%_]/g, '\\$&')}%`),
          ),
        );
      return rows.map((row) => row.slug);
    },

    update(id, content, options) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select({ updatedAt: recipes.updatedAt, baseLang: recipes.baseLang })
          .from(recipes)
          .where(eq(recipes.id, id))
          .for('update');
        if (!current) return 'not_found';
        // Timestamps are written from JS (millisecond precision): exact comparison is safe.
        if (options.baseVersion && current.updatedAt.getTime() !== options.baseVersion.getTime()) {
          return 'conflict';
        }
        await tx
          .update(recipes)
          .set({
            slug: content.slug,
            servings: content.servings,
            sourceUrl: content.sourceUrl,
            hasSteps: content.hasSteps,
            updatedAt: options.now,
          })
          .where(eq(recipes.id, id));
        await tx
          .update(recipeTranslations)
          .set({
            title: content.title,
            description: content.description,
            extraMeta: content.extraMeta,
            bodyMarkdown: content.bodyMarkdown,
            searchText: content.searchText,
            updatedAt: options.now,
          })
          .where(
            and(eq(recipeTranslations.recipeId, id), eq(recipeTranslations.lang, current.baseLang)),
          );
        // Tags only change when given (a save that does not know them keeps them).
        if (options.tagIds) await setTags(tx, id, options.tagIds);
        return 'ok';
      });
    },

    // Not a content change: `updatedAt` (list order, editor conflicts) stays.
    async setVisibility(id, visibility, shareToken) {
      await db.update(recipes).set({ visibility, shareToken }).where(eq(recipes.id, id));
    },

    async delete(id) {
      await db.delete(recipes).where(eq(recipes.id, id));
    },

    listByOwner: (ownerId, query) => list(eq(recipes.ownerId, ownerId), query),

    listPublic: (query) => list(eq(recipes.visibility, 'public'), query),

    async listAllByOwner(ownerId) {
      const rows = await db
        .select(rowColumns)
        .from(recipes)
        .innerJoin(recipeTranslations, baseTranslation)
        .innerJoin(user, eq(user.id, recipes.ownerId))
        .where(eq(recipes.ownerId, ownerId))
        .orderBy(recipes.createdAt, recipes.id);
      const links = await db
        .select({ recipeId: recipeTags.recipeId, tagId: recipeTags.tagId })
        .from(recipeTags)
        .innerJoin(recipes, eq(recipes.id, recipeTags.recipeId))
        .where(eq(recipes.ownerId, ownerId));
      return rows.map((row) => ({
        ...row,
        tagIds: links.filter((link) => link.recipeId === row.id).map((link) => link.tagId),
      }));
    },

    async saveTranslation(recipeId, lang, content, now) {
      await db
        .insert(recipeTranslations)
        .values({ ...content, recipeId, lang, updatedAt: now })
        .onConflictDoUpdate({
          target: [recipeTranslations.recipeId, recipeTranslations.lang],
          set: { ...content, updatedAt: now },
        });
    },

    async deleteTranslation(recipeId, lang) {
      const deleted = await db
        .delete(recipeTranslations)
        .where(and(eq(recipeTranslations.recipeId, recipeId), eq(recipeTranslations.lang, lang)))
        .returning({ lang: recipeTranslations.lang });
      return deleted.length > 0;
    },
  };
}
