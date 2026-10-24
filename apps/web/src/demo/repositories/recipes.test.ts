import { describe, expect, test } from 'bun:test';
import type { Locale } from '@cookit/shared';
import type { NewRecipe } from '../../../../server/src/modules/recipes/recipes.repository';
import { emptyState, type DemoState, type DemoUser } from '../state';
import { createMemoryRecipesRepository } from './recipes';

const T = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 10, minutes));

function user(id: string, extra: Partial<DemoUser> = {}): DemoUser {
  return {
    id,
    name: id.toUpperCase(),
    email: `${id}@x.test`,
    emailVerified: false,
    image: null,
    username: id,
    displayUsername: `${id}-display`,
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

function setup() {
  const state: DemoState = emptyState();
  state.users = [user('ann'), user('bob')];
  const repo = createMemoryRecipesRepository(() => state);
  let n = 0;
  const build = (over: Partial<NewRecipe> = {}): NewRecipe => {
    n += 1;
    return {
      id: `r${n}`,
      ownerId: 'ann',
      slug: `recipe-${n}`,
      servings: 4,
      sourceUrl: null,
      title: `Title ${n}`,
      description: '',
      summary: '',
      extraMeta: {},
      bodyMarkdown: '---\n\n---',
      searchText: `title ${n}`,
      hasSteps: true,
      tagIds: [],
      lang: 'en',
      now: T(n),
      ...over,
    };
  };
  const add = async (over: Partial<NewRecipe> = {}) => {
    const recipe = build(over);
    expect(await repo.create(recipe)).toBe('ok');
    return recipe.id;
  };
  const query = { limit: 50, offset: 0 };
  return { state, repo, add, build, query };
}

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);
const translation = (lang: Locale, title: string, searchText = title.toLowerCase()) => ({
  lang,
  title,
  description: `${title} description`,
  summary: '',
  extraMeta: {},
  bodyMarkdown: '---\n\n---',
  searchText,
});
const withoutLang = (lang: Locale, title: string) => {
  const { lang: _lang, ...content } = translation(lang, title);
  void _lang;
  return content;
};

describe('memory recipes repository: create and find', () => {
  test('create refuses a slug the owner already has, but another owner may use it', async () => {
    const { repo, add, build } = setup();
    await add({ slug: 'tarte' });
    expect(await repo.create(build({ slug: 'tarte' }))).toBe('slug_taken');
    expect(await repo.create(build({ slug: 'tarte', ownerId: 'bob' }))).toBe('ok');
  });

  test('a created recipe is private, without token, with the base translation', async () => {
    const { repo, add } = setup();
    const id = await add({ title: 'Tarte', tagIds: ['t1'] });
    expect(await repo.findById(id)).toMatchObject({
      visibility: 'private',
      shareToken: null,
      title: 'Tarte',
      tagIds: ['t1'],
      authorNote: '',
      imageIds: [],
      ownerUsername: 'ann-display',
    });
  });

  test('findById is undefined for an unknown id and findByShareToken finds by token', async () => {
    const { repo, add } = setup();
    const id = await add();
    expect(await repo.findById('nope')).toBeUndefined();
    await repo.setVisibility(id, 'unlisted', 'tok');
    expect((await repo.findByShareToken('tok'))?.id).toBe(id);
    expect(await repo.findByShareToken('other')).toBeUndefined();
  });

  test('create stores the other translations, returned sorted by language', async () => {
    const { repo, add } = setup();
    const id = await add({ translations: [translation('hu', 'Pite'), translation('fr', 'Tarte')] });
    const row = await repo.findById(id);
    expect(row?.translations.map((t) => t.lang)).toEqual(['fr', 'hu']);
    expect(row?.title).toBe('Title 1');
  });

  test('copy fields: the original visibility and owner names are exposed', async () => {
    const { repo, add } = setup();
    const original = await add({ ownerId: 'bob' });
    await repo.setVisibility(original, 'public', null);
    const copy = await add({ copiedFromId: original, copiedFromOwnerId: 'bob' });
    expect(await repo.findById(copy)).toMatchObject({
      copiedFromId: original,
      copiedFromOwnerId: 'bob',
      copiedFromOwnerName: 'BOB',
      copiedFromOwnerUsername: 'bob-display',
      copiedFromVisibility: 'public',
    });
  });

  test('slugsStartingWith only returns the owner slugs with that prefix', async () => {
    const { repo, add } = setup();
    await add({ slug: 'tarte' });
    await add({ slug: 'tarte-2' });
    await add({ slug: 'gateau' });
    await add({ slug: 'tarte-bob', ownerId: 'bob' });
    expect((await repo.slugsStartingWith('ann', 'tarte')).sort()).toEqual(['tarte', 'tarte-2']);
  });
});

describe('memory recipes repository: update', () => {
  const content = {
    slug: 'new-slug',
    servings: 6,
    sourceUrl: 'https://x.test',
    title: 'New',
    description: 'd',
    summary: 's',
    extraMeta: { k: 'v' },
    bodyMarkdown: 'body',
    searchText: 'new',
    hasSteps: false,
  };

  test('a save writes the columns and the base translation and moves updatedAt', async () => {
    const { repo, add } = setup();
    const id = await add();
    expect(await repo.update(id, content, { now: T(30) })).toBe('ok');
    const { searchText: _searchText, ...columns } = content;
    void _searchText;
    expect(await repo.findById(id)).toMatchObject({ ...columns, updatedAt: T(30) });
  });

  test('baseVersion equal to updatedAt saves, an older one is a conflict and changes nothing', async () => {
    const { repo, add } = setup();
    const id = await add();
    expect(await repo.update(id, content, { baseVersion: T(1), now: T(30) })).toBe('ok');
    const stale = await repo.update(
      id,
      { ...content, title: 'Late' },
      { baseVersion: T(1), now: T(31) },
    );
    expect(stale).toBe('conflict');
    expect((await repo.findById(id))?.title).toBe('New');
  });

  test('an unknown recipe is not_found', async () => {
    const { repo } = setup();
    expect(await repo.update('nope', content, { now: T(1) })).toBe('not_found');
  });

  test('tags are replaced only when given', async () => {
    const { repo, add } = setup();
    const id = await add({ tagIds: ['a', 'b'] });
    await repo.update(id, content, { now: T(30) });
    expect((await repo.findById(id))?.tagIds.sort()).toEqual(['a', 'b']);
    await repo.update(id, content, { now: T(31), tagIds: ['c'] });
    expect((await repo.findById(id))?.tagIds).toEqual(['c']);
    await repo.update(id, content, { now: T(32), tagIds: [] });
    expect((await repo.findById(id))?.tagIds).toEqual([]);
  });

  test('a save leaves the translations of other languages alone', async () => {
    const { repo, add } = setup();
    const id = await add({ translations: [translation('fr', 'Tarte')] });
    await repo.update(id, content, { now: T(30) });
    expect((await repo.findById(id))?.translations[0]?.title).toBe('Tarte');
  });

  test('setVisibility and setAuthorNote do not change updatedAt', async () => {
    const { repo, add } = setup();
    const id = await add();
    await repo.setVisibility(id, 'public', null);
    await repo.setAuthorNote(id, 'hello');
    expect(await repo.findById(id)).toMatchObject({
      visibility: 'public',
      authorNote: 'hello',
      updatedAt: T(1),
    });
  });
});

describe('memory recipes repository: lists', () => {
  test('listPublic returns only public recipes, newest update first', async () => {
    const { repo, add, query } = setup();
    const a = await add();
    const b = await add();
    const c = await add();
    const hidden = await add();
    for (const id of [a, b, c]) await repo.setVisibility(id, 'public', null);
    await repo.setVisibility(hidden, 'unlisted', 'tok');
    expect(ids(await repo.listPublic(query))).toEqual([c, b, a]);
  });

  test('the same updatedAt is ordered by id', async () => {
    const { repo, add, query } = setup();
    const b = await add({ id: 'b', now: T(5) });
    const a = await add({ id: 'a', now: T(5) });
    await repo.setVisibility(a, 'public', null);
    await repo.setVisibility(b, 'public', null);
    expect(ids(await repo.listPublic(query))).toEqual(['a', 'b']);
  });

  test('offset and limit page the ordered list', async () => {
    const { repo, add } = setup();
    const all: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await add();
      await repo.setVisibility(id, 'public', null);
      all.unshift(id);
    }
    expect(ids(await repo.listPublic({ limit: 2, offset: 0 }))).toEqual(all.slice(0, 2));
    expect(ids(await repo.listPublic({ limit: 2, offset: 2 }))).toEqual(all.slice(2, 4));
    expect(ids(await repo.listPublic({ limit: 2, offset: 4 }))).toEqual(all.slice(4));
    expect(await repo.listPublic({ limit: 2, offset: 9 })).toEqual([]);
  });

  test('listPublicOf keeps the public recipes of one owner', async () => {
    const { repo, add, query } = setup();
    const a = await add();
    const b = await add({ ownerId: 'bob' });
    await repo.setVisibility(a, 'public', null);
    await repo.setVisibility(b, 'public', null);
    expect(ids(await repo.listPublicOf('bob', query))).toEqual([b]);
  });

  test('all the tags asked are required', async () => {
    const { repo, add, query } = setup();
    const both = await add({ tagIds: ['x', 'y'] });
    const one = await add({ tagIds: ['x'] });
    for (const id of [both, one]) await repo.setVisibility(id, 'public', null);
    expect(ids(await repo.listPublic({ ...query, tagIds: ['x', 'y'] }))).toEqual([both]);
    expect(ids(await repo.listPublic({ ...query, tagIds: ['x'] })).sort()).toEqual(
      [both, one].sort(),
    );
    expect(await repo.listPublic({ ...query, tagIds: ['z'] })).toEqual([]);
  });

  test('every searched word is a prefix of a word of the text', async () => {
    const { repo, add, query } = setup();
    const id = await add({ searchText: 'tarte aux pommes' });
    const other = await add({ searchText: 'tarte au citron' });
    for (const r of [id, other]) await repo.setVisibility(r, 'public', null);
    expect(ids(await repo.listPublic({ ...query, tsquery: 'tar:* & pom:*' }))).toEqual([id]);
    expect(ids(await repo.listPublic({ ...query, tsquery: 'tarte:*' })).sort()).toEqual(
      [id, other].sort(),
    );
    expect(await repo.listPublic({ ...query, tsquery: 'arte:*' })).toEqual([]);
  });

  test('search matches the base language or the shown translation, not another one', async () => {
    const { repo, add, query } = setup();
    const id = await add({
      searchText: 'apple pie',
      translations: [
        translation('fr', 'Tarte', 'tarte aux pommes'),
        translation('hu', 'Pite', 'alma pite'),
      ],
    });
    await repo.setVisibility(id, 'public', null);
    expect(ids(await repo.listPublic({ ...query, tsquery: 'apple:*' }))).toEqual([id]);
    expect(ids(await repo.listPublic({ ...query, tsquery: 'pomm:*', lang: 'fr' }))).toEqual([id]);
    expect(await repo.listPublic({ ...query, tsquery: 'pomm:*' })).toEqual([]);
    expect(await repo.listPublic({ ...query, tsquery: 'alma:*', lang: 'fr' })).toEqual([]);
    expect(ids(await repo.listPublic({ ...query, tsquery: 'alma:*', lang: 'hu' }))).toEqual([id]);
  });

  test('the asked language is shown when the recipe has it, else the base language', async () => {
    const { repo, add, query } = setup();
    const id = await add({ title: 'Pie', translations: [translation('fr', 'Tarte')] });
    await repo.setVisibility(id, 'public', null);
    expect((await repo.listPublic({ ...query, lang: 'fr' }))[0]).toMatchObject({
      lang: 'fr',
      title: 'Tarte',
      description: 'Tarte description',
    });
    expect((await repo.listPublic({ ...query, lang: 'hu' }))[0]).toMatchObject({
      lang: 'en',
      title: 'Pie',
    });
    expect((await repo.listPublic(query))[0]).toMatchObject({ lang: 'en', title: 'Pie' });
  });

  test('mine is true only for the viewer own recipes and false without viewer', async () => {
    const { repo, add, query } = setup();
    const a = await add();
    const b = await add({ ownerId: 'bob' });
    for (const id of [a, b]) await repo.setVisibility(id, 'public', null);
    const rows = await repo.listPublic({ ...query, viewerId: 'ann' });
    expect(rows.find((r) => r.id === a)?.mine).toBe(true);
    expect(rows.find((r) => r.id === b)?.mine).toBe(false);
    expect((await repo.listPublic(query)).every((r) => !r.mine)).toBe(true);
  });

  test('a recipe whose owner is gone is left out', async () => {
    const { repo, add, state, query } = setup();
    const id = await add();
    await repo.setVisibility(id, 'public', null);
    state.users = state.users.filter((u) => u.id !== 'ann');
    expect(await repo.listPublic(query)).toEqual([]);
  });
});

describe('memory recipes repository: library scopes', () => {
  async function library() {
    const ctx = setup();
    const { repo, add } = ctx;
    const mine = await add({ ownerId: 'bob' });
    const pub = await add({ ownerId: 'ann' });
    const unl = await add({ ownerId: 'ann' });
    const priv = await add({ ownerId: 'ann' });
    await repo.setVisibility(pub, 'public', null);
    await repo.setVisibility(unl, 'unlisted', 'tok1');
    return { ...ctx, mine, pub, unl, priv };
  }

  test('mine: only the user own recipes, whatever the visibility', async () => {
    const { repo, query, mine } = await library();
    expect(ids(await repo.listLibrary('bob', 'mine', query))).toEqual([mine]);
  });

  test('saved: links to a public recipe, or to an unlisted one with the current token', async () => {
    const { repo, query, pub, unl, priv } = await library();
    await repo.saveLink('bob', pub, null, T(40));
    await repo.saveLink('bob', unl, 'tok1', T(40));
    await repo.saveLink('bob', priv, null, T(40));
    expect(ids(await repo.listLibrary('bob', 'saved', query)).sort()).toEqual([pub, unl].sort());
  });

  test('a stale share token or a private recipe drops the link from the lists', async () => {
    const { repo, query, unl, pub } = await library();
    await repo.saveLink('bob', unl, 'tok1', T(40));
    await repo.saveLink('bob', pub, null, T(40));
    await repo.setVisibility(unl, 'unlisted', 'tok2');
    await repo.setVisibility(pub, 'private', null);
    expect(await repo.listLibrary('bob', 'saved', query)).toEqual([]);
    // Once public, the link counts again whatever token it was added with.
    await repo.setVisibility(unl, 'public', null);
    expect(ids(await repo.listLibrary('bob', 'saved', query))).toEqual([unl]);
  });

  test('an unlisted link added without token does not show', async () => {
    const { repo, query, unl } = await library();
    await repo.saveLink('bob', unl, null, T(40));
    expect(await repo.listLibrary('bob', 'saved', query)).toEqual([]);
  });

  test('a link to the user own recipe never shows in saved, nor twice in all', async () => {
    const { repo, query, mine } = await library();
    await repo.saveLink('bob', mine, null, T(40));
    expect(await repo.listLibrary('bob', 'saved', query)).toEqual([]);
    expect(ids(await repo.listLibrary('bob', 'all', query))).toEqual([mine]);
  });

  test('all: own and saved recipes together, once each, with mine set', async () => {
    const { repo, query, mine, pub } = await library();
    await repo.saveLink('bob', pub, null, T(40));
    const rows = await repo.listLibrary('bob', 'all', query);
    expect(ids(rows).sort()).toEqual([mine, pub].sort());
    expect(rows.find((r) => r.id === mine)?.mine).toBe(true);
    expect(rows.find((r) => r.id === pub)?.mine).toBe(false);
  });

  test('saveLink again replaces the token without a second link', async () => {
    const { repo, state, unl } = await library();
    await repo.saveLink('bob', unl, 'tok1', T(40));
    await repo.saveLink('bob', unl, 'tok2', T(41));
    expect(state.saved).toHaveLength(1);
    expect(await repo.findSaved('bob', unl)).toEqual({ shareToken: 'tok2' });
    await repo.removeLink('bob', unl);
    expect(await repo.findSaved('bob', unl)).toBeUndefined();
  });
});

describe('memory recipes repository: delete and translations', () => {
  test('delete removes the recipe with its translations, tags, notes and links', async () => {
    const { repo, add, state } = setup();
    const id = await add({ tagIds: ['a'], translations: [translation('fr', 'Tarte')] });
    const keep = await add({ tagIds: ['a'] });
    await repo.saveNote('bob', id, 'note', T(10));
    await repo.saveNote('bob', keep, 'keep', T(10));
    await repo.saveLink('bob', id, null, T(10));
    await repo.delete(id);
    expect(await repo.findById(id)).toBeUndefined();
    expect(state.translations.map((t) => t.recipeId)).toEqual([keep]);
    expect(state.recipeTags).toEqual([{ recipeId: keep, tagId: 'a' }]);
    expect(state.notes.map((n) => n.recipeId)).toEqual([keep]);
    expect(state.saved).toEqual([]);
  });

  test('saveTranslation creates then replaces, deleteTranslation says whether it existed', async () => {
    const { repo, add } = setup();
    const id = await add();
    await repo.saveTranslation(id, 'fr', withoutLang('fr', 'Tarte'), T(20));
    await repo.saveTranslation(id, 'fr', withoutLang('fr', 'Tarte 2'), T(21));
    const row = await repo.findById(id);
    expect(row?.translations).toHaveLength(1);
    expect(row?.translations[0]?.title).toBe('Tarte 2');
    expect(await repo.deleteTranslation(id, 'fr')).toBe(true);
    expect(await repo.deleteTranslation(id, 'fr')).toBe(false);
  });

  test('saving a translation does not change the recipe updatedAt', async () => {
    const { repo, add } = setup();
    const id = await add();
    await repo.saveTranslation(id, 'fr', withoutLang('fr', 'Tarte'), T(50));
    expect((await repo.findById(id))?.updatedAt).toEqual(T(1));
  });
});

describe('memory recipes repository: notes', () => {
  test('one note per user and recipe, replaced, and removed by an empty text', async () => {
    const { repo, add, state } = setup();
    const id = await add();
    await repo.saveNote('bob', id, 'one', T(10));
    await repo.saveNote('bob', id, 'two', T(11));
    await repo.saveNote('ann', id, 'mine', T(11));
    expect(state.notes).toHaveLength(2);
    expect(await repo.findNote('bob', id)).toBe('two');
    await repo.saveNote('bob', id, '', T(12));
    expect(await repo.findNote('bob', id)).toBeUndefined();
    expect(await repo.findNote('ann', id)).toBe('mine');
  });
});

describe('memory recipes repository: pick and export', () => {
  test('pick is the same for the same seed and excludes the asked recipe', async () => {
    const { repo, add } = setup();
    const a = await add();
    const b = await add({ ownerId: 'bob' });
    await repo.setVisibility(b, 'public', null);
    const first = await repo.pick('ann', 'day-1');
    expect(first).toBeDefined();
    expect((await repo.pick('ann', 'day-1'))?.id).toBe(first?.id);
    const other = await repo.pick('ann', 'day-1', first?.id);
    expect(other?.id).toBe(first?.id === a ? b : a);
  });

  test('pick skips recipes without steps and other people private or unlisted ones', async () => {
    const { repo, add } = setup();
    await add({ hasSteps: false });
    const hiddenBob = await add({ ownerId: 'bob' });
    await repo.setVisibility(hiddenBob, 'unlisted', 'tok');
    expect(await repo.pick('ann', 'seed')).toBeUndefined();
  });

  test('pick returns nothing when the only candidate is excluded', async () => {
    const { repo, add } = setup();
    const only = await add();
    expect(await repo.pick('ann', 's', only)).toBeUndefined();
  });

  test('pick shows the asked translation and sets mine', async () => {
    const { repo, add } = setup();
    await add({ translations: [translation('fr', 'Tarte')] });
    expect(await repo.pick('ann', 's', undefined, 'fr')).toMatchObject({
      title: 'Tarte',
      mine: true,
    });
  });

  test('listAllByOwner is the owner base-language recipes, oldest first', async () => {
    const { repo, add } = setup();
    const a = await add({ now: T(9) });
    const b = await add({ now: T(3) });
    await add({ ownerId: 'bob' });
    expect(ids(await repo.listAllByOwner('ann'))).toEqual([b, a]);
  });
});

describe('memory recipes repository: photos are not part of the demo', () => {
  test('uploads are refused and nothing is ever found', async () => {
    const { repo, add } = setup();
    const id = await add();
    expect(await repo.addImage(id, {} as never, 6)).toBe('too_many');
    expect(await repo.deleteImage(id, 'x')).toBe(false);
    expect(await repo.findImage('x', 'full')).toBeUndefined();
    expect(await repo.imageBytesOfOwner('ann')).toBe(0);
    expect(await repo.imageBytesOfRecipe(id)).toBe(0);
    expect((await repo.findById(id))?.imageIds).toEqual([]);
  });
});
