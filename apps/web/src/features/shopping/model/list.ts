import {
  fold,
  formatAmount,
  MAX_SHOPPING_AMOUNT,
  MAX_SHOPPING_ENTRIES,
  MAX_SHOPPING_RECIPES,
  MAX_SHOPPING_TEXT_LENGTH,
  scaleFactor,
  scaleIngredient,
  unitIndex,
  type Locale,
  type RecipeDocument,
  type ShoppingEntry,
  type ShoppingRecipe,
  type ShoppingState,
  type Unit,
} from '@cookit/shared';

/**
 * The shopping list (phase 9e): entries are copies of ingredient lines (scaled to the servings
 * chosen) or free items. What is shown merges entries with the same ingredient and unit: their
 * amounts are added up (`250 g de farine` + `250 g farine` = `500 g de farine`).
 */

export const EMPTY_LIST: ShoppingState = { recipes: [], entries: [] };

/** An ingredient that can be added from a recipe (before the user picks which ones). */
export type Candidate = Omit<ShoppingEntry, 'id' | 'recipeId' | 'checked'>;

/** A line of the list: one entry, or several merged. */
export type ShoppingLine = {
  key: string;
  text: string;
  checked: boolean;
  entryIds: string[];
  /** Titles of the recipes it comes from (none for a free item). */
  recipes: string[];
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
  return text;
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
      const text = clean(scaleIngredient(item, factor, { locale, units }).trim());
      if (!text.trim()) return [];
      const quantity = item.quantity;
      // A line cut to the limit cannot be rebuilt from its parts: it is not added up.
      // Nor an amount the list refuses (a huge number written in the recipe).
      const whole =
        quantity !== undefined &&
        item.raw.length <= MAX_SHOPPING_TEXT_LENGTH &&
        (quantity.amount.max ?? quantity.amount.value) * factor <= MAX_SHOPPING_AMOUNT;
      return [
        {
          text,
          name: clean(item.name.trim()),
          quantity: whole
            ? {
                value: quantity.amount.value * factor,
                ...(quantity.amount.max === undefined ? {} : { max: quantity.amount.max * factor }),
                unit: item.unit?.slug ?? null,
                rounding: index.rounding(item.unit?.slug),
                before: clean(item.raw.slice(0, quantity.start)),
                after: clean(item.raw.slice(quantity.end)),
              }
            : null,
        },
      ];
    }),
  );
}

/** Puts a recipe's chosen ingredients in the list; a recipe already there is replaced. */
export function addRecipe(
  state: ShoppingState,
  recipe: ShoppingRecipe,
  chosen: Candidate[],
  newId: () => string,
): ShoppingState {
  const others = state.entries.filter((entry) => entry.recipeId !== recipe.recipeId);
  const recipes = state.recipes.filter((item) => item.recipeId !== recipe.recipeId);
  if (chosen.length === 0) return { recipes, entries: others };
  return {
    recipes: [...recipes, { ...recipe, title: clean(recipe.title) }],
    entries: [
      ...others,
      ...chosen.map((candidate) => ({
        ...candidate,
        id: newId(),
        recipeId: recipe.recipeId,
        checked: false,
      })),
    ],
  };
}

/** Whether `count` more entries (and maybe one more recipe) still fit. */
export function canAdd(state: ShoppingState, count: number, recipeId?: string): boolean {
  const replaced = recipeId
    ? state.entries.filter((entry) => entry.recipeId === recipeId).length
    : 0;
  const newRecipe =
    recipeId !== undefined && !state.recipes.some((recipe) => recipe.recipeId === recipeId);
  return (
    state.entries.length - replaced + count <= MAX_SHOPPING_ENTRIES &&
    (!newRecipe || state.recipes.length < MAX_SHOPPING_RECIPES)
  );
}

export function removeRecipe(state: ShoppingState, recipeId: string): ShoppingState {
  return {
    recipes: state.recipes.filter((recipe) => recipe.recipeId !== recipeId),
    entries: state.entries.filter((entry) => entry.recipeId !== recipeId),
  };
}

/** A free item (`papier toilette`): never merged with anything. */
export function addItem(state: ShoppingState, text: string, id: string): ShoppingState {
  const value = clean(text.trim()).trim();
  if (!value) return state;
  return {
    ...state,
    entries: [
      ...state.entries,
      { id, recipeId: null, text: value, name: value, quantity: null, checked: false },
    ],
  };
}

export function setChecked(
  state: ShoppingState,
  entryIds: readonly string[],
  checked: boolean,
): ShoppingState {
  const ids = new Set(entryIds);
  return {
    ...state,
    entries: state.entries.map((entry) => (ids.has(entry.id) ? { ...entry, checked } : entry)),
  };
}

/** After shopping: what was bought leaves the list, with the recipes nothing is left of. */
export function clearChecked(state: ShoppingState): ShoppingState {
  const entries = state.entries.filter((entry) => !entry.checked);
  const used = new Set(entries.map((entry) => entry.recipeId));
  return { recipes: state.recipes.filter((recipe) => used.has(recipe.recipeId)), entries };
}

/**
 * What makes two ingredients the same: the name without case, accents, punctuation or a plural
 * `s`/`x` (`Œufs` = `oeuf`), and the same unit.
 */
export function ingredientKey(entry: Pick<ShoppingEntry, 'name' | 'text' | 'quantity'>): string {
  const name = fold((entry.name || entry.text).replace(/œ/gi, 'oe').replace(/æ/gi, 'ae'))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .map((word) => (word.length > 3 ? word.replace(/[sx]$/, '') : word))
    .join(' ');
  return entry.quantity ? `${name}|${entry.quantity.unit ?? ''}` : `${name}|-`;
}

/** The list as shown: merged lines, what is left to buy first (in the order added). */
export function shoppingLines(state: ShoppingState): ShoppingLine[] {
  const titles = new Map(state.recipes.map((recipe) => [recipe.recipeId, recipe.title]));
  const langs = new Map(state.recipes.map((recipe) => [recipe.recipeId, recipe.lang]));
  const groups = new Map<string, ShoppingEntry[]>();
  for (const entry of state.entries) {
    const key = entry.recipeId === null ? `free:${entry.id}` : ingredientKey(entry);
    const group = groups.get(key);
    if (group) group.push(entry);
    else groups.set(key, [entry]);
  }
  const lines = [...groups].map(([key, entries]): ShoppingLine => {
    const first = entries[0]!;
    return {
      key,
      text: mergedText(entries, langs.get(first.recipeId ?? '') ?? 'fr'),
      checked: entries.every((entry) => entry.checked),
      entryIds: entries.map((entry) => entry.id),
      recipes: [...new Set(entries.flatMap((entry) => titles.get(entry.recipeId ?? '') ?? []))],
    };
  });
  return [...lines.filter((line) => !line.checked), ...lines.filter((line) => line.checked)];
}

function mergedText(entries: ShoppingEntry[], locale: Locale): string {
  const first = entries[0]!;
  const quantity = first.quantity;
  if (entries.length === 1 || !quantity) return first.text;
  let min = 0;
  let max = 0;
  let range = false;
  for (const entry of entries) {
    min += entry.quantity?.value ?? 0;
    max += entry.quantity?.max ?? entry.quantity?.value ?? 0;
    range ||= entry.quantity?.max !== undefined;
  }
  const low = formatAmount(min, quantity.rounding, locale);
  const high = formatAmount(max, quantity.rounding, locale);
  const amount = range && high !== low ? `${low}-${high}` : low;
  return `${quantity.before}${amount}${quantity.after}`;
}

/** Lines left to buy (the reminder on the home page). */
export function remainingCount(state: ShoppingState | null): number {
  return state ? shoppingLines(state).filter((line) => !line.checked).length : 0;
}
