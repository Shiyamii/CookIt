import { describe, expect, test } from 'bun:test';
import type { RecipePage, RecipeSearch } from '@cookit/shared';
import type { MemberRow, MembersRepository } from './members.repository';
import { createMembersService } from './members.service';

const SEARCH: RecipeSearch = { page: 1, tags: [], scope: 'all' };

function member(id: string, overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    id,
    username: id,
    name: `Name ${id}`,
    image: null,
    publicRecipes: 0,
    listed: false,
    ...overrides,
  };
}

function setup(rows: MemberRow[], disabled: string[] = []) {
  const members = new Map(rows.map((row) => [row.id, row]));
  const calls: { ownerId: string; viewerId: string }[] = [];
  const enabled = () => [...members.values()].filter((m) => !disabled.includes(m.id));
  const repository: MembersRepository = {
    async listListed() {
      return enabled()
        .filter((m) => m.listed)
        .map((m) => ({
          username: m.username,
          name: m.name,
          image: m.image,
          publicRecipes: m.publicRecipes,
        }));
    },
    async findByUsername(username) {
      return enabled().find((m) => m.username.toLowerCase() === username.toLowerCase());
    },
    async isListed(userId) {
      return members.get(userId)?.listed ?? false;
    },
    async setListed(userId, listed) {
      const found = members.get(userId);
      if (found) found.listed = listed;
    },
  };
  const page: RecipePage = { recipes: [], hasMore: false };
  const service = createMembersService({
    repository,
    recipes: {
      async publicOf(ownerId, _search, viewerId) {
        calls.push({ ownerId, viewerId });
        return page;
      },
    },
  });
  return { service, calls, page };
}

describe('members', () => {
  test('the list only shows the members who chose to appear in it', async () => {
    const { service } = setup([member('ann', { listed: true }), member('bob')]);
    expect(await service.list()).toEqual([
      { username: 'ann', name: 'Name ann', image: null, publicRecipes: 0 },
    ]);
  });

  test('a member chooses to appear, then to leave', async () => {
    const { service } = setup([member('bob')]);
    expect(await service.listed('bob')).toEqual({ listed: false });
    expect(await service.setListed('bob', true)).toEqual({ listed: true });
    expect((await service.list()).map((m) => m.username)).toEqual(['bob']);
    await service.setListed('bob', false);
    expect(await service.list()).toEqual([]);
  });

  test('the page of an unlisted member with public recipes opens, without their id or choice', async () => {
    const { service } = setup([member('bob', { username: 'Bob', publicRecipes: 2 })]);
    expect(await service.profile('bob', 'me')).toEqual({
      username: 'Bob',
      name: 'Name bob',
      image: null,
      publicRecipes: 2,
    });
  });

  test('an unlisted member without public recipe has no page for others (no guessing)', async () => {
    const { service, calls } = setup([member('bob')]);
    expect(await service.profile('bob', 'me')).toEqual({ error: 'not_found' });
    expect(await service.recipes('bob', SEARCH, 'me')).toEqual({ error: 'not_found' });
    expect(calls).toEqual([]);
    // Their own page, with their choice.
    expect(await service.profile('bob', 'bob')).toMatchObject({ username: 'bob', listed: false });
  });

  test('a listed member has a page even without public recipe', async () => {
    const { service } = setup([member('ann', { listed: true })]);
    expect(await service.profile('ann', 'me')).toMatchObject({ username: 'ann', publicRecipes: 0 });
  });

  test('a disabled or unknown account has no page and no recipes', async () => {
    const { service, calls } = setup([member('eve', { listed: true })], ['eve']);
    expect(await service.list()).toEqual([]);
    expect(await service.profile('eve', 'me')).toEqual({ error: 'not_found' });
    expect(await service.profile('eve', 'eve')).toEqual({ error: 'not_found' });
    expect(await service.recipes('eve', SEARCH, 'me')).toEqual({ error: 'not_found' });
    expect(await service.profile('nobody', 'me')).toEqual({ error: 'not_found' });
    expect(calls).toEqual([]);
  });

  test('the recipes of a member are their public ones, for the viewer', async () => {
    const { service, calls, page } = setup([member('bob', { publicRecipes: 1 })]);
    expect(await service.recipes('bob', SEARCH, 'me')).toBe(page);
    expect(calls).toEqual([{ ownerId: 'bob', viewerId: 'me' }]);
  });

  test('the list keeps every listed member and leaves out the others and the disabled', async () => {
    const { service } = setup(
      [
        member('ann', { listed: true, publicRecipes: 3 }),
        member('bob', { listed: true }),
        member('cid'),
        member('dan', { listed: true }),
      ],
      ['dan'],
    );
    expect((await service.list()).map((m) => [m.username, m.publicRecipes])).toEqual([
      ['ann', 3],
      ['bob', 0],
    ]);
  });

  test('the list and the page never carry an id or the listed flag in the list', async () => {
    const { service } = setup([member('ann', { listed: true })]);
    expect(Object.keys((await service.list())[0]!).sort()).toEqual([
      'image',
      'name',
      'publicRecipes',
      'username',
    ]);
    const keys = Object.keys((await service.profile('ann', 'me')) as object);
    expect(keys).not.toContain('id');
    expect(keys).not.toContain('listed');
  });

  test('a username is found whatever its case', async () => {
    const { service, calls } = setup([member('bob', { username: 'Bob', listed: true })]);
    expect(await service.profile('BOB', 'me')).toMatchObject({ username: 'Bob' });
    await service.recipes('bOb', SEARCH, 'me');
    expect(calls).toEqual([{ ownerId: 'bob', viewerId: 'me' }]);
  });

  test('the search is passed on to the recipes service', async () => {
    const seen: RecipeSearch[] = [];
    const repository: MembersRepository = {
      listListed: async () => [],
      findByUsername: async () => member('bob', { listed: true }),
      isListed: async () => false,
      setListed: async () => {},
    };
    const service = createMembersService({
      repository,
      recipes: {
        async publicOf(_owner, search) {
          seen.push(search);
          return { recipes: [], hasMore: false };
        },
      },
    });
    const search: RecipeSearch = { page: 3, q: 'tarte', tags: ['a'], scope: 'all' };
    await service.recipes('bob', search, 'me');
    expect(seen).toEqual([search]);
  });

  test('a user who is not found is not listed, and setting it changes nothing', async () => {
    const { service } = setup([member('bob')]);
    expect(await service.listed('ghost')).toEqual({ listed: false });
    await service.setListed('ghost', true);
    expect(await service.list()).toEqual([]);
  });
});
