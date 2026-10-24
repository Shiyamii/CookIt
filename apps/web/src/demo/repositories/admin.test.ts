import { describe, expect, test } from 'bun:test';
import { emptyState, type DemoState, type DemoUser, type StoredRecipe } from '../state';
import { DemoUnavailableError } from '../unavailable';
import { createMemoryInvitesRepository, createMemoryUsersRepository } from './admin';

const T = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 10, minutes));

function user(id: string, extra: Partial<DemoUser> = {}): DemoUser {
  return {
    id,
    name: id,
    email: `${id}@x.test`,
    emailVerified: false,
    image: null,
    username: id.toLowerCase(),
    displayUsername: id,
    role: 'user',
    locale: 'en',
    listed: true,
    disabledAt: null,
    twoFactorEnabled: false,
    createdAt: T(0),
    updatedAt: T(0),
    ...extra,
  };
}

function recipe(id: string, ownerId: string, extra: Partial<StoredRecipe> = {}): StoredRecipe {
  return {
    id,
    ownerId,
    slug: id,
    baseLang: 'en',
    servings: 2,
    visibility: 'public',
    shareToken: null,
    sourceUrl: null,
    copiedFromId: null,
    copiedFromOwnerId: null,
    hasSteps: true,
    authorNote: '',
    createdAt: T(0),
    updatedAt: T(0),
    ...extra,
  };
}

function setup(users: DemoUser[]) {
  const state: DemoState = { ...emptyState(), users };
  return { state, users: createMemoryUsersRepository(() => state) };
}

describe('demo users repository', () => {
  test('the last enabled admin is never disabled nor deleted', async () => {
    const { users } = setup([user('Ann', { role: 'admin' }), user('Bob')]);
    expect(await users.disable('Ann', T(1))).toBe('last_admin');
    expect(await users.delete('Ann')).toBe('last_admin');
    expect(await users.disable('Bob', T(1))).toBe('done');
    expect((await users.findById('Bob'))?.disabledAt).toEqual(T(1));
    // Disabled again: the first date stays.
    await users.disable('Bob', T(2));
    expect((await users.findById('Bob'))?.disabledAt).toEqual(T(1));
    await users.enable('Bob');
    expect((await users.findById('Bob'))?.disabledAt).toBeNull();
  });

  test('another enabled admin lets one go', async () => {
    const { users } = setup([user('Ann', { role: 'admin' }), user('Cid', { role: 'admin' })]);
    expect(await users.disable('Ann', T(1))).toBe('done');
    expect(await users.disable('Cid', T(1))).toBe('last_admin');
  });

  test('a deleted account takes what it owns; copies of its recipes keep theirs', async () => {
    const { state, users } = setup([user('Ann', { role: 'admin' }), user('Bob')]);
    state.recipes = [
      recipe('mine', 'Bob'),
      recipe('copy', 'Ann', { copiedFromId: 'mine', copiedFromOwnerId: 'Bob' }),
    ];
    state.translations = [
      {
        recipeId: 'mine',
        lang: 'en',
        title: 'T',
        description: '',
        summary: '',
        extraMeta: {},
        bodyMarkdown: '',
        searchText: '',
        updatedAt: T(0),
      },
    ];
    state.notes = [
      { userId: 'Ann', recipeId: 'mine', text: 'n', updatedAt: T(0) },
      { userId: 'Bob', recipeId: 'copy', text: 'n', updatedAt: T(0) },
    ];
    state.saved = [{ userId: 'Ann', recipeId: 'mine', shareToken: null, createdAt: T(0) }];
    expect(await users.delete('Bob')).toBe('done');
    expect(state.users.map((u) => u.id)).toEqual(['Ann']);
    expect(state.recipes.map((r) => r.id)).toEqual(['copy']);
    expect(state.recipes[0]?.copiedFromOwnerId).toBeNull();
    expect(state.translations).toEqual([]);
    expect(state.notes).toEqual([]);
    expect(state.saved).toEqual([]);
  });

  test('usernames are found whatever their case; the list is by creation date', async () => {
    const { users } = setup([user('Zed', { createdAt: T(5) }), user('Amy', { createdAt: T(1) })]);
    expect((await users.findByUsername('ZED'))?.id).toBe('Zed');
    expect((await users.list()).map((u) => u.id)).toEqual(['Amy', 'Zed']);
  });
});

describe('demo invites repository', () => {
  const invite = (id: string, extra = {}) => ({
    id,
    tokenHash: `hash-${id}`,
    expiresAt: T(60),
    createdBy: 'Ann',
    ...extra,
  });

  test('created, listed newest first, found by hash, revoked once while pending', async () => {
    const state: DemoState = { ...emptyState(), users: [user('Ann', { role: 'admin' })] };
    const invites = createMemoryInvitesRepository(() => state);
    await invites.create({ ...invite('a'), createdAt: T(1) });
    await invites.create({ ...invite('b'), createdAt: T(2) });
    expect((await invites.list()).map((i) => i.id)).toEqual(['b', 'a']);
    expect((await invites.findByTokenHash('hash-a'))?.id).toBe('a');
    expect(await invites.revoke('a', T(3))).toBe(true);
    expect(await invites.revoke('a', T(4))).toBe(false);
    // Expired: no longer pending.
    expect(await invites.revoke('b', T(61))).toBe(false);
  });

  test('accounts are never created in the demo', async () => {
    const invites = createMemoryInvitesRepository(() => emptyState());
    await expect(invites.accept('hash', {} as never, T(0))).rejects.toBeInstanceOf(
      DemoUnavailableError,
    );
  });

  test('emails in use and admins are read from the accounts', async () => {
    const state: DemoState = { ...emptyState(), users: [user('Ann', { role: 'admin' })] };
    const invites = createMemoryInvitesRepository(() => state);
    expect(await invites.emailTaken('ANN@x.test')).toBe(true);
    expect(await invites.adminExists()).toBe(true);
    state.users[0]!.disabledAt = T(1);
    expect(await invites.adminExists()).toBe(false);
  });
});
