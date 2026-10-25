import type { RateLimitRepository } from '../../../../server/src/modules/rate-limit/rate-limit.repository';
import type { SystemRepository } from '../../../../server/src/modules/system/system.repository';
import type { TagsRepository } from '../../../../server/src/modules/tags/tags.repository';
import type { UnitsRepository } from '../../../../server/src/modules/units/units.repository';
import type { DemoState } from '../state';

const byPosition = <T extends { position: number; slug: string }>(a: T, b: T) =>
  a.position - b.position || a.slug.localeCompare(b.slug);

/** Tag categories and tags in memory (demo only). */
export function createMemoryTagsRepository(state: () => DemoState): TagsRepository {
  const s = state;
  const slugTaken = (slug: string, except?: string) =>
    [...s().tagCategories, ...s().tags].some((item) => item.slug === slug && item.id !== except);
  const nextPosition = (items: { position: number }[]) =>
    items.reduce((max, item) => Math.max(max, item.position), -1) + 1;
  /** Recipes having `tagId` would get two tags of single-choice `categoryId`. */
  const singleChoiceConflict = (tagId: string, categoryId: string, ignore: string[]) => {
    const category = s().tagCategories.find((c) => c.id === categoryId);
    if (!category || category.multiple) return false;
    const inCategory = new Set(
      s()
        .tags.filter((tag) => tag.categoryId === categoryId && !ignore.includes(tag.id))
        .map((tag) => tag.id),
    );
    const recipes = s()
      .recipeTags.filter((link) => link.tagId === tagId)
      .map((link) => link.recipeId);
    return s().recipeTags.some(
      (link) => recipes.includes(link.recipeId) && inCategory.has(link.tagId),
    );
  };

  return {
    async list(options = {}) {
      return [...s().tagCategories].sort(byPosition).map((category) => ({
        ...category,
        tags: s()
          .tags.filter((tag) => tag.categoryId === category.id)
          .sort(byPosition)
          .map((tag) => ({
            ...tag,
            recipeCount: options.counts
              ? s().recipeTags.filter((link) => link.tagId === tag.id).length
              : 0,
          })),
      }));
    },

    async createCategory(id, input) {
      if (slugTaken(input.slug)) return 'slug_taken';
      s().tagCategories.push({ id, ...input, position: nextPosition(s().tagCategories) });
      return 'ok';
    },

    async updateCategory(id, input) {
      const category = s().tagCategories.find((c) => c.id === id);
      if (!category) return 'not_found';
      if (slugTaken(input.slug, id)) return 'slug_taken';
      if (category.multiple && !input.multiple) {
        const ids = new Set(
          s()
            .tags.filter((t) => t.categoryId === id)
            .map((t) => t.id),
        );
        const perRecipe = new Map<string, number>();
        for (const link of s().recipeTags.filter((l) => ids.has(l.tagId))) {
          perRecipe.set(link.recipeId, (perRecipe.get(link.recipeId) ?? 0) + 1);
        }
        if ([...perRecipe.values()].some((n) => n > 1)) return 'single_choice_conflict';
      }
      Object.assign(category, input);
      return 'ok';
    },

    async deleteCategory(id) {
      const state = s();
      if (!state.tagCategories.some((c) => c.id === id)) return 'not_found';
      if (state.tags.some((t) => t.categoryId === id)) return 'not_empty';
      state.tagCategories = state.tagCategories.filter((c) => c.id !== id);
      return 'ok';
    },

    async reorderCategories(ids) {
      for (const [position, id] of ids.entries()) {
        const category = s().tagCategories.find((c) => c.id === id);
        if (category) category.position = position;
      }
    },

    async createTag(id, input) {
      if (slugTaken(input.slug)) return 'slug_taken';
      const siblings = s().tags.filter((t) => t.categoryId === input.categoryId);
      s().tags.push({ id, ...input, position: nextPosition(siblings) });
      return 'ok';
    },

    async updateTag(id, input) {
      const tag = s().tags.find((t) => t.id === id);
      if (!tag) return 'not_found';
      if (slugTaken(input.slug, id)) return 'slug_taken';
      const moved = tag.categoryId !== input.categoryId;
      if (moved && singleChoiceConflict(id, input.categoryId, [id])) {
        return 'single_choice_conflict';
      }
      const siblings = s().tags.filter((t) => t.categoryId === input.categoryId);
      Object.assign(tag, input, moved ? { position: nextPosition(siblings) } : {});
      return 'ok';
    },

    async deleteTag(id) {
      const state = s();
      state.tags = state.tags.filter((t) => t.id !== id);
      state.recipeTags = state.recipeTags.filter((link) => link.tagId !== id);
    },

    async mergeTag(fromId, intoId) {
      const into = s().tags.find((t) => t.id === intoId);
      if (into && singleChoiceConflict(fromId, into.categoryId, [fromId, intoId])) {
        return 'single_choice_conflict';
      }
      const state = s();
      for (const link of state.recipeTags.filter((l) => l.tagId === fromId)) {
        if (!state.recipeTags.some((l) => l.recipeId === link.recipeId && l.tagId === intoId)) {
          state.recipeTags.push({ recipeId: link.recipeId, tagId: intoId });
        }
      }
      state.recipeTags = state.recipeTags.filter((l) => l.tagId !== fromId);
      state.tags = state.tags.filter((t) => t.id !== fromId);
      return 'ok';
    },

    async reorderTags(ids) {
      for (const [position, id] of ids.entries()) {
        const tag = s().tags.find((t) => t.id === id);
        if (tag) tag.position = position;
      }
    },
  };
}

/** Units in memory (demo only). */
export function createMemoryUnitsRepository(state: () => DemoState): UnitsRepository {
  const s = state;
  return {
    async list() {
      return [...s().units].sort(byPosition);
    },
    async create(unit) {
      if (s().units.some((u) => u.slug === unit.slug)) return 'slug_taken';
      const position = s().units.reduce((max, u) => Math.max(max, u.position), -1) + 1;
      s().units.push({ ...unit, position });
      return 'ok';
    },
    async update(id, unit) {
      const found = s().units.find((u) => u.id === id);
      if (!found) return 'not_found';
      if (s().units.some((u) => u.slug === unit.slug && u.id !== id)) return 'slug_taken';
      Object.assign(found, unit);
      return 'ok';
    },
    async delete(id) {
      const state = s();
      const before = state.units.length;
      state.units = state.units.filter((u) => u.id !== id);
      return state.units.length < before;
    },
    async reorder(ids) {
      for (const [position, id] of ids.entries()) {
        const unit = s().units.find((u) => u.id === id);
        if (unit) unit.position = position;
      }
    },
  };
}

/** The site settings in memory (demo only). */
export function createMemorySystemRepository(state: () => DemoState): SystemRepository {
  return {
    async ping() {},
    async findSettings() {
      return state().settings;
    },
    async saveSettings(settings) {
      state().settings = { ...settings };
    },
  };
}

/** Rate limit counters, for this visit only (never saved). */
export function createMemoryRateLimitRepository(): RateLimitRepository {
  const counters = new Map<string, { count: number; resetAt: Date }>();
  return {
    async hit(key, windowSeconds) {
      const now = Date.now();
      const current = counters.get(key);
      const counter =
        current && current.resetAt.getTime() > now
          ? { ...current, count: current.count + 1 }
          : { count: 1, resetAt: new Date(now + windowSeconds * 1000) };
      counters.set(key, counter);
      return counter;
    },
    async refund(key) {
      const counter = counters.get(key);
      if (counter) counter.count = Math.max(0, counter.count - 1);
    },
    async deleteOlderThan(date) {
      for (const [key, counter] of counters) {
        if (counter.resetAt < date) counters.delete(key);
      }
    },
    async deleteAll() {
      counters.clear();
    },
  };
}
