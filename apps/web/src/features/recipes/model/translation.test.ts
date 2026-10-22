import { describe, expect, test } from 'bun:test';
import { DEFAULT_UNITS, EXAMPLE_RECIPES, parseRecipe } from '@cookit/shared';
import { missingLanguages, readingLanguage, translationPreview } from './translation';

const base = parseRecipe(EXAMPLE_RECIPES.fr, { units: DEFAULT_UNITS });
const baseDocument = base.ok ? base.document : undefined;

describe('translationPreview', () => {
  test('an AI answer with text around its code block: no warning when the structure matches', () => {
    const preview = translationPreview(
      `Here is the translation:\n\n\`\`\`markdown\n${EXAMPLE_RECIPES.en}\`\`\`\n`,
      baseDocument,
      DEFAULT_UNITS,
    );
    expect(preview.ok).toBe(true);
    expect(preview.diagnostics).toEqual([]);
    expect(preview.markdown).toBe(EXAMPLE_RECIPES.en);
  });

  test('a missing step or timer gives structure warnings, still saveable', () => {
    const answer = EXAMPLE_RECIPES.en
      .replace('3. Top with the rest of the butter and the sugar.\n', '')
      .replace('[1 h](timer:1h "batter rest")', 'an hour');
    const preview = translationPreview(answer, baseDocument, DEFAULT_UNITS);
    expect(preview.ok).toBe(true);
    expect(preview.diagnostics.map((d) => d.code).sort()).toEqual([
      'translation_item_count',
      'translation_timers',
    ]);
    expect(preview.diagnostics.every((d) => d.severity === 'warning')).toBe(true);
  });

  test('different servings are a warning', () => {
    const preview = translationPreview(
      EXAMPLE_RECIPES.en.replace('servings: 4', 'servings: 6'),
      baseDocument,
    );
    expect(preview.diagnostics.map((d) => d.code)).toEqual(['translation_servings']);
  });

  test('an answer that does not parse is not ok', () => {
    const preview = translationPreview('Sorry, I cannot do that.', baseDocument);
    expect(preview.ok).toBe(false);
    expect(preview.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  test('without a base document, only the parser diagnostics', () => {
    expect(translationPreview(EXAMPLE_RECIPES.en, undefined).diagnostics).toEqual([]);
  });
});

describe('translationPreview edge cases', () => {
  test('an empty answer is not ok', () => {
    expect(translationPreview('', baseDocument).ok).toBe(false);
  });

  test('an answer in a code block with a missing step keeps the block content as markdown', () => {
    const answer = `\`\`\`md\n${EXAMPLE_RECIPES.en.replace('3. Top with the rest of the butter and the sugar.\n', '')}\`\`\``;
    const preview = translationPreview(answer, baseDocument, DEFAULT_UNITS);
    expect(preview.markdown.startsWith('# Salted butter')).toBe(true);
    expect(preview.diagnostics.map((d) => d.code)).toEqual(['translation_item_count']);
  });
});

describe('missingLanguages', () => {
  test('the supported languages the recipe does not have yet', () => {
    expect(missingLanguages(['fr'])).toEqual(['en', 'hu']);
    expect(missingLanguages(['hu', 'fr'])).toEqual(['en']);
    expect(missingLanguages(['en', 'fr', 'hu'])).toEqual([]);
  });
});

describe('readingLanguage', () => {
  test('the chosen language, else the interface language, else none', () => {
    expect(readingLanguage('en', 'fr')).toBe('en');
    expect(readingLanguage(null, 'fr')).toBe('fr');
    expect(readingLanguage('de', 'en-US')).toBeUndefined();
    expect(readingLanguage(null, undefined)).toBeUndefined();
  });
});
