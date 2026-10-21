import type { Locale } from '../locale';
import type { IngredientGroup, RecipeDocument, StepGroup } from '../recipe/model';
import { MAX_SERVINGS } from '../recipe/presentation';
import { serializeRecipe } from '../recipe/serialize';
import { splitSteps } from './paste';

/**
 * Import by URL (plan §5.2): the schema.org `Recipe` of a web page (JSON-LD), converted to the
 * recipe format. Fields the page does not give stay empty rather than invented: without servings,
 * the document has no `portions:` line and the preview asks for it.
 */

const MAX_ITEMS = 200;
const MAX_TEXT = 2000;
const MAX_SCRIPTS = 20;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
  deg: '°',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
};

/** Text of a JSON-LD string: HTML tags removed, entities decoded, one line, bounded. */
export function plainText(value: unknown): string {
  if (typeof value !== 'string') return '';
  // Bounded first: the replacements below then run on a few kilobytes at most.
  return value
    .slice(0, MAX_TEXT * 4)
    .replace(/<[^>]{0,500}>/g, ' ')
    .replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (entity, code: string) => {
      if (code.startsWith('#x') || code.startsWith('#X')) {
        return safeCodePoint(Number.parseInt(code.slice(2), 16)) ?? entity;
      }
      if (code.startsWith('#')) return safeCodePoint(Number(code.slice(1))) ?? entity;
      return ENTITIES[code.toLowerCase()] ?? entity;
    })
    .replace(/[\p{Cc}\p{Zl}\p{Zp}\p{Bidi_Control}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT);
}

function safeCodePoint(code: number): string | undefined {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : undefined;
}

/** The JSON-LD blocks of an HTML page (invalid ones are skipped). */
export function extractJsonLd(html: string): unknown[] {
  // A plain scan with indexOf (no backtracking regex on a 2 MB page given by anyone).
  const lower = html.toLowerCase();
  const blocks: unknown[] = [];
  let at = 0;
  while (blocks.length < MAX_SCRIPTS) {
    const start = lower.indexOf('<script', at);
    if (start === -1) break;
    const tagEnd = lower.indexOf('>', start);
    if (tagEnd === -1) break;
    const tag = lower.slice(start, Math.min(tagEnd, start + 1000));
    const close = lower.indexOf('</script', tagEnd);
    // No closing tag anywhere after: nothing more to find.
    if (close === -1) break;
    if (/\btype\s*=\s*["']?application\/ld\+json/.test(tag)) {
      try {
        blocks.push(JSON.parse(html.slice(tagEnd + 1, close)) as unknown);
      } catch {
        // Not valid JSON: ignored.
      }
    }
    at = close + 8;
  }
  return blocks;
}

type Node = Record<string, unknown>;

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function hasType(node: Node, type: string): boolean {
  const value = node['@type'];
  return value === type || (Array.isArray(value) && value.includes(type));
}

/** The first `Recipe` in the blocks (arrays and `@graph` included), searched without recursion limit issues. */
export function findRecipe(blocks: unknown[]): Node | undefined {
  const stack = [...blocks].reverse();
  let visited = 0;
  while (stack.length && visited++ < 10_000) {
    const value = stack.pop();
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) stack.push(value[i]);
    } else if (isNode(value)) {
      if (hasType(value, 'Recipe')) return value;
      if (value['@graph'] !== undefined) stack.push(value['@graph']);
    }
  }
  return undefined;
}

const list = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];

function texts(value: unknown): string[] {
  return list(value).flatMap((item) => {
    if (typeof item === 'string') return item.split(/,/).map(plainText);
    if (isNode(item)) return [plainText(item.name ?? item.text)];
    return [];
  });
}

/** Servings from `recipeYield` (`4`, `"6 portions"`, `["4", "4 servings"]`), if any. */
export function yieldServings(value: unknown): number | undefined {
  for (const item of list(value)) {
    const text = typeof item === 'number' ? String(item) : typeof item === 'string' ? item : '';
    const match = /\d{1,4}/.exec(text);
    const servings = match ? Number(match[0]) : NaN;
    if (Number.isInteger(servings) && servings >= 1 && servings <= MAX_SERVINGS) return servings;
  }
  return undefined;
}

/** Steps from `recipeInstructions`: a text, a list of texts, of `HowToStep`, or of `HowToSection`. */
function stepGroups(value: unknown): StepGroup[] {
  const groups: StepGroup[] = [];
  const add = (name: string | undefined, steps: string[]) => {
    const items = steps
      .filter(Boolean)
      .map((raw, index) => ({ kind: 'step' as const, line: 0, index, raw, segments: [] }));
    if (items.length) groups.push({ name, items });
  };
  const loose: string[] = [];
  for (const item of list(value).slice(0, MAX_ITEMS)) {
    if (typeof item === 'string') {
      const text = item.slice(0, MAX_TEXT * MAX_ITEMS);
      loose.push(...splitSteps(text).flatMap((group) => group.items.map(plainText)));
    } else if (isNode(item) && hasType(item, 'HowToSection')) {
      if (loose.length) add(undefined, loose.splice(0));
      const steps = list(item.itemListElement).map((step) =>
        isNode(step) ? plainText(step.text ?? step.name) : plainText(step),
      );
      add(plainText(item.name) || undefined, steps);
    } else if (isNode(item)) {
      loose.push(plainText(item.text ?? item.name));
    }
  }
  if (loose.length) add(undefined, loose);
  // Groups after the first one need a name to be read back as groups.
  return groups.map((group, index) => (index > 0 && !group.name ? { ...group, name: '' } : group));
}

export type ImportedRecipe = {
  /** The recipe document (format §4), to preview and correct before saving. */
  markdown: string;
  /** Keywords, categories and cuisine of the page: candidates for the "Validate tags" step. */
  tagValues: string[];
};

/** A schema.org Recipe as a recipe document. `sourceUrl`: the page it comes from. */
export function recipeFromJsonLd(recipe: Node, sourceUrl: string, locale: Locale): ImportedRecipe {
  const ingredients: IngredientGroup[] = [
    {
      items: texts(recipe.recipeIngredient ?? recipe.ingredients)
        .filter(Boolean)
        .slice(0, MAX_ITEMS)
        .map((raw) => ({ kind: 'ingredient' as const, line: 0, raw, name: '' })),
    },
  ];
  const servings = yieldServings(recipe.recipeYield);
  const document: RecipeDocument = {
    title: plainText(recipe.name).slice(0, 200) || sourceUrl.slice(0, 200),
    description: plainText(recipe.description),
    servings: servings ?? 1,
    source: sourceUrl,
    tags: [],
    extraMeta: {},
    ingredientGroups: ingredients[0]?.items.length ? ingredients : [],
    stepGroups: stepGroups(recipe.recipeInstructions),
  };
  let markdown = serializeRecipe(document, { locale });
  // Not given by the page: no servings line (the preview asks for it) rather than a made-up one.
  if (servings === undefined) markdown = markdown.replace(/^(?:portions|servings): 1\n/m, '');
  const tagValues = [
    ...texts(recipe.keywords),
    ...texts(recipe.recipeCategory),
    ...texts(recipe.recipeCuisine),
  ].filter(Boolean);
  return { markdown, tagValues: [...new Set(tagValues)].slice(0, 50) };
}
