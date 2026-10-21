import type { AdminTagCategory, TagCategory, TagCategoryInput, TagInput } from '@cookit/shared';
import type { TagsRepository } from './tags.repository';

export type TagError =
  | { error: 'not_found' }
  | { error: 'slug_taken' }
  /** Deleting a tag used by recipes needs a confirmation (or a merge). */
  | { error: 'tag_in_use'; recipeCount: number }
  | { error: 'category_not_empty' }
  /** Recipes would get two tags of a single-choice category (they could not be saved). */
  | { error: 'single_choice_conflict' };

/**
 * Tag categories and tags (plan §4): the common list, edited by the admin only. Recipes reference
 * tag ids; the catalog is cached and refreshed after every change.
 */
export function createTagsService(deps: { repository: TagsRepository; newId?: () => string }) {
  const { repository } = deps;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  let cached: Promise<TagCategory[]> | undefined;

  const catalog = () => {
    cached ??= repository
      .list()
      .then((categories) =>
        categories.map(({ tags, ...category }) => ({
          ...category,
          tags: tags.map((tag) => ({
            id: tag.id,
            slug: tag.slug,
            categoryId: tag.categoryId,
            position: tag.position,
            labels: tag.labels,
          })),
        })),
      )
      .catch((error: unknown) => {
        cached = undefined;
        throw error;
      });
    return cached;
  };
  const changed = () => {
    cached = undefined;
  };

  const tagOf = async (id: string) => {
    for (const category of await catalog()) {
      const tag = category.tags.find((t) => t.id === id);
      if (tag) return { tag, category };
    }
    return undefined;
  };

  const categoryExists = async (id: string) => (await catalog()).some((c) => c.id === id);

  return {
    catalog,

    adminList(): Promise<AdminTagCategory[]> {
      return repository.list({ counts: true });
    },

    /**
     * Tags chosen for a recipe: all known, and at most one per single-choice category. Returns
     * them without duplicates, or undefined when the selection is not allowed.
     */
    async checkSelection(tagIds: readonly string[]): Promise<string[] | undefined> {
      const unique = [...new Set(tagIds)];
      const perCategory = new Map<string, number>();
      for (const id of unique) {
        const found = await tagOf(id);
        if (!found) return undefined;
        const n = (perCategory.get(found.category.id) ?? 0) + 1;
        if (n > 1 && !found.category.multiple) return undefined;
        perCategory.set(found.category.id, n);
      }
      return unique;
    },

    /** Tag ids of the given slugs (unknown slugs are ignored). */
    async idsOfSlugs(slugs: readonly string[]): Promise<string[]> {
      const wanted = new Set(slugs);
      return (await catalog()).flatMap((category) =>
        category.tags.filter((tag) => wanted.has(tag.slug)).map((tag) => tag.id),
      );
    },

    async createCategory(input: TagCategoryInput): Promise<{ id: string } | TagError> {
      const id = newId();
      const result = await repository.createCategory(id, input);
      changed();
      return result === 'ok' ? { id } : { error: result };
    },

    async updateCategory(id: string, input: TagCategoryInput): Promise<{ ok: true } | TagError> {
      const result = await repository.updateCategory(id, input);
      changed();
      return result === 'ok' ? { ok: true } : { error: result };
    },

    /** Only an empty category can go: its tags are moved or deleted first. */
    async deleteCategory(id: string): Promise<{ ok: true } | TagError> {
      const result = await repository.deleteCategory(id);
      changed();
      if (result === 'not_empty') return { error: 'category_not_empty' };
      return result === 'ok' ? { ok: true } : { error: result };
    },

    async reorderCategories(ids: string[]): Promise<{ ok: true } | TagError> {
      const current = (await catalog()).map((c) => c.id);
      if (!sameSet(ids, current)) return { error: 'not_found' };
      await repository.reorderCategories(ids);
      changed();
      return { ok: true };
    },

    async createTag(input: TagInput): Promise<{ id: string } | TagError> {
      if (!(await categoryExists(input.categoryId))) return { error: 'not_found' };
      const id = newId();
      const result = await repository.createTag(id, input);
      changed();
      return result === 'ok' ? { id } : { error: result };
    },

    /** Renames, translates or moves a tag to another category. */
    async updateTag(id: string, input: TagInput): Promise<{ ok: true } | TagError> {
      if (!(await categoryExists(input.categoryId))) return { error: 'not_found' };
      const result = await repository.updateTag(id, input);
      changed();
      return result === 'ok' ? { ok: true } : { error: result };
    },

    /**
     * A tag used by recipes is only deleted when confirmed, or merged into another tag (its
     * recipes get that tag instead).
     */
    async deleteTag(
      id: string,
      options: { confirm?: boolean; mergeInto?: string },
    ): Promise<{ ok: true } | TagError> {
      const tag = (await repository.list({ counts: true }))
        .flatMap((category) => category.tags)
        .find((t) => t.id === id);
      if (!tag) return { error: 'not_found' };
      if (options.mergeInto !== undefined) {
        if (options.mergeInto === id || !(await tagOf(options.mergeInto))) {
          return { error: 'not_found' };
        }
        if ((await repository.mergeTag(id, options.mergeInto)) === 'single_choice_conflict') {
          return { error: 'single_choice_conflict' };
        }
      } else {
        if (tag.recipeCount > 0 && !options.confirm) {
          return { error: 'tag_in_use', recipeCount: tag.recipeCount };
        }
        await repository.deleteTag(id);
      }
      changed();
      return { ok: true };
    },

    /** `ids`: every tag of one category, in the new order. */
    async reorderTags(categoryId: string, ids: string[]): Promise<{ ok: true } | TagError> {
      const category = (await catalog()).find((c) => c.id === categoryId);
      if (
        !category ||
        !sameSet(
          ids,
          category.tags.map((t) => t.id),
        )
      )
        return { error: 'not_found' };
      await repository.reorderTags(ids);
      changed();
      return { ok: true };
    },
  };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return a.length === b.length && set.size === a.length && b.every((id) => set.has(id));
}

export type TagsService = ReturnType<typeof createTagsService>;
