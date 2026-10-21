import {
  checkTranslationStructure,
  extractMarkdownBlock,
  parseRecipe,
  SUPPORTED_LOCALES,
  type Diagnostic,
  type Locale,
  type RecipeDocument,
  type Unit,
} from '@cookit/shared';

/**
 * Translations of a recipe (plan §5.6): never automatic. The user copies a prompt into an AI and
 * pastes its answer, previewed here with the parser's diagnostics and the structure warnings
 * (same groups, items, steps and timers as the base language).
 */

export type TranslationPreview =
  | { ok: true; markdown: string; document: RecipeDocument; diagnostics: Diagnostic[] }
  | { ok: false; markdown: string; diagnostics: Diagnostic[] };

/** The pasted answer (its code block if it has one), parsed and compared with the base recipe. */
export function translationPreview(
  answer: string,
  base: RecipeDocument | undefined,
  units?: readonly Unit[],
): TranslationPreview {
  const markdown = extractMarkdownBlock(answer);
  const result = parseRecipe(markdown, { units });
  if (!result.ok) return { ok: false, markdown, diagnostics: result.diagnostics };
  const structure = base ? checkTranslationStructure(base, result.document) : [];
  return {
    ok: true,
    markdown,
    document: result.document,
    diagnostics: [...result.diagnostics, ...structure],
  };
}

/** Languages a recipe can still be translated into. */
export function missingLanguages(languages: readonly Locale[]): Locale[] {
  return SUPPORTED_LOCALES.filter((locale) => !languages.includes(locale));
}

/** The language to read a recipe in: the one chosen, else the interface's (the server falls back). */
export function readingLanguage(
  chosen: string | null,
  interfaceLang: string | undefined,
): Locale | undefined {
  const pick = (value: string | null | undefined) =>
    SUPPORTED_LOCALES.find((locale) => locale === value);
  return pick(chosen) ?? pick(interfaceLang);
}
