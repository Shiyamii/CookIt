import type { MemberProfile, MemberSummary, RecipePage, RecipeSearch } from '@cookit/shared';
import type { MembersRepository } from './members.repository';

type NotFound = { error: 'not_found' };
const NOT_FOUND: NotFound = { error: 'not_found' };

export type MembersService = ReturnType<typeof createMembersService>;

/**
 * Members (signed-in users only): the list shows the accounts that chose to appear in it (or that
 * an admin put there). A member's page (name, picture, public recipes, nothing else) opens when
 * they are listed or have a public recipe (their recipes lead there); otherwise it does not exist
 * for others, so guessing a username tells nothing about an account that did not opt in. Disabled
 * accounts are nowhere.
 */
export function createMembersService(deps: {
  repository: MembersRepository;
  /** Public recipes of one owner (recipes service). */
  recipes: {
    publicOf(ownerId: string, search: RecipeSearch, viewerId: string): Promise<RecipePage>;
  };
}) {
  const { repository } = deps;

  /** The member as `viewerId` may see them: undefined when hidden from others. */
  const visible = async (username: string, viewerId: string) => {
    const found = await repository.findByUsername(username);
    if (!found) return undefined;
    const hidden = !found.listed && found.publicRecipes === 0 && found.id !== viewerId;
    return hidden ? undefined : found;
  };

  return {
    list(): Promise<MemberSummary[]> {
      return repository.listListed();
    },

    async profile(username: string, viewerId: string): Promise<MemberProfile | NotFound> {
      const found = await visible(username, viewerId);
      if (!found) return NOT_FOUND;
      return {
        username: found.username,
        name: found.name,
        image: found.image,
        publicRecipes: found.publicRecipes,
        // Their own choice, only on their own page.
        ...(found.id === viewerId && { listed: found.listed }),
      };
    },

    async recipes(
      username: string,
      search: RecipeSearch,
      viewerId: string,
    ): Promise<RecipePage | NotFound> {
      const found = await visible(username, viewerId);
      return found ? deps.recipes.publicOf(found.id, search, viewerId) : NOT_FOUND;
    },

    /** The user's own choice: appear in the members list or not. */
    async listed(userId: string): Promise<{ listed: boolean }> {
      return { listed: await repository.isListed(userId) };
    },

    async setListed(userId: string, listed: boolean): Promise<{ listed: boolean }> {
      await repository.setListed(userId, listed);
      return { listed };
    },
  };
}
