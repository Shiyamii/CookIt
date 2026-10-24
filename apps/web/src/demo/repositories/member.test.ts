import { describe, expect, test } from 'bun:test';
import type { AlarmSettings, CookState, ShoppingState } from '@cookit/shared';
import { emptyState, type DemoState, type DemoUser } from '../state';
import {
  createMemoryCookingRepository,
  createMemoryMembersRepository,
  createMemoryProfileRepository,
  createMemoryPushRepository,
  createMemoryShoppingRepository,
} from './member';

const T = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 10, minutes));

function user(id: string, name: string, extra: Partial<DemoUser> = {}): DemoUser {
  return {
    id,
    name,
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

const recipe = (id: string, ownerId: string, visibility: 'private' | 'unlisted' | 'public') => ({
  id,
  ownerId,
  slug: id,
  baseLang: 'en' as const,
  servings: 2,
  visibility,
  shareToken: null,
  sourceUrl: null,
  copiedFromId: null,
  copiedFromOwnerId: null,
  hasSteps: true,
  authorNote: '',
  createdAt: T(0),
  updatedAt: T(0),
});

describe('memory members repository', () => {
  function setup() {
    const state: DemoState = emptyState();
    state.users = [
      user('Zed', 'Zed'),
      user('Amy', 'Amy', { image: '/images/avatars/a' }),
      user('Hidden', 'Hidden', { listed: false }),
      user('Gone', 'Gone', { disabledAt: T(5) }),
    ];
    state.recipes = [
      recipe('r1', 'Amy', 'public'),
      recipe('r2', 'Amy', 'public'),
      recipe('r3', 'Amy', 'unlisted'),
      recipe('r4', 'Amy', 'private'),
      recipe('r5', 'Zed', 'public'),
    ];
    return { state, repo: createMemoryMembersRepository(() => state) };
  }

  test('lists only enabled, listed accounts by name', async () => {
    const { repo } = setup();
    expect((await repo.listListed()).map((m) => m.name)).toEqual(['Amy', 'Zed']);
  });

  test('equal names are ordered by id', async () => {
    const { repo, state } = setup();
    state.users.push(user('Bbb', 'Amy'));
    expect((await repo.listListed()).map((m) => m.username)).toEqual(['Amy', 'Bbb', 'Zed']);
  });

  test('a summary counts only the public recipes of the member', async () => {
    const { repo } = setup();
    const [amy, zed] = await repo.listListed();
    expect(amy).toEqual({
      username: 'Amy',
      name: 'Amy',
      image: '/images/avatars/a',
      publicRecipes: 2,
    });
    expect(zed?.publicRecipes).toBe(1);
  });

  test('the username shown is the display one, else the lowercase one', async () => {
    const { repo, state } = setup();
    state.users.push(user('Kim', 'Kim', { displayUsername: '' }));
    const kim = (await repo.listListed()).find((m) => m.name === 'Kim');
    expect(kim?.username).toBe('kim');
  });

  test('findByUsername ignores case and finds unlisted members too', async () => {
    const { repo } = setup();
    expect(await repo.findByUsername('AMY')).toMatchObject({
      id: 'Amy',
      username: 'Amy',
      listed: true,
      publicRecipes: 2,
    });
    expect(await repo.findByUsername('hidden')).toMatchObject({ id: 'Hidden', listed: false });
  });

  test('findByUsername does not find a disabled or unknown account', async () => {
    const { repo } = setup();
    expect(await repo.findByUsername('gone')).toBeUndefined();
    expect(await repo.findByUsername('nobody')).toBeUndefined();
  });

  test('isListed and setListed, unknown accounts are not listed', async () => {
    const { repo } = setup();
    expect(await repo.isListed('Hidden')).toBe(false);
    await repo.setListed('Hidden', true);
    expect(await repo.isListed('Hidden')).toBe(true);
    expect((await repo.listListed()).map((m) => m.name)).toContain('Hidden');
    expect(await repo.isListed('nope')).toBe(false);
    await repo.setListed('nope', true);
  });

  test('a disabled account stays not found even when listed', async () => {
    const { repo, state } = setup();
    const gone = state.users.find((u) => u.id === 'Gone');
    if (gone) gone.listed = true;
    expect((await repo.listListed()).map((m) => m.name)).not.toContain('Gone');
  });
});

const cooking = () => {
  const state = emptyState();
  return createMemoryCookingRepository(() => state);
};
const shopping = () => {
  const state = emptyState();
  return createMemoryShoppingRepository(() => state);
};

describe('memory cooking repository', () => {
  const cookState = (label: string): CookState => ({ items: [], timers: [], label }) as never;

  test('no active session before the first save', async () => {
    const repo = cooking();
    expect(await repo.findActive('u1')).toBeUndefined();
  });

  test('every save bumps the version from 1 and replaces the state', async () => {
    const state = emptyState();
    const repo = createMemoryCookingRepository(() => state);
    expect(await repo.save('u1', cookState('a'), { now: T(1), newId: 'x' })).toBe(1);
    expect(await repo.save('u1', cookState('b'), { now: T(2), newId: 'y' })).toBe(2);
    expect(state.cookSessions).toHaveLength(1);
    expect(await repo.findActive('u1')).toEqual({
      version: 2,
      updatedAt: T(2),
      state: cookState('b'),
    });
  });

  test('sessions are per user', async () => {
    const repo = cooking();
    await repo.save('u1', cookState('a'), { now: T(1), newId: 'x' });
    expect(await repo.findActive('u2')).toBeUndefined();
    expect(await repo.end('u2', T(2))).toBe(false);
  });

  test('change applies the function to the current state and bumps the version', async () => {
    const repo = cooking();
    await repo.save('u1', cookState('a'), { now: T(1), newId: 'x' });
    let seen: unknown;
    const changed = await repo.change(
      'u1',
      (current) => {
        seen = current;
        return cookState('c');
      },
      T(3),
    );
    expect(changed).toBe(true);
    expect(seen).toEqual(cookState('a'));
    expect(await repo.findActive('u1')).toMatchObject({ version: 2, updatedAt: T(3) });
  });

  test('change does nothing without a session or when the function returns undefined', async () => {
    const repo = cooking();
    expect(await repo.change('u1', () => cookState('x'), T(1))).toBe(false);
    await repo.save('u1', cookState('a'), { now: T(1), newId: 'x' });
    expect(await repo.change('u1', () => undefined, T(2))).toBe(false);
    expect(await repo.findActive('u1')).toMatchObject({ version: 1, updatedAt: T(1) });
  });

  test('end deletes the session and a new one starts again at version 1', async () => {
    const repo = cooking();
    await repo.save('u1', cookState('a'), { now: T(1), newId: 'x' });
    await repo.save('u1', cookState('a'), { now: T(2), newId: 'x' });
    expect(await repo.end('u1', T(3))).toBe(true);
    expect(await repo.end('u1', T(3))).toBe(false);
    expect(await repo.findActive('u1')).toBeUndefined();
    expect(await repo.save('u1', cookState('n'), { now: T(4), newId: 'z' })).toBe(1);
  });
});

describe('memory shopping repository', () => {
  const list = (n: number): ShoppingState => ({ recipes: [], lines: [], n }) as never;

  test('no list before the first save, then the version counts from 1', async () => {
    const repo = shopping();
    expect(await repo.find('u1')).toBeUndefined();
    expect(await repo.save('u1', list(1), T(1))).toBe(1);
    expect(await repo.save('u1', list(2), T(2))).toBe(2);
    expect(await repo.find('u1')).toEqual({ version: 2, updatedAt: T(2), state: list(2) });
  });

  test('lists are per user', async () => {
    const repo = shopping();
    await repo.save('u1', list(1), T(1));
    expect(await repo.find('u2')).toBeUndefined();
    expect(await repo.save('u2', list(9), T(2))).toBe(1);
  });
});

describe('memory profile repository', () => {
  const alarm = (volume: number): AlarmSettings => ({
    sound: 'classic',
    volume,
    vibrate: true,
    repeat: true,
  });

  test('alarm settings are undefined until saved, then replaced per user', async () => {
    const state = emptyState();
    const repo = createMemoryProfileRepository(() => state);
    expect(await repo.findAlarm('u1')).toBeUndefined();
    await repo.saveAlarm('u1', alarm(10), T(1));
    await repo.saveAlarm('u2', alarm(20), T(1));
    await repo.saveAlarm('u1', alarm(30), T(2));
    expect(state.alarms).toHaveLength(2);
    expect(await repo.findAlarm('u1')).toEqual(alarm(30));
    expect(await repo.findAlarm('u2')).toEqual(alarm(20));
  });

  test('profile pictures are not part of the demo', async () => {
    const repo = createMemoryProfileRepository(() => emptyState());
    expect(await repo.findAvatar('x')).toBeUndefined();
    await repo.removeAvatar('u1');
    await expect(repo.replaceAvatar('u1', {} as never)).rejects.toThrow();
  });
});

describe('memory push repository', () => {
  test('nothing is stored or due', async () => {
    const repo = createMemoryPushRepository();
    expect(await repo.list('u1')).toEqual([]);
    expect(await repo.claimDue(10, 120)).toEqual([]);
    expect(await repo.delete('u1', 'e')).toBe(false);
  });
});
