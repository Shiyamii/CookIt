import { expect, test, type APIRequestContext } from '@playwright/test';
import { ADMIN_STATE, newMember, newVisitor, ORIGIN_HEADER, uniqueName } from './support';

test.use({ storageState: ADMIN_STATE });

type Category = { id: string; slug: string; tags: { id: string; slug: string }[] };

async function catalog(request: APIRequestContext): Promise<Category[]> {
  return (await (await request.get('/api/v1/tags')).json()) as Category[];
}

/** A unique tag in a new category (rerunnable: unique slugs). */
async function newTag(admin: APIRequestContext, fr: string, en: string) {
  const slug = uniqueName('cat').toLowerCase().replace(/_/g, '-');
  const created = await admin.post('/api/v1/admin/tag-categories', {
    data: { slug, labels: { fr: 'Catégorie test', en: 'Test category' }, multiple: true },
    headers: ORIGIN_HEADER,
  });
  expect(created.status()).toBe(201);
  const { id: categoryId } = (await created.json()) as { id: string };
  const tagSlug = `${slug}-tag`;
  const tag = await admin.post('/api/v1/admin/tags', {
    data: { slug: tagSlug, categoryId, labels: { fr, en } },
    headers: ORIGIN_HEADER,
  });
  expect(tag.status()).toBe(201);
  return { categoryId, tagId: ((await tag.json()) as { id: string }).id, tagSlug };
}

const recipe = (title: string, ingredient: string) =>
  [
    `# ${title}`,
    '',
    'portions: 4',
    '',
    '---',
    '',
    `- ${ingredient}`,
    '',
    '---',
    '',
    '1. Servir.',
    '',
  ].join('\n');

async function createRecipe(
  request: APIRequestContext,
  title: string,
  ingredient: string,
  tagIds: string[] = [],
) {
  const res = await request.post('/api/v1/recipes/markdown', {
    data: { markdown: recipe(title, ingredient), lang: 'fr', tagIds },
    headers: ORIGIN_HEADER,
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test('the starting catalogs are there (units and tag categories, FR and EN)', async ({ page }) => {
  const units = (await (await page.request.get('/api/v1/units')).json()) as { slug: string }[];
  expect(units.map((unit) => unit.slug)).toEqual(expect.arrayContaining(['g', 'kg', 'ml']));
  const slugs = (await catalog(page.request)).flatMap((c) => c.tags.map((t) => t.slug));
  expect(slugs).toEqual(expect.arrayContaining(['dessert', 'vegetarien']));
});

test('only an admin creates or changes tags and units', async ({ browser, page: adminPage }) => {
  const { page } = await newMember(browser, adminPage, 'nonadmin');
  const visitor = await newVisitor(browser);
  const [category] = await catalog(page.request);
  const attempts = (request: APIRequestContext) => [
    request.post('/api/v1/admin/tag-categories', {
      data: { slug: 'pirate', labels: { fr: 'Pirate' }, multiple: false },
      headers: ORIGIN_HEADER,
    }),
    request.post('/api/v1/admin/tags', {
      data: { slug: 'pirate', categoryId: category?.id, labels: { fr: 'Pirate' } },
      headers: ORIGIN_HEADER,
    }),
    request.post('/api/v1/admin/units', {
      data: {
        slug: 'pirate',
        rounding: 'decimal',
        labels: { fr: 'Pirate' },
        aliases: { fr: ['prt'] },
      },
      headers: ORIGIN_HEADER,
    }),
    request.get('/api/v1/admin/tags'),
  ];
  for (const answer of await Promise.all(attempts(page.request))) expect(answer.status()).toBe(403);
  for (const answer of await Promise.all(attempts(visitor.request)))
    expect(answer.status()).toBe(401);
});

test('tag labels follow the interface language, the data does not change', async ({
  browser,
  page: adminPage,
}) => {
  const { tagId } = await newTag(adminPage.request, 'Fait maison', 'Homemade');
  const { page } = await newMember(browser, adminPage, 'polyglot');
  const id = await createRecipe(page.request, 'Recette taguée', '1 œuf', [tagId]);

  await page.goto(`/recipes/${id}`);
  const tags = page.getByRole('list', { name: 'Tags' });
  await expect(tags).toContainText('Homemade');
  await page.getByRole('button', { name: 'Language' }).click();
  await page.getByRole('menuitemradio', { name: 'Français' }).click();
  await expect(page.getByRole('list', { name: 'Tags' })).toContainText('Fait maison');

  const detail = await (await page.request.get(`/api/v1/recipes/${id}`)).json();
  expect(detail.tagIds).toEqual([tagId]);
});

test('tags are chosen in the visual editor and filter the gallery', async ({
  browser,
  page: adminPage,
}) => {
  const quick = `Quick ${Date.now().toString(36)}`;
  const { tagSlug } = await newTag(adminPage.request, 'Rapide', quick);
  const { page } = await newMember(browser, adminPage, 'tagger');
  const id = await createRecipe(page.request, 'Soupe express', '1 l de bouillon');

  await page.goto(`/recipes/${id}/edit`);
  await page.getByRole('button', { name: quick }).click();
  await expect(page.getByRole('button', { name: quick })).toHaveAttribute('aria-pressed', 'true');
  // Single-choice category: a second dish type replaces the first.
  const dishTypes = page.getByRole('group', { name: 'Dish type' });
  await dishTypes.getByRole('button', { name: 'Starter' }).click();
  await dishTypes.getByRole('button', { name: 'Main course' }).click();
  await expect(dishTypes.getByRole('button', { name: 'Starter' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('list', { name: 'Tags' })).toContainText(quick);
  await expect(page.getByRole('list', { name: 'Tags' })).toContainText('Main course');

  // Saving from the markdown editor keeps the tags (they are never in the text).
  await page.goto(`/recipes/${id}/edit`);
  await page.getByRole('tab', { name: 'Markdown' }).click();
  await expect(page.getByTestId('markdown-editor')).not.toContainText('tags:');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('list', { name: 'Tags' })).toContainText(quick);

  await page.request.put(`/api/v1/recipes/${id}/visibility`, {
    data: { visibility: 'public' },
    headers: ORIGIN_HEADER,
  });
  const filtered = await (await page.request.get(`/api/v1/gallery?tags=${tagSlug}`)).json();
  expect(filtered.recipes.map((r: { id: string }) => r.id)).toEqual([id]);
  const none = await (await page.request.get('/api/v1/gallery?tags=no-such-tag')).json();
  expect(none.recipes).toEqual([]);

  await page.goto(`/gallery?tags=${tagSlug}`);
  await expect(page.getByTestId('recipe-card')).toHaveCount(1);
});

test('deleting a used tag asks for a confirmation and can merge it', async ({
  browser,
  page: adminPage,
}) => {
  const first = await newTag(adminPage.request, 'Ancien', 'Old');
  const target = `New ${Date.now().toString(36)}`;
  const second = await newTag(adminPage.request, 'Nouveau', target);
  const { page } = await newMember(browser, adminPage, 'merged');
  const id = await createRecipe(page.request, 'Recette fusionnée', '1 œuf', [first.tagId]);

  const refused = await adminPage.request.post(`/api/v1/admin/tags/${first.tagId}/delete`, {
    data: {},
    headers: ORIGIN_HEADER,
  });
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toEqual({ error: 'tag_in_use', recipeCount: 1 });

  await adminPage.goto('/admin/tags');
  await adminPage.getByRole('button', { name: `Delete the tag ${first.tagSlug}` }).click();
  const dialog = adminPage.getByRole('alertdialog');
  await expect(dialog).toContainText('1 recipe uses it');
  await dialog.getByRole('combobox', { name: 'Merge into' }).click();
  await adminPage.getByRole('option', { name: target }).click();
  await dialog.getByRole('button', { name: 'Merge' }).click();
  await expect(dialog).toBeHidden();

  const detail = await (await page.request.get(`/api/v1/recipes/${id}`)).json();
  expect(detail.tagIds).toEqual([second.tagId]);
});

test('a unit added by the admin is used at the next scaling; a duplicate alias is refused', async ({
  browser,
  page: adminPage,
}) => {
  const alias = uniqueName('zz')
    .toLowerCase()
    .replace(/[_0-9]/g, '');
  const { page } = await newMember(browser, adminPage, 'scaler');
  // 3 for 4 servings, shown for 3: 2.25 → "2 ¼" without unit (fractions), "2,5" in decimals.
  const id = await createRecipe(page.request, 'Recette à unité', `3 ${alias} de sel`);
  await page.goto(`/recipes/${id}`);
  await page.getByRole('button', { name: 'Fewer servings' }).click();
  await expect(page.getByText(`2 ¼ ${alias} de sel`)).toBeVisible();

  const unit = (aliases: string[]) => ({
    slug: alias,
    rounding: 'decimal',
    labels: { fr: alias },
    aliases: { fr: aliases },
  });
  const duplicate = await adminPage.request.post('/api/v1/admin/units', {
    data: unit([alias, 'g']),
    headers: ORIGIN_HEADER,
  });
  expect(duplicate.status()).toBe(409);
  expect(await duplicate.json()).toMatchObject({ error: 'alias_conflict', aliases: ['g'] });
  const created = await adminPage.request.post('/api/v1/admin/units', {
    data: unit([alias]),
    headers: ORIGIN_HEADER,
  });
  expect(created.status()).toBe(201);

  await page.reload();
  await page.getByRole('button', { name: 'Fewer servings' }).click();
  await expect(page.getByText(`2,5 ${alias} de sel`)).toBeVisible();
});
