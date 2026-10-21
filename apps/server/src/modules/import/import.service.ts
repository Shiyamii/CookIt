import {
  extractJsonLd,
  findRecipe,
  recipeFromJsonLd,
  type ImportedRecipe,
  type Locale,
} from '@cookit/shared';
import { SafeFetchError, type FetchError } from '../../lib/safe-fetch';

export type ImportError = { error: FetchError | 'no_recipe' };

/**
 * Import by URL (plan §5.2): the page's schema.org Recipe (JSON-LD), as a recipe document for
 * the preview. Nothing is saved here: the user checks the preview and validates the tags first.
 */
export function createImportService(deps: {
  /** Fetches a public page (SSRF-safe); throws an error with a `FetchError` code. */
  fetchHtml: (url: string) => Promise<{ url: string; html: string }>;
}) {
  return {
    async fromUrl(url: string, locale: Locale): Promise<ImportedRecipe | ImportError> {
      let page: { url: string; html: string };
      try {
        page = await deps.fetchHtml(url);
      } catch (error) {
        // Only our own codes reach the client (never a Node error code).
        return { error: error instanceof SafeFetchError ? error.code : 'fetch_failed' };
      }
      const recipe = findRecipe(extractJsonLd(page.html));
      if (!recipe) return { error: 'no_recipe' };
      return recipeFromJsonLd(recipe, page.url, locale);
    },
  };
}

export type ImportService = ReturnType<typeof createImportService>;
