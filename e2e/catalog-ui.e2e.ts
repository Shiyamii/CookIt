import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN_STATE, newMember, ORIGIN_HEADER, uniqueName } from './support';

test.use({ storageState: ADMIN_STATE });

const slugOf = (prefix: string) =>
  uniqueName(prefix)
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)] ?? 'x');

async function post(request: APIRequestContext, url: string, data: unknown) {
  return request.post(`/api/v1${url}`, { data, headers: ORIGIN_HEADER });
}
async function put(request: APIRequestContext, url: string, data: unknown) {
  return request.put(`/api/v1${url}`, { data, headers: ORIGIN_HEADER });
}

async function apiCategory(request: APIRequestContext, multiple: boolean) {
  const slug = slugOf('c');
  const res = await post(request, '/admin/tag-categories', {
    slug,
    labels: { en: `Cat ${slug}` },
    multiple,
  });
  expect(res.status()).toBe(201);
  return { id: ((await res.json()) as { id: string }).id, slug };
}

async function apiTag(request: APIRequestContext, categoryId: string, label: string) {
  const slug = slugOf('t');
  const res = await post(request, '/admin/tags', { slug, categoryId, labels: { en: label } });
  expect(res.status()).toBe(201);
  return { id: ((await res.json()) as { id: string }).id, slug, label };
}

async function apiRecipe(request: APIRequestContext, title: string, tagIds: string[]) {
  const markdown = `# ${title}\n\nportions: 2\n\n---\n\n- 1 oeuf\n\n---\n\n1. Servir.\n`;
  const res = await post(request, '/recipes/markdown', { markdown, lang: 'fr', tagIds });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function fillLabelAndSave(page: Page, label: string) {
  const form = page.getByRole('form');
  await form.getByLabel('Name (English)').fill(label);
  await form.getByRole('button', { name: 'Save' }).click();
}

test('the admin creates, edits, moves and deletes categories and tags in the UI', async ({
  page,
}) => {
  const first = `Alpha ${Date.now().toString(36)}`;
  const second = `Beta ${Date.now().toString(36)}`;
  await page.goto('/admin/tags');

  // Create two categories (the slug is suggested from the name).
  for (const label of [first, second]) {
    await page.getByRole('button', { name: 'Add a category' }).click();
    await fillLabelAndSave(page, label);
    await expect(page.getByRole('region', { name: label })).toBeVisible();
  }
  const catA = page.getByRole('region', { name: first });
  const catB = page.getByRole('region', { name: second });
  await expect(catA.getByText('one tag per recipe')).toBeVisible();

  // Edit a category: allow several tags.
  await catA.getByRole('button', { name: 'Edit the category' }).click();
  await page.getByLabel('Several tags of this category on one recipe').check();
  await page.getByRole('form').getByRole('button', { name: 'Save' }).click();
  await expect(catA.getByText('several tags per recipe')).toBeVisible();

  // Create tags, rename one.
  const tagName = `Tag ${Date.now().toString(36)}`;
  await catA.getByRole('button', { name: 'Add a tag' }).click();
  await fillLabelAndSave(page, tagName);
  await expect(catA.getByTestId('tag-row').filter({ hasText: tagName })).toBeVisible();
  const slug = (await catA.getByTestId('tag-row').first().innerText()).match(/tag-[a-z0-9-]+/)?.[0];
  expect(slug).toBeTruthy();

  await catA.getByRole('button', { name: `Edit the tag ${slug}` }).click();
  const renamed = `${tagName} renamed`;
  await fillLabelAndSave(page, renamed);
  await expect(catA.getByTestId('tag-row').filter({ hasText: renamed })).toBeVisible();

  // Move the tag to the other category.
  await catA.getByRole('button', { name: `Edit the tag ${slug}` }).click();
  await page.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: second }).click();
  await page.getByRole('form').getByRole('button', { name: 'Save' }).click();
  await expect(catB.getByTestId('tag-row').filter({ hasText: renamed })).toBeVisible();
  await expect(catA.getByTestId('tag-row')).toHaveCount(0);

  // A second tag, then reorder: the moved tag goes below it.
  const other = `Other ${Date.now().toString(36)}`;
  await catB.getByRole('button', { name: 'Add a tag' }).click();
  await fillLabelAndSave(page, other);
  await expect(catB.getByTestId('tag-row')).toHaveCount(2);
  await catB.getByTestId('tag-row').nth(1).getByRole('button', { name: 'Move up' }).click();
  await expect(catB.getByTestId('tag-row').first()).toContainText(other);
  await page.reload();
  await expect(
    page.getByRole('region', { name: second }).getByTestId('tag-row').first(),
  ).toContainText(other);

  // A category with tags cannot be deleted.
  await catB.getByRole('button', { name: /Delete the category/ }).click();
  await expect(page.getByRole('alert')).toContainText('still has tags');

  // Delete the (unused) tags, then the categories.
  for (let i = 0; i < 2; i++) {
    await catB
      .getByTestId('tag-row')
      .first()
      .getByRole('button', { name: /Delete the tag/ })
      .click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('No recipe uses it');
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(catB.getByTestId('tag-row')).toHaveCount(0);
  await catB.getByRole('button', { name: /Delete the category/ }).click();
  await expect(page.getByRole('region', { name: second })).toHaveCount(0);
  await page
    .getByRole('region', { name: first })
    .getByRole('button', { name: /Delete the category/ })
    .click();
  await expect(page.getByRole('region', { name: first })).toHaveCount(0);
});

test('a unit is edited through the form and a duplicate alias is explained', async ({ page }) => {
  const alias = slugOf('zz').replace(/[-0-9]/g, '');
  const slug = slugOf('u');
  const created = await post(page.request, '/admin/units', {
    slug,
    rounding: 'decimal',
    labels: { en: `Unit ${slug}` },
    aliases: { en: [alias] },
  });
  expect(created.status()).toBe(201);

  await page.goto('/admin/units');
  const row = page.getByTestId('unit-row').filter({ hasText: slug });
  await row.getByRole('button', { name: `Edit the unit ${slug}` }).click();

  const form = page.getByRole('form', { name: 'Unit' });
  // "g" belongs to the gram: refused with the alias named.
  await form.getByLabel('Ways of writing it (English)').fill(`${alias}, g`);
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toContainText('already used by another unit');
  await expect(page.getByRole('alert')).toContainText('g');

  const extra = `${alias}x`;
  await form.getByLabel('Ways of writing it (English)').fill(`${alias}\n${extra}`);
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(form).toBeHidden();
  await expect(page.getByTestId('unit-row').filter({ hasText: slug })).toContainText(extra);

  const units = (await (await page.request.get('/api/v1/units')).json()) as {
    slug: string;
    aliases: { en?: string[] };
  }[];
  expect(units.find((u) => u.slug === slug)?.aliases.en).toEqual([alias, extra]);

  // Clean up our own unit only.
  await page
    .getByTestId('unit-row')
    .filter({ hasText: slug })
    .getByRole('button', { name: `Delete the unit ${slug}` })
    .click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByTestId('unit-row').filter({ hasText: slug })).toHaveCount(0);
});

test('the tag filter panel narrows the gallery; all selected tags are required', async ({
  browser,
  page: adminPage,
}) => {
  const cat = await apiCategory(adminPage.request, true);
  const a = await apiTag(adminPage.request, cat.id, `Aaa ${cat.slug}`);
  const b = await apiTag(adminPage.request, cat.id, `Bbb ${cat.slug}`);
  const { page } = await newMember(browser, adminPage, 'filterer');
  const onlyA = `Only A ${cat.slug}`;
  const both = `Both ${cat.slug}`;
  for (const [title, tagIds] of [
    [onlyA, [a.id]],
    [both, [a.id, b.id]],
  ] as const) {
    const id = await apiRecipe(page.request, title, [...tagIds]);
    await put(page.request, `/recipes/${id}/visibility`, { visibility: 'public' });
  }

  await page.goto('/gallery');
  await page.getByText('Filter by tags').click();
  const group = page.getByText(`Cat ${cat.slug}`).locator('..');
  await group.getByRole('button', { name: a.label }).click();
  await expect(page).toHaveURL(new RegExp(`tags=${a.slug}`));
  await expect(page.getByTestId('recipe-card')).toHaveCount(2);

  await group.getByRole('button', { name: b.label }).click();
  await expect(page.getByTestId('recipe-card')).toHaveCount(1);
  await expect(page.getByTestId('recipe-card')).toContainText(both);

  await page.getByRole('button', { name: 'Clear the filters' }).click();
  await expect(page).not.toHaveURL(/tags=/);
  await expect(page.getByRole('button', { name: 'Clear the filters' })).toHaveCount(0);
});

test.describe('single-choice conflicts refused by the admin API', () => {
  test('switching a category to single-choice while a recipe has two of its tags', async ({
    browser,
    page: adminPage,
  }) => {
    const admin = adminPage.request;
    const cat = await apiCategory(admin, true);
    const a = await apiTag(admin, cat.id, 'A');
    const b = await apiTag(admin, cat.id, 'B');
    const { page } = await newMember(browser, adminPage, 'conflict1');
    await apiRecipe(page.request, 'Deux tags', [a.id, b.id]);

    const res = await put(admin, `/admin/tag-categories/${cat.id}`, {
      slug: cat.slug,
      labels: { en: `Cat ${cat.slug}` },
      multiple: false,
    });
    expect(res.status()).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'single_choice_conflict' });
  });

  test('moving a tag into a single-choice category where a recipe already has another tag', async ({
    browser,
    page: adminPage,
  }) => {
    const admin = adminPage.request;
    const single = await apiCategory(admin, false);
    const multi = await apiCategory(admin, true);
    const inSingle = await apiTag(admin, single.id, 'In single');
    const moving = await apiTag(admin, multi.id, 'Moving');
    const { page } = await newMember(browser, adminPage, 'conflict2');
    await apiRecipe(page.request, 'Conflit de déplacement', [inSingle.id, moving.id]);

    const res = await put(admin, `/admin/tags/${moving.id}`, {
      slug: moving.slug,
      categoryId: single.id,
      labels: { en: 'Moving' },
    });
    expect(res.status()).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'single_choice_conflict' });
  });

  test('merging a tag into a single-choice category where a recipe already has another tag', async ({
    browser,
    page: adminPage,
  }) => {
    const admin = adminPage.request;
    const single = await apiCategory(admin, false);
    const multi = await apiCategory(admin, true);
    const target = await apiTag(admin, single.id, 'Target');
    const keep = await apiTag(admin, single.id, 'Keep');
    const merged = await apiTag(admin, multi.id, 'Merged');
    const { page } = await newMember(browser, adminPage, 'conflict3');
    const id = await apiRecipe(page.request, 'Conflit de fusion', [keep.id, merged.id]);

    const res = await post(admin, `/admin/tags/${merged.id}/delete`, { mergeInto: target.id });
    expect(res.status()).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'single_choice_conflict' });
    const detail = await (await page.request.get(`/api/v1/recipes/${id}`)).json();
    expect([...detail.tagIds].sort()).toEqual([keep.id, merged.id].sort());
  });

  test('a label with a line separator is refused', async ({ page }) => {
    const cat = await apiCategory(page.request, true);
    const res = await post(page.request, '/admin/tags', {
      slug: slugOf('t'),
      categoryId: cat.id,
      labels: { en: 'a b' },
    });
    expect(res.status()).toBe(400);
  });
});
