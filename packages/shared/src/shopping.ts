import { z } from 'zod';
import { SUPPORTED_LOCALES } from './locale';
import { MAX_SERVINGS } from './recipe/presentation';
import { UNIT_ROUNDINGS } from './units/unit';

// Shopping list (phase 9e). One list per user, saved whole at every change like the cooking
// session (last change wins) and kept in the browser for network cuts. It only holds the user's
// own choices: recipe titles and ingredients are copies made when a recipe was added.
//
// The list is made of lines in the user's order. A line is one thing to buy (`Farine`) and holds
// the ingredients of every recipe that needs it (`250 g`, `1 tasse`). `keys` are the ingredient
// names (normalized) the line takes: an ingredient added later with one of them joins it, so a
// line grouped by hand (`farine T55` with `farine`) stays grouped.

export const MAX_SHOPPING_RECIPES = 50;
/** Ingredients and free items, over all lines (a line holds at least one). */
export const MAX_SHOPPING_ENTRIES = 300;
/** One line of text (names are cut to it): a full list stays well under the body limit. */
export const MAX_SHOPPING_TEXT_LENGTH = 200;
/** Names a line takes: per line, and over the whole list. */
export const MAX_LINE_KEYS = 20;
export const MAX_SHOPPING_KEYS = 600;
const MAX_KEY_LENGTH = 100;
/** Above it an amount is not added up (kept as text). */
export const MAX_SHOPPING_AMOUNT = 1_000_000;

/** One line of text (ingredient lines come from recipes written by anyone: see `cookText`). */
const lineText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !/[\p{Cc}\p{Bidi_Control}\p{Zl}\p{Zp}\p{Cs}]/u.test(value), {
      message: 'Control characters are not allowed',
    });
const nonEmpty = (max: number) =>
  lineText(max).refine((value) => value.trim().length > 0, { message: 'Empty text' });

const amount = z.number().finite().min(0).max(MAX_SHOPPING_AMOUNT);

/** An amount of an ingredient, already scaled to the servings chosen, not rounded. */
export const shoppingQuantitySchema = z
  .object({
    value: amount,
    max: amount.optional(),
    /** Catalog unit, if one was recognized: amounts of the same unit are added up. */
    unit: z
      .string()
      .max(50)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .nullable(),
    /** The unit as the recipe writes it (`c. à soupe`), `''` without unit. */
    unitText: lineText(50),
    rounding: z.enum(UNIT_ROUNDINGS),
  })
  .strict();
export type ShoppingQuantity = z.infer<typeof shoppingQuantitySchema>;

/** An ingredient of a recipe (`recipeId`) or a free item (`recipeId` null). */
export const shoppingEntrySchema = z
  .object({
    id: z.uuid(),
    recipeId: z.uuid().nullable(),
    /** What it is (`farine` in `250 g de farine`). */
    name: nonEmpty(MAX_SHOPPING_TEXT_LENGTH),
    quantity: shoppingQuantitySchema.nullable(),
  })
  .strict();
export type ShoppingEntry = z.infer<typeof shoppingEntrySchema>;

/** One thing to buy, with the ingredients it gathers. */
export const shoppingLineSchema = z
  .object({
    id: z.uuid(),
    name: nonEmpty(MAX_SHOPPING_TEXT_LENGTH),
    keys: z.array(lineText(MAX_KEY_LENGTH)).max(MAX_LINE_KEYS),
    checked: z.boolean(),
    entries: z.array(shoppingEntrySchema).min(1).max(MAX_SHOPPING_ENTRIES),
  })
  .strict();
export type ShoppingLine = z.infer<typeof shoppingLineSchema>;

/** A recipe whose ingredients were added, with the servings chosen. */
export const shoppingRecipeSchema = z
  .object({
    recipeId: z.uuid(),
    title: lineText(200),
    servings: z.number().int().min(1).max(MAX_SERVINGS),
    /** Language of its texts (decimal separator of the amounts). */
    lang: z.enum(SUPPORTED_LOCALES),
  })
  .strict();
export type ShoppingRecipe = z.infer<typeof shoppingRecipeSchema>;

const unique = (ids: string[]) => new Set(ids).size === ids.length;

export const shoppingStateSchema = z
  .object({
    recipes: z
      .array(shoppingRecipeSchema)
      .max(MAX_SHOPPING_RECIPES)
      .refine((recipes) => unique(recipes.map((recipe) => recipe.recipeId)), {
        message: 'A recipe is only once in the list',
      }),
    lines: z
      .array(shoppingLineSchema)
      .max(MAX_SHOPPING_ENTRIES)
      .refine((lines) => unique(lines.map((line) => line.id)), { message: 'Duplicate line' }),
  })
  .strict()
  .refine(
    (state) => state.lines.reduce((n, line) => n + line.entries.length, 0) <= MAX_SHOPPING_ENTRIES,
    { message: 'Too many items' },
  )
  .refine(
    (state) => state.lines.reduce((n, line) => n + line.keys.length, 0) <= MAX_SHOPPING_KEYS,
    { message: 'Too many names' },
  )
  .refine((state) => unique(state.lines.flatMap((line) => line.entries.map((e) => e.id))), {
    message: 'Duplicate item',
  })
  .refine(
    (state) => {
      const ids = new Set(state.recipes.map((recipe) => recipe.recipeId));
      return state.lines.every((line) =>
        line.entries.every((entry) => entry.recipeId === null || ids.has(entry.recipeId)),
      );
    },
    { message: 'An item refers to a recipe that is not in the list' },
  );
export type ShoppingState = z.infer<typeof shoppingStateSchema>;

export const shoppingListInputSchema = z.object({ state: shoppingStateSchema }).strict();

export type ShoppingList = { version: number; updatedAt: string; state: ShoppingState };
export type ShoppingListResponse = { list: ShoppingList | null };
