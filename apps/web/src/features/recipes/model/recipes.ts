import type {
  Diagnostic,
  Locale,
  RecipeCreateInput,
  RecipeDetail,
  RecipePage,
  RecipeSaveInput,
  RecipeVisibility,
} from '@cookit/shared';
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';

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

function searchParams(q: string, page: number): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function fetchMyRecipes(q: string, page: number): Promise<RecipePage> {
  return apiGet<RecipePage>(`/recipes${searchParams(q, page)}`);
}

export function fetchGallery(q: string, page: number): Promise<RecipePage> {
  return apiGet<RecipePage>(`/gallery${searchParams(q, page)}`);
}

export function fetchRecipe(id: string): Promise<RecipeDetail> {
  return apiGet<RecipeDetail>(`/recipes/${encodeURIComponent(id)}`);
}

/** An unlisted recipe from its share link (the token goes in the body, never in a URL). */
export function fetchSharedRecipe(token: string): Promise<RecipeDetail> {
  return apiPost<RecipeDetail>('/shared', { token });
}

export function createRecipe(input: RecipeCreateInput): Promise<{ id: string }> {
  return withDiagnostics(apiPost<{ id: string }>('/recipes', input));
}

export function createRecipeFromMarkdown(markdown: string, lang: Locale): Promise<{ id: string }> {
  return withDiagnostics(apiPost<{ id: string }>('/recipes/markdown', { markdown, lang }));
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
): Promise<{ updatedAt: string }> {
  return withDiagnostics(
    apiPut<{ updatedAt: string }>(`/recipes/${encodeURIComponent(id)}/markdown`, {
      markdown,
      baseVersion,
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

/** "Add to my library": the share token is needed when the recipe is unlisted. */
export function copyRecipe(id: string, token?: string): Promise<{ id: string }> {
  return apiPost<{ id: string }>(`/recipes/${encodeURIComponent(id)}/copy`, token ? { token } : {});
}
