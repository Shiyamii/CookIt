import { describe, expect, test } from 'bun:test';
import {
  checkTranslationStructure,
  DEFAULT_UNITS,
  parseRecipe,
  SUPPORTED_LOCALES,
  type RecipeDocument,
} from '@cookit/shared';
import { DEMO_RECIPES } from './recipes';

/** The parsed document, after checking it has no diagnostic at all (not even a warning). */
function parsed(markdown: string, label: string): RecipeDocument {
  const result = parseRecipe(markdown, { units: DEFAULT_UNITS });
  expect(result.diagnostics, label).toEqual([]);
  if (!result.ok) throw new Error(`${label}: not a recipe`);
  return result.document;
}

describe('demo recipes', () => {
  for (const recipe of DEMO_RECIPES) {
    test(`${recipe.key}: every language, without any diagnostic, with the same structure`, () => {
      const base = parsed(recipe.markdown, recipe.lang);
      const languages = [recipe.lang, ...Object.keys(recipe.translations ?? {})];
      expect(languages.toSorted()).toEqual([...SUPPORTED_LOCALES].toSorted());
      for (const [lang, markdown] of Object.entries(recipe.translations ?? {})) {
        expect(checkTranslationStructure(base, parsed(markdown, lang)), lang).toEqual([]);
      }
    });
  }
});
