import { z } from 'zod';
import { SUPPORTED_LOCALES } from './locale';
import { MAX_SERVINGS } from './recipe/presentation';
import { UNIT_ROUNDINGS } from './units/unit';

// Shopping list (phase 9e). One list per user, saved whole at every change like the cooking
// session (last change wins) and kept in the browser for network cuts. It only holds the user's
// own choices: recipe titles and ingredient texts are copies made when a recipe was added.

export const MAX_SHOPPING_RECIPES = 50;
export const MAX_SHOPPING_ENTRIES = 300;
/** One line (ingredient lines are cut to it): a full list stays well under the body limit. */
export const MAX_SHOPPING_TEXT_LENGTH = 200;

/** One line of text (ingredient lines come from recipes written by anyone: see `cookText`). */
const lineText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !/[\p{Cc}\p{Bidi_Control}\p{Zl}\p{Zp}\p{Cs}]/u.test(value), {
      message: 'Control characters are not allowed',
    });

/** Above it an amount is not added up (kept as text). */
export const MAX_SHOPPING_AMOUNT = 1_000_000;
const amount = z.number().finite().min(0).max(MAX_SHOPPING_AMOUNT);

/**
 * A number that can be added to others: the line is `before` + amount + `after`, `value` (and
 * `max` for a range) already scaled to the servings chosen, not rounded.
 */
export const shoppingQuantitySchema = z
  .object({
    value: amount,
    max: amount.optional(),
    /** Catalog unit, if one was recognized: only the same unit is added up. */
    unit: z
      .string()
      .max(50)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
      .nullable(),
    rounding: z.enum(UNIT_ROUNDINGS),
    before: lineText(MAX_SHOPPING_TEXT_LENGTH),
    after: lineText(MAX_SHOPPING_TEXT_LENGTH),
  })
  .strict();
export type ShoppingQuantity = z.infer<typeof shoppingQuantitySchema>;

/** One thing to buy: an ingredient of a recipe (`recipeId`) or a free item (`recipeId` null). */
export const shoppingEntrySchema = z
  .object({
    id: z.uuid(),
    recipeId: z.uuid().nullable(),
    /** The line as shown (scaled). */
    text: lineText(MAX_SHOPPING_TEXT_LENGTH).refine((value) => value.trim().length > 0, {
      message: 'Empty item',
    }),
    /** What it is (`farine` in `250 g de farine`): lines with the same name are merged. */
    name: lineText(MAX_SHOPPING_TEXT_LENGTH),
    quantity: shoppingQuantitySchema.nullable(),
    checked: z.boolean(),
  })
  .strict();
export type ShoppingEntry = z.infer<typeof shoppingEntrySchema>;

/** A recipe whose ingredients were added, with the servings chosen. */
export const shoppingRecipeSchema = z
  .object({
    recipeId: z.uuid(),
    title: lineText(200),
    servings: z.number().int().min(1).max(MAX_SERVINGS),
    /** Language of its texts (decimal separator of merged amounts). */
    lang: z.enum(SUPPORTED_LOCALES),
  })
  .strict();
export type ShoppingRecipe = z.infer<typeof shoppingRecipeSchema>;

export const shoppingStateSchema = z
  .object({
    recipes: z
      .array(shoppingRecipeSchema)
      .max(MAX_SHOPPING_RECIPES)
      .refine((recipes) => new Set(recipes.map((r) => r.recipeId)).size === recipes.length, {
        message: 'A recipe is only once in the list',
      }),
    entries: z
      .array(shoppingEntrySchema)
      .max(MAX_SHOPPING_ENTRIES)
      .refine((entries) => new Set(entries.map((e) => e.id)).size === entries.length, {
        message: 'Duplicate item',
      }),
  })
  .strict()
  .refine(
    (state) => {
      const ids = new Set(state.recipes.map((recipe) => recipe.recipeId));
      return state.entries.every((entry) => entry.recipeId === null || ids.has(entry.recipeId));
    },
    { message: 'An item refers to a recipe that is not in the list' },
  );
export type ShoppingState = z.infer<typeof shoppingStateSchema>;

export const shoppingListInputSchema = z.object({ state: shoppingStateSchema }).strict();

export type ShoppingList = { version: number; updatedAt: string; state: ShoppingState };
export type ShoppingListResponse = { list: ShoppingList | null };
