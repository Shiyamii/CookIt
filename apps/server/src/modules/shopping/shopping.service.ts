import type { ShoppingListResponse, ShoppingState } from '@cookit/shared';
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
      return {
        list: row
          ? { version: row.version, updatedAt: row.updatedAt.toISOString(), state: row.state }
          : null,
      };
    },

    async save(userId: string, state: ShoppingState): Promise<{ version: number }> {
      // Recipes no item refers to any more are dropped: the list never keeps empty recipes.
      const used = new Set(state.entries.map((entry) => entry.recipeId));
      const kept: ShoppingState = {
        recipes: state.recipes.filter((recipe) => used.has(recipe.recipeId)),
        entries: state.entries,
      };
      return { version: await deps.repository.save(userId, kept, now()) };
    },
  };
}

export type ShoppingService = ReturnType<typeof createShoppingService>;
