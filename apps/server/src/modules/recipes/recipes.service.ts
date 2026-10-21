import {
  composeRecipeMarkdown,
  fold,
  parseRecipe,
  RECIPES_PAGE_SIZE,
  serializeBody,
  type Diagnostic,
  type Locale,
  type RecipeCreateInput,
  type RecipeDetail,
  type RecipeDocument,
  type RecipeFields,
  type RecipePage,
  type RecipeSaveInput,
  type RecipeSearch,
  type RecipeVisibility,
  type Unit,
} from '@cookit/shared';
import type { RecipeContent, RecipeRow, RecipesRepository } from './recipes.repository';

/** A recipe that does not parse: the diagnostics say why (translated by the UI). */
export type InvalidRecipe = { error: 'invalid_recipe'; diagnostics: Diagnostic[] };
export type NotFound = { error: 'not_found' };
export type Conflict = { error: 'conflict' };

const NOT_FOUND: NotFound = { error: 'not_found' };
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
  /** The unit catalog for parsing (the `units` table from phase 4b). */
  units: () => readonly Unit[];
  generateToken: () => string;
  newId?: () => string;
  now?: () => Date;
}) {
  const { repository } = deps;
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  const shareUrl = (token: string) => `${deps.origin}/shared#token=${token}`;

  const toDetail = (row: RecipeRow, viewerId: string | null): RecipeDetail => {
    const isOwner = row.ownerId === viewerId;
    return {
      id: row.id,
      lang: row.lang,
      title: row.title,
      description: row.description,
      servings: row.servings,
      source: row.sourceUrl,
      extraMeta: row.extraMeta,
      body: row.bodyMarkdown,
      visibility: row.visibility,
      ownerName: row.ownerName,
      isOwner,
      shareUrl:
        isOwner && row.visibility === 'unlisted' && row.shareToken
          ? shareUrl(row.shareToken)
          : null,
      copiedFromId: row.copiedFromId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  };

  /** Parses the document; the canonical columns and body come from the parsed recipe. */
  const parseDocument = (markdown: string): { document: RecipeDocument } | InvalidRecipe => {
    const result = parseRecipe(markdown, { units: deps.units() });
    if (!result.ok) return { error: 'invalid_recipe', diagnostics: result.diagnostics };
    return { document: result.document };
  };

  /** The visual editor's columns and body, checked by parsing the document they compose. */
  const parseFields = (fields: RecipeFields, body: string, lang: Locale) =>
    parseDocument(composeRecipeMarkdown(fields, body, { locale: lang }));

  const content = (document: RecipeDocument, lang: Locale, slug: string): RecipeContent => ({
    slug,
    servings: document.servings,
    sourceUrl: document.source ?? null,
    title: document.title,
    description: document.description,
    // The parser builds it without prototype (no `__proto__` key can matter); Drizzle needs a
    // plain object.
    extraMeta: { ...document.extraMeta },
    bodyMarkdown: serializeBody(document, { locale: lang }),
    searchText: searchText(document),
  });

  const slugFor = async (ownerId: string, title: string, current?: string) => {
    const base = slugify(title);
    // A title change that keeps the same slug base keeps the slug (and its suffix).
    if (current && (current === base || new RegExp(`^${base}-\\d+$`).test(current))) {
      return current;
    }
    return freeSlug(base, await repository.slugsStartingWith(ownerId, base));
  };

  const insert = async (
    ownerId: string,
    document: RecipeDocument,
    lang: Locale,
    copiedFromId: string | null = null,
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
        copiedFromId,
        now: now(),
      });
      if (result === 'ok') return { id };
      if (attempt >= 2) throw new Error('No free slug');
    }
  };

  /** The recipe if `userId` owns it (others get not_found, never forbidden). */
  const owned = async (id: string, userId: string) => {
    const row = await repository.findById(id);
    return row && row.ownerId === userId ? row : undefined;
  };

  const save = async (
    row: RecipeRow,
    document: RecipeDocument,
    baseVersion: string | undefined,
  ): Promise<{ updatedAt: string } | NotFound | Conflict> => {
    const at = now();
    const result = await repository.update(
      row.id,
      content(document, row.lang, await slugFor(row.ownerId, document.title, row.slug)),
      { baseVersion: baseVersion ? new Date(baseVersion) : undefined, now: at },
    );
    if (result === 'not_found') return NOT_FOUND;
    if (result === 'conflict') return { error: 'conflict' };
    return { updatedAt: at.toISOString() };
  };

  const page = async (
    rows: Promise<Awaited<ReturnType<RecipesRepository['listPublic']>>>,
  ): Promise<RecipePage> => {
    const found = await rows;
    return {
      recipes: found.slice(0, RECIPES_PAGE_SIZE).map((row) => ({
        ...row,
        updatedAt: row.updatedAt.toISOString(),
      })),
      hasMore: found.length > RECIPES_PAGE_SIZE,
    };
  };

  // One more row than a page tells whether there is a next page.
  const listQuery = (search: RecipeSearch) => ({
    tsquery: searchQuery(search.q),
    limit: RECIPES_PAGE_SIZE + 1,
    offset: (search.page - 1) * RECIPES_PAGE_SIZE,
  });

  return {
    async create(ownerId: string, input: RecipeCreateInput) {
      const parsed = parseFields(input, input.body, input.lang);
      if ('error' in parsed) return parsed;
      return insert(ownerId, parsed.document, input.lang);
    },

    async createFromMarkdown(ownerId: string, input: { markdown: string; lang: Locale }) {
      const parsed = parseDocument(input.markdown);
      if ('error' in parsed) return parsed;
      return insert(ownerId, parsed.document, input.lang);
    },

    /** A recipe as `viewerId` (null: anonymous) may read it from its id: owner or public. */
    async get(id: string, viewerId: string | null): Promise<RecipeDetail | NotFound> {
      const row = await repository.findById(id);
      if (!row) return NOT_FOUND;
      if (row.ownerId !== viewerId && row.visibility !== 'public') return NOT_FOUND;
      return toDetail(row, viewerId);
    },

    /** A recipe from its share link: only while it is unlisted (the link is revoked otherwise). */
    async getShared(token: string, viewerId: string | null): Promise<RecipeDetail | NotFound> {
      const row = await repository.findByShareToken(token);
      if (!row || row.visibility !== 'unlisted') return NOT_FOUND;
      return toDetail(row, viewerId);
    },

    async update(id: string, userId: string, input: RecipeSaveInput) {
      const row = await owned(id, userId);
      if (!row) return NOT_FOUND;
      const parsed = parseFields(input, input.body, row.lang);
      if ('error' in parsed) return parsed;
      return save(row, parsed.document, input.baseVersion);
    },

    async updateFromMarkdown(
      id: string,
      userId: string,
      input: { markdown: string; baseVersion?: string },
    ) {
      const row = await owned(id, userId);
      if (!row) return NOT_FOUND;
      const parsed = parseDocument(input.markdown);
      if ('error' in parsed) return parsed;
      return save(row, parsed.document, input.baseVersion);
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
      const token =
        visibility !== 'unlisted'
          ? null
          : row.visibility === 'unlisted' && row.shareToken
            ? row.shareToken
            : deps.generateToken();
      await repository.setVisibility(id, visibility, token);
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
      const parsed = parseFields(
        {
          title: row.title,
          description: row.description,
          servings: row.servings,
          source: row.sourceUrl ?? undefined,
          extraMeta: row.extraMeta,
        },
        row.bodyMarkdown,
        row.lang,
      );
      if ('error' in parsed) return parsed;
      return insert(userId, parsed.document, row.lang, row.id);
    },

    listMine(userId: string, search: RecipeSearch): Promise<RecipePage> {
      return page(repository.listByOwner(userId, listQuery(search)));
    },

    gallery(search: RecipeSearch): Promise<RecipePage> {
      return page(repository.listPublic(listQuery(search)));
    },
  };
}

export type RecipesService = ReturnType<typeof createRecipesService>;
