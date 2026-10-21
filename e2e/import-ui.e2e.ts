import { expect, test, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { ADMIN_STATE, newMember, uniqueName } from './support';

test.use({ storageState: ADMIN_STATE });

const recipe = (title: string, servings = 'portions: 4\n') =>
  `# ${title}\n\n${servings}\n---\n\n- 200 g de farine\n\n---\n\n1. Cuire [10 min](timer:10m).\n`;

const zip = (files: Record<string, string>) =>
  Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))));

async function openImportFile(page: Page) {
  await page.goto('/recipes/import');
  await expect(page.getByRole('heading', { name: 'Import recipes' })).toBeVisible();
  await page.getByRole('tab', { name: 'File' }).click();
  return page.getByLabel('A .md file, or a .zip of .md files');
}

test('a zip with several recipes: invalid ones are shown with errors and not saved', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'zipmany');
  const stamp = uniqueName('r');
  const input = await openImportFile(page);
  await input.setInputFiles({
    name: 'recipes.zip',
    mimeType: 'application/zip',
    buffer: zip({
      'a.md': recipe(`Alpha ${stamp}`),
      'b.md': recipe(`Broken ${stamp}`, ''),
      'c.md': recipe(`Charlie ${stamp}`),
      'ignored.pdf': 'not a recipe',
    }),
  });

  const items = page.getByTestId('import-item');
  await expect(items).toHaveCount(3);
  await expect(page.getByText('3 recipes found')).toBeVisible();
  await expect(items.filter({ hasText: 'Has errors' })).toHaveCount(1);
  // Only the readable recipes can be saved.
  await page.getByRole('button', { name: 'Save 2 recipes' }).click();
  // Several recipes saved: back to the list.
  await expect(page).toHaveURL(/\/recipes$/);

  const listed = JSON.stringify(await (await page.request.get('/api/v1/recipes')).json());
  expect(listed).toContain(`Alpha ${stamp}`);
  expect(listed).toContain(`Charlie ${stamp}`);
  expect(listed).not.toContain(`Broken ${stamp}`);
});

test.describe('file errors', () => {
  test('a file over the size limit is refused with a message', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'bigfile');
    const input = await openImportFile(page);
    await input.setInputFiles({
      name: 'huge.md',
      mimeType: 'text/markdown',
      buffer: Buffer.alloc(1024 * 1024 + 1, 'a'),
    });
    await expect(page.getByRole('alert')).toContainText('This file is too large.');
    await expect(page.getByTestId('import-item')).toHaveCount(0);
  });

  test('a file that is not markdown or a zip is refused', async ({ browser, page: adminPage }) => {
    const { page } = await newMember(browser, adminPage, 'badtype');
    const input = await openImportFile(page);
    await input.setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71]),
    });
    await expect(page.getByRole('alert')).toContainText('Choose a .md file or a zip of .md files.');
  });

  test('a corrupted zip and a zip without recipes are refused', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'badzip');
    const input = await openImportFile(page);
    await input.setInputFiles({
      name: 'broken.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from('this is not a zip file at all'),
    });
    await expect(page.getByRole('alert')).toContainText('This zip cannot be read.');
    await input.setInputFiles({
      name: 'empty.zip',
      mimeType: 'application/zip',
      buffer: zip({ 'readme.pdf': 'x' }),
    });
    await expect(page.getByRole('alert')).toContainText('Choose a .md file or a zip of .md files.');
  });

  test('a zip with too many recipes is refused', async ({ browser, page: adminPage }) => {
    const { page } = await newMember(browser, adminPage, 'manyzip');
    const input = await openImportFile(page);
    const files: Record<string, string> = {};
    for (let i = 0; i < 301; i++) files[`r${i}.md`] = 'x';
    await input.setInputFiles({
      name: 'many.zip',
      mimeType: 'application/zip',
      buffer: zip(files),
    });
    await expect(page.getByRole('alert')).toContainText('too large or contains too many recipes');
  });

  test('a pasted text without a recipe shows errors and cannot be saved', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'junk');
    await page.goto('/recipes/import');
    await page.getByLabel('Recipe in the CookIt markdown format').fill('just some words');
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('import-item')).toContainText('Has errors');
    await expect(page.getByRole('button', { name: 'Save 0 recipes' })).toBeDisabled();
  });
});

test.describe('wizard drafts and skipping', () => {
  test('the draft is restored after a reload (information, ingredients and screen)', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'draft');
    await page.goto('/recipes/new/wizard');
    await page.getByLabel('Title').fill('Brouillon de tarte');
    await page.getByLabel('Servings').fill('8');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByLabel('Paste the ingredients').fill('200 g de farine\n3 oeufs');
    await page.getByRole('button', { name: 'Split into lines' }).click();
    await expect(page.getByLabel('Ingredient', { exact: true })).toHaveCount(2);

    // The draft is saved after a short delay.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.values(localStorage).some(
            (v) => v.includes('Brouillon de tarte') && v.includes('3 oeufs'),
          ),
        ),
      )
      .toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'New recipe, step by step' })).toBeVisible();
    await expect(page.getByLabel('Ingredient', { exact: true })).toHaveCount(2);
    await expect(page.getByLabel('Ingredient', { exact: true }).first()).toHaveValue(
      '200 g de farine',
    );
    await page.getByRole('button', { name: '1. Information' }).click();
    await expect(page.getByLabel('Title')).toHaveValue('Brouillon de tarte');
    await expect(page.getByLabel('Servings')).toHaveValue('8');

    // "Start over" forgets the draft, also after a reload.
    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(page.getByLabel('Title')).toHaveValue('');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'New recipe, step by step' })).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveValue('');
  });

  test('screens can be skipped: title and servings are enough to save', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'skip');
    await page.goto('/recipes/new/wizard');
    await page.getByLabel('Title').fill('Seulement un titre');
    await page.getByRole('button', { name: '4. Preview' }).click();
    await expect(page.getByRole('heading', { name: 'Seulement un titre' })).toBeVisible();
    await page.getByRole('button', { name: 'Save the recipe' }).click();
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop() ?? '';
    expect(await (await page.request.get(`/api/v1/recipes/${id}`)).json()).toMatchObject({
      title: 'Seulement un titre',
      incomplete: true,
    });
  });

  test('saving without a title is refused with a message', async ({ browser, page: adminPage }) => {
    const { page } = await newMember(browser, adminPage, 'notitle');
    await page.goto('/recipes/new/wizard');
    await expect(page.getByRole('heading', { name: 'New recipe, step by step' })).toBeVisible();
    await page.getByRole('button', { name: 'Save the recipe' }).click();
    await expect(page).toHaveURL(/\/recipes\/new\/wizard$/);
    await expect(page.getByText('A title is required.')).toBeVisible();
  });

  test('a range duration can use its low value', async ({ browser, page: adminPage }) => {
    const { page } = await newMember(browser, adminPage, 'range');
    await page.goto('/recipes/new/wizard');
    await page.getByLabel('Title').fill('Plage');
    await page.getByRole('button', { name: '3. Steps' }).click();
    await page.getByLabel('Paste the steps').fill('Cuire 2 à 3 minutes.');
    await page.getByRole('button', { name: 'Split into lines' }).click();
    await page.getByRole('button', { name: '2 min', exact: true }).click();
    await page.getByRole('button', { name: 'Save the recipe' }).click();
    await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop() ?? '';
    const { body } = await (await page.request.get(`/api/v1/recipes/${id}`)).json();
    expect(body).toContain('[2 à 3 minutes](timer:2m)');
  });
});

test.describe('the creation pages do not scroll sideways', () => {
  async function overflowing(page: Page) {
    return page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      return [
        document.documentElement.scrollWidth > width + 1 ? 'document' : '',
        ...[...document.body.querySelectorAll('*')]
          .filter((el) => el.getBoundingClientRect().right > width + 1)
          .slice(0, 5)
          .map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`),
      ].filter(Boolean);
    });
  }
  const long = 'Supercalifragilisticexpialidocious'.repeat(4);

  test('add a recipe', async ({ browser, page: adminPage }) => {
    const { page } = await newMember(browser, adminPage, 'ovadd');
    await page.goto('/recipes/new');
    await expect(page.getByRole('heading', { name: 'Add a recipe' })).toBeVisible();
    await page.getByLabel('Title').fill(long);
    expect(await overflowing(page)).toEqual([]);
  });

  test('wizard, with long words in every screen', async ({ browser, page: adminPage }) => {
    const { page } = await newMember(browser, adminPage, 'ovwiz');
    await page.goto('/recipes/new/wizard');
    await expect(page.getByRole('heading', { name: 'New recipe, step by step' })).toBeVisible();
    await page.getByLabel('Title').fill(long);
    expect(await overflowing(page)).toEqual([]);
    await page.getByRole('button', { name: '2. Ingredients' }).click();
    await page.getByLabel('Paste the ingredients').fill(`${long}\n200 g ${long}`);
    await page.getByRole('button', { name: 'Split into lines' }).click();
    expect(await overflowing(page)).toEqual([]);
    await page.getByRole('button', { name: '3. Steps' }).click();
    await page.getByLabel('Paste the steps').fill(`1. Cuire 10 min ${long}\n2. ${long} 1h30`);
    await page.getByRole('button', { name: 'Split into lines' }).click();
    expect(await overflowing(page)).toEqual([]);
    await page.getByRole('button', { name: '4. Preview' }).click();
    await expect(page.getByRole('heading', { name: long })).toBeVisible();
    expect(await overflowing(page)).toEqual([]);
  });

  test('import: each tab and the preview', async ({ browser, page: adminPage }) => {
    const { page } = await newMember(browser, adminPage, 'ovimp');
    await page.goto('/recipes/import');
    await expect(page.getByRole('heading', { name: 'Import recipes' })).toBeVisible();
    for (const tab of ['Paste', 'File', 'Web page']) {
      await page.getByRole('tab', { name: tab }).click();
      expect(await overflowing(page), tab).toEqual([]);
    }
    await page.getByRole('tab', { name: 'Paste' }).click();
    await page
      .getByLabel('Recipe in the CookIt markdown format')
      .fill(
        `# ${long}\n\nportions: 2\ntags: ${long}, dessert\n\n---\n\n- ${long}\n\n---\n\n1. ${long}\n`,
      );
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.getByTestId('import-item')).toBeVisible();
    expect(await overflowing(page)).toEqual([]);
  });
});
