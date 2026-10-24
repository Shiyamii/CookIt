import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
  DEFAULT_UNITS,
  RECIPES_PAGE_SIZE,
  type RecipePage,
  type RecipeSearch,
} from '@cookit/shared';
import type {
  ListQuery,
  NewImage,
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
/** A gallery page (the gallery answers `sign_in_required` to visitors when it is not public). */
function galleryPage(result: RecipePage | { error: string }): RecipePage {
  if ('error' in result) throw new Error(result.error);
  return result;
}

const search = (partial: Partial<RecipeSearch> = {}): RecipeSearch => ({
  page: 1,
  tags: [],
  scope: 'all',
  ...partial,
});

type FakeImage = NewImage & { recipeId: string };

function fakeRepository() {
  const rows = new Map<string, RecipeRow & { searchText: string }>();
  const notes = new Map<string, string>();
  /** Recipes added by link: `user/recipe` → the share token they were added with. */
  const links = new Map<string, string | null>();
  const images = new Map<string, FakeImage>();
  const state = { slugTakenOnce: 0, creates: 0, lastList: undefined as ListQuery | undefined };
  const toRow = (r: NewRecipe) => ({
    id: r.id,
    ownerId: r.ownerId,
    ownerName: `name-${r.ownerId}`,
    ownerUsername: `user-${r.ownerId}`,
    ownerImage: null,
    slug: r.slug,
    lang: r.lang,
    servings: r.servings,
    visibility: 'private' as const,
    shareToken: null as string | null,
    sourceUrl: r.sourceUrl,
    copiedFromId: r.copiedFromId ?? null,
    copiedFromOwnerId: r.copiedFromOwnerId ?? null,
    copiedFromOwnerName: r.copiedFromOwnerId ? `name-${r.copiedFromOwnerId}` : null,
    copiedFromOwnerUsername: r.copiedFromOwnerId ? `user-${r.copiedFromOwnerId}` : null,
    copiedFromVisibility: null as RecipeRow['copiedFromVisibility'],
    title: r.title,
    description: r.description,
    summary: r.summary,
    extraMeta: r.extraMeta,
    bodyMarkdown: r.bodyMarkdown,
    tagIds: r.tagIds,
    translations: (r.translations ?? []).map((t) => ({ ...t })),
    imageIds: [] as string[],
    createdAt: r.now,
    updatedAt: r.now,
    searchText: r.searchText,
    hasSteps: r.hasSteps,
    authorNote: '',
  });
  const repository: RecipesRepository = {
    async create(recipe) {
      state.creates++;
      if (state.slugTakenOnce > 0) {
        state.slugTakenOnce--;
        return 'slug_taken';
      }
      const row = toRow(recipe);
      for (const id of rows.get(recipe.copyImagesFrom ?? '')?.imageIds ?? []) {
        const copy = { ...images.get(id)!, id: `copy-of-${id}`, recipeId: recipe.id };
        images.set(copy.id, copy);
        row.imageIds.push(copy.id);
      }
      rows.set(recipe.id, row);
      return 'ok';
    },
    async findById(id) {
      const row = rows.get(id);
      // As the repository's join: the original's visibility, null once it is deleted.
      if (row) row.copiedFromVisibility = rows.get(row.copiedFromId ?? '')?.visibility ?? null;
      return row;
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
    async setVisibility(id, visibility, shareToken, options) {
      const row = rows.get(id)!;
      row.visibility = visibility;
      row.shareToken = shareToken;
      if (options?.renewImageIds) {
        row.imageIds = row.imageIds.map((old) => {
          const renewed = { ...images.get(old)!, id: `renewed-${old}` };
          images.delete(old);
          images.set(renewed.id, renewed);
          return renewed.id;
        });
      }
    },
    async delete(id) {
      rows.delete(id);
    },
    async listLibrary(userId, scope, query) {
      state.lastList = query;
      const savedBy = (r: RecipeRow) => {
        const key = `${userId}/${r.id}`;
        return (
          r.ownerId !== userId &&
          links.has(key) &&
          (r.visibility === 'public' ||
            (r.visibility === 'unlisted' && links.get(key) === r.shareToken))
        );
      };
      const mine = (r: RecipeRow) => r.ownerId === userId;
      const shown = (r: RecipeRow) =>
        scope === 'mine' ? mine(r) : scope === 'saved' ? savedBy(r) : mine(r) || savedBy(r);
      return listRows([...rows.values()].filter(shown), userId);
    },
    async listPublic(query) {
      state.lastList = query;
      return listRows(
        [...rows.values()].filter((r) => r.visibility === 'public'),
        query.viewerId,
      );
    },
    async listPublicOf(ownerId, query) {
      state.lastList = query;
      return listRows(
        [...rows.values()].filter((r) => r.visibility === 'public' && r.ownerId === ownerId),
        query.viewerId,
      );
    },
    async findSaved(userId, recipeId) {
      const key = `${userId}/${recipeId}`;
      return links.has(key) ? { shareToken: links.get(key) ?? null } : undefined;
    },
    async saveLink(userId, recipeId, shareToken) {
      links.set(`${userId}/${recipeId}`, shareToken);
    },
    async removeLink(userId, recipeId) {
      links.delete(`${userId}/${recipeId}`);
    },
    async listAllByOwner(ownerId) {
      return [...rows.values()].filter((r) => r.ownerId === ownerId);
    },
    async saveTranslation(recipeId, lang, content) {
      const row = rows.get(recipeId)!;
      row.translations = [...row.translations.filter((t) => t.lang !== lang), { ...content, lang }];
    },
    async deleteTranslation(recipeId, lang) {
      const row = rows.get(recipeId);
      const before = row?.translations.length ?? 0;
      if (row) row.translations = row.translations.filter((t) => t.lang !== lang);
      return (row?.translations.length ?? 0) < before;
    },
    async addImage(recipeId, image, max) {
      const row = rows.get(recipeId)!;
      if (row.imageIds.length >= max) return 'too_many';
      images.set(image.id, { ...image, recipeId });
      row.imageIds.push(image.id);
      return 'ok';
    },
    async deleteImage(recipeId, imageId) {
      const row = rows.get(recipeId)!;
      if (!row.imageIds.includes(imageId)) return false;
      row.imageIds = row.imageIds.filter((id) => id !== imageId);
      images.delete(imageId);
      return true;
    },
    async orderImages(recipeId, ids) {
      const row = rows.get(recipeId)!;
      const same =
        ids.length === row.imageIds.length &&
        new Set(ids).size === ids.length &&
        ids.every((id) => row.imageIds.includes(id));
      if (!same) return 'mismatch';
      row.imageIds = [...ids];
      return 'ok';
    },
    async pick(ownerId, seed, exclude) {
      // The same ordering as the repository's (md5 of id and seed).
      const rank = (id: string) => createHash('md5').update(`${id}${seed}`).digest('hex');
      const found = [...rows.values()]
        .filter((r) => r.hasSteps && (r.ownerId === ownerId || r.visibility === 'public'))
        .filter((r) => r.id !== exclude)
        .sort((a, b) => rank(a.id).localeCompare(rank(b.id)));
      return found.length ? listRows(found.slice(0, 1), ownerId)[0] : undefined;
    },
    async imageBytesOfOwner(ownerId) {
      return [...images.values()]
        .filter((image) => rows.get(image.recipeId)?.ownerId === ownerId)
        .reduce((sum, image) => sum + image.data.length + image.thumb.length, 0);
    },
    async imageBytesOfRecipe(recipeId) {
      return [...images.values()]
        .filter((image) => image.recipeId === recipeId)
        .reduce((sum, image) => sum + image.data.length + image.thumb.length, 0);
    },
    async findImage(imageId, size) {
      const image = images.get(imageId);
      const row = image && rows.get(image.recipeId);
      if (!image || !row) return undefined;
      return {
        contentType: image.contentType,
        data: size === 'thumb' ? image.thumb : image.data,
        ownerId: row.ownerId,
        visibility: row.visibility,
      };
    },
    async setAuthorNote(recipeId, text) {
      const row = rows.get(recipeId);
      if (row) row.authorNote = text;
    },
    async findNote(userId, recipeId) {
      return notes.get(`${userId}/${recipeId}`);
    },
    async saveNote(userId, recipeId, text) {
      if (text) notes.set(`${userId}/${recipeId}`, text);
      else notes.delete(`${userId}/${recipeId}`);
    },
  };
  const listRows = (found: RecipeRow[], viewerId?: string): RecipeListRow[] =>
    found.map((r) => ({ ...r, coverId: r.imageIds[0] ?? null, mine: r.ownerId === viewerId }));
  return { repository, rows, images, state, notes, links };
}

function setup(options: { maxImageBytes?: number; publicGallery?: boolean } = {}) {
  const fake = fakeRepository();
  const gallery = { open: options.publicGallery ?? true };
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
      async catalog() {
        return [
          {
            id: 'c1',
            slug: 'cat',
            position: 0,
            multiple: true,
            labels: { fr: 'Cat' },
            tags: [
              { id: 't1', slug: 'tag-one', categoryId: 'c1', position: 0, labels: { fr: 'Un' } },
            ],
          },
        ];
      },
      async idsOfSlugs(slugs) {
        return slugs.filter((slug) => slug.startsWith('tag-')).map((slug) => slug.slice(4));
      },
    },
    generateToken: () => (tokens++ === 0 ? TOKEN : 'U'.repeat(43)),
    publicGallery: async () => gallery.open,
    newId: () => `id-${++n}`,
    now: () => new Date((clock += 1000)),
    maxImageBytes: options.maxImageBytes,
  });
  return { ...fake, service, gallery };
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
    expect(await s.service.copy(id, OWNER, undefined)).toEqual({ error: 'own_recipe' });
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
    expect(galleryPage(await s.service.gallery(search(), null)).recipes.map((r) => r.id)).toEqual([
      a,
    ]);
  });
  test('asks one more row than a page and computes the offset and the tsquery', async () => {
    const s = setup();
    await s.service.gallery(search({ page: 3, q: 'Crème' }), null);
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

describe('export and "to complete"', () => {
  test('a recipe without steps is incomplete; one with steps is not', async () => {
    const s = setup();
    const empty = await s.service.create(OWNER, { ...FIELDS, body: '---' });
    const full = await s.service.create(OWNER, FIELDS);
    if ('error' in empty || 'error' in full) throw new Error('create failed');
    expect(await s.service.get(empty.id, OWNER)).toMatchObject({ incomplete: true });
    expect(await s.service.get(full.id, OWNER)).toMatchObject({ incomplete: false });
    const page = await s.service.listMine(OWNER, search());
    expect(page.recipes.map((r) => r.incomplete).sort()).toEqual([false, true]);
  });

  test('exports one .md per recipe with the tags line and the format', async () => {
    const s = setup();
    const created = await s.service.create(OWNER, { ...FIELDS, tagIds: ['t1'] });
    if ('error' in created) throw new Error('create failed');
    const files = await s.service.exportAll(OWNER);
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe('tarte-aux-pommes.md');
    expect(files[0]?.markdown).toContain('tags: tag-one');
    expect(files[0]?.markdown).toContain('format: 1');
    expect(await s.service.exportAll('someone-else')).toEqual([]);
  });
});

describe('translations', () => {
  const EN =
    '# Apple pie\n\nservings: 4\ntags: tag-one\n\n---\n\n### Base\n\n- 200 g flour\n- 2 eggs\n\n---\n\n1. Mix.\n2. Bake [10 min](timer:10m).\n';

  test('a translation is saved without warning when the structure matches', async () => {
    const s = setup();
    const id = await created(s);
    const result = await s.service.saveTranslation(id, OWNER, 'en', EN);
    expect(result).toEqual({ updatedAt: expect.any(String), warnings: [] });
    const row = s.rows.get(id)!;
    expect(row.translations).toEqual([
      expect.objectContaining({ lang: 'en', title: 'Apple pie', searchText: expect.any(String) }),
    ]);
    // Recipe-level data does not change: tags, servings.
    expect(row.tagIds).toEqual([]);
    expect(row.servings).toBe(4);
  });

  test('a structure mismatch is saved with readable warnings', async () => {
    const s = setup();
    const id = await created(s);
    const result = await s.service.saveTranslation(
      id,
      OWNER,
      'en',
      EN.replace('2. Bake [10 min](timer:10m).\n', ''),
    );
    expect('warnings' in result && result.warnings.map((w) => w.code)).toEqual([
      'translation_item_count',
    ]);
    expect(s.rows.get(id)!.translations).toHaveLength(1);
  });

  test('a translation that does not parse is refused', async () => {
    const s = setup();
    const id = await created(s);
    const result = await s.service.saveTranslation(id, OWNER, 'en', 'no title');
    expect(result).toMatchObject({ error: 'invalid_recipe' });
    expect(s.rows.get(id)!.translations).toEqual([]);
  });

  test('the base language is not a translation; only the owner translates', async () => {
    const s = setup();
    const id = await created(s);
    expect(await s.service.saveTranslation(id, OWNER, 'fr', EN)).toEqual({
      error: 'base_language',
    });
    expect(await s.service.saveTranslation(id, OTHER, 'en', EN)).toEqual({ error: 'not_found' });
    expect(await s.service.deleteTranslation(id, OWNER, 'fr')).toEqual({
      error: 'base_language',
    });
  });

  test('read in a language: that translation, else the base language', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.saveTranslation(id, OWNER, 'en', EN);
    const en = await s.service.get(id, OWNER, 'en');
    expect(en).toMatchObject({ lang: 'en', baseLang: 'fr', languages: ['fr', 'en'] });
    expect('title' in en && en.title).toBe('Apple pie');
    expect('body' in en && en.body).toContain('Bake');
    const base = await s.service.get(id, OWNER);
    expect(base).toMatchObject({ lang: 'fr', title: 'Tarte aux pommes' });
    expect(await s.service.get(id, OTHER, 'en')).toEqual({ error: 'not_found' });
  });

  test('deleting a translation; a missing one is not found', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.saveTranslation(id, OWNER, 'en', EN);
    expect(await s.service.deleteTranslation(id, OTHER, 'en')).toEqual({ error: 'not_found' });
    expect(await s.service.deleteTranslation(id, OWNER, 'en')).toEqual({ ok: true });
    expect(await s.service.deleteTranslation(id, OWNER, 'en')).toEqual({ error: 'not_found' });
    expect(await s.service.get(id, OWNER, 'en')).toMatchObject({ lang: 'fr', languages: ['fr'] });
  });

  test('"add to my library" copies the translations', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.saveTranslation(id, OWNER, 'en', EN);
    await s.service.setVisibility(id, OWNER, 'public');
    const copy = await s.service.copy(id, OTHER, undefined);
    if ('error' in copy) throw new Error('copy failed');
    expect(await s.service.get(copy.id, OTHER, 'en')).toMatchObject({
      lang: 'en',
      title: 'Apple pie',
      languages: ['fr', 'en'],
    });
  });

  test('saving a translation keeps the recipe version, and replaces the previous translation', async () => {
    const s = setup();
    const id = await created(s);
    const before = s.rows.get(id)!.updatedAt;
    await s.service.saveTranslation(id, OWNER, 'en', EN);
    await s.service.saveTranslation(id, OWNER, 'en', EN.replace('Apple pie', 'Pie'));
    const row = s.rows.get(id)!;
    expect(row.updatedAt).toEqual(before);
    expect(row.translations).toHaveLength(1);
    expect(row.translations[0]!.title).toBe('Pie');
  });

  test('a missing timer is reported as a warning', async () => {
    const s = setup();
    const id = await created(s);
    const result = await s.service.saveTranslation(
      id,
      OWNER,
      'en',
      EN.replace('[10 min](timer:10m)', '10 min'),
    );
    expect('warnings' in result && result.warnings.map((w) => w.code)).toEqual([
      'translation_timers',
    ]);
  });

  test('a share link reads a translation too, else the base language', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.saveTranslation(id, OWNER, 'en', EN);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(await s.service.getShared(TOKEN, null, 'en')).toMatchObject({
      lang: 'en',
      title: 'Apple pie',
    });
    expect(await s.service.getShared(TOKEN, null)).toMatchObject({ lang: 'fr' });
  });

  test('a stranger cannot read or delete a translation of a private recipe', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.saveTranslation(id, OWNER, 'en', EN);
    expect(await s.service.get(id, null, 'en')).toEqual({ error: 'not_found' });
    expect(await s.service.deleteTranslation(id, OTHER, 'en')).toEqual({ error: 'not_found' });
    expect(s.rows.get(id)!.translations).toHaveLength(1);
  });
});

/** A lossy WebP header of `width` × `height` (only the header is ever read by the server). */
function webp(width: number, height: number, padding = 30): Uint8Array {
  const file = new Uint8Array(20 + padding);
  const view = new DataView(file.buffer);
  file.set(new TextEncoder().encode('RIFF'), 0);
  view.setUint32(4, file.length - 8, true);
  file.set(new TextEncoder().encode('WEBPVP8 '), 8);
  view.setUint32(16, padding, true);
  file.set([0x9d, 0x01, 0x2a], 23);
  view.setUint16(26, width, true);
  view.setUint16(28, height, true);
  return file;
}

const JPEG_THUMB = new Uint8Array([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x10, 0x00, 0x10, 0x03, 0, 0, 0, 0, 0, 0, 0, 0,
]);
const UPLOAD = { image: webp(1600, 1200), thumb: webp(480, 360) };

describe('photos', () => {
  test('the owner adds photos: the first is the cover, in details and lists', async () => {
    const s = setup();
    const id = await created(s);
    const first = await s.service.addImage(id, OWNER, UPLOAD);
    const second = await s.service.addImage(id, OWNER, UPLOAD);
    if ('error' in first || 'error' in second) throw new Error('upload failed');
    expect(first.url).toBe(`/images/recipes/${first.id}`);
    expect(first.thumbUrl).toBe(`/images/recipes/${first.id}/thumb`);
    expect(s.images.get(first.id)?.contentType).toBe('image/webp');

    const detail = await s.service.get(id, OWNER);
    expect('images' in detail && detail.images.map((image) => image.id)).toEqual([
      first.id,
      second.id,
    ]);
    const list = await s.service.listMine(OWNER, search());
    expect(list.recipes[0]?.cover).toBe(first.thumbUrl);
  });

  test('a recipe without photos has no cover', async () => {
    const s = setup();
    await created(s);
    expect((await s.service.listMine(OWNER, search())).recipes[0]?.cover).toBeNull();
  });

  test('at most six photos', async () => {
    const s = setup();
    const id = await created(s);
    for (let i = 0; i < 6; i++)
      expect(await s.service.addImage(id, OWNER, UPLOAD)).toHaveProperty('id');
    expect(await s.service.addImage(id, OWNER, UPLOAD)).toEqual({ error: 'too_many_images' });
  });

  test('only the owner adds, deletes or orders photos', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    const image = await s.service.addImage(id, OWNER, UPLOAD);
    if ('error' in image) throw new Error('upload failed');
    expect(await s.service.addImage(id, OTHER, UPLOAD)).toEqual({ error: 'not_found' });
    expect(await s.service.deleteImage(id, OTHER, image.id)).toEqual({ error: 'not_found' });
    expect(await s.service.orderImages(id, OTHER, [image.id])).toEqual({ error: 'not_found' });
    expect(await s.service.addImage('nope', OWNER, UPLOAD)).toEqual({ error: 'not_found' });
    expect(s.rows.get(id)!.imageIds).toEqual([image.id]);
  });

  test('pictures that are not WebP/JPEG within the limits are refused', async () => {
    const s = setup();
    const id = await created(s);
    const refused = [
      { image: new TextEncoder().encode('<svg/>'), thumb: UPLOAD.thumb },
      { image: UPLOAD.image, thumb: new Uint8Array() },
      // Too many pixels for a photo, for a thumbnail.
      { image: webp(1601, 100), thumb: UPLOAD.thumb },
      { image: UPLOAD.image, thumb: webp(481, 100) },
      // Too many bytes.
      { image: webp(100, 100, 700_000), thumb: UPLOAD.thumb },
      // Thumbnail of another type than the picture.
      { image: UPLOAD.image, thumb: JPEG_THUMB },
    ];
    for (const upload of refused) {
      expect(await s.service.addImage(id, OWNER, upload)).toEqual({ error: 'invalid_image' });
    }
    expect(s.rows.get(id)!.imageIds).toEqual([]);
  });

  test('deleting and reordering', async () => {
    const s = setup();
    const id = await created(s);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const image = await s.service.addImage(id, OWNER, UPLOAD);
      if ('error' in image) throw new Error('upload failed');
      ids.push(image.id);
    }
    const [a, b, c] = ids as [string, string, string];
    expect(await s.service.orderImages(id, OWNER, [c, a, b])).toEqual({ ok: true });
    expect(s.rows.get(id)!.imageIds).toEqual([c, a, b]);
    // Missing, duplicated or foreign ids.
    expect(await s.service.orderImages(id, OWNER, [c, a])).toEqual({ error: 'invalid_order' });
    expect(await s.service.orderImages(id, OWNER, [c, a, a])).toEqual({ error: 'invalid_order' });
    expect(await s.service.orderImages(id, OWNER, [c, a, 'x'])).toEqual({ error: 'invalid_order' });
    expect(await s.service.deleteImage(id, OWNER, c)).toEqual({ ok: true });
    expect(await s.service.deleteImage(id, OWNER, c)).toEqual({ error: 'not_found' });
    expect(s.rows.get(id)!.imageIds).toEqual([a, b]);
  });

  test('a photo of another recipe cannot be deleted through this one', async () => {
    const s = setup();
    const mine = await created(s);
    const other = await created(s);
    const image = await s.service.addImage(other, OWNER, UPLOAD);
    if ('error' in image) throw new Error('upload failed');
    expect(await s.service.deleteImage(mine, OWNER, image.id)).toEqual({ error: 'not_found' });
    expect(s.images.has(image.id)).toBe(true);
  });

  test('who sees a photo: owner always, anyone when public or unlisted, nobody else', async () => {
    const s = setup();
    const id = await created(s);
    const image = await s.service.addImage(id, OWNER, UPLOAD);
    if ('error' in image) throw new Error('upload failed');
    // The photo's current id (a new share link renews it).
    const read = async (viewer: string | null, size: 'full' | 'thumb' = 'full') => {
      const current = s.rows.get(id)!.imageIds[0]!;
      const result = await s.service.readImage(current, viewer, size);
      return 'error' in result ? result.error : result.public ? 'public' : 'private';
    };
    expect(await read(OWNER)).toBe('private');
    expect(await read(OTHER)).toBe('not_found');
    expect(await read(null)).toBe('not_found');
    await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(await read(OTHER)).toBe('private');
    expect(await read(null, 'thumb')).toBe('private');
    await s.service.setVisibility(id, OWNER, 'public');
    expect(await read(null)).toBe('public');
    await s.service.setVisibility(id, OWNER, 'private');
    expect(await read(null)).toBe('not_found');
    expect(await s.service.readImage('nope', OWNER, 'full')).toEqual({ error: 'not_found' });
  });

  test('the full picture and the thumbnail are served separately', async () => {
    const s = setup();
    const id = await created(s);
    const image = await s.service.addImage(id, OWNER, UPLOAD);
    if ('error' in image) throw new Error('upload failed');
    const full = await s.service.readImage(image.id, OWNER, 'full');
    const thumb = await s.service.readImage(image.id, OWNER, 'thumb');
    expect('data' in full && full.data.length).toBe(UPLOAD.image.length);
    expect('data' in thumb && thumb.data.length).toBe(UPLOAD.thumb.length);
  });

  test('"add to my library" copies the photos', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    const image = await s.service.addImage(id, OWNER, UPLOAD);
    if ('error' in image) throw new Error('upload failed');
    const copy = await s.service.copy(id, OTHER, undefined);
    if (!('id' in copy)) throw new Error('copy failed');
    expect(s.rows.get(copy.id)!.imageIds).toEqual([`copy-of-${image.id}`]);
    // The copy's photos are its own: deleting the original's leaves them.
    await s.service.deleteImage(id, OWNER, image.id);
    expect(await s.service.readImage(`copy-of-${image.id}`, OTHER, 'full')).toHaveProperty('data');
  });

  test('a new share link gives the photos new URLs: the old ones stop working', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    const image = await s.service.addImage(id, OWNER, UPLOAD);
    if ('error' in image) throw new Error('upload failed');
    // Same link kept (already unlisted): same URLs.
    await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(s.rows.get(id)!.imageIds).toEqual([image.id]);
    // Link revoked, then a new one.
    await s.service.setVisibility(id, OWNER, 'private');
    await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(s.rows.get(id)!.imageIds).not.toContain(image.id);
    expect(await s.service.readImage(image.id, null, 'full')).toEqual({ error: 'not_found' });
    // Public and private keep them (only a share link can leak).
    const before = s.rows.get(id)!.imageIds;
    await s.service.setVisibility(id, OWNER, 'public');
    await s.service.setVisibility(id, OWNER, 'private');
    expect(s.rows.get(id)!.imageIds).toEqual(before);
  });

  test("an owner's photos are limited in total bytes", async () => {
    const size = UPLOAD.image.length + UPLOAD.thumb.length;
    const s = setup({ maxImageBytes: size * 2 });
    const a = await created(s);
    const b = await created(s);
    expect(await s.service.addImage(a, OWNER, UPLOAD)).toHaveProperty('id');
    expect(await s.service.addImage(b, OWNER, UPLOAD)).toHaveProperty('id');
    expect(await s.service.addImage(b, OWNER, UPLOAD)).toEqual({ error: 'storage_full' });
    // Another user has their own storage.
    const other = await created(s, OTHER);
    expect(await s.service.addImage(other, OTHER, UPLOAD)).toHaveProperty('id');
  });

  test('a copy leaves the photos out when they do not fit in the reader storage', async () => {
    const size = UPLOAD.image.length + UPLOAD.thumb.length;
    const s = setup({ maxImageBytes: size * 2 });
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    await s.service.addImage(id, OWNER, UPLOAD);
    await s.service.addImage(id, OWNER, UPLOAD);
    const first = await s.service.copy(id, OTHER, undefined);
    const second = await s.service.copy(id, OTHER, undefined);
    if (!('id' in first) || !('id' in second)) throw new Error('copy failed');
    expect(s.rows.get(first.id)!.imageIds).toHaveLength(2);
    expect(s.rows.get(second.id)!.imageIds).toEqual([]);
  });
});

describe('idea of the day', () => {
  const DAY = { day: '2026-10-22', n: 0 };
  const idea = async (
    s: ReturnType<typeof setup>,
    user: string,
    query: Partial<typeof DAY> & { exclude?: string } = {},
  ) => (await s.service.idea(user, { ...DAY, ...query })).recipe?.id ?? null;

  test('the same recipe all day, among the ones that can be cooked', async () => {
    const s = setup();
    const ids = [await created(s), await created(s), await created(s)];
    const incomplete = await s.service.create(OWNER, { ...FIELDS, body: '- 1 oeuf\n\n---\n' });
    if ('error' in incomplete) throw new Error('create failed');
    const first = await idea(s, OWNER);
    expect(ids).toContain(first ?? '');
    expect(await idea(s, OWNER)).toBe(first);
    // Never a recipe without steps.
    for (let n = 0; n < 20; n++) expect(await idea(s, OWNER, { n })).not.toBe(incomplete.id);
  });

  test('another day or another try can give another one', async () => {
    const s = setup();
    for (let i = 0; i < 8; i++) await created(s);
    const days = new Set<string | null>();
    for (let d = 10; d < 30; d++) days.add(await idea(s, OWNER, { day: `2026-10-${d}` }));
    expect(days.size).toBeGreaterThan(1);
    const tries = new Set<string | null>();
    for (let n = 0; n < 20; n++) tries.add(await idea(s, OWNER, { n }));
    expect(tries.size).toBeGreaterThan(1);
  });

  test('"another idea" never gives the one shown, unless it is the only one', async () => {
    const s = setup();
    const a = await created(s);
    expect(await idea(s, OWNER, { exclude: a })).toBe(a);
    const b = await created(s);
    for (let n = 0; n < 10; n++) {
      expect(await idea(s, OWNER, { n, exclude: a })).toBe(b);
      expect(await idea(s, OWNER, { n, exclude: b })).toBe(a);
    }
  });

  test("others' recipes only when public; nothing when there is nothing", async () => {
    const s = setup();
    expect(await idea(s, OTHER)).toBeNull();
    const id = await created(s);
    expect(await idea(s, OTHER)).toBeNull();
    await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(await idea(s, OTHER)).toBeNull();
    await s.service.setVisibility(id, OWNER, 'public');
    expect(await idea(s, OTHER)).toBe(id);
  });
});

describe('notes', () => {
  test("a reader's private note: on their own or a public recipe, seen only by them", async () => {
    const s = setup();
    const id = await created(s);
    expect(await s.service.saveNote(id, OWNER, 'moins de sel')).toEqual({ myNote: 'moins de sel' });
    const mine = await s.service.get(id, OWNER);
    expect('error' in mine ? undefined : mine.myNote).toBe('moins de sel');

    // Someone else cannot note a private recipe; once public, they can, and see only theirs.
    expect(await s.service.saveNote(id, OTHER, 'x')).toEqual({ error: 'not_found' });
    await s.service.setVisibility(id, OWNER, 'public');
    await s.service.saveNote(id, OTHER, 'à refaire');
    const theirs = await s.service.get(id, OTHER);
    expect('error' in theirs ? undefined : theirs.myNote).toBe('à refaire');
    const anonymous = await s.service.get(id, null);
    expect('error' in anonymous ? undefined : anonymous.myNote).toBeNull();

    // An empty text removes it.
    expect(await s.service.saveNote(id, OTHER, '')).toEqual({ myNote: null });
    const after = await s.service.get(id, OTHER);
    expect('error' in after ? undefined : after.myNote).toBeNull();
  });

  test('an unlisted recipe of someone else: only with its share token', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    const token = s.rows.get(id)!.shareToken!;
    expect(await s.service.saveNote(id, OTHER, 'x')).toEqual({ error: 'not_found' });
    expect(await s.service.saveNote(id, OTHER, 'x', 'W'.repeat(43))).toEqual({
      error: 'not_found',
    });
    expect(await s.service.saveNote(id, OTHER, 'noté', token)).toEqual({ myNote: 'noté' });
    const shared = await s.service.getShared(token, OTHER);
    expect('error' in shared ? undefined : shared.myNote).toBe('noté');
  });

  test("the author's public note: only the owner sets it, every reader sees it", async () => {
    const s = setup();
    const id = await created(s);
    const before = s.rows.get(id)!.updatedAt;
    expect(await s.service.setAuthorNote(id, OTHER, 'x')).toEqual({ error: 'not_found' });
    expect(await s.service.setAuthorNote(id, OWNER, 'Ma recette préférée')).toEqual({
      authorNote: 'Ma recette préférée',
    });
    await s.service.setVisibility(id, OWNER, 'public');
    const read = await s.service.get(id, null);
    expect('error' in read ? undefined : read.authorNote).toBe('Ma recette préférée');
    // Not an edit of the recipe: no conflict for an editor opened before.
    expect(s.rows.get(id)!.updatedAt).toEqual(before);
  });
});

describe('summary', () => {
  test('saved from the fields, read back, written in the markdown export', async () => {
    const s = setup();
    const r = await s.service.create(OWNER, { ...FIELDS, summary: 'Une tarte rapide.' });
    if ('error' in r) throw new Error('create failed');
    const detail = await s.service.get(r.id, OWNER);
    expect('error' in detail ? undefined : detail.summary).toBe('Une tarte rapide.');
    const [file] = await s.service.exportAll(OWNER);
    expect(file?.markdown).toContain('résumé: Une tarte rapide.');
  });
});

describe('notes and summary edge cases', () => {
  test('the owner can note their own private recipe', async () => {
    const s = setup();
    const id = await created(s);
    expect(await s.service.saveNote(id, OWNER, 'ma note')).toEqual({ myNote: 'ma note' });
    expect(s.notes.get(`${OWNER}/${id}`)).toBe('ma note');
  });
  test('an empty text removes the note and a note on an unknown id is not_found', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.saveNote(id, OWNER, 'x');
    expect(await s.service.saveNote(id, OWNER, '')).toEqual({ myNote: null });
    expect(s.notes.size).toBe(0);
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect(await s.service.saveNote(unknown, OWNER, 'x')).toEqual({ error: 'not_found' });
    expect(s.notes.size).toBe(0);
  });
  test('a note on an unlisted recipe is refused once the link is revoked', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    const token = s.rows.get(id)!.shareToken!;
    await s.service.setVisibility(id, OWNER, 'private');
    expect(await s.service.saveNote(id, OTHER, 'x', token)).toEqual({ error: 'not_found' });
  });
  test('a note on a private recipe is not readable by a token alone', async () => {
    const s = setup();
    const id = await created(s);
    expect(await s.service.saveNote(id, OTHER, 'x', TOKEN)).toEqual({ error: 'not_found' });
  });
  test('the author note on an unknown id is not_found; an empty text removes it', async () => {
    const s = setup();
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect(await s.service.setAuthorNote(unknown, OWNER, 'x')).toEqual({ error: 'not_found' });
    const id = await created(s);
    await s.service.setAuthorNote(id, OWNER, 'note');
    expect(await s.service.setAuthorNote(id, OWNER, '')).toEqual({ authorNote: '' });
    const read = await s.service.get(id, OWNER);
    expect('error' in read ? undefined : read.authorNote).toBe('');
  });
  test("one reader's note is never in another reader's details", async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    await s.service.saveNote(id, OTHER, 'secret');
    const owner = await s.service.get(id, OWNER);
    expect('error' in owner ? undefined : owner.myNote).toBeNull();
  });
  test('createFromMarkdown stores the summary, searchable and exported', async () => {
    const s = setup();
    const doc =
      '# Tarte\n\nrésumé: Dessert pommé express\nportions: 4\n\n---\n\n- 1 oeuf\n\n---\n\n1. Cuire.\n';
    const r = await s.service.createFromMarkdown(OWNER, { markdown: doc, lang: 'fr' });
    if (!('id' in r)) throw new Error('create failed');
    const row = s.rows.get(r.id)!;
    expect(row.summary).toBe('Dessert pommé express');
    expect(row.searchText).toContain('dessert pomme express');
    const [file] = await s.service.exportAll(OWNER);
    expect(file?.markdown).toContain('résumé: Dessert pommé express');
  });
  test('createFromMarkdown refuses a summary over 160 characters', async () => {
    const s = setup();
    const doc = `# T\n\nsummary: ${'a'.repeat(161)}\nservings: 4\n\n---\n\n- 1 egg\n\n---\n\n1. Bake.\n`;
    const r = await s.service.createFromMarkdown(OWNER, { markdown: doc, lang: 'en' });
    expect(r).toMatchObject({ error: 'invalid_recipe' });
    expect(s.rows.size).toBe(0);
  });
  test('a translation keeps its own summary, shown with ?lang= and searchable', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    const EN =
      '# Apple pie\n\nsummary: Quick weeknight pie\nservings: 4\n\n---\n\n### Base\n\n- 200 g flour\n- 2 eggs\n\n---\n\n1. Mix.\n2. Bake [10 min](timer:10m).\n';
    await s.service.saveTranslation(id, OWNER, 'en', EN);
    const en = await s.service.get(id, OWNER, 'en');
    expect('error' in en ? undefined : en.summary).toBe('Quick weeknight pie');
    const base = await s.service.get(id, OWNER);
    expect('error' in base ? undefined : base.summary).toBe('');
    expect(s.rows.get(id)!.translations[0]).toMatchObject({ summary: 'Quick weeknight pie' });
    expect(s.rows.get(id)!.translations[0]!.searchText).toContain('quick weeknight pie');
  });
  test('a summary is saved by update and removed with an empty one', async () => {
    const s = setup();
    const id = await created(s);
    const r = await s.service.update(id, OWNER, { ...FIELDS, summary: 'Court.' });
    expect('error' in r).toBe(false);
    expect(s.rows.get(id)!.summary).toBe('Court.');
    await s.service.update(id, OWNER, { ...FIELDS });
    expect(s.rows.get(id)!.summary).toBe('');
  });
});

describe('added by link ("add to my recipes")', () => {
  const ids = (page: { recipes: { id: string }[] }) => page.recipes.map((r) => r.id);

  test('a public recipe of someone else is listed in "my recipes", not copied', async () => {
    const s = setup();
    const id = await created(s);
    const own = await created(s, OTHER);
    await s.service.setVisibility(id, OWNER, 'public');
    expect(await s.service.saveLink(id, OTHER, undefined)).toEqual({ saved: true });
    expect(s.rows.size).toBe(2);

    const all = await s.service.listMine(OTHER, search());
    expect(ids(all).sort()).toEqual([id, own].sort());
    expect(all.recipes.find((r) => r.id === id)?.mine).toBe(false);
    expect(all.recipes.find((r) => r.id === own)?.mine).toBe(true);
    expect(ids(await s.service.listMine(OTHER, search({ scope: 'mine' })))).toEqual([own]);
    expect(ids(await s.service.listMine(OTHER, search({ scope: 'saved' })))).toEqual([id]);

    const detail = await s.service.get(id, OTHER);
    expect('error' in detail ? undefined : detail.saved).toBe(true);
    // The author's changes show at once: it is the same recipe.
    await s.service.update(id, OWNER, { ...FIELDS, title: 'Nouvelle version' });
    const changed = await s.service.get(id, OTHER);
    expect('error' in changed ? undefined : changed.title).toBe('Nouvelle version');

    expect(await s.service.removeLink(id, OTHER)).toEqual({ saved: false });
    expect(ids(await s.service.listMine(OTHER, search()))).toEqual([own]);
  });

  test('a private recipe cannot be added, and one turned private leaves the list', async () => {
    const s = setup();
    const id = await created(s);
    expect(await s.service.saveLink(id, OTHER, undefined)).toEqual({ error: 'not_found' });
    expect(s.links.size).toBe(0);
    await s.service.setVisibility(id, OWNER, 'public');
    await s.service.saveLink(id, OTHER, undefined);
    await s.service.setVisibility(id, OWNER, 'private');
    expect(ids(await s.service.listMine(OTHER, search()))).toEqual([]);
    expect(await s.service.get(id, OTHER)).toEqual({ error: 'not_found' });
  });

  test('the owner does not add their own recipe', async () => {
    const s = setup();
    const id = await created(s);
    expect(await s.service.saveLink(id, OWNER, undefined)).toEqual({ error: 'own_recipe' });
  });

  test('an unlisted recipe needs its link, then opens from its id while the link lasts', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(await s.service.saveLink(id, OTHER, undefined)).toEqual({ error: 'not_found' });
    expect(await s.service.saveLink(id, OTHER, 'X'.repeat(43))).toEqual({ error: 'not_found' });
    expect(await s.service.saveLink(id, OTHER, TOKEN)).toEqual({ saved: true });

    const detail = await s.service.get(id, OTHER);
    expect(detail).toMatchObject({ id, saved: true, shareUrl: null });
    expect(await s.service.saveNote(id, OTHER, 'Bon')).toEqual({ myNote: 'Bon' });
    expect(ids(await s.service.listMine(OTHER, search()))).toEqual([id]);
    // Someone else without the link still gets nothing from the id.
    expect(await s.service.get(id, 'third')).toEqual({ error: 'not_found' });

    // A new link (private, then unlisted again) cuts the added one off.
    await s.service.setVisibility(id, OWNER, 'private');
    await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(await s.service.get(id, OTHER)).toEqual({ error: 'not_found' });
    expect(ids(await s.service.listMine(OTHER, search()))).toEqual([]);
  });

  test('a copy replaces the link and says where it comes from', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    await s.service.saveLink(id, OTHER, undefined);
    const copy = await s.service.copy(id, OTHER, undefined);
    if (!('id' in copy)) throw new Error('copy failed');
    expect(s.links.size).toBe(0);

    const detail = await s.service.get(copy.id, OTHER);
    expect(detail).toMatchObject({
      copiedFromId: id,
      copiedFrom: { recipeId: id, ownerName: `name-${OWNER}` },
      saved: false,
    });
    // The original turned private: its author is still named, without a link to it.
    await s.service.setVisibility(id, OWNER, 'private');
    expect(await s.service.get(copy.id, OTHER)).toMatchObject({
      copiedFrom: { recipeId: null, ownerName: `name-${OWNER}` },
    });
    // Deleted: the same.
    await s.service.delete(id, OWNER);
    expect(await s.service.get(copy.id, OTHER)).toMatchObject({
      copiedFrom: { recipeId: null, ownerName: `name-${OWNER}` },
    });
  });

  test('an unlisted recipe added by link can be copied without giving the token again', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    await s.service.saveLink(id, OTHER, TOKEN);
    expect(await s.service.copy(id, OTHER, undefined)).toHaveProperty('id');
  });

  test('a recipe not copied has no origin', async () => {
    const s = setup();
    const id = await created(s);
    expect(await s.service.get(id, OWNER)).toMatchObject({ copiedFrom: null, saved: false });
  });
});

describe('added by link: more cases', () => {
  const ids = (page: { recipes: { id: string }[] }) => page.recipes.map((r) => r.id);
  const detailOf = (r: unknown) => r as { saved?: boolean; copiedFrom?: unknown; error?: string };

  test('an unknown recipe is not_found', async () => {
    expect(await setup().service.saveLink('nope', OTHER, undefined)).toEqual({
      error: 'not_found',
    });
  });

  test('adding twice keeps one link', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    await s.service.saveLink(id, OTHER, undefined);
    await s.service.saveLink(id, OTHER, undefined);
    expect(s.links.size).toBe(1);
    expect(ids(await s.service.listMine(OTHER, search({ scope: 'saved' })))).toEqual([id]);
  });

  test('removing a link that was never added changes nothing', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    expect(await s.service.removeLink(id, OTHER)).toEqual({ saved: false });
    expect(s.rows.size).toBe(1);
  });

  test('a link to a public recipe stores no token and does not follow it to unlisted', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    await s.service.saveLink(id, OTHER, undefined);
    expect(s.links.get(`${OTHER}/${id}`)).toBeNull();
    await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(await s.service.get(id, OTHER)).toEqual({ error: 'not_found' });
    expect(ids(await s.service.listMine(OTHER, search()))).toEqual([]);
  });

  test('a link to an unlisted recipe stores the current token', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    await s.service.saveLink(id, OTHER, TOKEN);
    expect(s.links.get(`${OTHER}/${id}`)).toBe(TOKEN);
  });

  test('a stale link cannot be used to copy or to write a note', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    await s.service.saveLink(id, OTHER, TOKEN);
    await s.service.setVisibility(id, OWNER, 'private');
    await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(await s.service.copy(id, OTHER, undefined)).toEqual({ error: 'not_found' });
    expect(await s.service.saveNote(id, OTHER, 'x')).toEqual({ error: 'not_found' });
    expect(s.notes.size).toBe(0);
  });

  test('another user does not inherit the link of someone else', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    await s.service.saveLink(id, OTHER, TOKEN);
    expect(await s.service.saveLink(id, 'third', undefined)).toEqual({ error: 'not_found' });
    expect(ids(await s.service.listMine('third', search()))).toEqual([]);
  });

  test('the owner copying their own private recipe gets own_recipe', async () => {
    const s = setup();
    const id = await created(s);
    expect(await s.service.copy(id, OWNER, undefined)).toEqual({ error: 'own_recipe' });
    expect(s.rows.size).toBe(1);
  });

  test('copying a private recipe of someone else is not_found and leaves no copy', async () => {
    const s = setup();
    const id = await created(s);
    expect(await s.service.copy(id, OTHER, undefined)).toEqual({ error: 'not_found' });
    expect(s.rows.size).toBe(1);
  });

  test('copying one recipe leaves the links to other recipes alone', async () => {
    const s = setup();
    const a = await created(s);
    const b = await created(s);
    await s.service.setVisibility(a, OWNER, 'public');
    await s.service.setVisibility(b, OWNER, 'public');
    await s.service.saveLink(b, OTHER, undefined);
    expect(await s.service.copy(a, OTHER, undefined)).toHaveProperty('id');
    expect([...s.links.keys()]).toEqual([`${OTHER}/${b}`]);
  });

  test('saved is false for the owner, anonymous readers and readers without a link', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    expect(detailOf(await s.service.get(id, OWNER)).saved).toBe(false);
    expect(detailOf(await s.service.get(id, null)).saved).toBe(false);
    expect(detailOf(await s.service.get(id, OTHER)).saved).toBe(false);
  });

  test('the shared link shows saved for a reader who also added it', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(detailOf(await s.service.getShared(TOKEN, OTHER)).saved).toBe(false);
    await s.service.saveLink(id, OTHER, TOKEN);
    expect(detailOf(await s.service.getShared(TOKEN, OTHER)).saved).toBe(true);
  });

  test('saved is not reported once the link no longer gives access', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    await s.service.saveLink(id, OTHER, TOKEN);
    await s.service.setVisibility(id, OWNER, 'private');
    await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(detailOf(await s.service.getShared('U'.repeat(43), OTHER)).saved).toBe(false);
  });

  test('a copy of an unlisted original links to it only for the original owner', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    const copy = await s.service.copy(id, OTHER, TOKEN);
    if (!('id' in copy)) throw new Error('copy failed');
    expect(detailOf(await s.service.get(copy.id, OTHER)).copiedFrom).toEqual({
      recipeId: null,
      ownerName: `name-${OWNER}`,
      ownerUsername: `user-${OWNER}`,
    });
    await s.service.setVisibility(copy.id, OTHER, 'public');
    expect(detailOf(await s.service.get(copy.id, OWNER)).copiedFrom).toEqual({
      recipeId: id,
      ownerName: `name-${OWNER}`,
      ownerUsername: `user-${OWNER}`,
    });
  });

  test('a copy of a now private original links to it for the original owner only', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    const copy = await s.service.copy(id, OTHER, undefined);
    if (!('id' in copy)) throw new Error('copy failed');
    await s.service.setVisibility(id, OWNER, 'private');
    await s.service.setVisibility(copy.id, OTHER, 'public');
    expect(detailOf(await s.service.get(copy.id, OWNER)).copiedFrom).toMatchObject({
      recipeId: id,
    });
    // A visitor who may not open the original learns nothing of it.
    expect(detailOf(await s.service.get(copy.id, null)).copiedFrom).toBeNull();
  });

  test('scopes "mine" and "saved" exclude each other and "all" has no duplicate', async () => {
    const s = setup();
    const a = await created(s);
    const own = await created(s, OTHER);
    await s.service.setVisibility(a, OWNER, 'public');
    await s.service.saveLink(a, OTHER, undefined);
    const all = ids(await s.service.listMine(OTHER, search()));
    expect(all.length).toBe(new Set(all).size);
    expect(ids(await s.service.listMine(OTHER, search({ scope: 'mine' })))).toEqual([own]);
    expect(ids(await s.service.listMine(OTHER, search({ scope: 'saved' })))).toEqual([a]);
    expect(ids(await s.service.listMine(OWNER, search({ scope: 'saved' })))).toEqual([]);
  });

  test('a deleted recipe leaves the list of the people who linked it', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    await s.service.saveLink(id, OTHER, undefined);
    await s.service.delete(id, OWNER);
    expect(ids(await s.service.listMine(OTHER, search()))).toEqual([]);
  });

  test('the gallery flags the own recipes of the viewer and passes the viewer on', async () => {
    const s = setup();
    const a = await created(s);
    const b = await created(s, OTHER);
    await s.service.setVisibility(a, OWNER, 'public');
    await s.service.setVisibility(b, OTHER, 'public');
    const seen = galleryPage(await s.service.gallery(search(), OTHER));
    expect(Object.fromEntries(seen.recipes.map((r) => [r.id, r.mine]))).toEqual({
      [a]: false,
      [b]: true,
    });
    expect(s.state.lastList).toMatchObject({ viewerId: OTHER });
    const anonymous = galleryPage(await s.service.gallery(search(), null));
    expect(s.state.lastList?.viewerId).toBeUndefined();
    expect(anonymous.recipes.every((r) => !r.mine)).toBe(true);
  });
});

describe('where a copy comes from, for other readers', () => {
  test('a public copy of a recipe readers may not open names nothing of it', async () => {
    const s = setup();
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    const copy = await s.service.copy(id, OTHER, TOKEN);
    if (!('id' in copy)) throw new Error('copy failed');
    await s.service.setVisibility(copy.id, OTHER, 'public');

    expect(await s.service.get(copy.id, 'third')).toMatchObject({
      copiedFromId: null,
      copiedFrom: null,
    });
    expect(await s.service.get(copy.id, null)).toMatchObject({ copiedFrom: null });
    // The copy's owner still knows where it came from.
    expect(await s.service.get(copy.id, OTHER)).toMatchObject({
      copiedFromId: id,
      copiedFrom: { recipeId: null, ownerName: `name-${OWNER}` },
    });
    // Once the original is public, everyone may see it.
    await s.service.setVisibility(id, OWNER, 'public');
    expect(await s.service.get(copy.id, 'third')).toMatchObject({
      copiedFrom: { recipeId: id, ownerName: `name-${OWNER}` },
    });
  });
});

describe('gallery for members only (the instance setting)', () => {
  test('a visitor reads no public recipe, nor the gallery, nor its photos', async () => {
    const s = setup({ publicGallery: false });
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    const image = await s.service.addImage(id, OWNER, UPLOAD);
    if ('error' in image) throw new Error('upload failed');
    const imageId = s.rows.get(id)!.imageIds[0]!;

    expect(await s.service.get(id, null)).toEqual({ error: 'not_found' });
    expect(await s.service.gallery(search(), null)).toEqual({ error: 'sign_in_required' });
    expect(await s.service.readImage(imageId, null, 'thumb')).toEqual({ error: 'not_found' });

    // Every member still does.
    expect(await s.service.get(id, OTHER)).toMatchObject({ id });
    expect(galleryPage(await s.service.gallery(search(), OTHER)).recipes).toHaveLength(1);
    // Served to members, but not cacheable as public (visitors may not see it).
    expect(await s.service.readImage(imageId, OTHER, 'thumb')).toMatchObject({ public: false });
  });

  test('a share link still works without an account', async () => {
    const s = setup({ publicGallery: false });
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    expect(await s.service.getShared(TOKEN, null)).toMatchObject({ id });
  });

  test('with a public gallery, a visitor reads public recipes', async () => {
    const s = setup({ publicGallery: true });
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    expect(await s.service.get(id, null)).toMatchObject({ id });
    expect(galleryPage(await s.service.gallery(search(), null)).recipes).toHaveLength(1);
  });

  test('the page of a member lists their public recipes only', async () => {
    const s = setup({ publicGallery: false });
    const shown = await created(s);
    const hidden = await created(s);
    await created(s, OTHER);
    await s.service.setVisibility(shown, OWNER, 'public');
    await s.service.setVisibility(hidden, OWNER, 'unlisted');
    const page = await s.service.publicOf(OWNER, search(), OTHER);
    expect(page.recipes.map((r) => r.id)).toEqual([shown]);
    expect(page.recipes[0]).toMatchObject({ ownerUsername: `user-${OWNER}`, mine: false });
  });
});

describe('gallery for members only: more cases', () => {
  test('a visitor reads an unlisted recipe by its token and its photos, but not a private one', async () => {
    const s = setup({ publicGallery: false });
    const unlisted = await created(s);
    const priv = await created(s);
    await s.service.setVisibility(unlisted, OWNER, 'unlisted');
    const a = await s.service.addImage(unlisted, OWNER, UPLOAD);
    const b = await s.service.addImage(priv, OWNER, UPLOAD);
    if ('error' in a || 'error' in b) throw new Error('upload failed');
    expect(await s.service.readImage(a.id, null, 'full')).toHaveProperty('data');
    expect(await s.service.readImage(b.id, null, 'full')).toEqual({ error: 'not_found' });
    expect(await s.service.get(priv, null)).toEqual({ error: 'not_found' });
  });

  test('a visitor does not read a public recipe through its share token once it is public', async () => {
    const s = setup({ publicGallery: false });
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'unlisted');
    await s.service.setVisibility(id, OWNER, 'public');
    expect(await s.service.getShared(TOKEN, null)).toEqual({ error: 'not_found' });
    expect(await s.service.get(id, null)).toEqual({ error: 'not_found' });
  });

  test('the setting is read on every request: opening the gallery shows recipes at once', async () => {
    const s = setup({ publicGallery: false });
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    expect(await s.service.get(id, null)).toEqual({ error: 'not_found' });
    s.gallery.open = true;
    expect(await s.service.get(id, null)).toMatchObject({ id });
    s.gallery.open = false;
    expect(await s.service.get(id, null)).toEqual({ error: 'not_found' });
  });

  test('a signed-in viewer is not blocked by the setting on a member page without recipes', async () => {
    const s = setup({ publicGallery: false });
    await created(s);
    expect((await s.service.publicOf(OWNER, search(), OTHER)).recipes).toEqual([]);
  });

  test('the page of a member passes the viewer and the search on, and never lists private recipes', async () => {
    const s = setup({ publicGallery: false });
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'private');
    const page = await s.service.publicOf(OWNER, search({ page: 2, q: 'Crème' }), OTHER);
    expect(page.recipes).toEqual([]);
    expect(s.state.lastList).toMatchObject({ viewerId: OTHER, offset: RECIPES_PAGE_SIZE });
  });
});

describe('usernames are for members only', () => {
  test('a visitor never gets the author username (it signs in)', async () => {
    const s = setup({ publicGallery: true });
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    const shared = await created(s);
    await s.service.setVisibility(shared, OWNER, 'unlisted');

    expect(await s.service.get(id, null)).toMatchObject({ ownerUsername: null });
    expect(await s.service.getShared(TOKEN, null)).toMatchObject({ ownerUsername: null });
    expect(galleryPage(await s.service.gallery(search(), null)).recipes[0]).toMatchObject({
      ownerUsername: null,
    });
    // Members do.
    expect(await s.service.get(id, OTHER)).toMatchObject({ ownerUsername: `user-${OWNER}` });
    expect(galleryPage(await s.service.gallery(search(), OTHER)).recipes[0]).toMatchObject({
      ownerUsername: `user-${OWNER}`,
    });
  });

  test('a copy names its author username to its owner only when signed in', async () => {
    const s = setup({ publicGallery: true });
    const id = await created(s);
    await s.service.setVisibility(id, OWNER, 'public');
    const copy = await s.service.copy(id, OTHER, undefined);
    if (!('id' in copy)) throw new Error('copy failed');
    await s.service.setVisibility(copy.id, OTHER, 'public');
    expect(await s.service.get(copy.id, null)).toMatchObject({
      copiedFrom: { recipeId: id, ownerUsername: null },
    });
    expect(await s.service.get(copy.id, OTHER)).toMatchObject({
      copiedFrom: { ownerUsername: `user-${OWNER}` },
    });
  });
});
