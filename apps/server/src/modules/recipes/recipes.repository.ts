import type { Locale, RecipeScope, RecipeVisibility } from '@cookit/shared';
import { and, asc, desc, eq, exists, like, ne, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from '../../db';
import { uniqueViolation } from '../../db/errors';
import { user } from '../auth/auth.schema';
import {
  recipeImages,
  recipeNotes,
  recipes,
  recipeTags,
  recipeTranslations,
  savedRecipes,
} from './recipes.schema';

/** The language-dependent part of a recipe (plan §3), as stored. */
export type TranslationContent = {
  title: string;
  description: string;
  summary: string;
  extraMeta: Record<string, string>;
  bodyMarkdown: string;
  searchText: string;
};

/** A translation other than the base language. */
export type TranslationRow = TranslationContent & { lang: Locale };

/**
 * A recipe with its base-language translation, its other translations, its photos and its
 * owner's display name and picture.
 */
export type RecipeRow = {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerUsername: string;
  /** URL of the owner's profile picture. */
  ownerImage: string | null;
  slug: string;
  lang: Locale;
  servings: number;
  visibility: RecipeVisibility;
  shareToken: string | null;
  sourceUrl: string | null;
  copiedFromId: string | null;
  /** A copy: the original's author (null once their account is gone). */
  copiedFromOwnerId: string | null;
  copiedFromOwnerName: string | null;
  copiedFromOwnerUsername: string | null;
  /** A copy: the original's visibility, null when it was deleted. */
  copiedFromVisibility: RecipeVisibility | null;
  title: string;
  description: string;
  summary: string;
  extraMeta: Record<string, string>;
  bodyMarkdown: string;
  tagIds: string[];
  translations: TranslationRow[];
  /** Photos, cover first. */
  imageIds: string[];
  hasSteps: boolean;
  authorNote: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RecipeListRow = Pick<
  RecipeRow,
  | 'id'
  | 'lang'
  | 'title'
  | 'description'
  | 'summary'
  | 'servings'
  | 'visibility'
  | 'ownerName'
  | 'ownerUsername'
  | 'ownerImage'
  | 'hasSteps'
  | 'updatedAt'
> & {
  coverId: string | null;
  /** The reader's own recipe. */
  mine: boolean;
};

/** What a save writes: the columns of part 1 and the body. */
export type RecipeContent = {
  slug: string;
  servings: number;
  sourceUrl: string | null;
  title: string;
  description: string;
  summary: string;
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
  copiedFromOwnerId?: string | null;
  /** Other languages, stored as given (a copy keeps the original's translations). */
  translations?: (TranslationContent & { lang: Locale })[];
  /** A copy: the recipe whose photos are copied too. */
  copyImagesFrom?: string;
  now: Date;
};

/** A photo to add: the full picture and its thumbnail, of the same type. */
export type NewImage = { id: string; contentType: string; data: Buffer; thumb: Buffer };

/** A photo as served, with what deciding who may see it needs. */
export type StoredImage = {
  contentType: string;
  data: Buffer;
  ownerId: string;
  visibility: RecipeVisibility;
};

export type ListQuery = {
  /** A `to_tsquery` expression (built by the service from the words searched), if any. */
  tsquery?: string;
  /** Recipes having all these tags. */
  tagIds?: string[];
  /** Show titles, descriptions and summaries in this language when the recipe has it. */
  lang?: Locale;
  /** The reader (`mine` in the rows); none for an anonymous visitor. */
  viewerId?: string;
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
  /**
   * With `renewImageIds`, the photos get new ids (new URLs): the old ones stop working, like the
   * old share link.
   */
  setVisibility(
    id: string,
    visibility: RecipeVisibility,
    shareToken: string | null,
    options?: { renewImageIds?: boolean },
  ): Promise<void>;
  delete(id: string): Promise<void>;
  /**
   * "My recipes": the user's own (`mine`), the ones they added by link that they may still read
   * (`saved`: public, or unlisted with the token they added it with), or both (`all`).
   */
  listLibrary(
    userId: string,
    scope: RecipeScope,
    query: Omit<ListQuery, 'viewerId'>,
  ): Promise<RecipeListRow[]>;
  listPublic(query: ListQuery): Promise<RecipeListRow[]>;
  /** The public recipes of one owner (their member page). */
  listPublicOf(ownerId: string, query: ListQuery): Promise<RecipeListRow[]>;
  /**
   * One recipe with steps among the owner's and the public ones, picked by `seed` (the same seed
   * gives the same recipe while they do not change), other than `exclude`.
   */
  pick(
    ownerId: string,
    seed: string,
    exclude?: string,
    lang?: Locale,
  ): Promise<RecipeListRow | undefined>;
  /** Every recipe of the owner in its base language (export of all recipes), oldest first. */
  listAllByOwner(ownerId: string): Promise<Omit<RecipeRow, 'translations' | 'imageIds'>[]>;
  /** Creates or replaces a translation (never the base language: the service checks it). */
  saveTranslation(
    recipeId: string,
    lang: Locale,
    content: TranslationContent,
    now: Date,
  ): Promise<void>;
  /** False when there was no such translation. */
  deleteTranslation(recipeId: string, lang: Locale): Promise<boolean>;
  /** The author's public note (does not change `updated_at`: no editor conflict). */
  setAuthorNote(recipeId: string, text: string): Promise<void>;
  /** A reader's private note, if any. */
  findNote(userId: string, recipeId: string): Promise<string | undefined>;
  /** Saves a reader's note; an empty text deletes it. */
  saveNote(userId: string, recipeId: string, text: string, now: Date): Promise<void>;
  /** The share token a user added a recipe with (null: public), undefined when not added. */
  findSaved(userId: string, recipeId: string): Promise<{ shareToken: string | null } | undefined>;
  /** Adds a recipe to the user's recipes by link (again: its token is replaced). */
  saveLink(userId: string, recipeId: string, shareToken: string | null, now: Date): Promise<void>;
  removeLink(userId: string, recipeId: string): Promise<void>;
  /** Adds a photo after the others; `too_many` when the recipe already has `max`. */
  addImage(recipeId: string, image: NewImage, max: number): Promise<'ok' | 'too_many'>;
  /** False when the recipe has no such photo. */
  deleteImage(recipeId: string, imageId: string): Promise<boolean>;
  /** New order of the photos; `mismatch` unless `ids` are exactly the recipe's photos. */
  orderImages(recipeId: string, ids: string[]): Promise<'ok' | 'mismatch'>;
  findImage(imageId: string, size: 'full' | 'thumb'): Promise<StoredImage | undefined>;
  /** Bytes of the photos (pictures and thumbnails) of every recipe of the owner. */
  imageBytesOfOwner(ownerId: string): Promise<number>;
  /** Bytes of the photos of one recipe. */
  imageBytesOfRecipe(recipeId: string): Promise<number>;
};

/** The base-language translation of each recipe. */
const baseTranslation = and(
  eq(recipeTranslations.recipeId, recipes.id),
  eq(recipeTranslations.lang, recipes.baseLang),
);

/** A copy's original and that original's author. */
const original = alias(recipes, 'original');
const originalOwner = alias(user, 'original_owner');

/** The username as the person typed it (the stored one is lowercased). */
const usernameOf = (table: typeof user) =>
  sql<string>`coalesce(${table.displayUsername}, ${table.username}, '')`;

const rowColumns = {
  id: recipes.id,
  ownerId: recipes.ownerId,
  ownerName: user.name,
  ownerUsername: usernameOf(user),
  ownerImage: user.image,
  slug: recipes.slug,
  lang: sql<Locale>`${recipes.baseLang}`,
  servings: recipes.servings,
  visibility: recipes.visibility,
  shareToken: recipes.shareToken,
  sourceUrl: recipes.sourceUrl,
  copiedFromId: recipes.copiedFromId,
  copiedFromOwnerId: recipes.copiedFromOwnerId,
  copiedFromOwnerName: originalOwner.name,
  copiedFromOwnerUsername: sql<
    string | null
  >`coalesce(${originalOwner.displayUsername}, ${originalOwner.username})`,
  copiedFromVisibility: original.visibility,
  hasSteps: recipes.hasSteps,
  authorNote: recipes.authorNote,
  title: recipeTranslations.title,
  description: recipeTranslations.description,
  summary: recipeTranslations.summary,
  extraMeta: recipeTranslations.extraMeta,
  bodyMarkdown: recipeTranslations.bodyMarkdown,
  createdAt: recipes.createdAt,
  updatedAt: recipes.updatedAt,
};

/** The translation shown in lists: the one asked for, when the recipe has it. */
const shown = alias(recipeTranslations, 'shown');
const shownJoin = (lang: Locale | undefined) =>
  and(eq(shown.recipeId, recipes.id), eq(shown.lang, lang ?? sql`${recipes.baseLang}`));

const listColumns = (viewerId: string | undefined) => ({
  id: recipes.id,
  lang: sql<Locale>`coalesce(${shown.lang}, ${recipes.baseLang})`,
  title: sql<string>`coalesce(${shown.title}, ${recipeTranslations.title})`,
  description: sql<string>`coalesce(${shown.description}, ${recipeTranslations.description})`,
  summary: sql<string>`coalesce(${shown.summary}, ${recipeTranslations.summary})`,
  servings: recipes.servings,
  visibility: recipes.visibility,
  ownerName: user.name,
  ownerUsername: usernameOf(user),
  ownerImage: user.image,
  hasSteps: recipes.hasSteps,
  updatedAt: recipes.updatedAt,
  // The cover's id (first photo), if any.
  coverId: sql<
    string | null
  >`(select ${recipeImages.id} from ${recipeImages} where ${recipeImages.recipeId} = ${recipes.id} order by ${recipeImages.position}, ${recipeImages.id} limit 1)`,
  mine: viewerId ? sql<boolean>`${recipes.ownerId} = ${viewerId}` : sql<boolean>`false`,
});

/**
 * Recipes `userId` added by link and may still read: public, or unlisted with the share token
 * they were added with (a new link or another visibility cuts them off). Never their own.
 */
const savedBy = (userId: string) =>
  and(
    ne(recipes.ownerId, userId),
    sql`exists (select 1 from ${savedRecipes} where ${savedRecipes.userId} = ${userId} and ${savedRecipes.recipeId} = ${recipes.id} and (${recipes.visibility} = 'public' or (${recipes.visibility} = 'unlisted' and ${savedRecipes.shareToken} = ${recipes.shareToken})))`,
  );

const imageBytes =
  sql<number>`coalesce(sum(octet_length(${recipeImages.data}) + octet_length(${recipeImages.thumb})), 0)::bigint`.mapWith(
    Number,
  );

const searchConfigOf = (lang: SQL | typeof recipeTranslations.lang | typeof shown.lang) =>
  sql`(case ${lang} when 'fr' then 'french'::regconfig when 'hu' then 'hungarian'::regconfig else 'english'::regconfig end)`;
const searchConfig = searchConfigOf(recipeTranslations.lang);

export function createRecipesRepository(db: Database): RecipesRepository {
  const findOne = async (where: SQL): Promise<RecipeRow | undefined> => {
    const [row] = await db
      .select(rowColumns)
      .from(recipes)
      .innerJoin(recipeTranslations, baseTranslation)
      .innerJoin(user, eq(user.id, recipes.ownerId))
      .leftJoin(original, eq(original.id, recipes.copiedFromId))
      .leftJoin(originalOwner, eq(originalOwner.id, recipes.copiedFromOwnerId))
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
        summary: recipeTranslations.summary,
        extraMeta: recipeTranslations.extraMeta,
        bodyMarkdown: recipeTranslations.bodyMarkdown,
        searchText: recipeTranslations.searchText,
      })
      .from(recipeTranslations)
      .where(and(eq(recipeTranslations.recipeId, row.id), ne(recipeTranslations.lang, row.lang)))
      .orderBy(recipeTranslations.lang);
    const images = await db
      .select({ id: recipeImages.id })
      .from(recipeImages)
      .where(eq(recipeImages.recipeId, row.id))
      .orderBy(asc(recipeImages.position), asc(recipeImages.id));
    return {
      ...row,
      tagIds: tagRows.map((tag) => tag.tagId),
      translations,
      imageIds: images.map((image) => image.id),
    };
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
    // Words found in the base language or in the language shown.
    const matches = query.tsquery
      ? sql`(${recipeTranslations.search} @@ to_tsquery(${searchConfig}, ${query.tsquery}) or coalesce(${shown.search} @@ to_tsquery(${searchConfigOf(shown.lang)}, ${query.tsquery}), false))`
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
            sql`greatest(ts_rank(${recipeTranslations.search}, to_tsquery(${searchConfig}, ${query.tsquery})), coalesce(ts_rank(${shown.search}, to_tsquery(${searchConfigOf(shown.lang)}, ${query.tsquery})), 0))`,
          ),
          desc(recipes.updatedAt),
        ]
      : [desc(recipes.updatedAt)];
    return db
      .select(listColumns(query.viewerId))
      .from(recipes)
      .innerJoin(recipeTranslations, baseTranslation)
      .leftJoin(shown, shownJoin(query.lang))
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
        copiedFromOwnerId: recipe.copiedFromOwnerId ?? null,
        hasSteps: recipe.hasSteps,
        createdAt: recipe.now,
        updatedAt: recipe.now,
      });
      await tx.insert(recipeTranslations).values({
        recipeId: recipe.id,
        lang: recipe.lang,
        title: recipe.title,
        description: recipe.description,
        summary: recipe.summary,
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
      if (recipe.copyImagesFrom) {
        // Copied by the database (new ids), without reading the pictures into the server.
        await tx.execute(sql`
          insert into ${recipeImages} (id, recipe_id, position, content_type, data, thumb, created_at)
          select gen_random_uuid()::text, ${recipe.id}, position, content_type, data, thumb, ${recipe.now.toISOString()}::timestamptz
          from ${recipeImages} where recipe_id = ${recipe.copyImagesFrom}`);
      }
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
            summary: content.summary,
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
    async setVisibility(id, visibility, shareToken, options) {
      await db.transaction(async (tx) => {
        await tx.update(recipes).set({ visibility, shareToken }).where(eq(recipes.id, id));
        if (options?.renewImageIds) {
          await tx
            .update(recipeImages)
            .set({ id: sql`gen_random_uuid()::text` })
            .where(eq(recipeImages.recipeId, id));
        }
      });
    },

    async delete(id) {
      await db.delete(recipes).where(eq(recipes.id, id));
    },

    listLibrary: (userId, scope, query) =>
      list(
        scope === 'mine'
          ? eq(recipes.ownerId, userId)
          : scope === 'saved'
            ? savedBy(userId)
            : or(eq(recipes.ownerId, userId), savedBy(userId)),
        { ...query, viewerId: userId },
      ),

    listPublic: (query) => list(eq(recipes.visibility, 'public'), query),

    listPublicOf: (ownerId, query) =>
      list(and(eq(recipes.visibility, 'public'), eq(recipes.ownerId, ownerId)), query),

    async pick(ownerId, seed, exclude, lang) {
      const [row] = await db
        .select(listColumns(ownerId))
        .from(recipes)
        .innerJoin(recipeTranslations, baseTranslation)
        .leftJoin(shown, shownJoin(lang))
        .innerJoin(user, eq(user.id, recipes.ownerId))
        .where(
          and(
            eq(recipes.hasSteps, true),
            or(eq(recipes.ownerId, ownerId), eq(recipes.visibility, 'public')),
            exclude ? ne(recipes.id, exclude) : undefined,
          ),
        )
        .orderBy(sql`md5(${recipes.id} || ${seed})`)
        .limit(1);
      return row;
    },

    async listAllByOwner(ownerId) {
      const rows = await db
        .select(rowColumns)
        .from(recipes)
        .innerJoin(recipeTranslations, baseTranslation)
        .innerJoin(user, eq(user.id, recipes.ownerId))
        .leftJoin(original, eq(original.id, recipes.copiedFromId))
        .leftJoin(originalOwner, eq(originalOwner.id, recipes.copiedFromOwnerId))
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

    async setAuthorNote(recipeId, text) {
      await db.update(recipes).set({ authorNote: text }).where(eq(recipes.id, recipeId));
    },

    async findNote(userId, recipeId) {
      const [row] = await db
        .select({ text: recipeNotes.text })
        .from(recipeNotes)
        .where(and(eq(recipeNotes.userId, userId), eq(recipeNotes.recipeId, recipeId)));
      return row?.text;
    },

    async saveNote(userId, recipeId, text, now) {
      if (!text) {
        await db
          .delete(recipeNotes)
          .where(and(eq(recipeNotes.userId, userId), eq(recipeNotes.recipeId, recipeId)));
        return;
      }
      await db
        .insert(recipeNotes)
        .values({ userId, recipeId, text, updatedAt: now })
        .onConflictDoUpdate({
          target: [recipeNotes.userId, recipeNotes.recipeId],
          set: { text, updatedAt: now },
        });
    },

    async findSaved(userId, recipeId) {
      const [row] = await db
        .select({ shareToken: savedRecipes.shareToken })
        .from(savedRecipes)
        .where(and(eq(savedRecipes.userId, userId), eq(savedRecipes.recipeId, recipeId)));
      return row;
    },

    async saveLink(userId, recipeId, shareToken, now) {
      await db
        .insert(savedRecipes)
        .values({ userId, recipeId, shareToken, createdAt: now })
        .onConflictDoUpdate({
          target: [savedRecipes.userId, savedRecipes.recipeId],
          set: { shareToken },
        });
    },

    async removeLink(userId, recipeId) {
      await db
        .delete(savedRecipes)
        .where(and(eq(savedRecipes.userId, userId), eq(savedRecipes.recipeId, recipeId)));
    },

    async deleteTranslation(recipeId, lang) {
      const deleted = await db
        .delete(recipeTranslations)
        .where(and(eq(recipeTranslations.recipeId, recipeId), eq(recipeTranslations.lang, lang)))
        .returning({ lang: recipeTranslations.lang });
      return deleted.length > 0;
    },

    addImage(recipeId, image, max) {
      return db.transaction(async (tx) => {
        // The recipe row is locked: two uploads at once cannot both take the last place.
        await tx
          .select({ id: recipes.id })
          .from(recipes)
          .where(eq(recipes.id, recipeId))
          .for('update');
        const [stats] = await tx
          .select({
            count: sql<number>`count(*)::int`,
            last: sql<number>`coalesce(max(${recipeImages.position}), -1)::int`,
          })
          .from(recipeImages)
          .where(eq(recipeImages.recipeId, recipeId));
        if ((stats?.count ?? 0) >= max) return 'too_many';
        await tx
          .insert(recipeImages)
          .values({ ...image, recipeId, position: (stats?.last ?? -1) + 1 });
        return 'ok';
      });
    },

    async deleteImage(recipeId, imageId) {
      const deleted = await db
        .delete(recipeImages)
        .where(and(eq(recipeImages.recipeId, recipeId), eq(recipeImages.id, imageId)))
        .returning({ id: recipeImages.id });
      return deleted.length > 0;
    },

    orderImages(recipeId, ids) {
      return db.transaction(async (tx) => {
        const current = await tx
          .select({ id: recipeImages.id })
          .from(recipeImages)
          .where(eq(recipeImages.recipeId, recipeId))
          .for('update');
        const known = new Set(current.map((image) => image.id));
        const same =
          ids.length === known.size &&
          new Set(ids).size === ids.length &&
          ids.every((id) => known.has(id));
        if (!same) return 'mismatch';
        for (const [position, id] of ids.entries()) {
          await tx.update(recipeImages).set({ position }).where(eq(recipeImages.id, id));
        }
        return 'ok';
      });
    },

    async imageBytesOfOwner(ownerId) {
      const [row] = await db
        .select({ bytes: imageBytes })
        .from(recipeImages)
        .innerJoin(recipes, eq(recipes.id, recipeImages.recipeId))
        .where(eq(recipes.ownerId, ownerId));
      return row?.bytes ?? 0;
    },

    async imageBytesOfRecipe(recipeId) {
      const [row] = await db
        .select({ bytes: imageBytes })
        .from(recipeImages)
        .where(eq(recipeImages.recipeId, recipeId));
      return row?.bytes ?? 0;
    },

    async findImage(imageId, size) {
      const [row] = await db
        .select({
          contentType: recipeImages.contentType,
          data: size === 'thumb' ? recipeImages.thumb : recipeImages.data,
          ownerId: recipes.ownerId,
          visibility: recipes.visibility,
        })
        .from(recipeImages)
        .innerJoin(recipes, eq(recipes.id, recipeImages.recipeId))
        .where(eq(recipeImages.id, imageId));
      return row;
    },
  };
}
