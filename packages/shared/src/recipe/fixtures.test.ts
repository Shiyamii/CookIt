import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parseRecipe } from './parse';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('example recipes', () => {
  test('crêpes: simple recipe without groups', () => {
    const result = parseRecipe(fixture('crepes.md'));
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.diagnostics).toEqual([]);
    expect(result.document).toMatchObject({ title: 'Crêpes', servings: 4, format: 1 });
    expect(result.document.ingredientGroups.map((g) => g.items.length)).toEqual([5]);
    expect(result.document.stepGroups.map((g) => g.items.length)).toEqual([4]);
  });

  test('bœuf bourguignon: groups, metadata, continuations and text lines', () => {
    const result = parseRecipe(fixture('boeuf-bourguignon.md'));
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    expect(result.diagnostics).toEqual([]);
    const doc = result.document;
    expect(doc).toMatchObject({
      title: 'Bœuf bourguignon',
      servings: 6,
      source: 'Livre de cuisine familial',
      tags: ['plat-principal', 'française', 'mijoté'],
    });
    expect({ ...doc.extraMeta }).toEqual({ 'temps-total': '3 h 30', Difficulté: 'moyenne' });
    expect(doc.ingredientGroups.map((g) => [g.name, g.items.length])).toEqual([
      ['Pour la marinade', 6],
      ['Pour la cuisson', 8],
      ['Pour servir', 1],
    ]);
    expect(doc.stepGroups.map((g) => [g.name, g.items.map((item) => item.kind)])).toEqual([
      ['La veille', ['step', 'step', 'step']],
      ['Le jour même', ['step', 'step', 'step', 'step', 'step', 'step', 'text']],
      ['Finition', ['step', 'step', 'step']],
    ]);
  });
});
