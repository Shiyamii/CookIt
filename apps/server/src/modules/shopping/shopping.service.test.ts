import { describe, expect, test } from 'bun:test';
import type { ShoppingState } from '@cookit/shared';
import type { ShoppingListRow, ShoppingRepository } from './shopping.repository';
import { createShoppingService } from './shopping.service';

const T0 = new Date('2026-10-22T18:00:00.000Z');
const CREPES = '11111111-1111-4111-8111-111111111111';
const GATEAU = '22222222-2222-4222-8222-222222222222';

function setup() {
  const lists = new Map<string, ShoppingListRow>();
  const repository: ShoppingRepository = {
    async find(userId) {
      return lists.get(userId);
    },
    async save(userId, state, now) {
      const version = (lists.get(userId)?.version ?? 0) + 1;
      lists.set(userId, { version, updatedAt: now, state });
      return version;
    },
  };
  return { service: createShoppingService({ repository, now: () => T0 }), lists };
}

const entry = (id: string, recipeId: string | null, text: string) => ({
  id,
  recipeId,
  text,
  name: text,
  quantity: null,
  checked: false,
});

const state: ShoppingState = {
  recipes: [
    { recipeId: CREPES, title: 'Crêpes', servings: 4, lang: 'fr' },
    { recipeId: GATEAU, title: 'Gâteau', servings: 6, lang: 'fr' },
  ],
  entries: [
    entry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', CREPES, 'lait'),
    entry('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', null, 'papier toilette'),
  ],
};

describe('shopping lists', () => {
  test('no list yet: null', async () => {
    const { service } = setup();
    expect(await service.get('u1')).toEqual({ list: null });
  });

  test('each save is the next version; reading it back gives the list', async () => {
    const { service } = setup();
    expect(await service.save('u1', state)).toEqual({ version: 1 });
    expect(await service.save('u1', state)).toEqual({ version: 2 });
    const { list } = await service.get('u1');
    expect(list?.version).toBe(2);
    expect(list?.updatedAt).toBe(T0.toISOString());
    expect(list?.state.entries).toEqual(state.entries);
  });

  test('a recipe nothing refers to any more is dropped', async () => {
    const { service, lists } = setup();
    await service.save('u1', state);
    expect(lists.get('u1')?.state.recipes.map((recipe) => recipe.title)).toEqual(['Crêpes']);
  });

  test('an empty list is saved as such, not as no list', async () => {
    const { service } = setup();
    await service.save('u1', { recipes: [], entries: [] });
    expect((await service.get('u1')).list?.state).toEqual({ recipes: [], entries: [] });
  });

  test('recipes with items keep their order and entries are untouched', async () => {
    const { service, lists } = setup();
    const both: ShoppingState = {
      recipes: state.recipes,
      entries: [
        entry('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', GATEAU, 'sucre'),
        entry('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', CREPES, 'lait'),
      ],
    };
    await service.save('u1', both);
    expect(lists.get('u1')?.state).toEqual(both);
  });

  test('only free items: every recipe is dropped', async () => {
    const { service, lists } = setup();
    await service.save('u1', { recipes: state.recipes, entries: [state.entries[1]!] });
    expect(lists.get('u1')?.state.recipes).toEqual([]);
  });

  test('the next save replaces the previous list', async () => {
    const { service } = setup();
    await service.save('u1', state);
    await service.save('u1', { recipes: [], entries: [] });
    expect((await service.get('u1')).list?.state.entries).toEqual([]);
  });

  test('each user has their own list', async () => {
    const { service } = setup();
    await service.save('u1', state);
    expect(await service.get('u2')).toEqual({ list: null });
  });
});
