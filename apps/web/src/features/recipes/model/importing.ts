import {
  MAX_RECIPE_MARKDOWN_LENGTH,
  parseRecipe,
  splitTagValues,
  type Diagnostic,
  type RecipeDocument,
  type Unit,
} from '@cookit/shared';
import { apiPost } from '@/lib/api';

/**
 * Imports (plan §5.2): markdown pasted or read from `.md` files and zips, or a web page (JSON-LD,
 * converted by the server). Every import is previewed, its tags validated, then saved one recipe
 * at a time through the normal API.
 */

/** Bounds on files read in the browser (checked before reading or inflating). */
export const IMPORT_LIMITS = {
  /** A `.md` file. */
  markdownBytes: 1024 * 1024,
  /** A zip file. */
  zipBytes: 20 * 1024 * 1024,
  /** Recipes in a zip. */
  zipEntries: 300,
  /** One recipe inside a zip, uncompressed. */
  entryBytes: 1024 * 1024,
  /** All the recipes of a zip, uncompressed (no zip bomb). */
  totalBytes: 50 * 1024 * 1024,
} as const;

export type ImportSource = { name: string; markdown: string };

export type ImportError =
  'file_too_large' | 'zip_too_large' | 'not_a_recipe_file' | 'unreadable_zip';

export class ImportFileError extends Error {
  constructor(readonly code: ImportError) {
    super(code);
  }
}

const isMarkdown = (name: string) => /\.(md|markdown|txt)$/i.test(name);

/** The recipes of a `.md` file or a zip of `.md` files. */
export async function readImportFile(file: File): Promise<ImportSource[]> {
  if (/\.zip$/i.test(file.name) || file.type === 'application/zip') {
    if (file.size > IMPORT_LIMITS.zipBytes) throw new ImportFileError('zip_too_large');
    const { unzipSync, strFromU8 } = await import('fflate');
    let total = 0;
    let entries = 0;
    let tooBig = false;
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
        // Decided from the declared sizes, before anything is inflated.
        filter: (entry) => {
          if (!isMarkdown(entry.name) || entry.name.includes('__MACOSX/')) return false;
          entries += 1;
          total += entry.originalSize;
          if (
            entry.originalSize > IMPORT_LIMITS.entryBytes ||
            entries > IMPORT_LIMITS.zipEntries ||
            total > IMPORT_LIMITS.totalBytes
          ) {
            tooBig = true;
            return false;
          }
          return true;
        },
      });
    } catch {
      throw new ImportFileError('unreadable_zip');
    }
    if (tooBig) throw new ImportFileError('zip_too_large');
    const sources = Object.entries(files)
      .map(([name, data]) => ({ name: name.split('/').pop() ?? name, markdown: strFromU8(data) }))
      .filter((source) => source.markdown.length <= MAX_RECIPE_MARKDOWN_LENGTH);
    if (sources.length === 0) throw new ImportFileError('not_a_recipe_file');
    return sources.sort((a, b) => a.name.localeCompare(b.name));
  }
  if (!isMarkdown(file.name)) throw new ImportFileError('not_a_recipe_file');
  if (file.size > IMPORT_LIMITS.markdownBytes) throw new ImportFileError('file_too_large');
  return [{ name: file.name, markdown: await file.text() }];
}

export type ParsedImport =
  | { ok: true; document: RecipeDocument; diagnostics: Diagnostic[]; tagValues: string[] }
  | { ok: false; diagnostics: Diagnostic[]; tagValues: string[] };

/** A recipe document to preview, with the values of its `tags:` line. */
export function parseImport(markdown: string, units?: readonly Unit[]): ParsedImport {
  const result = parseRecipe(markdown, { units });
  if (!result.ok) return { ok: false, diagnostics: result.diagnostics, tagValues: [] };
  return {
    ok: true,
    document: result.document,
    diagnostics: result.diagnostics,
    tagValues: result.document.tags.flatMap(splitTagValues),
  };
}

/** A web page's recipe (schema.org JSON-LD), converted by the server. */
export function importFromUrl(
  url: string,
  lang: string,
): Promise<{ markdown: string; tagValues: string[] }> {
  return apiPost('/import/url', { url, lang });
}

/** A file name for a recipe: `tarte-aux-pommes.md`. */
export function markdownFileName(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'recette'}.md`;
}

/** Saves a text as a file of the user (the browser's download). */
export function downloadText(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "Export all my recipes": a zip built by the server. */
export const EXPORT_ALL_URL = '/api/v1/recipes/export';
