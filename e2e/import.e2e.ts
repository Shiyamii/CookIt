import { expect, test, type APIRequestContext } from '@playwright/test';
import { ADMIN_STATE, newMember, ORIGIN_HEADER, uniqueName } from './support';

test.use({ storageState: ADMIN_STATE });

type Category = { id: string; slug: string; tags: { id: string; slug: string }[] };

async function tagId(request: APIRequestContext, slug: string): Promise<string> {
  const categories = (await (await request.get('/api/v1/tags')).json()) as Category[];
  const tag = categories.flatMap((c) => c.tags).find((t) => t.slug === slug);
  if (!tag) throw new Error(`No tag ${slug}`);
  return tag.id;
}

test('quick creation: the recipe exists at once, "to complete", and is completed later', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'quick');
  await page.goto('/recipes');
  await page.getByRole('link', { name: 'New recipe' }).click();
  await page.getByLabel('Title').fill('Idée de soupe');
  await page.getByLabel('Servings').fill('2');
  await page.getByRole('button', { name: 'Create the recipe' }).click();

  // The visual editor opens on the new recipe, which already exists without ingredients or steps.
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}\/edit$/);
  const id = /recipes\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
  const created = await (await page.request.get(`/api/v1/recipes/${id}`)).json();
  expect(created).toMatchObject({
    title: 'Idée de soupe',
    servings: 2,
    body: '---',
    incomplete: true,
  });
  await page.goto('/recipes');
  await expect(page.getByTestId('recipe-card').filter({ hasText: 'Idée de soupe' })).toContainText(
    'To complete',
  );

  await page.goto(`/recipes/${id}/edit`);
  await page.getByLabel('Step', { exact: true }).first().fill('Mixer les légumes.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${id}$`));
  await expect(page.getByText('Mixer les légumes.')).toBeVisible();
  expect((await (await page.request.get(`/api/v1/recipes/${id}`)).json()).incomplete).toBe(false);
});

test('wizard: pasted lists are split, "1h30" and "10 min" become timers', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'wizard');
  await page.goto('/recipes/new/wizard');
  await page.getByLabel('Title').fill('Pot-au-feu');
  await page.getByLabel('Servings').fill('6');
  await page.getByRole('button', { name: 'Next' }).click();

  await page
    .getByLabel('Paste the ingredients')
    .fill('- 1 kg de bœuf\n- 4 carottes\nPour servir :\n- gros sel');
  await page.getByRole('button', { name: 'Split into lines' }).click();
  await expect(page.getByLabel('Ingredient', { exact: true })).toHaveCount(3);
  await page.getByRole('button', { name: 'Next' }).click();

  await page
    .getByLabel('Paste the steps')
    .fill(
      '1. Cuire la viande 1h30 à petit feu.\n2. Ajouter les carottes et cuire 10 min.\n3. Servir au bout de 2 minutes.',
    );
  await page.getByRole('button', { name: 'Split into lines' }).click();
  await expect(page.getByTestId('wizard-step')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Timer 1h30' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Timer 10 min' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // A proposed timer can be refused in one tap.
  await page.getByRole('button', { name: 'Timer 2 minutes' }).click();
  await expect(page.getByRole('button', { name: 'Timer 2 minutes' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  await page.getByRole('button', { name: 'Save the recipe' }).click();
  await expect(page.getByRole('heading', { name: 'Pot-au-feu' })).toBeVisible();
  const id = page.url().split('/').pop() ?? '';
  const { body } = await (await page.request.get(`/api/v1/recipes/${id}`)).json();
  expect(body).toContain('[1h30](timer:1h30m)');
  expect(body).toContain('[10 min](timer:10m)');
  expect(body).toContain('2 minutes');
  expect(body).not.toContain('timer:2m');
  expect(body).toContain('### Pour servir');
});

test('export then import of all recipes loses nothing, tags included', async ({
  browser,
  page: adminPage,
}) => {
  const author = await newMember(browser, adminPage, 'exporter');
  const markdown = [
    '# Gâteau au yaourt',
    '',
    '> Le classique.',
    '',
    'portions: 6',
    'source: https://example.com/gateau',
    'temps: 45 min',
    '',
    '---',
    '',
    '### Pâte',
    '',
    '- 1 pot de yaourt',
    '- 3 œufs',
    '',
    '---',
    '',
    '1. Mélanger.',
    '2. Cuire [35 min](timer:35m "Four").',
    '',
  ].join('\n');
  const created = await author.page.request.post('/api/v1/recipes/markdown', {
    data: {
      markdown,
      lang: 'fr',
      tagIds: [
        await tagId(author.page.request, 'dessert'),
        await tagId(author.page.request, 'vegetarien'),
      ],
    },
    headers: ORIGIN_HEADER,
  });
  expect(created.status()).toBe(201);
  const original = await (
    await author.page.request.get(`/api/v1/recipes/${(await created.json()).id}`)
  ).json();

  const zip = await author.page.request.get('/api/v1/recipes/export');
  expect(zip.headers()['content-type']).toBe('application/zip');

  const reader = await newMember(browser, adminPage, 'importer');
  await reader.page.goto('/recipes/import');
  // The file does not say its language (the import page asks): the original was French.
  await reader.page.getByLabel('Recipe language').click();
  await reader.page.getByRole('option', { name: 'Français' }).click();
  await reader.page.getByRole('tab', { name: 'File' }).click();
  await reader.page.getByLabel('A .md file, or a .zip of .md files').setInputFiles({
    name: 'cookit-recipes.zip',
    mimeType: 'application/zip',
    buffer: await zip.body(),
  });
  const item = reader.page.getByTestId('import-item');
  await expect(item).toHaveCount(1);
  await expect(item.getByRole('button', { name: 'Dessert', pressed: true })).toBeVisible();
  await expect(item.getByRole('button', { name: 'Vegetarian', pressed: true })).toBeVisible();
  await reader.page.getByRole('button', { name: 'Save 1 recipe' }).click();
  await expect(reader.page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);

  const id = reader.page.url().split('/').pop() ?? '';
  const imported = await (await reader.page.request.get(`/api/v1/recipes/${id}`)).json();
  for (const field of ['title', 'description', 'servings', 'source', 'extraMeta', 'body', 'lang']) {
    expect(imported[field]).toEqual(original[field]);
  }
  expect([...imported.tagIds].sort()).toEqual([...original.tagIds].sort());
});

test('"Validate tags": by id and by label, ambiguous asks, unknown ignored, nothing without validation', async ({
  browser,
  page: adminPage,
}) => {
  // Two tags with the same label in two categories: an ambiguous label.
  const label = `Mystère ${Date.now().toString(36)}`;
  const ambiguousIds: string[] = [];
  for (const n of [1, 2]) {
    const slug = uniqueName(`amb${n}`).toLowerCase().replace(/_/g, '-');
    const category = await adminPage.request.post('/api/v1/admin/tag-categories', {
      data: { slug, labels: { fr: `Catégorie ${n}` }, multiple: true },
      headers: ORIGIN_HEADER,
    });
    const tag = await adminPage.request.post('/api/v1/admin/tags', {
      data: {
        slug: `${slug}-t`,
        categoryId: (await category.json()).id,
        labels: { fr: label, en: label },
      },
      headers: ORIGIN_HEADER,
    });
    ambiguousIds.push((await tag.json()).id);
  }

  const { page } = await newMember(browser, adminPage, 'tagcheck');
  await page.goto('/recipes/import');
  await page
    .getByLabel('Recipe in the CookIt markdown format')
    .fill(
      `# Salade\n\nportions: 2\ntags: dessert, Végétarien, inconnu-du-site, ${label}\n\n---\n\n- 1 salade\n\n---\n\n1. Laver.\n`,
    );
  await page.getByRole('button', { name: 'Preview' }).click();
  const review = page.getByTestId('tag-review');
  await expect(review.getByRole('button', { name: 'Dessert', pressed: true })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Vegetarian', pressed: true })).toBeVisible();
  await expect(page.getByTestId('ignored-tags')).toContainText('inconnu-du-site');
  await expect(review).toContainText(`"${label}" matches several tags`);

  // The user unchecks a recognized tag and picks one of the ambiguous ones.
  await review.getByRole('button', { name: 'Dessert', pressed: true }).click();
  await review.getByRole('group', { name: label }).getByRole('button').first().click();
  await page.getByRole('button', { name: 'Save 1 recipe' }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);

  const id = page.url().split('/').pop() ?? '';
  const saved = await (await page.request.get(`/api/v1/recipes/${id}`)).json();
  expect(saved.tagIds).toContain(await tagId(page.request, 'vegetarien'));
  expect(saved.tagIds).not.toContain(await tagId(page.request, 'dessert'));
  expect(saved.tagIds.filter((t: string) => ambiguousIds.includes(t))).toHaveLength(1);
  expect(saved.tagIds).toHaveLength(2);
});

test('import by URL never reaches the local or private network', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'ssrf');
  for (const url of [
    'http://127.0.0.1:3000/',
    'http://127.0.0.1/',
    'http://localhost/',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.1/',
    'http://192.168.1.1/',
    'http://[::1]/',
    'http://0.0.0.0/',
  ]) {
    const res = await page.request.post('/api/v1/import/url', {
      data: { url, lang: 'fr' },
      headers: ORIGIN_HEADER,
    });
    expect(res.status(), url).toBe(422);
    expect(['blocked_address', 'invalid_url']).toContain((await res.json()).error);
  }
  for (const url of ['file:///etc/passwd', 'ftp://example.com/', 'http://user:pw@example.com/']) {
    const res = await page.request.post('/api/v1/import/url', {
      data: { url, lang: 'fr' },
      headers: ORIGIN_HEADER,
    });
    expect((await res.json()).error, url).toBe('invalid_url');
  }

  await page.goto('/recipes/import');
  await page.getByRole('tab', { name: 'Web page' }).click();
  await page.getByLabel('Address of a recipe page').fill('http://192.168.1.10/recette');
  await page.getByRole('button', { name: 'Fetch the recipe' }).click();
  await expect(page.getByRole('alert')).toContainText('local or private network');

  // Without an account: refused before anything is fetched.
  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const refused = await anonymous.request.post('/api/v1/import/url', {
    data: { url: 'https://example.com/', lang: 'fr' },
    headers: ORIGIN_HEADER,
  });
  expect(refused.status()).toBe(401);
});

test('one recipe can be exported as a .md file with its tags', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'onefile');
  const created = await page.request.post('/api/v1/recipes/markdown', {
    data: {
      markdown: '# Pesto\n\nportions: 4\n\n---\n\n- 1 botte de basilic\n\n---\n\n1. Mixer.\n',
      lang: 'fr',
      tagIds: [await tagId(page.request, 'sauce')],
    },
    headers: ORIGIN_HEADER,
  });
  await page.goto(`/recipes/${(await created.json()).id}`);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export (.md)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('pesto.md');
  const text = await (await file.createReadStream()).toArray();
  const content = Buffer.concat(text).toString('utf8');
  expect(content).toContain('tags: sauce');
  expect(content).toContain('format: 1');
  expect(content).toContain('- 1 botte de basilic');
});
