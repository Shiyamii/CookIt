import {
  checkTranslationStructure,
  composeRecipeMarkdown,
  type TagCategory,
  fold,
  MAX_IMAGE_BYTES_PER_USER,
  MAX_RECIPE_IMAGES,
  parseRecipe,
  recipeImageUrls,
  type RecipeImage,
  RECIPES_PAGE_SIZE,
  serializeBody,
  type Diagnostic,
  type Locale,
  type RecipeCreateInput,
  type RecipeDetail,
  type RecipeDocument,
  type RecipeFields,
  type RecipeIdeaQuery,
  type RecipePage,
  type RecipeSummary,
  type RecipeSaveInput,
  type RecipeSearch,
  type RecipeVisibility,
  type Unit,
} from '@cookit/shared';
import { checkImage } from '../../lib/images';
import type {
  RecipeContent,
  RecipeListRow,
  RecipeRow,
  RecipesRepository,
  TranslationContent,
} from './recipes.repository';

/** A recipe that does not parse: the diagnostics say why (translated by the UI). */
export type InvalidRecipe = { error: 'invalid_recipe'; diagnostics: Diagnostic[] };
export type NotFound = { error: 'not_found' };
export type Conflict = { error: 'conflict' };
/** Unknown tags, or two tags of a single-choice category. */
export type InvalidTags = { error: 'invalid_tags' };
/** The base language is changed by the editors, not as a translation. */
export type BaseLanguage = { error: 'base_language' };
/** Not a WebP or JPEG within the limits, or a thumbnail of another type than its picture. */
export type InvalidImage = { error: 'invalid_image' };
export type TooManyImages = { error: 'too_many_images' };
/** The owner's photos already take all their storage. */
export type StorageFull = { error: 'storage_full' };
/** A new photo order that is not exactly the recipe's photos. */
export type InvalidOrder = { error: 'invalid_order' };

const NOT_FOUND: NotFound = { error: 'not_found' };
const INVALID_TAGS: InvalidTags = { error: 'invalid_tags' };
const BASE_LANGUAGE: BaseLanguage = { error: 'base_language' };
const INVALID_IMAGE: InvalidImage = { error: 'invalid_image' };
const SLUG_MAX = 80;
const MAX_SEARCH_WORDS = 10;

/** `Tarte aux pommes !` → `tarte-aux-pommes`. */
export function slugify(title: string): string {
  const slug = fold(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
  return slug || 'recette';
}

/** The first of `base`, `base-2`, `base-3`… not in `taken`. */
export function freeSlug(base: string, taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

/**
 * The words searched, as a `to_tsquery` expression: each word as a prefix (`tart:*`), all
 * required. Accents are removed like in the indexed text; anything but letters and digits is
 * dropped, so the expression is always valid.
 */
export function searchQuery(q: string | undefined): string | undefined {
  const words = fold(q ?? '').match(/[\p{L}\p{N}]+/gu) ?? [];
  const terms = words.slice(0, MAX_SEARCH_WORDS).map((word) => `${word.slice(0, 50)}:*`);
  return terms.length ? terms.join(' & ') : undefined;
}

/** What the search reads: title, description and ingredients, without accents. */
function searchText(document: RecipeDocument): string {
  const ingredients = document.ingredientGroups.flatMap((group) => [
    group.name ?? '',
    ...group.items.map((item) => item.raw),
  ]);
  return fold([document.title, document.description, ...ingredients].join('\n'));
}

/**
 * Recipes: CRUD, visibility, sharing, copies, lists and search. Access rules (plan §5.2, phase 4
 * criterion): a private recipe is only ever seen by its owner (admins included: no exception); a
 * public one by anyone, signed in or not; an unlisted one by its owner and by whoever has its
 * share link. Only the owner changes a recipe. Whatever is not visible answers `not_found`.
 */
export function createRecipesService(deps: {
  repository: RecipesRepository;
  origin: string;
  /** The unit catalog for parsing (the `units` table, units service). */
  units: () => Promise<readonly Unit[]>;
  /** Tag catalog checks (tags service). */
  tags: {
    checkSelection(tagIds: readonly string[]): Promise<string[] | undefined>;
    idsOfSlugs(slugs: readonly string[]): Promise<string[]>;
    catalog(): Promise<TagCategory[]>;
  };
  generateToken: () => string;
  newId?: () => string;
  now?: () => Date;
  /** Photo storage per user (tests use a small one). */
  maxImageBytes?: number;
}) {
  const { repository } = deps;
  const maxImageBytes = deps.maxImageBytes ?? MAX_IMAGE_BYTES_PER_USER;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  const shareUrl = (token: string) => `${deps.origin}/shared#token=${token}`;

  /** The recipe in `lang` when it has that translation, in its base language otherwise. */
  const toDetail = (row: RecipeRow, viewerId: string | null, lang?: Locale): RecipeDetail => {
    const isOwner = row.ownerId === viewerId;
    const shown = row.translations.find((translation) => translation.lang === lang) ?? row;
    return {
      id: row.id,
      lang: shown.lang,
      baseLang: row.lang,
      languages: [row.lang, ...row.translations.map((translation) => translation.lang)],
      title: shown.title,
      description: shown.description,
      servings: row.servings,
      source: row.sourceUrl,
      extraMeta: shown.extraMeta,
      body: shown.bodyMarkdown,
      visibility: row.visibility,
      ownerName: row.ownerName,
      ownerImage: row.ownerImage,
      images: row.imageIds.map(recipeImageUrls),
      isOwner,
      shareUrl:
        isOwner && row.visibility === 'unlisted' && row.shareToken
          ? shareUrl(row.shareToken)
          : null,
      copiedFromId: row.copiedFromId,
      tagIds: row.tagIds,
      incomplete: !row.hasSteps,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  };

  /** Parses the document; the canonical columns and body come from the parsed recipe. */
  const parseDocument = async (
    markdown: string,
  ): Promise<{ document: RecipeDocument } | InvalidRecipe> => {
    const result = parseRecipe(markdown, { units: await deps.units() });
    if (!result.ok) return { error: 'invalid_recipe', diagnostics: result.diagnostics };
    return { document: result.document };
  };

  /** The visual editor's columns and body, checked by parsing the document they compose. */
  const parseFields = (fields: RecipeFields, body: string, lang: Locale) =>
    parseDocument(composeRecipeMarkdown(fields, body, { locale: lang }));

  const translationContent = (document: RecipeDocument, lang: Locale): TranslationContent => ({
    title: document.title,
    description: document.description,
    // The parser builds it without prototype (no `__proto__` key can matter); Drizzle needs a
    // plain object.
    extraMeta: { ...document.extraMeta },
    bodyMarkdown: serializeBody(document, { locale: lang }),
    searchText: searchText(document),
  });

  const content = (document: RecipeDocument, lang: Locale, slug: string): RecipeContent => ({
    ...translationContent(document, lang),
    slug,
    servings: document.servings,
    sourceUrl: document.source ?? null,
    hasSteps: document.stepGroups.some((group) => group.items.some((item) => item.kind === 'step')),
  });

  const slugFor = async (ownerId: string, title: string, current?: string) => {
    const base = slugify(title);
    // A title change that keeps the same slug base keeps the slug (and its suffix).
    if (current && (current === base || new RegExp(`^${base}-\\d+$`).test(current))) {
      return current;
    }
    return freeSlug(base, await repository.slugsStartingWith(ownerId, base));
  };

  /** The tags to save: checked, or undefined when none were given. */
  const checkTags = async (
    tagIds: readonly string[] | undefined,
  ): Promise<{ tagIds?: string[] } | InvalidTags> => {
    if (tagIds === undefined) return {};
    const checked = await deps.tags.checkSelection(tagIds);
    return checked ? { tagIds: checked } : INVALID_TAGS;
  };

  const insert = async (
    ownerId: string,
    document: RecipeDocument,
    lang: Locale,
    options: {
      copiedFromId?: string | null;
      tagIds?: string[];
      translations?: (TranslationContent & { lang: Locale })[];
      copyImagesFrom?: string;
    } = {},
  ): Promise<{ id: string }> => {
    // Two creations with the same title at once: the second one picks the next free slug.
    for (let attempt = 0; ; attempt++) {
      const id = newId();
      const slug = await slugFor(ownerId, document.title);
      const result = await repository.create({
        ...content(document, lang, slug),
        id,
        ownerId,
        lang,
        copiedFromId: options.copiedFromId ?? null,
        tagIds: options.tagIds ?? [],
        translations: options.translations,
        copyImagesFrom: options.copyImagesFrom,
        now: now(),
      });
      if (result === 'ok') return { id };
      if (attempt >= 2) throw new Error('No free slug');
    }
  };

  /** Part 1 columns of the base language, as the editors and the parser see them. */
  const baseFields = (row: RecipeRow): RecipeFields => ({
    title: row.title,
    description: row.description,
    servings: row.servings,
    source: row.sourceUrl ?? undefined,
    extraMeta: row.extraMeta,
  });

  /** The recipe if `userId` owns it (others get not_found, never forbidden). */
  const owned = async (id: string, userId: string) => {
    const row = await repository.findById(id);
    return row && row.ownerId === userId ? row : undefined;
  };

  const save = async (
    row: RecipeRow,
    document: RecipeDocument,
    baseVersion: string | undefined,
    tagIds: string[] | undefined,
  ): Promise<{ updatedAt: string } | NotFound | Conflict> => {
    const at = now();
    const result = await repository.update(
      row.id,
      content(document, row.lang, await slugFor(row.ownerId, document.title, row.slug)),
      { baseVersion: baseVersion ? new Date(baseVersion) : undefined, now: at, tagIds },
    );
    if (result === 'not_found') return NOT_FOUND;
    if (result === 'conflict') return { error: 'conflict' };
    return { updatedAt: at.toISOString() };
  };

  const summary = ({ hasSteps, coverId, ...row }: RecipeListRow): RecipeSummary => ({
    ...row,
    cover: coverId ? recipeImageUrls(coverId).thumbUrl : null,
    incomplete: !hasSteps,
    updatedAt: row.updatedAt.toISOString(),
  });

  const page = async (rows: Promise<RecipeListRow[]>): Promise<RecipePage> => {
    const found = await rows;
    return {
      recipes: found.slice(0, RECIPES_PAGE_SIZE).map(summary),
      hasMore: found.length > RECIPES_PAGE_SIZE,
    };
  };

  /**
   * The list query, or undefined when a filtered tag does not exist (nothing can match). One
   * more row than a page tells whether there is a next page.
   */
  const listQuery = async (search: RecipeSearch) => {
    const tagIds = await deps.tags.idsOfSlugs(search.tags);
    if (tagIds.length < new Set(search.tags).size) return undefined;
    return {
      tsquery: searchQuery(search.q),
      tagIds,
      limit: RECIPES_PAGE_SIZE + 1,
      offset: (search.page - 1) * RECIPES_PAGE_SIZE,
    };
  };
  const EMPTY_PAGE: RecipePage = { recipes: [], hasMore: false };

  return {
    async create(ownerId: string, input: RecipeCreateInput) {
      const tags = await checkTags(input.tagIds);
      if ('error' in tags) return tags;
      const parsed = await parseFields(input, input.body, input.lang);
      if ('error' in parsed) return parsed;
      return insert(ownerId, parsed.document, input.lang, tags);
    },

    async createFromMarkdown(
      ownerId: string,
      input: { markdown: string; lang: Locale; tagIds?: string[] },
    ) {
      const tags = await checkTags(input.tagIds);
      if ('error' in tags) return tags;
      const parsed = await parseDocument(input.markdown);
      if ('error' in parsed) return parsed;
      return insert(ownerId, parsed.document, input.lang, tags);
    },

    /**
     * A recipe as `viewerId` (null: anonymous) may read it from its id: owner or public. In `lang`
     * when it has that translation, in its base language otherwise.
     */
    async get(
      id: string,
      viewerId: string | null,
      lang?: Locale,
    ): Promise<RecipeDetail | NotFound> {
      const row = await repository.findById(id);
      if (!row) return NOT_FOUND;
      if (row.ownerId !== viewerId && row.visibility !== 'public') return NOT_FOUND;
      return toDetail(row, viewerId, lang);
    },

    /** A recipe from its share link: only while it is unlisted (the link is revoked otherwise). */
    async getShared(
      token: string,
      viewerId: string | null,
      lang?: Locale,
    ): Promise<RecipeDetail | NotFound> {
      const row = await repository.findByShareToken(token);
      if (!row || row.visibility !== 'unlisted') return NOT_FOUND;
      return toDetail(row, viewerId, lang);
    },

    /**
     * Adds or replaces the translation of a recipe in `lang` (plan §5.6): the full document, as
     * pasted from an AI. Servings, source and tags stay the recipe's (a `tags:` line is ignored).
     * A structure that differs from the base language is saved anyway, with warnings.
     */
    async saveTranslation(
      id: string,
      userId: string,
      lang: Locale,
      markdown: string,
    ): Promise<
      { updatedAt: string; warnings: Diagnostic[] } | NotFound | BaseLanguage | InvalidRecipe
    > {
      const row = await owned(id, userId);
      if (!row) return NOT_FOUND;
      if (lang === row.lang) return BASE_LANGUAGE;
      const parsed = await parseDocument(markdown);
      if ('error' in parsed) return parsed;
      const base = await parseFields(baseFields(row), row.bodyMarkdown, row.lang);
      const warnings =
        'error' in base ? [] : checkTranslationStructure(base.document, parsed.document);
      const at = now();
      await repository.saveTranslation(id, lang, translationContent(parsed.document, lang), at);
      return { updatedAt: at.toISOString(), warnings };
    },

    async deleteTranslation(
      id: string,
      userId: string,
      lang: Locale,
    ): Promise<{ ok: true } | NotFound | BaseLanguage> {
      const row = await owned(id, userId);
      if (!row) return NOT_FOUND;
      if (lang === row.lang) return BASE_LANGUAGE;
      return (await repository.deleteTranslation(id, lang)) ? { ok: true } : NOT_FOUND;
    },

    async update(id: string, userId: string, input: RecipeSaveInput) {
      const row = await owned(id, userId);
      if (!row) return NOT_FOUND;
      const tags = await checkTags(input.tagIds);
      if ('error' in tags) return tags;
      const parsed = await parseFields(input, input.body, row.lang);
      if ('error' in parsed) return parsed;
      return save(row, parsed.document, input.baseVersion, tags.tagIds);
    },

    async updateFromMarkdown(
      id: string,
      userId: string,
      input: { markdown: string; baseVersion?: string; tagIds?: string[] },
    ) {
      const row = await owned(id, userId);
      if (!row) return NOT_FOUND;
      const tags = await checkTags(input.tagIds);
      if ('error' in tags) return tags;
      const parsed = await parseDocument(input.markdown);
      if ('error' in parsed) return parsed;
      return save(row, parsed.document, input.baseVersion, tags.tagIds);
    },

    /**
     * Unlisted recipes get a share link. Leaving "unlisted" revokes it: going back gives a new
     * link, so a link that leaked can always be cut off.
     */
    async setVisibility(
      id: string,
      userId: string,
      visibility: RecipeVisibility,
    ): Promise<{ visibility: RecipeVisibility; shareUrl: string | null } | NotFound> {
      const row = await owned(id, userId);
      if (!row) return NOT_FOUND;
      const keep = row.visibility === 'unlisted' && row.shareToken;
      const token = visibility !== 'unlisted' ? null : keep ? row.shareToken : deps.generateToken();
      // A new link: the photos get new URLs too, so a leaked link's photos are cut off as well.
      await repository.setVisibility(id, visibility, token, {
        renewImageIds: visibility === 'unlisted' && !keep,
      });
      return { visibility, shareUrl: token ? shareUrl(token) : null };
    },

    async delete(id: string, userId: string): Promise<{ ok: true } | NotFound> {
      if (!(await owned(id, userId))) return NOT_FOUND;
      await repository.delete(id);
      return { ok: true };
    },

    /**
     * "Add to my library": an independent private copy of a recipe `userId` can read — public, or
     * unlisted with its share link.
     */
    async copy(
      id: string,
      userId: string,
      token: string | undefined,
    ): Promise<{ id: string } | NotFound | InvalidRecipe> {
      const row = await repository.findById(id);
      const readable =
        row &&
        (row.visibility === 'public' ||
          (row.visibility === 'unlisted' && token !== undefined && token === row.shareToken));
      if (!row || !readable || row.ownerId === userId) return NOT_FOUND;
      const parsed = await parseFields(baseFields(row), row.bodyMarkdown, row.lang);
      if ('error' in parsed) return parsed;
      // The photos only when they fit in the reader's storage (the recipe is copied anyway).
      const photosFit =
        row.imageIds.length > 0 &&
        (await repository.imageBytesOfOwner(userId)) +
          (await repository.imageBytesOfRecipe(row.id)) <=
          maxImageBytes;
      // Tags, translations and photos are copied too (plan §4); translations as stored.
      return insert(userId, parsed.document, row.lang, {
        copiedFromId: row.id,
        tagIds: row.tagIds,
        translations: row.translations,
        copyImagesFrom: photosFit ? row.id : undefined,
      });
    },

    /**
     * "Export all my recipes" (plan §5.2): one `.md` file per recipe (`<slug>.md`), with the
     * `tags:` line (neutral slugs) and the current `format:`.
     */
    async exportAll(userId: string): Promise<{ name: string; markdown: string }[]> {
      const slugOf = new Map(
        (await deps.tags.catalog()).flatMap((category) =>
          category.tags.map((tag) => [tag.id, tag.slug] as const),
        ),
      );
      return (await repository.listAllByOwner(userId)).map((row) => ({
        name: `${row.slug}.md`,
        markdown: composeRecipeMarkdown(
          {
            title: row.title,
            description: row.description,
            servings: row.servings,
            source: row.sourceUrl ?? undefined,
            extraMeta: row.extraMeta,
            tags: row.tagIds.flatMap((id) => slugOf.get(id) ?? []),
          },
          row.bodyMarkdown,
          { locale: row.lang, includeTags: true },
        ),
      }));
    },

    /**
     * Adds a photo (after the others: the first one is the cover). Only the owner; both pictures
     * are checked from their header (type, dimensions, size).
     */
    async addImage(
      id: string,
      userId: string,
      upload: { image: Uint8Array; thumb: Uint8Array },
    ): Promise<RecipeImage | NotFound | InvalidImage | TooManyImages | StorageFull> {
      if (!(await owned(id, userId))) return NOT_FOUND;
      const type = checkImage(upload.image, 'full');
      if (!type || checkImage(upload.thumb, 'thumb') !== type) return INVALID_IMAGE;
      const size = upload.image.length + upload.thumb.length;
      if ((await repository.imageBytesOfOwner(userId)) + size > maxImageBytes) {
        return { error: 'storage_full' };
      }
      const imageId = newId();
      const added = await repository.addImage(
        id,
        {
          id: imageId,
          contentType: type,
          data: Buffer.from(upload.image),
          thumb: Buffer.from(upload.thumb),
        },
        MAX_RECIPE_IMAGES,
      );
      return added === 'ok' ? recipeImageUrls(imageId) : { error: 'too_many_images' };
    },

    async deleteImage(
      id: string,
      userId: string,
      imageId: string,
    ): Promise<{ ok: true } | NotFound> {
      if (!(await owned(id, userId))) return NOT_FOUND;
      return (await repository.deleteImage(id, imageId)) ? { ok: true } : NOT_FOUND;
    },

    /** New order of the photos (all of them, the cover first). */
    async orderImages(
      id: string,
      userId: string,
      ids: string[],
    ): Promise<{ ok: true } | NotFound | InvalidOrder> {
      if (!(await owned(id, userId))) return NOT_FOUND;
      return (await repository.orderImages(id, ids)) === 'ok'
        ? { ok: true }
        : { error: 'invalid_order' };
    },

    /**
     * A photo, for whoever may read its recipe: anyone for a public recipe, the owner always. An
     * unlisted recipe's photos are served to anyone with their URL: it is only given with the
     * recipe (its share link), and its id is random like a share token. A private recipe's
     * photos are only served to its owner.
     */
    async readImage(
      imageId: string,
      viewerId: string | null,
      size: 'full' | 'thumb',
    ): Promise<{ contentType: string; data: Buffer; public: boolean } | NotFound> {
      const image = await repository.findImage(imageId, size);
      if (!image) return NOT_FOUND;
      if (image.visibility === 'private' && image.ownerId !== viewerId) return NOT_FOUND;
      return {
        contentType: image.contentType,
        data: image.data,
        public: image.visibility === 'public',
      };
    },

    /**
     * The idea of the day: a recipe that can be cooked, among the user's and the public ones,
     * the same all day for this user (another one for each `n`). The one shown (`exclude`) is
     * only given again when it is the only one.
     */
    async idea(userId: string, query: RecipeIdeaQuery): Promise<{ recipe: RecipeSummary | null }> {
      const seed = `${userId}:${query.day}:${query.n}`;
      const row =
        (await repository.pick(userId, seed, query.exclude)) ??
        (query.exclude ? await repository.pick(userId, seed) : undefined);
      return { recipe: row ? summary(row) : null };
    },

    async listMine(userId: string, search: RecipeSearch): Promise<RecipePage> {
      const query = await listQuery(search);
      return query ? page(repository.listByOwner(userId, query)) : EMPTY_PAGE;
    },

    async gallery(search: RecipeSearch): Promise<RecipePage> {
      const query = await listQuery(search);
      return query ? page(repository.listPublic(query)) : EMPTY_PAGE;
    },
  };
}

export type RecipesService = ReturnType<typeof createRecipesService>;
