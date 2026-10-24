import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN_STATE, newMember, newVisitor, ORIGIN_HEADER, uniqueName } from './support';

test.use({ storageState: ADMIN_STATE });

/** A recipe document (format §4) with a unique word to find it by search. */
function recipeMarkdown(title: string, extra = '') {
  return [
    `# ${title}`,
    '',
    '> Une recette de test.',
    '',
    'portions: 4',
    '',
    '---',
    '',
    `- 250 g de farine ${extra}`,
    '- 2 œufs',
    '',
    '---',
    '',
    '1. Mélanger la farine et les œufs.',
    '2. Cuire [10 min](timer:10m "Cuisson").',
    '',
  ].join('\n');
}

async function createRecipe(
  request: APIRequestContext,
  title: string,
  extra = '',
): Promise<string> {
  const res = await request.post('/api/v1/recipes/markdown', {
    data: { markdown: recipeMarkdown(title, extra), lang: 'fr' },
    headers: ORIGIN_HEADER,
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function setVisibility(request: APIRequestContext, id: string, visibility: string) {
  const res = await request.put(`/api/v1/recipes/${id}/visibility`, {
    data: { visibility },
    headers: ORIGIN_HEADER,
  });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { shareUrl: string | null };
}

const tokenOf = (url: string) => /#token=([A-Za-z0-9_-]+)/.exec(url)?.[1] ?? '';

/** Every way someone who is not the owner could read or change a recipe: all answer 404. */
async function expectNoAccess(request: APIRequestContext, id: string) {
  const headers = ORIGIN_HEADER;
  const body = { title: 'Pirate', description: '', servings: 1, extraMeta: {}, body: '' };
  const answers = [
    await request.get(`/api/v1/recipes/${id}`),
    await request.put(`/api/v1/recipes/${id}`, { data: body, headers }),
    await request.put(`/api/v1/recipes/${id}/markdown`, {
      data: { markdown: recipeMarkdown('Pirate') },
      headers,
    }),
    await request.put(`/api/v1/recipes/${id}/visibility`, {
      data: { visibility: 'public' },
      headers,
    }),
    await request.delete(`/api/v1/recipes/${id}`, { headers }),
    await request.post(`/api/v1/recipes/${id}/copy`, { data: {}, headers }),
    await request.put(`/api/v1/recipes/${id}/saved`, { data: {}, headers }),
  ];
  // Anonymous callers are stopped earlier (401) on the routes that need an account.
  for (const answer of answers) expect([401, 404]).toContain(answer.status());
  expect(answers[0]?.status()).toBe(404);
}

test.describe('authorization', () => {
  test('a private recipe is only ever seen and changed by its owner', async ({
    browser,
    page: adminPage,
  }) => {
    const owner = await newMember(browser, adminPage, 'owner');
    const other = await newMember(browser, adminPage, 'other');
    const word = uniqueName('secret').toLowerCase();
    const id = await createRecipe(owner.page.request, 'Recette privée', word);

    await expectNoAccess(other.page.request, id);
    await expectNoAccess(adminPage.request, id); // admins included
    await expectNoAccess((await newVisitor(browser)).request, id);

    // Not listed or found anywhere for others.
    const gallery = await other.page.request.get(`/api/v1/gallery?q=${word}`);
    expect((await gallery.json()).recipes).toEqual([]);
    const theirs = await other.page.request.get(`/api/v1/recipes?q=${word}`);
    expect((await theirs.json()).recipes).toEqual([]);

    // Untouched, and still the owner's.
    const mine = await owner.page.request.get(`/api/v1/recipes/${id}`);
    expect(await mine.json()).toMatchObject({ title: 'Recette privée', isOwner: true });
    const listed = await owner.page.request.get(`/api/v1/recipes?q=${word}`);
    expect((await listed.json()).recipes).toHaveLength(1);

    // The page says "not found", like any unknown address.
    await other.page.goto(`/recipes/${id}`);
    await expect(other.page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('an unlisted recipe is readable with its link only, and the link stops when private', async ({
    browser,
    page: adminPage,
  }) => {
    const owner = await newMember(browser, adminPage, 'sharer');
    const id = await createRecipe(owner.page.request, 'Recette partagée');
    const { shareUrl } = await setVisibility(owner.page.request, id, 'unlisted');
    expect(shareUrl).toMatch(/\/shared#token=[A-Za-z0-9_-]{43}$/);
    const token = tokenOf(shareUrl ?? '');

    const visitor = await newVisitor(browser);
    // Not by its id, not in the gallery…
    expect((await visitor.request.get(`/api/v1/recipes/${id}`)).status()).toBe(404);
    // …but with the link, even without an account.
    await visitor.goto(shareUrl ?? '');
    await expect(visitor.getByRole('heading', { name: 'Recette partagée' })).toBeVisible();
    await expect(visitor.getByText('Sign in to add this recipe to your recipes.')).toBeVisible();
    // A reload keeps working: the token stays in the address.
    await visitor.reload();
    await expect(visitor.getByRole('heading', { name: 'Recette partagée' })).toBeVisible();

    await setVisibility(owner.page.request, id, 'private');
    const shared = await visitor.request.post('/api/v1/shared', {
      data: { token },
      headers: ORIGIN_HEADER,
    });
    expect(shared.status()).toBe(404);

    // Back to unlisted: a new link; the old one stays dead.
    const renewed = (await setVisibility(owner.page.request, id, 'unlisted')).shareUrl ?? '';
    expect(renewed).not.toBe(shareUrl);
    const post = (t: string) =>
      visitor.request.post('/api/v1/shared', { data: { token: t }, headers: ORIGIN_HEADER });
    expect((await post(token)).status()).toBe(404);
    expect((await post(tokenOf(renewed))).status()).toBe(200);
  });

  test('"add to my recipes" keeps a link to the author\'s version, without a copy', async ({
    browser,
    page: adminPage,
  }) => {
    const owner = await newMember(browser, adminPage, 'linked');
    const reader = await newMember(browser, adminPage, 'follower');
    const id = await createRecipe(owner.page.request, 'Recette suivie');
    await setVisibility(owner.page.request, id, 'public');

    await reader.page.goto(`/recipes/${id}`);
    await reader.page.getByRole('button', { name: 'Add to my recipes' }).click();
    await expect(reader.page.getByRole('heading', { name: 'In my recipes' })).toBeVisible();
    await expect(reader.page).toHaveURL(new RegExp(id));

    // Listed in "my recipes" with its author, under "All" and "Added", not under "Mine".
    await reader.page.goto('/recipes');
    const card = reader.page.getByTestId('recipe-card').filter({ hasText: 'Recette suivie' });
    await expect(card).toContainText(`By ${owner.username}`);
    await expect(card.getByLabel('Added to my recipes')).toBeVisible();
    await reader.page.getByRole('button', { name: 'Mine', exact: true }).click();
    await expect(reader.page).toHaveURL(/scope=mine/);
    await expect(reader.page.getByText('No recipe yet. Create your first one!')).toBeVisible();
    await reader.page.getByRole('button', { name: 'Added', exact: true }).click();
    await expect(card).toBeVisible();

    // The author's changes show at once: it is the same recipe.
    await owner.page.request.put(`/api/v1/recipes/${id}/markdown`, {
      data: { markdown: recipeMarkdown('Recette suivie v2') },
      headers: ORIGIN_HEADER,
    });
    await reader.page.reload();
    await expect(
      reader.page.getByTestId('recipe-card').filter({ hasText: 'Recette suivie v2' }),
    ).toBeVisible();

    // Shared by link only: it leaves the reader's recipes; adding it again needs the link.
    const { shareUrl } = await setVisibility(owner.page.request, id, 'unlisted');
    const list = async () =>
      (await (await reader.page.request.get('/api/v1/recipes')).json()).recipes as { id: string }[];
    expect((await list()).map((r) => r.id)).not.toContain(id);
    const without = await reader.page.request.put(`/api/v1/recipes/${id}/saved`, {
      data: {},
      headers: ORIGIN_HEADER,
    });
    expect(without.status()).toBe(404);

    // From the share link: added again, then readable from its id (cooking needs that).
    await reader.page.goto(shareUrl ?? '');
    await expect(reader.page.getByText('Add it to your recipes to cook it.')).toBeVisible();
    await reader.page.getByRole('button', { name: 'Add to my recipes' }).click();
    await expect(reader.page.getByRole('heading', { name: 'In my recipes' })).toBeVisible();
    await expect(reader.page.getByRole('link', { name: 'Cook', exact: true })).toBeVisible();
    expect((await reader.page.request.get(`/api/v1/recipes/${id}`)).status()).toBe(200);
    expect((await list()).map((r) => r.id)).toContain(id);

    // A new share link cuts it off.
    await setVisibility(owner.page.request, id, 'private');
    await setVisibility(owner.page.request, id, 'unlisted');
    expect((await reader.page.request.get(`/api/v1/recipes/${id}`)).status()).toBe(404);
    expect((await list()).map((r) => r.id)).not.toContain(id);

    // Public again: everyone may read it, so it is back in the reader's recipes. Removing it.
    await setVisibility(owner.page.request, id, 'public');
    expect((await list()).map((r) => r.id)).toContain(id);
    await reader.page.goto(`/recipes/${id}`);
    await reader.page.getByRole('button', { name: 'Remove from my recipes' }).click();
    await expect(reader.page.getByRole('button', { name: 'Add to my recipes' })).toBeVisible();
    expect((await list()).map((r) => r.id)).not.toContain(id);
  });

  test('"make a copy in my recipes" makes an independent private copy that says where it comes from', async ({
    browser,
    page: adminPage,
  }) => {
    const owner = await newMember(browser, adminPage, 'author');
    const reader = await newMember(browser, adminPage, 'reader');
    const id = await createRecipe(owner.page.request, 'Recette publique');
    await setVisibility(owner.page.request, id, 'public');

    await reader.page.goto(`/recipes/${id}`);
    await expect(reader.page.getByText(`By ${owner.username}`)).toBeVisible();
    await reader.page.getByRole('button', { name: 'Make a copy in my recipes' }).click();
    // The copy is explained before it is made: it no longer follows the author.
    const dialog = reader.page.getByRole('alertdialog');
    await expect(dialog).toContainText('will not reach it');
    await dialog.getByRole('button', { name: 'Make the copy' }).click();
    await expect(reader.page).not.toHaveURL(new RegExp(id));
    await expect(reader.page.getByText('Your recipe')).toBeVisible();
    await expect(reader.page.getByText(`Copied from a recipe by ${owner.username}`)).toBeVisible();
    await reader.page.getByRole('link', { name: 'See the original recipe' }).click();
    await expect(reader.page).toHaveURL(new RegExp(id));
    await reader.page.goBack();
    const copyId = reader.page.url().split('/').pop() ?? '';

    const copy = await (await reader.page.request.get(`/api/v1/recipes/${copyId}`)).json();
    expect(copy).toMatchObject({
      visibility: 'private',
      copiedFromId: id,
      copiedFrom: { recipeId: id, ownerName: owner.username },
      isOwner: true,
    });

    // The original changes; the copy does not.
    await owner.page.request.put(`/api/v1/recipes/${id}/markdown`, {
      data: { markdown: recipeMarkdown('Recette modifiée') },
      headers: ORIGIN_HEADER,
    });
    const after = await (await reader.page.request.get(`/api/v1/recipes/${copyId}`)).json();
    expect(after.title).toBe('Recette publique');

    // A private recipe cannot be copied, and nobody copies their own.
    await setVisibility(owner.page.request, id, 'private');
    const refused = await reader.page.request.post(`/api/v1/recipes/${id}/copy`, {
      data: {},
      headers: ORIGIN_HEADER,
    });
    expect(refused.status()).toBe(404);
    // The original is gone from view: its author is still named, without a link to it.
    const after2 = await (await reader.page.request.get(`/api/v1/recipes/${copyId}`)).json();
    expect(after2.copiedFrom).toEqual({ recipeId: null, ownerName: owner.username });
    const own = await owner.page.request.post(`/api/v1/recipes/${id}/copy`, {
      data: {},
      headers: ORIGIN_HEADER,
    });
    expect(own.status()).toBe(400);
  });
});

test.describe('gallery and search', () => {
  test('public recipes are in the gallery without an account; search ignores accents', async ({
    browser,
    page: adminPage,
  }) => {
    const owner = await newMember(browser, adminPage, 'chef');
    const word = `pâtisserie${Date.now().toString(36)}`;
    const id = await createRecipe(owner.page.request, `Tarte ${word}`, 'beurre');
    await setVisibility(owner.page.request, id, 'public');

    const visitor = await newVisitor(browser);
    await visitor.goto('/gallery');
    await visitor.getByRole('searchbox', { name: 'Search recipes' }).fill(word.replace('â', 'a'));
    await expect(visitor.getByTestId('recipe-card')).toHaveCount(1);
    await visitor.getByTestId('recipe-card').click();
    await expect(visitor.getByRole('heading', { name: `Tarte ${word}` })).toBeVisible();

    // Ingredients are searched too (by the start of a word).
    const byIngredient = await visitor.request.get(
      `/api/v1/gallery?q=${encodeURIComponent(`${word} farin`)}`,
    );
    expect((await byIngredient.json()).recipes).toHaveLength(1);
  });
});

test.describe('API checks', () => {
  test('an unreadable recipe is refused with its diagnostics; a stale save is a conflict', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'api');
    const invalid = await page.request.post('/api/v1/recipes/markdown', {
      data: { markdown: 'portions: 4\n\n---\n\n---\n', lang: 'fr' },
      headers: ORIGIN_HEADER,
    });
    expect(invalid.status()).toBe(422);
    expect((await invalid.json()).diagnostics).toContainEqual(
      expect.objectContaining({ code: 'missing_title', severity: 'error' }),
    );

    const id = await createRecipe(page.request, 'Conflit');
    const { updatedAt } = await (await page.request.get(`/api/v1/recipes/${id}`)).json();
    const save = (title: string) =>
      page.request.put(`/api/v1/recipes/${id}/markdown`, {
        data: { markdown: recipeMarkdown(title), baseVersion: updatedAt },
        headers: ORIGIN_HEADER,
      });
    expect((await save('Première')).status()).toBe(200);
    expect((await save('Seconde')).status()).toBe(409);

    // A line break in a single-line field, or a reserved extra key, is refused.
    const fields = { description: '', servings: 2, body: '', lang: 'fr' };
    for (const data of [
      { ...fields, title: 'Un\n---\ndeux', extraMeta: {} },
      { ...fields, title: 'Ok', extraMeta: { portions: '8' } },
    ]) {
      const res = await page.request.post('/api/v1/recipes', { data, headers: ORIGIN_HEADER });
      expect(res.status()).toBe(400);
    }
  });
});

test.describe('editor', () => {
  /** Opens a new recipe in the visual editor with a title, an ingredient and a step. */
  async function startRecipe(page: Page, title: string) {
    await page.goto('/recipes');
    await page.getByRole('link', { name: 'New recipe' }).click();
    await page.getByRole('link', { name: /Full editor/ }).click();
    // The editor is loaded on demand: wait for it (the previous page also has a Title field).
    await expect(page.getByRole('heading', { name: 'New recipe' })).toBeVisible();
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Servings', { exact: true }).fill('4');
    const ingredient = page.getByTestId('ingredient-row').first();
    await ingredient.getByLabel('Quantity').fill('250');
    await ingredient.getByLabel('Unit').fill('g');
    await ingredient.getByLabel('Ingredient', { exact: true }).fill('de farine');
    await page.getByLabel('Step', { exact: true }).first().fill('Cuire au four.');
  }

  test('create in the visual editor, add a timer, switch to markdown and back, save', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'cook');
    await startRecipe(page, 'Gâteau simple');

    await page.getByRole('button', { name: 'Add a timer' }).click();
    await page.getByLabel('Minutes').fill('35');
    await page.getByLabel('Name', { exact: true }).fill('Four');
    await page.getByRole('button', { name: 'Insert' }).click();
    await expect(page.getByRole('button', { name: 'Change the timer Four' })).toBeVisible();

    await page.getByRole('tab', { name: 'Markdown' }).click();
    const editor = page.getByTestId('markdown-editor');
    await expect(editor).toContainText('# Gâteau simple');
    await expect(editor).toContainText('- 250 g de farine');
    await expect(editor).toContainText('[35 min](timer:35m "Four")');

    // Back to the visual editor: nothing lost.
    await page.getByRole('tab', { name: 'Visual' }).click();
    await expect(page.getByLabel('Title')).toHaveValue('Gâteau simple');
    await expect(page.getByTestId('ingredient-row').first().getByLabel('Quantity')).toHaveValue(
      '250',
    );

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Gâteau simple' })).toBeVisible();
    await expect(page.getByText('250 g de farine')).toBeVisible();

    // Servings scale the quantities, not the timers.
    await page.getByRole('button', { name: 'More servings' }).click();
    await page.getByRole('button', { name: 'More servings' }).click();
    await page.getByRole('button', { name: 'More servings' }).click();
    await page.getByRole('button', { name: 'More servings' }).click();
    await expect(page.getByText('500 g de farine')).toBeVisible();
    await expect(page.getByText('35 min')).toBeVisible();
  });

  test('the markdown editor refuses to switch to the visual editor while the text has errors', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'writer');
    const id = await createRecipe(page.request, 'Recette à casser');
    await page.goto(`/recipes/${id}/edit`);
    await page.getByRole('tab', { name: 'Markdown' }).click();

    const content = page.getByTestId('markdown-editor').locator('.cm-content');
    await content.click();
    await page.keyboard.press('ControlOrMeta+a');
    // Only part 1 left: the separators are missing.
    await page.keyboard.type('portions: 4');
    await expect(page.getByText('Three parts are needed', { exact: false })).toBeVisible();

    await page.getByRole('tab', { name: 'Visual' }).click();
    await expect(page.getByRole('alert')).toContainText('fix them to leave the markdown editor');
    await expect(page.getByRole('tab', { name: 'Markdown' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('leaving with unsaved changes asks first, and the draft can be restored', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'draft');
    await startRecipe(page, 'Brouillon gardé');
    // The draft is written after a short pause.
    await page.waitForTimeout(1200);

    await page.getByRole('link', { name: 'Gallery' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Leave without saving?');
    await page.getByRole('button', { name: 'Leave' }).click();
    await expect(page).toHaveURL(/\/gallery$/);

    await page.goto('/recipes/new/editor');
    await page.getByRole('button', { name: 'Restore them' }).click();
    await expect(page.getByLabel('Title')).toHaveValue('Brouillon gardé');
  });
});
