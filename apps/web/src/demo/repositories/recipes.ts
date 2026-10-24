import type { Locale, RecipeScope } from '@cookit/shared';
import type {
  ListQuery,
  RecipeListRow,
  RecipeRow,
  RecipesRepository,
} from '../../../../server/src/modules/recipes/recipes.repository';
import type { DemoState, StoredRecipe } from '../state';

/** A stable pseudo-random order (the server uses md5 of the id and the seed). */
function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** `tarte:* & pomm:*` (built by the service) → the prefixes searched. */
const prefixesOf = (tsquery: string) =>
  tsquery
    .split('&')
    .map((term) => term.trim().replace(/:\*$/, ''))
    .filter(Boolean);

/** Every prefix starts a word of the text (no stemming: prefixes stand in for it). */
const matches = (searchText: string, prefixes: string[]) => {
  const words = searchText.split(/[^\p{L}\p{N}]+/u);
  return prefixes.every((prefix) => words.some((word) => word.startsWith(prefix)));
};

/** Recipes in memory, with the contract of the Drizzle repository (demo only). */
export function createMemoryRecipesRepository(state: () => DemoState): RecipesRepository {
  const s = state;
  const userOf = (id: string | null) => s().users.find((user) => user.id === id);
  const usernameOf = (id: string | null) => {
    const user = userOf(id);
    return user ? user.displayUsername || user.username : null;
  };
  const translation = (recipeId: string, lang: Locale) =>
    s().translations.find((t) => t.recipeId === recipeId && t.lang === lang);
  const imagesOf = (recipeId: string) => {
    void recipeId;
    // Photos are not part of the demo (no image server).
    return [] as string[];
  };

  const toRow = (recipe: StoredRecipe): RecipeRow | undefined => {
    const base = translation(recipe.id, recipe.baseLang);
    const owner = userOf(recipe.ownerId);
    if (!base || !owner) return undefined;
    const original = s().recipes.find((r) => r.id === recipe.copiedFromId);
    return {
      id: recipe.id,
      ownerId: recipe.ownerId,
      ownerName: owner.name,
      ownerUsername: usernameOf(recipe.ownerId) ?? '',
      ownerImage: owner.image,
      slug: recipe.slug,
      lang: recipe.baseLang,
      servings: recipe.servings,
      visibility: recipe.visibility,
      shareToken: recipe.shareToken,
      sourceUrl: recipe.sourceUrl,
      copiedFromId: recipe.copiedFromId,
      copiedFromOwnerId: recipe.copiedFromOwnerId,
      copiedFromOwnerName: userOf(recipe.copiedFromOwnerId)?.name ?? null,
      copiedFromOwnerUsername: usernameOf(recipe.copiedFromOwnerId),
      copiedFromVisibility: original?.visibility ?? null,
      title: base.title,
      description: base.description,
      summary: base.summary,
      extraMeta: base.extraMeta,
      bodyMarkdown: base.bodyMarkdown,
      tagIds: s()
        .recipeTags.filter((link) => link.recipeId === recipe.id)
        .map((link) => link.tagId),
      translations: s()
        .translations.filter((t) => t.recipeId === recipe.id && t.lang !== recipe.baseLang)
        .sort((a, b) => a.lang.localeCompare(b.lang))
        .map((t) => ({
          lang: t.lang,
          title: t.title,
          description: t.description,
          summary: t.summary,
          extraMeta: t.extraMeta,
          bodyMarkdown: t.bodyMarkdown,
          searchText: t.searchText,
        })),
      imageIds: imagesOf(recipe.id),
      hasSteps: recipe.hasSteps,
      authorNote: recipe.authorNote,
      createdAt: recipe.createdAt,
      updatedAt: recipe.updatedAt,
    };
  };

  const toListRow = (recipe: StoredRecipe, query: Pick<ListQuery, 'lang' | 'viewerId'>) => {
    const base = translation(recipe.id, recipe.baseLang);
    const owner = userOf(recipe.ownerId);
    if (!base || !owner) return undefined;
    const shown = (query.lang && translation(recipe.id, query.lang)) || base;
    const row: RecipeListRow = {
      id: recipe.id,
      lang: shown.lang,
      title: shown.title,
      description: shown.description,
      summary: shown.summary,
      servings: recipe.servings,
      visibility: recipe.visibility,
      ownerName: owner.name,
      ownerUsername: usernameOf(recipe.ownerId) ?? '',
      ownerImage: owner.image,
      hasSteps: recipe.hasSteps,
      updatedAt: recipe.updatedAt,
      coverId: imagesOf(recipe.id)[0] ?? null,
      mine: recipe.ownerId === query.viewerId,
    };
    return row;
  };

  /** Added by link, still readable (public, or unlisted with the token it was added with). */
  const savedBy = (userId: string, recipe: StoredRecipe) =>
    recipe.ownerId !== userId &&
    s().saved.some(
      (link) =>
        link.userId === userId &&
        link.recipeId === recipe.id &&
        (recipe.visibility === 'public' ||
          (recipe.visibility === 'unlisted' && link.shareToken === recipe.shareToken)),
    );

  const list = (where: (recipe: StoredRecipe) => boolean, query: ListQuery): RecipeListRow[] => {
    const prefixes = query.tsquery ? prefixesOf(query.tsquery) : [];
    const found = s().recipes.filter((recipe) => {
      if (!where(recipe)) return false;
      const tagIds = s()
        .recipeTags.filter((link) => link.recipeId === recipe.id)
        .map((link) => link.tagId);
      if ((query.tagIds ?? []).some((tagId) => !tagIds.includes(tagId))) return false;
      if (!prefixes.length) return true;
      const texts = [
        translation(recipe.id, recipe.baseLang)?.searchText ?? '',
        (query.lang && translation(recipe.id, query.lang)?.searchText) || '',
      ];
      return texts.some((text) => matches(text, prefixes));
    });
    found.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id));
    return found
      .slice(query.offset, query.offset + query.limit)
      .flatMap((recipe) => toListRow(recipe, query) ?? []);
  };

  const setTags = (recipeId: string, tagIds: string[]) => {
    const state = s();
    state.recipeTags = [
      ...state.recipeTags.filter((link) => link.recipeId !== recipeId),
      ...tagIds.map((tagId) => ({ recipeId, tagId })),
    ];
  };

  return {
    async create(recipe) {
      const state = s();
      if (state.recipes.some((r) => r.ownerId === recipe.ownerId && r.slug === recipe.slug)) {
        return 'slug_taken';
      }
      state.recipes.push({
        id: recipe.id,
        ownerId: recipe.ownerId,
        slug: recipe.slug,
        baseLang: recipe.lang,
        servings: recipe.servings,
        visibility: 'private',
        shareToken: null,
        sourceUrl: recipe.sourceUrl,
        copiedFromId: recipe.copiedFromId ?? null,
        copiedFromOwnerId: recipe.copiedFromOwnerId ?? null,
        hasSteps: recipe.hasSteps,
        authorNote: '',
        createdAt: recipe.now,
        updatedAt: recipe.now,
      });
      state.translations.push({
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
      for (const t of recipe.translations ?? []) {
        state.translations.push({ ...t, recipeId: recipe.id, updatedAt: recipe.now });
      }
      setTags(recipe.id, recipe.tagIds);
      return 'ok';
    },

    async findById(id) {
      const recipe = s().recipes.find((r) => r.id === id);
      return recipe && toRow(recipe);
    },

    async findByShareToken(token) {
      const recipe = s().recipes.find((r) => r.shareToken === token);
      return recipe && toRow(recipe);
    },

    async slugsStartingWith(ownerId, base) {
      return s()
        .recipes.filter((r) => r.ownerId === ownerId && r.slug.startsWith(base))
        .map((r) => r.slug);
    },

    async update(id, content, options) {
      const recipe = s().recipes.find((r) => r.id === id);
      if (!recipe) return 'not_found';
      if (options.baseVersion && recipe.updatedAt.getTime() !== options.baseVersion.getTime()) {
        return 'conflict';
      }
      Object.assign(recipe, {
        slug: content.slug,
        servings: content.servings,
        sourceUrl: content.sourceUrl,
        hasSteps: content.hasSteps,
        updatedAt: options.now,
      });
      const base = translation(id, recipe.baseLang);
      if (base) {
        Object.assign(base, {
          title: content.title,
          description: content.description,
          summary: content.summary,
          extraMeta: content.extraMeta,
          bodyMarkdown: content.bodyMarkdown,
          searchText: content.searchText,
          updatedAt: options.now,
        });
      }
      if (options.tagIds) setTags(id, options.tagIds);
      return 'ok';
    },

    async setVisibility(id, visibility, shareToken) {
      const recipe = s().recipes.find((r) => r.id === id);
      if (recipe) Object.assign(recipe, { visibility, shareToken });
    },

    async delete(id) {
      const state = s();
      state.recipes = state.recipes.filter((r) => r.id !== id);
      state.translations = state.translations.filter((t) => t.recipeId !== id);
      state.recipeTags = state.recipeTags.filter((link) => link.recipeId !== id);
      state.notes = state.notes.filter((note) => note.recipeId !== id);
      state.saved = state.saved.filter((link) => link.recipeId !== id);
    },

    async listLibrary(userId, scope: RecipeScope, query) {
      const mine = (r: StoredRecipe) => r.ownerId === userId;
      const where =
        scope === 'mine'
          ? mine
          : scope === 'saved'
            ? (r: StoredRecipe) => savedBy(userId, r)
            : (r: StoredRecipe) => mine(r) || savedBy(userId, r);
      return list(where, { ...query, viewerId: userId });
    },

    async listPublic(query) {
      return list((r) => r.visibility === 'public', query);
    },

    async listPublicOf(ownerId, query) {
      return list((r) => r.visibility === 'public' && r.ownerId === ownerId, query);
    },

    async pick(ownerId, seed, exclude, lang) {
      const candidates = s()
        .recipes.filter(
          (r) =>
            r.hasSteps && (r.ownerId === ownerId || r.visibility === 'public') && r.id !== exclude,
        )
        .sort((a, b) => hash(`${a.id}${seed}`) - hash(`${b.id}${seed}`));
      const first = candidates[0];
      return first && toListRow(first, { lang, viewerId: ownerId });
    },

    async listAllByOwner(ownerId) {
      return s()
        .recipes.filter((r) => r.ownerId === ownerId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .flatMap((recipe) => toRow(recipe) ?? []);
    },

    async saveTranslation(recipeId, lang, content, now) {
      const existing = translation(recipeId, lang);
      if (existing) Object.assign(existing, content, { updatedAt: now });
      else s().translations.push({ ...content, recipeId, lang, updatedAt: now });
    },

    async deleteTranslation(recipeId, lang) {
      const state = s();
      const before = state.translations.length;
      state.translations = state.translations.filter(
        (t) => !(t.recipeId === recipeId && t.lang === lang),
      );
      return state.translations.length < before;
    },

    async setAuthorNote(recipeId, text) {
      const recipe = s().recipes.find((r) => r.id === recipeId);
      if (recipe) recipe.authorNote = text;
    },

    async findNote(userId, recipeId) {
      return s().notes.find((note) => note.userId === userId && note.recipeId === recipeId)?.text;
    },

    async saveNote(userId, recipeId, text, now) {
      const state = s();
      state.notes = state.notes.filter((n) => !(n.userId === userId && n.recipeId === recipeId));
      if (text) state.notes.push({ userId, recipeId, text, updatedAt: now });
    },

    async findSaved(userId, recipeId) {
      const link = s().saved.find((l) => l.userId === userId && l.recipeId === recipeId);
      return link && { shareToken: link.shareToken };
    },

    async saveLink(userId, recipeId, shareToken, now) {
      const state = s();
      const link = state.saved.find((l) => l.userId === userId && l.recipeId === recipeId);
      if (link) link.shareToken = shareToken;
      else state.saved.push({ userId, recipeId, shareToken, createdAt: now });
    },

    async removeLink(userId, recipeId) {
      const state = s();
      state.saved = state.saved.filter((l) => !(l.userId === userId && l.recipeId === recipeId));
    },

    // Photos are not part of the demo: uploads are refused before reaching these.
    async addImage() {
      return 'too_many';
    },
    async deleteImage() {
      return false;
    },
    async orderImages() {
      return 'mismatch';
    },
    async findImage() {
      return undefined;
    },
    async imageBytesOfOwner() {
      return 0;
    },
    async imageBytesOfRecipe() {
      return 0;
    },
  };
}
