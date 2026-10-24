import { afterEach, describe, expect, setSystemTime, test } from 'bun:test';
import type { LocalizedLabels, Unit } from '@cookit/shared';
import { emptyState } from '../state';
import {
  createMemoryRateLimitRepository,
  createMemorySystemRepository,
  createMemoryTagsRepository,
  createMemoryUnitsRepository,
} from './catalog';

const labels = (text: string): LocalizedLabels => ({ en: text });

function tagsSetup() {
  const state = emptyState();
  const repo = createMemoryTagsRepository(() => state);
  return { state, repo };
}

/** Two categories: `diet` (several tags per recipe) and `course` (single choice). */
async function withCategories() {
  const ctx = tagsSetup();
  await ctx.repo.createCategory('c-diet', { slug: 'diet', multiple: true, labels: labels('Diet') });
  await ctx.repo.createCategory('c-course', {
    slug: 'course',
    multiple: false,
    labels: labels('Course'),
  });
  return ctx;
}

const tagInput = (slug: string, categoryId: string) => ({
  slug,
  categoryId,
  labels: labels(slug),
});

describe('memory tags repository: slugs', () => {
  test('a category slug is taken across categories and tags', async () => {
    const { repo } = await withCategories();
    await repo.createTag('t1', tagInput('vegan', 'c-diet'));
    expect(await repo.createCategory('c3', { slug: 'diet', multiple: true, labels: {} })).toBe(
      'slug_taken',
    );
    expect(await repo.createCategory('c4', { slug: 'vegan', multiple: true, labels: {} })).toBe(
      'slug_taken',
    );
  });

  test('a tag slug is taken across categories and by a category slug', async () => {
    const { repo } = await withCategories();
    await repo.createTag('t1', tagInput('vegan', 'c-diet'));
    expect(await repo.createTag('t2', tagInput('vegan', 'c-course'))).toBe('slug_taken');
    expect(await repo.createTag('t3', tagInput('diet', 'c-course'))).toBe('slug_taken');
  });

  test('updating keeps the own slug but refuses another one in use', async () => {
    const { repo } = await withCategories();
    await repo.createTag('t1', tagInput('vegan', 'c-diet'));
    await repo.createTag('t2', tagInput('quick', 'c-diet'));
    expect(await repo.updateTag('t1', tagInput('vegan', 'c-diet'))).toBe('ok');
    expect(await repo.updateTag('t1', tagInput('quick', 'c-diet'))).toBe('slug_taken');
    expect(await repo.updateTag('t1', tagInput('course', 'c-diet'))).toBe('slug_taken');
    expect(
      await repo.updateCategory('c-diet', { slug: 'course', multiple: true, labels: {} }),
    ).toBe('slug_taken');
    expect(
      await repo.updateCategory('c-diet', { slug: 'diet', multiple: true, labels: labels('D2') }),
    ).toBe('ok');
  });

  test('updating an unknown category or tag is not_found', async () => {
    const { repo } = await withCategories();
    expect(await repo.updateTag('nope', tagInput('a', 'c-diet'))).toBe('not_found');
    expect(await repo.updateCategory('nope', { slug: 'a', multiple: true, labels: {} })).toBe(
      'not_found',
    );
  });
});

describe('memory tags repository: list and positions', () => {
  test('new categories and tags go last, listed in order with counts only on demand', async () => {
    const { repo, state } = await withCategories();
    await repo.createTag('t1', tagInput('b', 'c-diet'));
    await repo.createTag('t2', tagInput('a', 'c-diet'));
    state.recipeTags.push({ recipeId: 'r1', tagId: 't1' }, { recipeId: 'r2', tagId: 't1' });
    const plain = await repo.list();
    expect(plain.map((c) => c.slug)).toEqual(['diet', 'course']);
    expect(plain[0]?.tags.map((t) => [t.slug, t.recipeCount])).toEqual([
      ['b', 0],
      ['a', 0],
    ]);
    const counted = await repo.list({ counts: true });
    expect(counted[0]?.tags.map((t) => [t.slug, t.recipeCount])).toEqual([
      ['b', 2],
      ['a', 0],
    ]);
  });

  test('equal positions are ordered by slug', async () => {
    const { repo, state } = await withCategories();
    await repo.createTag('t1', tagInput('b', 'c-diet'));
    await repo.createTag('t2', tagInput('a', 'c-diet'));
    for (const tag of state.tags) tag.position = 0;
    expect((await repo.list())[0]?.tags.map((t) => t.slug)).toEqual(['a', 'b']);
  });

  test('reorder follows the order of the ids', async () => {
    const { repo } = await withCategories();
    await repo.createTag('t1', tagInput('a', 'c-diet'));
    await repo.createTag('t2', tagInput('b', 'c-diet'));
    await repo.reorderTags(['t2', 't1']);
    await repo.reorderCategories(['c-course', 'c-diet']);
    const list = await repo.list();
    expect(list.map((c) => c.slug)).toEqual(['course', 'diet']);
    expect(list[1]?.tags.map((t) => t.slug)).toEqual(['b', 'a']);
  });

  test('a tag moved to another category goes to its end, one that stays keeps its place', async () => {
    const { repo, state } = await withCategories();
    await repo.createTag('t1', tagInput('a', 'c-diet'));
    await repo.createTag('t2', tagInput('b', 'c-course'));
    await repo.createTag('t3', tagInput('c', 'c-course'));
    await repo.updateTag('t1', tagInput('a', 'c-course'));
    expect(state.tags.find((t) => t.id === 't1')).toMatchObject({
      categoryId: 'c-course',
      position: 2,
    });
    await repo.updateTag('t2', { ...tagInput('b', 'c-course'), labels: labels('B') });
    expect(state.tags.find((t) => t.id === 't2')?.position).toBe(0);
  });
});

describe('memory tags repository: deleting and single choice', () => {
  test('a category with tags is not_empty, an empty one is deleted, an unknown one not_found', async () => {
    const { repo } = await withCategories();
    await repo.createTag('t1', tagInput('a', 'c-diet'));
    expect(await repo.deleteCategory('c-diet')).toBe('not_empty');
    expect(await repo.deleteCategory('c-course')).toBe('ok');
    expect(await repo.deleteCategory('c-course')).toBe('not_found');
    await repo.deleteTag('t1');
    expect(await repo.deleteCategory('c-diet')).toBe('ok');
  });

  test('deleting a tag removes only its recipe links', async () => {
    const { repo, state } = await withCategories();
    await repo.createTag('t1', tagInput('a', 'c-diet'));
    await repo.createTag('t2', tagInput('b', 'c-diet'));
    state.recipeTags.push({ recipeId: 'r1', tagId: 't1' }, { recipeId: 'r1', tagId: 't2' });
    await repo.deleteTag('t1');
    expect(state.recipeTags).toEqual([{ recipeId: 'r1', tagId: 't2' }]);
  });

  test('a category cannot become single-choice while a recipe has two of its tags', async () => {
    const { repo, state } = await withCategories();
    await repo.createTag('t1', tagInput('a', 'c-diet'));
    await repo.createTag('t2', tagInput('b', 'c-diet'));
    state.recipeTags.push({ recipeId: 'r1', tagId: 't1' }, { recipeId: 'r1', tagId: 't2' });
    const input = { slug: 'diet', multiple: false, labels: {} };
    expect(await repo.updateCategory('c-diet', input)).toBe('single_choice_conflict');
    state.recipeTags.pop();
    expect(await repo.updateCategory('c-diet', input)).toBe('ok');
  });

  test('a tag with two recipes sharing one other tag only counts per recipe', async () => {
    const { repo, state } = await withCategories();
    await repo.createTag('t1', tagInput('a', 'c-diet'));
    await repo.createTag('t2', tagInput('b', 'c-diet'));
    state.recipeTags.push({ recipeId: 'r1', tagId: 't1' }, { recipeId: 'r2', tagId: 't2' });
    expect(await repo.updateCategory('c-diet', { slug: 'diet', multiple: false, labels: {} })).toBe(
      'ok',
    );
  });

  test('moving a tag into a single-choice category conflicts when a recipe already has one of it', async () => {
    const { repo, state } = await withCategories();
    await repo.createTag('t1', tagInput('main', 'c-course'));
    await repo.createTag('t2', tagInput('a', 'c-diet'));
    state.recipeTags.push({ recipeId: 'r1', tagId: 't1' }, { recipeId: 'r1', tagId: 't2' });
    expect(await repo.updateTag('t2', tagInput('a', 'c-course'))).toBe('single_choice_conflict');
    expect(state.tags.find((t) => t.id === 't2')?.categoryId).toBe('c-diet');
    // Another recipe set: no clash.
    state.recipeTags = [{ recipeId: 'r2', tagId: 't2' }];
    expect(await repo.updateTag('t2', tagInput('a', 'c-course'))).toBe('ok');
  });

  test('moving into a multiple-choice category never conflicts', async () => {
    const { repo, state } = await withCategories();
    await repo.createTag('t1', tagInput('main', 'c-course'));
    await repo.createTag('t2', tagInput('a', 'c-course'));
    await repo.createTag('t3', tagInput('b', 'c-diet'));
    state.recipeTags.push({ recipeId: 'r1', tagId: 't1' }, { recipeId: 'r1', tagId: 't2' });
    expect(await repo.updateTag('t2', tagInput('a', 'c-diet'))).toBe('ok');
  });
});

describe('memory tags repository: merge', () => {
  test('recipes of the merged tag get the target, without duplicates, and the tag is deleted', async () => {
    const { repo, state } = await withCategories();
    await repo.createTag('t1', tagInput('a', 'c-diet'));
    await repo.createTag('t2', tagInput('b', 'c-diet'));
    state.recipeTags.push(
      { recipeId: 'r1', tagId: 't1' },
      { recipeId: 'r2', tagId: 't1' },
      { recipeId: 'r2', tagId: 't2' },
    );
    expect(await repo.mergeTag('t1', 't2')).toBe('ok');
    expect(state.tags.map((t) => t.id)).toEqual(['t2']);
    expect(state.recipeTags.sort((a, b) => a.recipeId.localeCompare(b.recipeId))).toEqual([
      { recipeId: 'r1', tagId: 't2' },
      { recipeId: 'r2', tagId: 't2' },
    ]);
  });

  test('merging into a single-choice category conflicts when a recipe has both', async () => {
    const { repo, state } = await withCategories();
    await repo.createTag('t1', tagInput('a', 'c-diet'));
    await repo.createTag('t2', tagInput('b', 'c-course'));
    await repo.createTag('t3', tagInput('c', 'c-course'));
    // r1 has the merged tag and another tag of the target category.
    state.recipeTags.push({ recipeId: 'r1', tagId: 't1' }, { recipeId: 'r1', tagId: 't3' });
    expect(await repo.mergeTag('t1', 't2')).toBe('single_choice_conflict');
    expect(state.tags.map((t) => t.id)).toContain('t1');
  });

  test('merging a tag with a recipe that already has the target is fine in a single-choice category', async () => {
    const { repo, state } = await withCategories();
    await repo.createTag('t1', tagInput('a', 'c-course'));
    await repo.createTag('t2', tagInput('b', 'c-course'));
    state.recipeTags.push({ recipeId: 'r1', tagId: 't1' }, { recipeId: 'r1', tagId: 't2' });
    expect(await repo.mergeTag('t1', 't2')).toBe('ok');
    expect(state.recipeTags).toEqual([{ recipeId: 'r1', tagId: 't2' }]);
  });
});

describe('memory units repository', () => {
  const unit = (slug: string): Unit & { id: string } => ({
    id: `id-${slug}`,
    slug,
    rounding: 'decimal',
    labels: { en: slug },
    aliases: { en: [slug] },
  });

  test('create refuses a used slug and puts new units last', async () => {
    const state = emptyState();
    const repo = createMemoryUnitsRepository(() => state);
    expect(await repo.create(unit('g'))).toBe('ok');
    expect(await repo.create(unit('kg'))).toBe('ok');
    expect(await repo.create({ ...unit('g'), id: 'other' })).toBe('slug_taken');
    expect((await repo.list()).map((u) => [u.slug, u.position])).toEqual([
      ['g', 0],
      ['kg', 1],
    ]);
  });

  test('update keeps the position, refuses another slug in use, reports unknown ids', async () => {
    const state = emptyState();
    const repo = createMemoryUnitsRepository(() => state);
    await repo.create(unit('g'));
    await repo.create(unit('kg'));
    expect(await repo.update('id-kg', { ...unit('kg'), rounding: 'fraction' })).toBe('ok');
    expect((await repo.list())[1]).toMatchObject({ slug: 'kg', rounding: 'fraction', position: 1 });
    expect(await repo.update('id-kg', unit('g'))).toBe('slug_taken');
    expect(await repo.update('missing', unit('x'))).toBe('not_found');
  });

  test('delete tells whether the unit existed, reorder follows the ids', async () => {
    const state = emptyState();
    const repo = createMemoryUnitsRepository(() => state);
    await repo.create(unit('a'));
    await repo.create(unit('b'));
    await repo.create(unit('c'));
    expect(await repo.delete('id-b')).toBe(true);
    expect(await repo.delete('id-b')).toBe(false);
    await repo.reorder(['id-c', 'id-a']);
    expect((await repo.list()).map((u) => u.slug)).toEqual(['c', 'a']);
  });

  test('list returns a new array on every call (the unit index is cached per array)', async () => {
    const state = emptyState();
    const repo = createMemoryUnitsRepository(() => state);
    await repo.create(unit('a'));
    expect(await repo.list()).not.toBe(await repo.list());
  });
});

describe('memory system repository', () => {
  test('settings are undefined until saved, then a copy is kept', async () => {
    const state = emptyState();
    const repo = createMemorySystemRepository(() => state);
    expect(await repo.findSettings()).toBeUndefined();
    const settings = { publicGallery: true };
    await repo.saveSettings(settings, new Date(0));
    settings.publicGallery = false;
    expect(await repo.findSettings()).toEqual({ publicGallery: true });
  });
});

describe('memory rate limit repository', () => {
  afterEach(() => setSystemTime());

  test('counts hits inside a window and resets after it', async () => {
    setSystemTime(new Date('2026-01-01T10:00:00Z'));
    const repo = createMemoryRateLimitRepository();
    expect((await repo.hit('k', 60)).count).toBe(1);
    setSystemTime(new Date('2026-01-01T10:00:30Z'));
    const second = await repo.hit('k', 60);
    expect(second.count).toBe(2);
    // The window ends 60 s after the first hit, not after the last one.
    expect(second.resetAt).toEqual(new Date('2026-01-01T10:01:00Z'));
    setSystemTime(new Date('2026-01-01T10:01:01Z'));
    const fresh = await repo.hit('k', 60);
    expect(fresh.count).toBe(1);
    expect(fresh.resetAt).toEqual(new Date('2026-01-01T10:02:01Z'));
  });

  test('keys count separately', async () => {
    const repo = createMemoryRateLimitRepository();
    await repo.hit('a', 60);
    await repo.hit('a', 60);
    expect((await repo.hit('b', 60)).count).toBe(1);
  });

  test('deleteAll forgets every counter and each repository has its own', async () => {
    const repo = createMemoryRateLimitRepository();
    await repo.hit('a', 60);
    await repo.deleteAll();
    expect((await repo.hit('a', 60)).count).toBe(1);
    expect((await createMemoryRateLimitRepository().hit('a', 60)).count).toBe(1);
  });

  test('deleteOlderThan drops counters whose window ended before the date', async () => {
    setSystemTime(new Date('2026-01-01T10:00:00Z'));
    const repo = createMemoryRateLimitRepository();
    await repo.hit('old', 60);
    setSystemTime(new Date('2026-01-01T10:10:00Z'));
    await repo.hit('new', 60);
    await repo.deleteOlderThan(new Date('2026-01-01T10:05:00Z'));
    expect((await repo.hit('old', 60)).count).toBe(1);
    expect((await repo.hit('new', 60)).count).toBe(2);
  });
});
