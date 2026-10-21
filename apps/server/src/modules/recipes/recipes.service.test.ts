import { describe, expect, test } from 'bun:test';
import { DEFAULT_UNITS, RECIPES_PAGE_SIZE, type RecipeSearch } from '@cookit/shared';
import type {
  ListQuery,
  NewRecipe,
  RecipeContent,
  RecipeListRow,
  RecipeRow,
  RecipesRepository,
} from './recipes.repository';
import { createRecipesService, freeSlug, searchQuery, slugify } from './recipes.service';

const ORIGIN = 'https://cook.example';
const T0 = new Date('2026-03-10T12:00:00.000Z');
const TOKEN = 'T'.repeat(43);
const OWNER = 'owner';
const OTHER = 'other';

const BODY =
  '### Base\n\n- 200 g farine\n- 2 oeufs\n\n---\n\n1. Mélanger.\n2. Cuire [10 min](timer:10m).';
const FIELDS = {
  title: 'Tarte aux pommes',
  description: 'Une tarte',
  servings: 4,
  extraMeta: {},
  body: BODY,
  lang: 'fr' as const,
};
const DOC = '# Tarte\n\nportions: 4\n\n---\n\n- 1 oeuf\n\n---\n\n1. Cuire.\n';
const search = (partial: Partial<RecipeSearch> = {}): RecipeSearch => ({
  page: 1,
  tags: [],
  ...partial,
});

function fakeRepository() {
  const rows = new Map<string, RecipeRow & { searchText: string }>();
  const state = { slugTakenOnce: 0, creates: 0, lastList: undefined as ListQuery | undefined };
  const toRow = (r: NewRecipe) => ({
    id: r.id,
    ownerId: r.ownerId,
    ownerName: `name-${r.ownerId}`,
    slug: r.slug,
    lang: r.lang,
    servings: r.servings,
    visibility: 'private' as const,
    shareToken: null as string | null,
    sourceUrl: r.sourceUrl,
    copiedFromId: r.copiedFromId ?? null,
    title: r.title,
    description: r.description,
    extraMeta: r.extraMeta,
    bodyMarkdown: r.bodyMarkdown,
    tagIds: r.tagIds,
    createdAt: r.now,
    updatedAt: r.now,
    searchText: r.searchText,
  });
  const repository: RecipesRepository = {
    async create(recipe) {
      state.creates++;
      if (state.slugTakenOnce > 0) {
        state.slugTakenOnce--;
        return 'slug_taken';
      }
      rows.set(recipe.id, toRow(recipe));
      return 'ok';
    },
    async findById(id) {
      return rows.get(id);
    },
    async findByShareToken(token) {
      return [...rows.values()].find((r) => r.shareToken === token);
    },
    async slugsStartingWith(ownerId, base) {
      return [...rows.values()]
        .filter((r) => r.ownerId === ownerId && r.slug.startsWith(base))
        .map((r) => r.slug);
    },
    async update(id, content: RecipeContent, options) {
      const row = rows.get(id);
      if (!row) return 'not_found';
      if (options.baseVersion && row.updatedAt.getTime() !== options.baseVersion.getTime()) {
        return 'conflict';
      }
      Object.assign(row, content, { updatedAt: options.now });
      return 'ok';
    },
    async setVisibility(id, visibility, shareToken) {
      const row = rows.get(id)!;
      row.visibility = visibility;
      row.shareToken = shareToken;
    },
    async delete(id) {
      rows.delete(id);
    },
    async listByOwner(ownerId, query) {
      state.lastList = query;
      return [...rows.values()].filter((r) => r.ownerId === ownerId) as RecipeListRow[];
    },
    async listPublic(query) {
      state.lastList = query;
      return [...rows.values()].filter((r) => r.visibility === 'public') as RecipeListRow[];
    },
  };
  return { repository, rows, state };
}

function setup() {
  const fake = fakeRepository();
  let n = 0;
  let tokens = 0;
  let clock = T0.getTime();
  const service = createRecipesService({
    repository: fake.repository,
    origin: ORIGIN,
    units: async () => DEFAULT_UNITS,
    tags: {
      // Tags `t1`… exist; `single-a` and `single-b` share a single-choice category.
      async checkSelection(tagIds) {
        const unique = [...new Set(tagIds)];
        const known = unique.every((id) => /^t\d+$|^single-[ab]$/.test(id));
        const singles = unique.filter((id) => id.startsWith('single-')).length;
        return known && singles <= 1 ? unique : undefined;
      },
      async idsOfSlugs(slugs) {
        return slugs.filter((slug) => slug.startsWith('tag-')).map((slug) => slug.slice(4));
      },
    },
    generateToken: () => (tokens++ === 0 ? TOKEN : 'U'.repeat(43)),
    newId: () => `id-${++n}`,
    now: () => new Date((clock += 1000)),
  });
  return { ...fake, service };
}

async function created(s: ReturnType<typeof setup>, owner = OWNER) {
  const r = await s.service.create(owner, FIELDS);
  if ('error' in r) throw new Error('create failed');
  return r.id;
}

describe('slugify', () => {
  test('removes accents, punctuation and case', () => {
    expect(slugify('Tarte aux pommes !')).toBe('tarte-aux-pommes');
    expect(slugify('Crème brûlée à l’orange')).toBe('creme-brulee-a-l-orange');
  });
  test('falls back when nothing usable is left', () => {
    expect(slugify('!!!')).toBe('recette');
    expect(slugify('日本')).toBe('recette');
  });
  test('is bounded and never ends with a dash', () => {
    const slug = slugify(`${'a'.repeat(79)} bbb`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('freeSlug', () => {
  test('keeps the base when free', () => expect(freeSlug('a', ['b'])).toBe('a'));
  test('picks the next free suffix', () => {
    expect(freeSlug('a', ['a'])).toBe('a-2');
    expect(freeSlug('a', ['a', 'a-2', 'a-3'])).toBe('a-4');
    expect(freeSlug('a', ['a', 'a-3'])).toBe('a-2');
  });
});

describe('searchQuery', () => {
  test('builds an AND of prefixes without accents', () => {
    expect(searchQuery('Tarte  pommes')).toBe('tarte:* & pommes:*');
    expect(searchQuery('crème')).toBe('creme:*');
  });
  test('returns undefined for nothing searchable', () => {
    expect(searchQuery(undefined)).toBeUndefined();
    expect(searchQuery('  !&|:() ')).toBeUndefined();
  });
  test('drops tsquery operators', () => {
    expect(searchQuery("a' & b | !c:*")).toBe('a:* & b:* & c:*');
  });
  test('bounds the number and length of words', () => {
    const many = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    expect(searchQuery(many)!.split(' & ')).toHaveLength(10);
    expect(searchQuery('x'.repeat(200))).toBe(`${'x'.repeat(50)}:*`);
  });
});

describe('create', () => {
  test('stores the canonical columns and body, private by default', async () => {
    const s = setup();
    const id = await created(s);
    const row = s.rows.get(id)!;
    expect(row.slug).toBe('tarte-aux-pommes');
    expect(row.visibility).toBe('private');
    expect(row.servings).toBe(4);
    expect(row.bodyMarkdown).toContain('200 g farine');
    expect(row.searchText).toContain('farine');
  });
  test('gives the same title a numbered slug', async () => {
    const s = setup();
    const a = await created(s);
    const b = await created(s);
    expect(s.rows.get(a)!.slug).toBe('tarte-aux-pommes');
    expect(s.rows.get(b)!.slug).toBe('tarte-aux-pommes-2');
  });
  test('slugs are per owner', async () => {
    const s = setup();
    await created(s);
    const id = await created(s, OTHER);
    expect(s.rows.get(id)!.slug).toBe('tarte-aux-pommes');
  });
  test('retries on slug_taken, then gives up', async () => {
    const s = setup();
    s.state.slugTakenOnce = 2;
    const r = await s.service.create(OWNER, FIELDS);
    expect('id' in r).toBe(true);
    expect(s.state.creates).toBe(3);

    const s2 = setup();
    s2.state.slugTakenOnce = 10;
    await expect(s2.service.create(OWNER, FIELDS)).rejects.toThrow();
  });
  test('refuses a body that makes the document invalid and stores nothing', async () => {
    const s = setup();
    // A body whose first part is a line of dashes cannot be split into ingredients and steps.
    const r = await s.service.create(OWNER, { ...FIELDS, title: '', body: BODY });
    expect(r).toMatchObject({ error: 'invalid_recipe' });
    expect(s.rows.size).toBe(0);
  });
  test('createFromMarkdown refuses a document without title with diagnostics', async () => {
    const s = setup();
    const r = await s.service.createFromMarkdown(OWNER, {
      markdown: 'portions: 4\n\n---\n\n- a\n\n---\n\n1. b',
      lang: 'fr',
    });
    expect(r).toMatchObject({ error: 'invalid_recipe' });
    if ('diagnostics' in r) expect(r.diagnostics.length).toBeGreaterThan(0);
    expect(s.rows.size).toBe(0);
  });
  test('createFromMarkdown stores a valid document', async () => {
    const s = setup();
    const r = await s.service.createFromMarkdown(OWNER, { markdown: DOC, lang: 'en' });
    expect('id' in r).toBe(true);
    const row = [...s.rows.values()][0]!;
    expect(row.lang).toBe('en');
    expect(row.title).toBe('Tarte');
  });
});

describe('read access', () => {
  test('a private recipe is seen by its owner only', async () => {
    const s = setup();
    const id = await created(s);
    expect(await s.service.get(id, OWNER)).toMatchObject({ isOwner: true, shareUrl: null });
    expect(await s.service.get(id, OTHER)).toEqual({ error: 'not_found' });
    expect(await s.service.get(id, null)).toEqual({ error: 'not_found' });
  });
  test('an unknown id is not_found', async () => {
    expect(await setup().service.get('nope', OWNER)).toEqual({ error: 'not_found' });
  });
  test('an unlisted recipe is not readable by id for others', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(await s.service.get(id, OTHER)).toEqual({ error: 'not_found' });
    expect(await s.service.get(id, null)).toEqual({ error: 'not_found' });
  });
  test('a public recipe is readable by anyone, and shows no share url', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    expect(await s.service.get(id, null)).toMatchObject({ isOwner: false, shareUrl: null });
    expect(await s.service.get(id, OTHER)).toMatchObject({ isOwner: false });
  });
  test('the share link works for an unlisted recipe, and only the owner sees the url', async () => {
    const s = setup();
    const id = await created(s);
    const set = await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(set).toEqual({ visibility: 'unlisted', shareUrl: `${ORIGIN}/shared#token=${TOKEN}` });
    expect(await s.service.getShared(TOKEN, null)).toMatchObject({ id, shareUrl: null });
    expect(await s.service.getShared(TOKEN, OWNER)).toMatchObject({
      isOwner: true,
      shareUrl: `${ORIGIN}/shared#token=${TOKEN}`,
    });
  });
  test('leaving unlisted deletes the token; going unlisted again gives a new link', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    await s.service.setVisibility(id, OWNER, 'private');
    expect(s.rows.get(id)!.shareToken).toBeNull();
    expect(await s.service.getShared(TOKEN, OWNER)).toEqual({ error: 'not_found' });
    const again = await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(again).toMatchObject({ shareUrl: `${ORIGIN}/shared#token=${'U'.repeat(43)}` });
    expect(await s.service.getShared(TOKEN, OWNER)).toEqual({ error: 'not_found' });
  });
  test('staying unlisted keeps the same link', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    const again = await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(again).toMatchObject({ shareUrl: `${ORIGIN}/shared#token=${TOKEN}` });
  });
  test('the old link does not work once the recipe is public', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    await s.service.setVisibility(id, OWNER, 'public');
    expect(s.rows.get(id)!.shareToken).toBeNull();
    expect(await s.service.getShared(TOKEN, null)).toEqual({ error: 'not_found' });
  });
  test('a wrong share token is not_found', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(await s.service.getShared('X'.repeat(43), null)).toEqual({ error: 'not_found' });
  });
  test('public visibility gives no share url', async () => {
    const s = setup();
    const id = await created(s);
    expect(await s.service.setVisibility(id, OWNER, 'public')).toEqual({
      visibility: 'public',
      shareUrl: null,
    });
  });
});

describe('write access', () => {
  test('only the owner can change visibility, update, or delete', async () => {
    const s = setup();
    const id = await created(s);
    const gone = { error: 'not_found' } as const;
    expect(await s.service.setVisibility(id, OTHER, 'public')).toEqual(gone);
    expect(await s.service.update(id, OTHER, { ...FIELDS, title: 'x' })).toEqual(gone);
    expect(await s.service.updateFromMarkdown(id, OTHER, { markdown: DOC })).toEqual(gone);
    expect(await s.service.delete(id, OTHER)).toEqual(gone);
    expect(s.rows.get(id)!.visibility).toBe('private');
    expect(s.rows.get(id)!.title).toBe('Tarte aux pommes');
  });
  test('a public recipe cannot be changed by others either', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    expect(await s.service.update(id, OTHER, { ...FIELDS, title: 'x' })).toEqual({
      error: 'not_found',
    });
  });
  test('the owner deletes', async () => {
    const s = setup();
    const id = await created(s);
    expect(await s.service.delete(id, OWNER)).toEqual({ ok: true });
    expect(s.rows.size).toBe(0);
    expect(await s.service.delete(id, OWNER)).toEqual({ error: 'not_found' });
  });
});

describe('update', () => {
  test('saves and returns the new version', async () => {
    const s = setup();
    const id = await created(s);
    const r = await s.service.update(id, OWNER, { ...FIELDS, description: 'Nouvelle' });
    expect(r).toEqual({ updatedAt: s.rows.get(id)!.updatedAt.toISOString() });
    expect(s.rows.get(id)!.description).toBe('Nouvelle');
  });
  test('a stale baseVersion is a conflict and changes nothing', async () => {
    const s = setup();
    const id = await created(s);
    const v1 = s.rows.get(id)!.updatedAt.toISOString();
    await s.service.update(id, OWNER, { ...FIELDS, description: 'B', baseVersion: v1 });
    const r = await s.service.update(id, OWNER, { ...FIELDS, description: 'C', baseVersion: v1 });
    expect(r).toEqual({ error: 'conflict' });
    expect(s.rows.get(id)!.description).toBe('B');
  });
  test('the current baseVersion is accepted', async () => {
    const s = setup();
    const id = await created(s);
    const v = s.rows.get(id)!.updatedAt.toISOString();
    expect(await s.service.update(id, OWNER, { ...FIELDS, baseVersion: v })).toHaveProperty(
      'updatedAt',
    );
  });
  test('without baseVersion the save always wins', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.update(id, OWNER, FIELDS);
    expect(await s.service.update(id, OWNER, FIELDS)).toHaveProperty('updatedAt');
  });
  test('an invalid markdown document is refused and the recipe is untouched', async () => {
    const s = setup();
    const id = await created(s);
    const r = await s.service.updateFromMarkdown(id, OWNER, { markdown: '# T\n\nno servings' });
    expect(r).toMatchObject({ error: 'invalid_recipe' });
    expect(s.rows.get(id)!.title).toBe('Tarte aux pommes');
  });
  test('updateFromMarkdown replaces the content and keeps the base language', async () => {
    const s = setup();
    const id = await created(s);
    expect(await s.service.updateFromMarkdown(id, OWNER, { markdown: DOC })).toHaveProperty(
      'updatedAt',
    );
    expect(s.rows.get(id)!.title).toBe('Tarte');
    expect(s.rows.get(id)!.lang).toBe('fr');
  });
  test('the slug is kept when the base is the same and follows a new title', async () => {
    const s = setup();
    await created(s);
    const id = await created(s);
    expect(s.rows.get(id)!.slug).toBe('tarte-aux-pommes-2');
    await s.service.update(id, OWNER, { ...FIELDS, description: 'x' });
    expect(s.rows.get(id)!.slug).toBe('tarte-aux-pommes-2');
    await s.service.update(id, OWNER, { ...FIELDS, title: 'Gâteau' });
    expect(s.rows.get(id)!.slug).toBe('gateau');
  });
});

describe('copy', () => {
  test('copies a public recipe as a private independent one', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    const r = await s.service.copy(id, OTHER, undefined);
    if (!('id' in r)) throw new Error('copy failed');
    const copy = s.rows.get(r.id)!;
    expect(copy).toMatchObject({
      ownerId: OTHER,
      visibility: 'private',
      copiedFromId: id,
      shareToken: null,
      title: 'Tarte aux pommes',
      lang: 'fr',
    });
    expect(copy.bodyMarkdown).toBe(s.rows.get(id)!.bodyMarkdown);
  });
  test('cannot copy a private recipe, even with a token', async () => {
    const s = setup();
    const id = await created(s);
    expect(await s.service.copy(id, OTHER, TOKEN)).toEqual({ error: 'not_found' });
  });
  test('an unlisted recipe needs its share token', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(await s.service.copy(id, OTHER, undefined)).toEqual({ error: 'not_found' });
    expect(await s.service.copy(id, OTHER, 'X'.repeat(43))).toEqual({ error: 'not_found' });
    expect(await s.service.copy(id, OTHER, TOKEN)).toHaveProperty('id');
  });
  test('the owner cannot copy their own recipe', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    expect(await s.service.copy(id, OWNER, undefined)).toEqual({ error: 'not_found' });
  });
  test('an unknown recipe is not_found', async () => {
    expect(await setup().service.copy('nope', OTHER, undefined)).toEqual({ error: 'not_found' });
  });
  test('editing the copy leaves the original alone', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    const r = await s.service.copy(id, OTHER, undefined);
    if (!('id' in r)) throw new Error('copy failed');
    await s.service.update(r.id, OTHER, { ...FIELDS, title: 'Autre' });
    expect(s.rows.get(id)!.title).toBe('Tarte aux pommes');
  });
});

describe('lists', () => {
  test('listMine only returns the owner recipes', async () => {
    const s = setup();
    await created(s);
    await created(s, OTHER);
    const page = await s.service.listMine(OWNER, search());
    expect(page.recipes).toHaveLength(1);
    expect(page.hasMore).toBe(false);
    expect(typeof page.recipes[0]!.updatedAt).toBe('string');
  });
  test('the gallery only returns public recipes', async () => {
    const s = setup();
    const a = await created(s);
    await created(s);
    await s.service.setVisibility(a, OWNER, 'public');
    expect((await s.service.gallery(search())).recipes.map((r) => r.id)).toEqual([a]);
  });
  test('asks one more row than a page and computes the offset and the tsquery', async () => {
    const s = setup();
    await s.service.gallery(search({ page: 3, q: 'Crème' }));
    expect(s.state.lastList).toEqual({
      tsquery: 'creme:*',
      tagIds: [],
      limit: RECIPES_PAGE_SIZE + 1,
      offset: 2 * RECIPES_PAGE_SIZE,
    });
  });
  test('hasMore is set past a page and the extra row is cut', async () => {
    const s = setup();
    for (let i = 0; i <= RECIPES_PAGE_SIZE; i++) await created(s);
    const page = await s.service.listMine(OWNER, search());
    expect(page.recipes).toHaveLength(RECIPES_PAGE_SIZE);
    expect(page.hasMore).toBe(true);
  });
});

describe('tags', () => {
  test('are checked and saved with the recipe, and copied with it', async () => {
    const s = setup();
    const created = await s.service.create(OWNER, { ...FIELDS, tagIds: ['t1', 't2'] });
    if ('error' in created) throw new Error('create failed');
    expect(s.rows.get(created.id)?.tagIds).toEqual(['t1', 't2']);
    await s.service.setVisibility(created.id, OWNER, 'public');
    const copy = await s.service.copy(created.id, 'someone-else', undefined);
    if ('error' in copy) throw new Error('copy failed');
    expect(s.rows.get(copy.id)?.tagIds).toEqual(['t1', 't2']);
  });

  test('unknown tags or two tags of a single-choice category are refused', async () => {
    const s = setup();
    expect(await s.service.create(OWNER, { ...FIELDS, tagIds: ['nope'] })).toEqual({
      error: 'invalid_tags',
    });
    expect(await s.service.create(OWNER, { ...FIELDS, tagIds: ['single-a', 'single-b'] })).toEqual({
      error: 'invalid_tags',
    });
  });

  test('a filter on an unknown tag matches nothing (without asking the repository)', async () => {
    const s = setup();
    await created(s);
    expect(await s.service.listMine(OWNER, search({ tags: ['unknown'] }))).toEqual({
      recipes: [],
      hasMore: false,
    });
    expect(s.state.lastList).toBeUndefined();
    await s.service.listMine(OWNER, search({ tags: ['tag-t1'] }));
    expect(s.state.lastList?.tagIds).toEqual(['t1']);
  });
});
