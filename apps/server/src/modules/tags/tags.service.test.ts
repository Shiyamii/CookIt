import { describe, expect, test } from 'bun:test';
import type { AdminTagCategory, TagCategoryInput, TagInput } from '@cookit/shared';
import type { TagsRepository } from './tags.repository';
import { createTagsService } from './tags.service';

function fakeRepository() {
  let categories: AdminTagCategory[] = [];
  const state = {
    merges: [] as [string, string][],
    deletes: [] as string[],
    tagOrders: [] as string[][],
    categoryOrders: [] as string[][],
    conflict: false,
  };
  const allTags = () => categories.flatMap((c) => c.tags);
  const slugUsed = (slug: string, exceptId?: string) =>
    allTags().some((t) => t.slug === slug && t.id !== exceptId);
  const repository: TagsRepository = {
    async list() {
      return structuredClone(categories);
    },
    async createCategory(id, input) {
      if (categories.some((c) => c.slug === input.slug)) return 'slug_taken';
      categories.push({ id, position: categories.length, tags: [], ...input });
      return 'ok';
    },
    async updateCategory(id, input) {
      const c = categories.find((x) => x.id === id);
      if (!c) return 'not_found';
      if (state.conflict) return 'single_choice_conflict';
      Object.assign(c, input);
      return 'ok';
    },
    async deleteCategory(id) {
      const c = categories.find((x) => x.id === id);
      if (!c) return 'not_found';
      if (c.tags.length) return 'not_empty';
      categories = categories.filter((x) => x.id !== id);
      return 'ok';
    },
    async reorderCategories(ids) {
      state.categoryOrders.push(ids);
    },
    async createTag(id, input) {
      if (slugUsed(input.slug)) return 'slug_taken';
      const c = categories.find((x) => x.id === input.categoryId)!;
      c.tags.push({ id, position: c.tags.length, recipeCount: 0, ...input });
      return 'ok';
    },
    async updateTag(id, input) {
      const tag = allTags().find((t) => t.id === id);
      if (!tag) return 'not_found';
      if (slugUsed(input.slug, id)) return 'slug_taken';
      if (state.conflict) return 'single_choice_conflict';
      const from = categories.find((c) => c.tags.includes(tag))!;
      from.tags = from.tags.filter((t) => t !== tag);
      Object.assign(tag, input);
      categories.find((c) => c.id === input.categoryId)!.tags.push(tag);
      return 'ok';
    },
    async deleteTag(id) {
      state.deletes.push(id);
      for (const c of categories) c.tags = c.tags.filter((t) => t.id !== id);
    },
    async mergeTag(from, into) {
      if (state.conflict) return 'single_choice_conflict';
      state.merges.push([from, into]);
      for (const c of categories) c.tags = c.tags.filter((t) => t.id !== from);
      return 'ok';
    },
    async reorderTags(ids) {
      state.tagOrders.push(ids);
    },
  };
  return {
    repository,
    state,
    setCount: (tagId: string, recipeCount: number) => {
      const tag = allTags().find((t) => t.id === tagId);
      if (tag) tag.recipeCount = recipeCount;
    },
  };
}

const category = (slug: string, multiple: boolean): TagCategoryInput => ({
  slug,
  multiple,
  labels: { en: slug },
});
const tag = (slug: string, categoryId: string): TagInput => ({
  slug,
  categoryId,
  labels: { en: slug },
});

async function setup() {
  const fake = fakeRepository();
  let n = 0;
  const service = createTagsService({ repository: fake.repository, newId: () => `id-${++n}` });
  const { id: dish } = (await service.createCategory(category('dish', false))) as { id: string };
  const { id: diet } = (await service.createCategory(category('diet', true))) as { id: string };
  const ids = {
    starter: ((await service.createTag(tag('starter', dish))) as { id: string }).id,
    dessert: ((await service.createTag(tag('dessert', dish))) as { id: string }).id,
    vegan: ((await service.createTag(tag('vegan', diet))) as { id: string }).id,
    gf: ((await service.createTag(tag('gluten-free', diet))) as { id: string }).id,
  };
  return { service, dish, diet, ids, ...fake };
}

describe('tags service cache', () => {
  test('catalog() is a NEW array after every write', async () => {
    const { service, dish } = await setup();
    const before = await service.catalog();
    expect(await service.catalog()).toBe(before);
    await service.createTag(tag('soup', dish));
    const after = await service.catalog();
    expect(after).not.toBe(before);
    expect(after.find((c) => c.id === dish)?.tags.map((t) => t.slug)).toContain('soup');
  });

  test('catalog() does not expose recipe counts', async () => {
    const { service } = await setup();
    const [first] = await service.catalog();
    expect(first?.tags[0]).not.toHaveProperty('recipeCount');
  });

  test('updating a tag into another category refreshes the catalog', async () => {
    const { service, diet, dish, ids } = await setup();
    await service.catalog();
    expect(await service.updateTag(ids.starter, tag('starter', diet))).toEqual({ ok: true });
    const cat = await service.catalog();
    expect(cat.find((c) => c.id === dish)?.tags.map((t) => t.slug)).toEqual(['dessert']);
    expect(cat.find((c) => c.id === diet)?.tags.map((t) => t.slug)).toContain('starter');
  });
});

describe('tags service checkSelection', () => {
  test('accepts several tags of a multiple category and one of a single category', async () => {
    const { service, ids } = await setup();
    expect(await service.checkSelection([ids.starter, ids.vegan, ids.gf])).toEqual([
      ids.starter,
      ids.vegan,
      ids.gf,
    ]);
  });

  test('refuses two tags of a single-choice category', async () => {
    const { service, ids } = await setup();
    expect(await service.checkSelection([ids.starter, ids.dessert])).toBeUndefined();
  });

  test('refuses an unknown tag', async () => {
    const { service, ids } = await setup();
    expect(await service.checkSelection([ids.vegan, 'ghost'])).toBeUndefined();
  });

  test('removes duplicates (the same tag twice is not two tags)', async () => {
    const { service, ids } = await setup();
    expect(await service.checkSelection([ids.starter, ids.starter])).toEqual([ids.starter]);
  });

  test('accepts an empty selection', async () => {
    const { service } = await setup();
    expect(await service.checkSelection([])).toEqual([]);
  });
});

describe('tags service idsOfSlugs', () => {
  test('returns the ids of known slugs and ignores unknown ones', async () => {
    const { service, ids } = await setup();
    expect((await service.idsOfSlugs(['vegan', 'nope', 'dessert'])).sort()).toEqual(
      [ids.vegan, ids.dessert].sort(),
    );
  });

  test('returns nothing for no slug', async () => {
    const { service } = await setup();
    expect(await service.idsOfSlugs([])).toEqual([]);
  });
});

describe('tags service writes', () => {
  test('createTag in an unknown category is not_found', async () => {
    const { service } = await setup();
    expect(await service.createTag(tag('x', 'ghost'))).toEqual({ error: 'not_found' });
  });

  test('updateTag to an unknown category is not_found', async () => {
    const { service, ids } = await setup();
    expect(await service.updateTag(ids.vegan, tag('vegan', 'ghost'))).toEqual({
      error: 'not_found',
    });
  });

  test('a duplicate tag slug is slug_taken', async () => {
    const { service, dish } = await setup();
    expect(await service.createTag(tag('vegan', dish))).toEqual({ error: 'slug_taken' });
  });

  test('a duplicate category slug is slug_taken', async () => {
    const { service } = await setup();
    expect(await service.createCategory(category('dish', true))).toEqual({
      error: 'slug_taken',
    });
  });

  test('a category with tags cannot be deleted, an empty one can', async () => {
    const { service, dish } = await setup();
    expect(await service.deleteCategory(dish)).toEqual({ error: 'category_not_empty' });
    const { id } = (await service.createCategory(category('empty', false))) as { id: string };
    expect(await service.deleteCategory(id)).toEqual({ ok: true });
    expect((await service.catalog()).some((c) => c.id === id)).toBe(false);
  });

  test('deleting an unknown category is not_found', async () => {
    const { service } = await setup();
    expect(await service.deleteCategory('ghost')).toEqual({ error: 'not_found' });
  });
});

describe('tags service deleteTag', () => {
  test('an unused tag is deleted without confirmation', async () => {
    const { service, ids, state } = await setup();
    expect(await service.deleteTag(ids.vegan, {})).toEqual({ ok: true });
    expect(state.deletes).toEqual([ids.vegan]);
    expect(await service.idsOfSlugs(['vegan'])).toEqual([]);
  });

  test('a used tag needs a confirmation and reports how many recipes use it', async () => {
    const { service, ids, setCount, state } = await setup();
    setCount(ids.vegan, 3);
    expect(await service.deleteTag(ids.vegan, {})).toEqual({
      error: 'tag_in_use',
      recipeCount: 3,
    });
    expect(await service.deleteTag(ids.vegan, { confirm: false })).toMatchObject({
      error: 'tag_in_use',
    });
    expect(state.deletes).toEqual([]);
    expect(await service.deleteTag(ids.vegan, { confirm: true })).toEqual({ ok: true });
    expect(state.deletes).toEqual([ids.vegan]);
  });

  test('a used tag is merged into another tag without confirmation', async () => {
    const { service, ids, setCount, state } = await setup();
    setCount(ids.vegan, 2);
    expect(await service.deleteTag(ids.vegan, { mergeInto: ids.gf })).toEqual({ ok: true });
    expect(state.merges).toEqual([[ids.vegan, ids.gf]]);
    expect(await service.idsOfSlugs(['vegan'])).toEqual([]);
  });

  test('merging into itself or into an unknown tag is refused', async () => {
    const { service, ids, state } = await setup();
    expect(await service.deleteTag(ids.vegan, { mergeInto: ids.vegan })).toEqual({
      error: 'not_found',
    });
    expect(await service.deleteTag(ids.vegan, { mergeInto: 'ghost' })).toEqual({
      error: 'not_found',
    });
    expect(state.merges).toEqual([]);
  });

  test('deleting an unknown tag is not_found', async () => {
    const { service } = await setup();
    expect(await service.deleteTag('ghost', { confirm: true })).toEqual({ error: 'not_found' });
  });
});

describe('tags service reorder validation', () => {
  test('categories: needs every category exactly once', async () => {
    const { service, dish, diet, state } = await setup();
    expect(await service.reorderCategories([dish])).toEqual({ error: 'not_found' });
    expect(await service.reorderCategories([dish, dish])).toEqual({ error: 'not_found' });
    expect(await service.reorderCategories([dish, 'ghost'])).toEqual({ error: 'not_found' });
    expect(state.categoryOrders).toEqual([]);
    expect(await service.reorderCategories([diet, dish])).toEqual({ ok: true });
    expect(state.categoryOrders).toEqual([[diet, dish]]);
  });

  test('tags: needs every tag of that category, not tags of another one', async () => {
    const { service, dish, ids, state } = await setup();
    expect(await service.reorderTags(dish, [ids.starter])).toEqual({ error: 'not_found' });
    expect(await service.reorderTags(dish, [ids.starter, ids.vegan])).toEqual({
      error: 'not_found',
    });
    expect(await service.reorderTags('ghost', [ids.starter])).toEqual({ error: 'not_found' });
    expect(state.tagOrders).toEqual([]);
    expect(await service.reorderTags(dish, [ids.dessert, ids.starter])).toEqual({ ok: true });
    expect(state.tagOrders).toEqual([[ids.dessert, ids.starter]]);
  });
});

describe('tags service single-choice conflicts', () => {
  test('making a category single-choice is refused and the catalog is unchanged', async () => {
    const { service, diet, state } = await setup();
    state.conflict = true;
    expect(await service.updateCategory(diet, category('diet', false))).toEqual({
      error: 'single_choice_conflict',
    });
    expect((await service.catalog()).find((c) => c.id === diet)?.multiple).toBe(true);
  });

  test('moving a tag into a single-choice category can be refused', async () => {
    const { service, dish, ids, state } = await setup();
    state.conflict = true;
    expect(await service.updateTag(ids.vegan, tag('vegan', dish))).toEqual({
      error: 'single_choice_conflict',
    });
    expect(await service.idsOfSlugs(['vegan'])).toEqual([ids.vegan]);
  });

  test('merging a tag can be refused and the tag stays', async () => {
    const { service, ids, state } = await setup();
    state.conflict = true;
    expect(await service.deleteTag(ids.vegan, { mergeInto: ids.starter })).toEqual({
      error: 'single_choice_conflict',
    });
    expect(await service.idsOfSlugs(['vegan'])).toEqual([ids.vegan]);
  });
});
