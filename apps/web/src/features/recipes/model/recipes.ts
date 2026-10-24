import type {
  Diagnostic,
  Locale,
  RecipeImage,
  RecipeCreateInput,
  RecipeDetail,
  RecipePage,
  RecipeSaveInput,
  RecipeScope,
  RecipeVisibility,
} from '@cookit/shared';
import { ApiError, apiDelete, apiGet, apiPost, apiPut, apiUpload } from '@/lib/api';
import { preparePhoto } from '@/lib/images';

export const RECIPES_QUERY_KEY = ['recipes'] as const;

/** The server refused a recipe that does not parse: its diagnostics say why. */
export class InvalidRecipeError extends ApiError {
  constructor(readonly diagnostics: Diagnostic[]) {
    super(422, 'invalid_recipe');
  }
}

/** Turns a 422 answer into an InvalidRecipeError carrying the diagnostics. */
async function withDiagnostics<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'invalid_recipe') {
      const diagnostics = error.details?.diagnostics;
      throw new InvalidRecipeError(Array.isArray(diagnostics) ? (diagnostics as Diagnostic[]) : []);
    }
    throw error;
  }
}

function searchParams(
  q: string,
  page: number,
  tags: readonly string[],
  lang?: Locale,
  scope: RecipeScope = 'all',
): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (lang) params.set('lang', lang);
  if (tags.length) params.set('tags', tags.join(','));
  if (scope !== 'all') params.set('scope', scope);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Recipes matching the words `q` and having all the `tags` (slugs), shown in `lang` when they
 * have that translation. My recipes: the user's own and the ones added by link (`scope`).
 */
export function fetchMyRecipes(
  q: string,
  page: number,
  tags: readonly string[],
  lang?: Locale,
  scope?: RecipeScope,
): Promise<RecipePage> {
  return apiGet<RecipePage>(`/recipes${searchParams(q, page, tags, lang, scope)}`);
}

export function fetchGallery(
  q: string,
  page: number,
  tags: readonly string[],
  lang?: Locale,
): Promise<RecipePage> {
  return apiGet<RecipePage>(`/gallery${searchParams(q, page, tags, lang)}`);
}

/** A recipe in `lang` if it has that translation, in its base language otherwise (or if omitted). */
export function fetchRecipe(id: string, lang?: Locale): Promise<RecipeDetail> {
  const query = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  return apiGet<RecipeDetail>(`/recipes/${encodeURIComponent(id)}${query}`);
}

/** An unlisted recipe from its share link (the token goes in the body, never in a URL). */
export function fetchSharedRecipe(token: string, lang?: Locale): Promise<RecipeDetail> {
  return apiPost<RecipeDetail>('/shared', lang ? { token, lang } : { token });
}

export function createRecipe(input: RecipeCreateInput): Promise<{ id: string }> {
  return withDiagnostics(apiPost<{ id: string }>('/recipes', input));
}

export function createRecipeFromMarkdown(
  markdown: string,
  lang: Locale,
  tagIds: string[],
): Promise<{ id: string }> {
  return withDiagnostics(apiPost<{ id: string }>('/recipes/markdown', { markdown, lang, tagIds }));
}

export function saveRecipe(id: string, input: RecipeSaveInput): Promise<{ updatedAt: string }> {
  return withDiagnostics(
    apiPut<{ updatedAt: string }>(`/recipes/${encodeURIComponent(id)}`, input),
  );
}

export function saveRecipeMarkdown(
  id: string,
  markdown: string,
  baseVersion: string,
  tagIds: string[],
): Promise<{ updatedAt: string }> {
  return withDiagnostics(
    apiPut<{ updatedAt: string }>(`/recipes/${encodeURIComponent(id)}/markdown`, {
      markdown,
      baseVersion,
      tagIds,
    }),
  );
}

export function setVisibility(
  id: string,
  visibility: RecipeVisibility,
): Promise<{ visibility: RecipeVisibility; shareUrl: string | null }> {
  return apiPut(`/recipes/${encodeURIComponent(id)}/visibility`, { visibility });
}

export async function deleteRecipe(id: string): Promise<void> {
  await apiDelete(`/recipes/${encodeURIComponent(id)}`);
}

/** The signed-in reader's private note (`''` removes it); `token` for an unlisted recipe. */
export function saveMyNote(id: string, text: string, token?: string) {
  return apiPut<{ myNote: string | null }>(`/recipes/${encodeURIComponent(id)}/note`, {
    text,
    ...(token && { token }),
  });
}

/** The author's public note (owner only; `''` removes it). */
export function saveAuthorNote(id: string, text: string) {
  return apiPut<{ authorNote: string }>(`/recipes/${encodeURIComponent(id)}/author-note`, {
    text,
  });
}

/** "Add to my recipes": a link, not a copy (`token` for an unlisted recipe). */
export function saveRecipeLink(id: string, token?: string): Promise<{ saved: true }> {
  return apiPut(`/recipes/${encodeURIComponent(id)}/saved`, token ? { token } : {});
}

export async function removeRecipeLink(id: string): Promise<void> {
  await apiDelete(`/recipes/${encodeURIComponent(id)}/saved`);
}

/** "Make a copy in my recipes" (`token` for an unlisted recipe not added by link). */
export function copyRecipe(id: string, token?: string): Promise<{ id: string }> {
  return apiPost<{ id: string }>(`/recipes/${encodeURIComponent(id)}/copy`, token ? { token } : {});
}

/**
 * Adds or replaces a translation (not the base language). Saved even when its structure differs
 * from the base language: the warnings say how.
 */
export function saveTranslation(
  id: string,
  lang: Locale,
  markdown: string,
): Promise<{ updatedAt: string; warnings: Diagnostic[] }> {
  return withDiagnostics(
    apiPut(`/recipes/${encodeURIComponent(id)}/translations/${encodeURIComponent(lang)}`, {
      markdown,
    }),
  );
}

export async function deleteTranslation(id: string, lang: Locale): Promise<void> {
  await apiDelete(`/recipes/${encodeURIComponent(id)}/translations/${encodeURIComponent(lang)}`);
}

/** Adds a photo after the others (resized in the browser, with its thumbnail). */
export async function uploadRecipeImage(id: string, file: Blob): Promise<RecipeImage> {
  const { image, thumb } = await preparePhoto(file);
  const form = new FormData();
  form.append('image', image);
  form.append('thumb', thumb);
  return apiUpload<RecipeImage>('POST', `/recipes/${encodeURIComponent(id)}/images`, form);
}

export async function deleteRecipeImage(id: string, imageId: string): Promise<void> {
  await apiDelete(`/recipes/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}`);
}

/** New order of the photos: all of them, the cover first. */
export async function orderRecipeImages(id: string, ids: string[]): Promise<void> {
  await apiPut(`/recipes/${encodeURIComponent(id)}/images`, { ids });
}
