import {
  fold,
  formatAmount,
  MAX_LINE_KEYS,
  MAX_SHOPPING_AMOUNT,
  MAX_SHOPPING_ENTRIES,
  MAX_SHOPPING_KEYS,
  MAX_SHOPPING_RECIPES,
  MAX_SHOPPING_TEXT_LENGTH,
  scaleFactor,
  scaleIngredient,
  unitIndex,
  type Locale,
  type RecipeDocument,
  type ShoppingEntry,
  type ShoppingLine,
  type ShoppingQuantity,
  type ShoppingRecipe,
  type ShoppingState,
  type Unit,
} from '@cookit/shared';

/**
 * The shopping list (phase 9e): lines in the user's order, each one thing to buy with the
 * ingredients of the recipes that need it. An ingredient joins the line that takes its name
 * (whatever its unit): `250 g de farine` and `1 tasse de farine` are one line,
 * `Farine (250 g · 1 tasse)`. Lines can be grouped by hand (`farine T55` with `farine`), split,
 * and moved.
 */

export const EMPTY_LIST: ShoppingState = { recipes: [], lines: [] };

/** An ingredient that can be added from a recipe; `text` is only shown while picking. */
export type Candidate = Omit<ShoppingEntry, 'id' | 'recipeId'> & { text: string };

/** A line as shown. */
export type LineView = {
  id: string;
  name: string;
  /** `250 g · 1 tasse`, with the total when every amount has the same unit (`3 · 2 = 5`). */
  quantities: string;
  /** Titles of the recipes it comes from (none for a free item). */
  recipes: string[];
  checked: boolean;
  /** Several ingredients: can be split. */
  merged: boolean;
};

/**
 * Text from a recipe written by anyone: no control characters, cut to the length the API counts
 * (UTF-16 units, as Zod does) without splitting an emoji.
 */
function clean(value: string, max = MAX_SHOPPING_TEXT_LENGTH): string {
  let text = '';
  for (const char of value.replace(/[\p{Cc}\p{Bidi_Control}\p{Zl}\p{Zp}\p{Cs}]/gu, ' ')) {
    if (text.length + char.length > max) break;
    text += char;
  }
  return text.trim();
}

/**
 * What makes two ingredients the same thing to buy: the name without case, accents, punctuation
 * or a plural `s`/`x` (`Œufs` = `oeuf`).
 */
export function nameKey(name: string): string {
  return clean(
    fold(name.replace(/œ/gi, 'oe').replace(/æ/gi, 'ae'))
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .split(' ')
      .map((word) => (word.length > 3 ? word.replace(/[sx]$/, '') : word))
      .join(' '),
    100,
  );
}

/** The ingredients of a recipe for `servings`, as they would be added. */
export function recipeCandidates(
  document: RecipeDocument,
  servings: number,
  locale: Locale,
  units?: readonly Unit[],
): Candidate[] {
  const factor = scaleFactor(document.servings, servings);
  const index = unitIndex(units);
  return document.ingredientGroups.flatMap((group) =>
    group.items.flatMap((item): Candidate[] => {
      if (item.kind !== 'ingredient') return [];
      const text = clean(scaleIngredient(item, factor, { locale, units }));
      if (!text) return [];
      const quantity = item.quantity;
      // An amount the list refuses (a huge number written in the recipe) stays in the name.
      if (
        !quantity ||
        (quantity.amount.max ?? quantity.amount.value) * factor > MAX_SHOPPING_AMOUNT
      ) {
        return [{ text, name: text, quantity: null }];
      }
      return [
        {
          text,
          name: clean(item.name) || text,
          quantity: {
            value: quantity.amount.value * factor,
            ...(quantity.amount.max === undefined ? {} : { max: quantity.amount.max * factor }),
            unit: item.unit?.slug ?? null,
            unitText: item.unit ? clean(item.raw.slice(item.unit.start, item.unit.end), 50) : '',
            rounding: index.rounding(item.unit?.slug),
          },
        },
      ];
    }),
  );
}

const entryCount = (state: ShoppingState) =>
  state.lines.reduce((n, line) => n + line.entries.length, 0);

/** Recipes nothing in the list refers to any more are dropped. */
function withUsedRecipes(recipes: ShoppingRecipe[], lines: ShoppingLine[]): ShoppingState {
  const used = new Set(lines.flatMap((line) => line.entries.map((entry) => entry.recipeId)));
  return { recipes: recipes.filter((recipe) => used.has(recipe.recipeId)), lines };
}

export function removeRecipe(state: ShoppingState, recipeId: string): ShoppingState {
  const lines = state.lines.flatMap((line) => {
    const entries = line.entries.filter((entry) => entry.recipeId !== recipeId);
    if (entries.length === line.entries.length) return [line];
    return entries.length ? [{ ...line, entries }] : [];
  });
  return withUsedRecipes(state.recipes, lines);
}

/**
 * Puts a recipe's chosen ingredients in the list (a recipe already there is replaced): each one
 * joins the line that takes its name (unchecked again: more is needed), else a new line at the
 * end.
 */
export function addRecipe(
  state: ShoppingState,
  recipe: ShoppingRecipe,
  chosen: Candidate[],
  newId: () => string,
): ShoppingState {
  const without = removeRecipe(state, recipe.recipeId);
  const lines = [...without.lines];
  for (const candidate of chosen) {
    const key = nameKey(candidate.name);
    const entry: ShoppingEntry = {
      id: newId(),
      recipeId: recipe.recipeId,
      name: candidate.name,
      quantity: candidate.quantity,
    };
    const index = lines.findIndex((line) => line.keys.includes(key));
    const line = lines[index];
    if (line) {
      lines[index] = { ...line, checked: false, entries: [...line.entries, entry] };
    } else {
      lines.push({
        id: newId(),
        name: candidate.name,
        keys: key ? [key] : [],
        checked: false,
        entries: [entry],
      });
    }
  }
  const recipes = chosen.length
    ? [...without.recipes, { ...recipe, title: clean(recipe.title) }]
    : without.recipes;
  return withUsedRecipes(recipes, lines);
}

/** Whether `count` more ingredients (and maybe one more recipe) still fit. */
export function canAdd(state: ShoppingState, count: number, recipeId?: string): boolean {
  const replaced = recipeId
    ? state.lines.reduce(
        (n, line) => n + line.entries.filter((entry) => entry.recipeId === recipeId).length,
        0,
      )
    : 0;
  const newRecipe =
    recipeId !== undefined && !state.recipes.some((recipe) => recipe.recipeId === recipeId);
  return (
    entryCount(state) - replaced + count <= MAX_SHOPPING_ENTRIES &&
    (!newRecipe || state.recipes.length < MAX_SHOPPING_RECIPES)
  );
}

/** A free item (`papier toilette`): its own line, which no ingredient joins by itself. */
export function addItem(
  state: ShoppingState,
  text: string,
  ids: { line: string; entry: string },
): ShoppingState {
  const name = clean(text);
  if (!name || entryCount(state) >= MAX_SHOPPING_ENTRIES) return state;
  return {
    ...state,
    lines: [
      ...state.lines,
      {
        id: ids.line,
        name,
        keys: [],
        checked: false,
        entries: [{ id: ids.entry, recipeId: null, name, quantity: null }],
      },
    ],
  };
}

export function setChecked(state: ShoppingState, lineId: string, checked: boolean): ShoppingState {
  return {
    ...state,
    lines: state.lines.map((line) => (line.id === lineId ? { ...line, checked } : line)),
  };
}

/** After shopping: what was bought leaves the list, with the recipes nothing is left of. */
export function clearChecked(state: ShoppingState): ShoppingState {
  return withUsedRecipes(
    state.recipes,
    state.lines.filter((line) => !line.checked),
  );
}

/** Moves a line just before or after another one. */
export function moveLine(
  state: ShoppingState,
  lineId: string,
  targetId: string,
  place: 'before' | 'after',
): ShoppingState {
  const line = state.lines.find((item) => item.id === lineId);
  if (!line || lineId === targetId) return state;
  const others = state.lines.filter((item) => item.id !== lineId);
  const target = others.findIndex((item) => item.id === targetId);
  if (target < 0) return state;
  const at = place === 'before' ? target : target + 1;
  return { ...state, lines: [...others.slice(0, at), line, ...others.slice(at)] };
}

/**
 * Groups lines into one, named `name`, where the first of them was. It takes all their names, so
 * the same ingredients join it later; when the list has too many names, only those of the
 * ingredients it holds are kept.
 */
export function groupLines(state: ShoppingState, lineIds: string[], name: string): ShoppingState {
  const ids = new Set(lineIds);
  const grouped = state.lines.filter((line) => ids.has(line.id));
  const first = grouped[0];
  if (!first || grouped.length < 2) return state;
  const entries = grouped.flatMap((line) => line.entries);
  const own = entries.flatMap((entry) => (entry.recipeId === null ? [] : [nameKey(entry.name)]));
  let keys = [...new Set([...grouped.flatMap((line) => line.keys), ...own])].filter(Boolean);
  const othersKeys = state.lines
    .filter((line) => !ids.has(line.id))
    .reduce((n, line) => n + line.keys.length, 0);
  if (keys.length > MAX_LINE_KEYS || othersKeys + keys.length > MAX_SHOPPING_KEYS) {
    keys = [...new Set(own)];
  }
  const line: ShoppingLine = {
    id: first.id,
    name: clean(name) || first.name,
    keys: keys.slice(0, MAX_LINE_KEYS),
    checked: grouped.every((item) => item.checked),
    entries,
  };
  return {
    ...state,
    lines: state.lines.flatMap((item) =>
      item.id === first.id ? [line] : ids.has(item.id) ? [] : [item],
    ),
  };
}

/** Undoes a group: one line per ingredient, where the group was. */
export function splitLine(
  state: ShoppingState,
  lineId: string,
  newId: () => string,
): ShoppingState {
  return {
    ...state,
    lines: state.lines.flatMap((line) => {
      if (line.id !== lineId || line.entries.length < 2) return [line];
      return line.entries.map((entry, index) => {
        const key = entry.recipeId === null ? '' : nameKey(entry.name);
        return {
          id: index === 0 ? line.id : newId(),
          name: entry.name,
          keys: key ? [key] : [],
          checked: line.checked,
          entries: [entry],
        };
      });
    }),
  };
}

/** The name a group gets by default: the shortest one (`farine` rather than `farine T55`). */
export function groupName(state: ShoppingState, lineIds: string[]): string {
  const names = state.lines.filter((line) => lineIds.includes(line.id)).map((line) => line.name);
  return names.reduce((best, name) => (name.length < best.length ? name : best), names[0] ?? '');
}

function amountText(value: number, max: number | undefined, q: ShoppingQuantity, lang: Locale) {
  const low = formatAmount(value, q.rounding, lang);
  const high = max === undefined ? low : formatAmount(max, q.rounding, lang);
  const amount = high === low ? low : `${low}-${high}`;
  return q.unitText ? `${amount} ${q.unitText}` : amount;
}

function quantitiesText(entries: ShoppingEntry[], langs: Map<string, Locale>): string {
  const lang = (entry: ShoppingEntry) => langs.get(entry.recipeId ?? '') ?? 'fr';
  const parts = entries.flatMap((entry) =>
    entry.quantity
      ? [amountText(entry.quantity.value, entry.quantity.max, entry.quantity, lang(entry))]
      : [],
  );
  const quantities = entries.flatMap((entry) => (entry.quantity ? [entry.quantity] : []));
  const first = quantities[0];
  const total =
    first &&
    quantities.length > 1 &&
    quantities.length === entries.length &&
    quantities.every((q) => q.unit === first.unit)
      ? amountText(
          quantities.reduce((n, q) => n + q.value, 0),
          quantities.some((q) => q.max !== undefined)
            ? quantities.reduce((n, q) => n + (q.max ?? q.value), 0)
            : undefined,
          first,
          lang(entries[0]!),
        )
      : undefined;
  return parts.join(' · ') + (total ? ` = ${total}` : '');
}

const capitalized = (name: string) => name.charAt(0).toLocaleUpperCase() + name.slice(1);

/** The list as shown: what is left to buy in the user's order, then what is in the basket. */
export function shoppingLines(state: ShoppingState): { toBuy: LineView[]; inBasket: LineView[] } {
  const titles = new Map(state.recipes.map((recipe) => [recipe.recipeId, recipe.title]));
  const langs = new Map(state.recipes.map((recipe) => [recipe.recipeId, recipe.lang]));
  const views = state.lines.map((line): LineView => ({
    id: line.id,
    name: capitalized(line.name),
    quantities: quantitiesText(line.entries, langs),
    recipes: [...new Set(line.entries.flatMap((entry) => titles.get(entry.recipeId ?? '') ?? []))],
    checked: line.checked,
    merged: line.entries.length > 1,
  }));
  return {
    toBuy: views.filter((line) => !line.checked),
    inBasket: views.filter((line) => line.checked),
  };
}

/** Lines left to buy (the reminder on the home page). */
export function remainingCount(state: ShoppingState | null): number {
  return state ? state.lines.filter((line) => !line.checked).length : 0;
}
