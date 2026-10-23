import { shoppingStateSchema, type ShoppingListResponse, type ShoppingState } from '@cookit/shared';
import type { ShoppingRepository } from './shopping.repository';

/**
 * Shopping lists (phase 9e): the client sends the whole list at every change, the last save wins.
 * The list only holds the user's own choices (copies of ingredient lines, recipe ids and titles):
 * nothing in it is read through another user's access, so nothing more is checked than its shape.
 */
export function createShoppingService(deps: { repository: ShoppingRepository; now?: () => Date }) {
  const now = deps.now ?? (() => new Date());

  return {
    async get(userId: string): Promise<ShoppingListResponse> {
      const row = await deps.repository.find(userId);
      // A list saved in an older shape (before lines, phase 9e) is not read back: it starts empty.
      const state = row && shoppingStateSchema.safeParse(row.state);
      return {
        list:
          row && state?.success
            ? { version: row.version, updatedAt: row.updatedAt.toISOString(), state: state.data }
            : null,
      };
    },

    async save(userId: string, state: ShoppingState): Promise<{ version: number }> {
      // Recipes no item refers to any more are dropped: the list never keeps empty recipes.
      const used = new Set(
        state.lines.flatMap((line) => line.entries.map((entry) => entry.recipeId)),
      );
      const kept: ShoppingState = {
        recipes: state.recipes.filter((recipe) => used.has(recipe.recipeId)),
        lines: state.lines,
      };
      return { version: await deps.repository.save(userId, kept, now()) };
    },
  };
}

export type ShoppingService = ReturnType<typeof createShoppingService>;
