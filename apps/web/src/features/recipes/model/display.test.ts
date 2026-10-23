import { describe, expect, test } from 'bun:test';
import { parseRecipe } from '@cookit/shared';
import { displayRecipe, durationText, sourceLink } from './display';

const MD = `# Tarte

portions: 4
source: https://example.com/x

---

### Pâte

- 200 g farine
- 1 oeuf
- sel au goût

---

1. Mélanger [2 c. à soupe](q:) de sucre.
2. Cuire [10 min](timer:10m "four").
`;

function document() {
  const r = parseRecipe(MD);
  if (!r.ok) throw new Error('parse');
  return r.document;
}

describe('displayRecipe', () => {
  test('same servings leaves the text untouched', () => {
    const d = displayRecipe(document(), 4, 'fr');
    expect(d.ingredientGroups[0]!.name).toBe('Pâte');
    expect(d.ingredientGroups[0]!.items[0]).toEqual({ kind: 'ingredient', text: '200 g farine' });
  });
  test('scales ingredients and quantity links, never timers', () => {
    const d = displayRecipe(document(), 8, 'fr');
    expect(d.ingredientGroups[0]!.items[0]!.text).toBe('400 g farine');
    const [first, second] = d.stepGroups[0]!.items;
    expect(first).toMatchObject({ kind: 'step', number: 1 });
    expect(JSON.stringify(first)).toContain('4 c. à soupe');
    expect(JSON.stringify(second)).toContain('"seconds":600');
    expect(d.servings).toBe(8);
  });
  test('scales down', () => {
    const d = displayRecipe(document(), 1, 'en');
    expect(d.ingredientGroups[0]!.items[0]!.text).toBe('50 g farine');
  });
  test('a line without quantity stays as written', () => {
    const d = displayRecipe(document(), 8, 'fr');
    expect(d.ingredientGroups[0]!.items[2]!.text).toBe('sel au goût');
  });
  test('empty is true without steps', () => {
    const r = parseRecipe('# T\n\nportions: 2\n\n---\n\n- 1 oeuf\n\n---\n\n');
    if (!r.ok) throw new Error('parse');
    expect(displayRecipe(r.document, 2, 'fr').empty).toBe(true);
    expect(displayRecipe(document(), 4, 'fr').empty).toBe(false);
  });
  test('the source is passed through', () => {
    expect(displayRecipe(document(), 4, 'fr').source).toBe('https://example.com/x');
  });
});

describe('sourceLink', () => {
  test('only http and https URLs are links', () => {
    expect(sourceLink('https://example.com/a')).toBe('https://example.com/a');
    expect(sourceLink('http://example.com')).toBe('http://example.com/');
  });
  test('refuses other schemes, plain text and empty', () => {
    const bad = [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,x',
      'ftp://x.y',
      'mailto:a@b.c',
      'Grand-mère',
      '',
      null,
    ];
    for (const s of bad) expect(sourceLink(s)).toBeUndefined();
  });
});

describe('durationText', () => {
  test('formats seconds, minutes and hours', () => {
    expect(durationText(45)).toBe('45 s');
    expect(durationText(600)).toBe('10 min');
    expect(durationText(90)).toBe('1 min 30 s');
    expect(durationText(5400)).toBe('1 h 30');
    expect(durationText(3600)).toBe('1 h');
  });
});

describe('displayRecipe summary', () => {
  test('is the document summary, or empty', () => {
    expect(displayRecipe(document(), 4, 'fr').summary).toBe('');
    const withSummary = { ...document(), summary: 'Court.' };
    expect(displayRecipe(withSummary, 8, 'fr').summary).toBe('Court.');
  });
});
