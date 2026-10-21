import { describe, expect, test } from 'bun:test';
import { SUPPORTED_LOCALES } from '../locale';
import { CURRENT_FORMAT } from '../recipe/meta-keys';
import { parseRecipe } from '../recipe/parse';
import { serializeRecipe } from '../recipe/serialize';
import { checkTranslationStructure } from '../recipe/translation';
import { MAX_RECIPE_MARKDOWN_LENGTH } from '../recipe/split';
import { DEFAULT_TAG_CATEGORIES, type TagCategory } from '../tags';
import { DEFAULT_UNITS } from '../units/catalog';
import { EXAMPLE_RECIPES } from './examples';
import { extractMarkdownBlock, importPrompt, promptExample, translationPrompt } from './prompts';

const categories: TagCategory[] = DEFAULT_TAG_CATEGORIES.map((category, i) => ({
  id: `c${i}`,
  slug: category.slug,
  position: i,
  multiple: category.multiple,
  labels: category.labels,
  tags: category.tags.map((tag, j) => ({
    id: `t${i}-${j}`,
    slug: tag.slug,
    categoryId: `c${i}`,
    position: j,
    labels: tag.labels,
  })),
}));
const allSlugs = new Set(categories.flatMap((category) => category.tags.map((tag) => tag.slug)));

const parse = (markdown: string) => parseRecipe(markdown, { units: DEFAULT_UNITS });

describe('importPrompt', () => {
  for (const locale of SUPPORTED_LOCALES) {
    for (const lang of SUPPORTED_LOCALES) {
      for (const withTags of [true, false]) {
        test(`the example parses without any diagnostic (${locale} → ${lang}, tags: ${withTags})`, () => {
          const prompt = importPrompt({
            locale,
            lang,
            tagCategories: withTags ? categories : [],
          });
          const example = extractMarkdownBlock(prompt);
          const result = parse(example);
          expect(result.ok).toBe(true);
          expect(result.diagnostics).toEqual([]);
          if (!result.ok) return;
          // Current version of the format, canonical form.
          expect(result.document.format).toBe(CURRENT_FORMAT);
          expect(serializeRecipe(result.document, { locale: lang, includeTags: true })).toBe(
            example,
          );
          // Every construct of the format is shown.
          expect(example).toContain('### ');
          expect(example).toContain('(timer:');
          expect(example).toContain('(q:)');
          if (withTags) {
            expect(result.document.tags.length).toBeGreaterThan(0);
            for (const slug of result.document.tags) expect(allSlugs.has(slug)).toBe(true);
          } else {
            expect(result.document.tags).toEqual([]);
            expect(prompt).not.toContain('tags:');
          }
        });
      }
    }
  }

  test('lists the tag ids by category, with single or multiple choice', () => {
    const prompt = importPrompt({ locale: 'en', lang: 'en', tagCategories: categories });
    for (const slug of allSlugs) expect(prompt).toContain(slug);
    expect(prompt).toContain('(only one)');
    expect(prompt).toContain('(several allowed)');
  });

  test('a single-choice category never gets two tags in the example', () => {
    const single: TagCategory[] = [
      {
        ...categories[0]!,
        multiple: false,
        tags: [
          { ...categories[0]!.tags[0]!, slug: 'dessert' },
          { ...categories[0]!.tags[1]!, slug: 'vegetarien' },
        ],
      },
    ];
    const example = extractMarkdownBlock(
      importPrompt({ locale: 'fr', lang: 'fr', tagCategories: single }),
    );
    expect(example).toContain('tags: dessert\n');
  });

  test('the units come from the catalog, in the output language', () => {
    const units = [
      {
        slug: 'poignee',
        rounding: 'fraction' as const,
        labels: { fr: 'poignée', en: 'handful' },
        aliases: { fr: ['poignée'], en: ['handful'] },
      },
    ];
    expect(importPrompt({ locale: 'fr', lang: 'en', units })).toContain('handful');
    expect(importPrompt({ locale: 'fr', lang: 'fr', units })).toContain('poignée');
  });

  test('is written in the interface language and asks for the output language', () => {
    const prompt = importPrompt({ locale: 'fr', lang: 'en' });
    expect(prompt).toContain('Écris la recette en anglais');
    expect(prompt).toContain('servings: N');
    expect(importPrompt({ locale: 'en', lang: 'fr' })).toContain('Write the recipe in French');
  });

  test('asks for nothing made up and a code block only', () => {
    const prompt = importPrompt({ locale: 'en', lang: 'en' });
    expect(prompt).toContain('Make nothing up');
    expect(prompt).toContain('Answer only with a markdown code block');
  });
});

describe('translationPrompt', () => {
  test('contains the recipe, recoverable as written, and both languages', () => {
    const markdown = promptExample('fr');
    const prompt = translationPrompt({ locale: 'fr', from: 'fr', to: 'en', markdown });
    expect(prompt).toContain("Langue de départ : français. Langue d'arrivée : anglais.");
    expect(extractMarkdownBlock(prompt)).toBe(markdown);
  });

  test('backticks in the recipe cannot close its code block', () => {
    const markdown = '# Test\n\nportions: 2\n\n---\n\n- 1 ```odd``` thing\n\n---\n\n1. Mix.\n';
    const prompt = translationPrompt({ locale: 'en', from: 'en', to: 'fr', markdown });
    expect(prompt).toContain('````markdown\n');
    expect(extractMarkdownBlock(prompt)).toBe(markdown);
  });
});

describe('an AI answer checked against the original', () => {
  const base = parse(EXAMPLE_RECIPES.fr);
  const warnings = (answer: string) => {
    const translated = parse(extractMarkdownBlock(answer));
    if (!base.ok || !translated.ok) throw new Error('does not parse');
    return checkTranslationStructure(base.document, translated.document);
  };

  test('a correct translation is accepted without warning', () => {
    expect(
      warnings(`Here it is:\n\n\`\`\`markdown\n${EXAMPLE_RECIPES.en}\`\`\`\n\nEnjoy!`),
    ).toEqual([]);
  });

  test('a missing step gives a readable warning', () => {
    const answer = EXAMPLE_RECIPES.en.replace(
      '3. Top with the rest of the butter and the sugar.\n',
      '',
    );
    expect(warnings(answer)).toEqual([
      expect.objectContaining({
        code: 'translation_item_count',
        params: { part: 'steps', group: 2, expected: 3, found: 2 },
      }),
    ]);
  });

  test('a missing timer gives a readable warning', () => {
    const answer = EXAMPLE_RECIPES.en.replace('[1 h](timer:1h "batter rest")', '1 hour');
    expect(warnings(answer)).toEqual([
      expect.objectContaining({
        code: 'translation_timers',
        params: expect.objectContaining({ step: 2 }),
      }),
    ]);
  });
});

describe('extractMarkdownBlock', () => {
  test('text without code block: the whole text', () => {
    expect(extractMarkdownBlock('  # Title\n\nportions: 2\n  ')).toBe('# Title\n\nportions: 2\n');
  });

  test('text around the block is dropped', () => {
    expect(extractMarkdownBlock('Sure!\n```md\n# A\n```\nAnything else?')).toBe('# A\n');
  });

  test('tildes, Windows line ends and an unclosed block', () => {
    expect(extractMarkdownBlock('~~~\r\n# A\r\n~~~')).toBe('# A\n');
    expect(extractMarkdownBlock('```markdown\n# A\n\nportions: 2')).toBe('# A\n\nportions: 2\n');
  });

  test('the longest block wins; a shorter or different fence does not close it', () => {
    const answer = '```\nnote\n```\n\n````markdown\n# Recipe\n```\nnot closed\n~~~\n````\n';
    expect(extractMarkdownBlock(answer)).toBe('# Recipe\n```\nnot closed\n~~~\n');
  });

  test('a fence indented by four spaces is not a code block', () => {
    const answer = '    ```\n# A\n    ```\n';
    expect(extractMarkdownBlock(answer)).toBe('```\n# A\n    ```\n');
  });

  test('a line with an info string does not close a block', () => {
    expect(extractMarkdownBlock('```\n# A\n```markdown\nB\n```\n')).toBe('# A\n```markdown\nB\n');
  });

  test('an empty block falls back to the other blocks, else gives an empty text', () => {
    expect(extractMarkdownBlock('```\n```\n```\n# A\n```\n')).toBe('# A\n');
    expect(extractMarkdownBlock('```\n```').trim()).toBe('');
  });

  test('is stable when applied twice', () => {
    for (const answer of ['Sure\n```md\n# A\n\nportions: 2\n```\nbye', '# A\n', '~~~\nx\n~~~']) {
      const once = extractMarkdownBlock(answer);
      expect(extractMarkdownBlock(once)).toBe(once);
    }
  });

  test('hostile and huge answers stay fast and bounded', () => {
    const limit = MAX_RECIPE_MARKDOWN_LENGTH * 2;
    const cases = [
      '```\n'.repeat(200_000),
      '`'.repeat(5_000_000),
      '```markdown\n' + 'a\n'.repeat(3_000_000),
      '~~~\n```\n'.repeat(300_000),
      '\r'.repeat(3_000_000),
      ' '.repeat(3_000_000) + '```',
    ];
    for (const answer of cases) {
      const start = performance.now();
      const result = extractMarkdownBlock(answer);
      expect(performance.now() - start).toBeLessThan(2000);
      expect(result.length).toBeLessThanOrEqual(limit + 1);
    }
  });
});

describe('prompt examples and bounds', () => {
  for (const lang of SUPPORTED_LOCALES) {
    test(`promptExample(${lang}) parses without diagnostic, with and without tags`, () => {
      for (const tags of [[], ['dessert', 'vegetarien']]) {
        const example = promptExample(lang, tags);
        const result = parse(example);
        expect(result.ok).toBe(true);
        expect(result.diagnostics).toEqual([]);
        if (result.ok) {
          expect(result.document.tags).toEqual(tags);
          expect(result.document.format).toBe(CURRENT_FORMAT);
        }
        expect(example).toContain(`format: ${CURRENT_FORMAT}`);
      }
    });
  }

  test('the French and English examples have the same structure', () => {
    const fr = parse(EXAMPLE_RECIPES.fr);
    const en = parse(EXAMPLE_RECIPES.en);
    if (!fr.ok || !en.ok) throw new Error('does not parse');
    expect(checkTranslationStructure(fr.document, en.document)).toEqual([]);
  });

  test('a huge catalog and tag list keep the prompt bounded', () => {
    const units = Array.from({ length: 1000 }, (_, i) => ({
      slug: `u${i}`,
      rounding: 'fraction' as const,
      labels: { fr: `u${i}`, en: `u${i}` },
      aliases: { fr: [`unitefr${i}`], en: [`unitx${i}`] },
    }));
    const tags = Array.from({ length: 1000 }, (_, j) => ({
      id: `t${j}`,
      slug: `slug${j}`,
      categoryId: 'c',
      position: j,
      labels: { fr: `Etiquette ${j}`, en: `Tag ${j}` },
    }));
    const category: TagCategory = {
      id: 'c',
      slug: 'cat',
      position: 0,
      multiple: true,
      labels: { fr: 'Cat', en: 'Cat' },
      tags,
    };
    const prompt = importPrompt({ locale: 'en', lang: 'en', units, tagCategories: [category] });
    expect(prompt).toContain('unitx99');
    expect(prompt).not.toContain('unitx100,');
    expect(prompt).toContain('slug299 ');
    expect(prompt).not.toContain('slug300 ');
  });

  test('a recipe holding a lone fence line cannot break the translation prompt', () => {
    const markdown = '# T\n\nservings: 2\n\n---\n\n- a\n\n---\n\n1. x\n```\n2. y\n';
    const prompt = translationPrompt({ locale: 'en', from: 'en', to: 'fr', markdown });
    expect(extractMarkdownBlock(prompt)).toBe(markdown);
  });
});

test('a recipe with very many backtick runs still gets a prompt', () => {
  const markdown = `# T\n\nportions: 1\n\n---\n\n---\n\n1. ${'`a'.repeat(100_000)}\n`;
  const prompt = translationPrompt({ locale: 'en', from: 'en', to: 'fr', markdown });
  expect(prompt).toContain('``markdown\n# T');
});
