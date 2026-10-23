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

let n = 0;
const uuid = () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++n).padStart(12, '0')}`;
const line = (recipeId: string | null, name: string) => ({
  id: uuid(),
  name,
  keys: recipeId ? [name] : [],
  checked: false,
  entries: [{ id: uuid(), recipeId, name, quantity: null }],
});

const state: ShoppingState = {
  recipes: [
    { recipeId: CREPES, title: 'Crêpes', servings: 4, lang: 'fr' },
    { recipeId: GATEAU, title: 'Gâteau', servings: 6, lang: 'fr' },
  ],
  lines: [line(CREPES, 'lait'), line(null, 'papier toilette')],
};

const EMPTY: ShoppingState = { recipes: [], lines: [] };

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
    expect(list?.state.lines).toEqual(state.lines);
  });

  test('a recipe nothing refers to any more is dropped', async () => {
    const { service, lists } = setup();
    await service.save('u1', state);
    expect(lists.get('u1')?.state.recipes.map((recipe) => recipe.title)).toEqual(['Crêpes']);
  });

  test('an empty list is saved as such, not as no list', async () => {
    const { service } = setup();
    await service.save('u1', EMPTY);
    expect((await service.get('u1')).list?.state).toEqual(EMPTY);
  });

  test('a list saved in an older shape is not read back', async () => {
    const { service, lists } = setup();
    lists.set('u1', {
      version: 3,
      updatedAt: T0,
      state: { recipes: [], entries: [] } as unknown as ShoppingState,
    });
    expect(await service.get('u1')).toEqual({ list: null });
    // The next save starts it again.
    expect(await service.save('u1', EMPTY)).toEqual({ version: 4 });
  });

  test('each user has their own list', async () => {
    const { service } = setup();
    await service.save('u1', state);
    expect(await service.get('u2')).toEqual({ list: null });
  });
});
