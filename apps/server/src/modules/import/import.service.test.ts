import { describe, expect, test } from 'bun:test';
import { parseRecipe } from '@cookit/shared';
import { SafeFetchError, type FetchError } from '../../lib/safe-fetch';
import { createImportService } from './import.service';

const page = (recipe: string) =>
  `<html><script type="application/ld+json">${recipe}</script></html>`;

const recipeJson = JSON.stringify({
  '@type': 'Recipe',
  name: 'Crêpes',
  recipeYield: '4',
  recipeIngredient: ['250 g de farine', '3 œufs'],
  recipeInstructions: ['Mélanger.', 'Cuire 2 min.'],
  keywords: 'dessert, rapide',
});

describe('import service', () => {
  test('returns the recipe document, the final URL as source and the tag values', async () => {
    const service = createImportService({
      fetchHtml: async () => ({ url: 'https://site.test/final', html: page(recipeJson) }),
    });
    const result = await service.fromUrl('https://site.test/start', 'fr');
    if ('error' in result) throw new Error(result.error);
    const parsed = parseRecipe(result.markdown);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
    expect(parsed.document.source).toBe('https://site.test/final');
    expect(parsed.document.title).toBe('Crêpes');
    expect(result.tagValues).toEqual(['dessert', 'rapide']);
  });

  test('passes the requested URL to the fetcher', async () => {
    let asked = '';
    const service = createImportService({
      fetchHtml: async (url) => {
        asked = url;
        return { url, html: page(recipeJson) };
      },
    });
    await service.fromUrl('https://site.test/r', 'en');
    expect(asked).toBe('https://site.test/r');
  });

  test.each<FetchError>([
    'invalid_url',
    'blocked_address',
    'fetch_failed',
    'too_large',
    'timeout',
    'not_html',
  ])('fetch error %s is returned as is', async (code) => {
    const service = createImportService({
      fetchHtml: async () => {
        throw new SafeFetchError(code);
      },
    });
    expect(await service.fromUrl('https://site.test/', 'fr')).toEqual({ error: code });
  });

  test.each([new Error('boom'), { code: 'ERR_INVALID_URL' }, { code: 'blocked_address' }, 'text'])(
    'a thrown value that is not a SafeFetchError becomes fetch_failed (%#)',
    async (thrown) => {
      const service = createImportService({
        fetchHtml: async () => {
          throw thrown;
        },
      });
      expect(await service.fromUrl('https://site.test/', 'fr')).toEqual({ error: 'fetch_failed' });
    },
  );

  test('an unexpected error becomes fetch_failed and its message is not exposed', async () => {
    const service = createImportService({
      fetchHtml: async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.1:5432');
      },
    });
    expect(await service.fromUrl('https://site.test/', 'fr')).toEqual({ error: 'fetch_failed' });
  });

  test.each([
    ['no JSON-LD', '<html><body>nothing</body></html>'],
    ['JSON-LD without recipe', page('{"@type":"Article","name":"x"}')],
    ['invalid JSON-LD', page('{broken')],
    ['empty page', ''],
  ])('%s gives no_recipe', async (_name, html) => {
    const service = createImportService({
      fetchHtml: async () => ({ url: 'https://site.test/', html }),
    });
    expect(await service.fromUrl('https://site.test/', 'fr')).toEqual({ error: 'no_recipe' });
  });

  test('a recipe without servings is returned, so the preview can ask for them', async () => {
    const service = createImportService({
      fetchHtml: async () => ({
        url: 'https://site.test/',
        html: page('{"@type":"Recipe","name":"Soupe"}'),
      }),
    });
    const result = await service.fromUrl('https://site.test/', 'en');
    if ('error' in result) throw new Error(result.error);
    expect(result.markdown).toContain('# Soupe');
    expect(result.markdown).not.toMatch(/^(portions|servings):/m);
  });
});
