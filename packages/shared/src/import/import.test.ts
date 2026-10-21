import { describe, expect, test } from 'bun:test';
import { parseRecipe } from '../recipe/parse';
import { detectDurations } from './durations';
import { extractJsonLd, findRecipe, plainText, recipeFromJsonLd, yieldServings } from './jsonld';
import { splitIngredients, splitSteps } from './paste';

const seconds = (text: string) => detectDurations(text).map((d) => d.seconds);

describe('detectDurations', () => {
  test('French and English forms (plan criterion: "1h30" and "10 min")', () => {
    expect(seconds('Cuire 10 min.')).toEqual([600]);
    expect(seconds('Laisser mijoter 1h30 à couvert.')).toEqual([5400]);
    expect(seconds('Cuire 1 h 30 puis 1 heure 15 minutes')).toEqual([5400, 4500]);
    expect(seconds('Reposer 45 secondes, puis 2 heures.')).toEqual([45, 7200]);
    expect(seconds('Bake for 25 minutes, then 1 hour.')).toEqual([1500, 3600]);
    expect(seconds('Cuire 1,5 h')).toEqual([5400]);
    expect(seconds('Pause de 30 s et 5 mn')).toEqual([30, 300]);
  });

  test('a range proposes its high value and keeps the low one', () => {
    expect(detectDurations('Cuire 2 à 3 minutes.')).toEqual([
      { start: 6, end: 19, text: '2 à 3 minutes', seconds: 180, lowSeconds: 120 },
    ]);
    expect(detectDurations('Bake 20-25 min')[0]).toMatchObject({ seconds: 1500, lowSeconds: 1200 });
  });

  test('ignores what is not a duration', () => {
    expect(seconds('Préchauffer à 180 °C, 200 g de farine, 10 m de ficelle, 3 oeufs')).toEqual([]);
    expect(seconds('Page A10 min')).toEqual([]);
    expect(seconds('Un minimum de sel, 2 hommes')).toEqual([]);
  });

  test('positions point at the text found', () => {
    const text = 'Faire revenir 5 min puis cuire 1h30.';
    for (const duration of detectDurations(text)) {
      expect(text.slice(duration.start, duration.end)).toBe(duration.text);
    }
  });
});

describe('splitIngredients', () => {
  test('one per line, bullets and numbers removed, groups from headings', () => {
    const text = '- 200 g de farine\n• 3 œufs\n\nPour la sauce :\n1. 20 cl de crème\n2) sel';
    expect(splitIngredients(text)).toEqual([
      { items: ['200 g de farine', '3 œufs'] },
      { name: 'Pour la sauce', items: ['20 cl de crème', 'sel'] },
    ]);
  });
});

describe('splitSteps', () => {
  test('numbered steps continue over several lines', () => {
    expect(splitSteps('1. Mélanger la farine\net les œufs.\n2. Cuire 10 min.')).toEqual([
      { items: ['Mélanger la farine et les œufs.', 'Cuire 10 min.'] },
    ]);
  });
  test('paragraphs, or one step per line without blank lines', () => {
    expect(splitSteps('Mélanger.\nVerser.\n\nCuire.')).toEqual([
      { items: ['Mélanger. Verser.', 'Cuire.'] },
    ]);
    expect(splitSteps('Mélanger.\nVerser.\nCuire.')).toEqual([
      { items: ['Mélanger.', 'Verser.', 'Cuire.'] },
    ]);
  });
  test('"Étape 2" and headings', () => {
    expect(splitSteps('## La veille\nÉtape 1 : mariner\nÉtape 2 : égoutter')).toEqual([
      { name: 'La veille', items: ['mariner', 'égoutter'] },
    ]);
  });
});

describe('JSON-LD import', () => {
  const page = `<html><head>
    <script type="application/ld+json">{ not json</script>
    <script type='application/ld+json'>
      {"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":["Recipe"],
        "name":"Tarte &amp; pommes","description":"<p>La meilleure</p>","recipeYield":["6","6 parts"],
        "recipeIngredient":["200 g de farine","3 pommes"],
        "keywords":"dessert, facile","recipeCuisine":"Française",
        "recipeInstructions":[{"@type":"HowToSection","name":"Pâte","itemListElement":[{"@type":"HowToStep","text":"Mélanger."}]},
          {"@type":"HowToStep","text":"Cuire 30 min."}]}]}
    </script></head></html>`;

  test('finds the recipe in a @graph and converts it to a valid document', () => {
    const recipe = findRecipe(extractJsonLd(page));
    expect(recipe).toBeDefined();
    const imported = recipeFromJsonLd(recipe ?? {}, 'https://example.com/tarte', 'fr');
    const parsed = parseRecipe(imported.markdown);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
    expect(parsed.document).toMatchObject({
      title: 'Tarte & pommes',
      description: 'La meilleure',
      servings: 6,
      source: 'https://example.com/tarte',
    });
    expect(parsed.document.ingredientGroups[0]?.items.map((i) => i.raw)).toEqual([
      '200 g de farine',
      '3 pommes',
    ]);
    expect(parsed.document.stepGroups.map((g) => [g.name, g.items.map((i) => i.raw)])).toEqual([
      ['Pâte', ['Mélanger.']],
      ['', ['Cuire 30 min.']],
    ]);
    expect(imported.tagValues).toEqual(['dessert', 'facile', 'Française']);
  });

  test('missing servings are not invented: the document asks for them', () => {
    const imported = recipeFromJsonLd(
      { '@type': 'Recipe', name: 'Soupe', recipeIngredient: ['1 l d’eau'] },
      'https://example.com/soupe',
      'fr',
    );
    const parsed = parseRecipe(imported.markdown);
    expect(parsed.ok).toBe(false);
    expect(parsed.diagnostics.map((d) => d.code)).toContain('missing_servings');
  });

  test('plain text and yields', () => {
    expect(plainText('<b>Bœuf</b> &#233;minc&eacute; &#x2014; 2&nbsp;kg')).toBe(
      'Bœuf émincé — 2 kg',
    );
    expect(plainText({})).toBe('');
    expect(yieldServings('4 personnes')).toBe(4);
    expect(yieldServings(['', 'beaucoup', 8])).toBe(8);
    expect(yieldServings('0')).toBeUndefined();
  });
});
