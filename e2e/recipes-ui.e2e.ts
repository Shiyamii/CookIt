import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import {
  ADMIN_STATE,
  createInvite,
  newMember,
  newVisitor,
  ORIGIN_HEADER,
  registerWithApi,
  uniqueName,
} from './support';

test.use({ storageState: ADMIN_STATE });

function markdown(title: string, opts: { ingredients?: string[]; steps?: string[] } = {}) {
  const ingredients = opts.ingredients ?? ['250 g de farine', '2 oeufs'];
  const steps = opts.steps ?? ['Melanger.', 'Cuire [10 min](timer:10m "Cuisson").'];
  return [
    `# ${title}`,
    '',
    'portions: 4',
    '',
    '---',
    '',
    ...ingredients.map((line) => `- ${line}`),
    '',
    '---',
    '',
    ...steps.map((line, i) => `${i + 1}. ${line}`),
    '',
  ].join('\n');
}

async function create(request: APIRequestContext, md: string): Promise<string> {
  const res = await request.post('/api/v1/recipes/markdown', {
    data: { markdown: md, lang: 'fr' },
    headers: ORIGIN_HEADER,
  });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test.describe('editor interactions', () => {
  test('the row menu moves an ingredient down, and the order is saved', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'mover');
    const id = await create(page.request, markdown('Ordre'));
    await page.goto(`/recipes/${id}/edit`);

    const rows = page.getByTestId('ingredient-row');
    await expect(rows.first().getByLabel('Ingredient', { exact: true })).toHaveValue('de farine');
    await rows.first().getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: 'Move down' }).click();
    await expect(rows.first().getByLabel('Ingredient', { exact: true })).toHaveValue('oeufs');

    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Ordre' })).toBeVisible();
    const farine = page.getByText('250 g de farine');
    const oeufs = page.getByText('2 oeufs');
    const [farineBox, oeufsBox] = [await farine.boundingBox(), await oeufs.boundingBox()];
    expect(oeufsBox!.y).toBeLessThan(farineBox!.y);
  });

  test('the first row cannot move up, the last one cannot move down', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'mover');
    const id = await create(page.request, markdown('Premier'));
    await page.goto(`/recipes/${id}/edit`);
    const rows = page.getByTestId('ingredient-row');
    await rows.first().getByRole('button', { name: 'Actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Move up' })).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: 'Move down' })).toBeEnabled();
    await page.keyboard.press('Escape');
    await rows.last().getByRole('button', { name: 'Actions' }).click();
    await expect(page.getByRole('menuitem', { name: 'Move down' })).toBeDisabled();
    await expect(rows.first().getByLabel('Ingredient', { exact: true })).toHaveValue('de farine');
  });

  test('a timer chip can be changed, and the new duration is saved', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'timer');
    const id = await create(page.request, markdown('Minuteur'));
    await page.goto(`/recipes/${id}/edit`);
    await page.getByRole('button', { name: 'Change the timer Cuisson' }).click();
    await page.getByLabel('Minutes').fill('25');
    await page.getByRole('button', { name: 'Save the timer' }).click();
    await expect(page.getByRole('button', { name: 'Change the timer Cuisson' })).toContainText(
      '25 min',
    );
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Minuteur' })).toBeVisible();
    await expect(page.getByText('25 min')).toBeVisible();
    await expect(page.getByText('10 min')).toHaveCount(0);
  });

  test('a save after another one shows the conflict and loads the latest version', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'conflict');
    const id = await create(page.request, markdown('Version un'));
    await page.goto(`/recipes/${id}/edit`);
    await expect(page.getByLabel('Title')).toHaveValue('Version un');

    // Another tab saves in the meantime.
    const other = await page.request.put(`/api/v1/recipes/${id}/markdown`, {
      data: { markdown: markdown('Version deux') },
      headers: ORIGIN_HEADER,
    });
    expect(other.status()).toBe(200);

    await page.getByLabel('Title').fill('Version locale');
    await page.getByRole('button', { name: 'Save' }).click();
    const reload = page.getByRole('button', { name: /Load the latest version/ });
    await expect(reload).toBeVisible();
    await reload.click();
    await expect(page.getByLabel('Title')).toHaveValue('Version deux');
    await expect(reload).toHaveCount(0);
  });
});

test.describe('gallery pagination', () => {
  test('"Show more" loads the next page', async ({ browser, page: adminPage }) => {
    const { page } = await newMember(browser, adminPage, 'pager');
    const word = `pagine${Date.now().toString(36)}`;
    for (let i = 0; i < 25; i++) {
      const id = await create(page.request, markdown(`Recette ${word} ${i}`));
      const res = await page.request.put(`/api/v1/recipes/${id}/visibility`, {
        data: { visibility: 'public' },
        headers: ORIGIN_HEADER,
      });
      expect(res.ok()).toBe(true);
    }
    await page.goto('/gallery');
    await page.getByRole('searchbox', { name: 'Search recipes' }).fill(word);
    // The search runs after a short pause; wait for it (it is kept in the URL).
    await page.waitForURL(/q=pagine/);
    await expect(page.getByTestId('recipe-card')).toHaveCount(24);
    await page.getByRole('button', { name: 'Show more' }).click();
    await expect(page.getByTestId('recipe-card')).toHaveCount(25);
    await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0);
  });
});

test.describe('French UI', () => {
  test('the recipe page is translated, with scaled quantities', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'fr');
    const id = await create(page.request, markdown('Gâteau'));
    await page.goto(`/recipes/${id}`);
    await page.getByRole('button', { name: 'Language' }).click();
    await page.getByRole('menuitemradio', { name: 'Français' }).click();

    await expect(page.getByRole('heading', { name: 'Ingrédients' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Étapes' })).toBeVisible();
    await expect(page.getByRole('status')).toHaveText('4');
    await page.getByRole('button', { name: 'Plus de portions' }).click();
    await expect(page.getByRole('status')).toHaveText('5');
    await expect(page.getByText('10 min')).toBeVisible();
  });
});

test.describe('layout', () => {
  async function setup(browser: Browser, adminPage: Page) {
    const { page } = await newMember(browser, adminPage, 'wide');
    const long = 'Supercalifragilisticexpialidocious'.repeat(3);
    const id = await create(
      page.request,
      markdown(long, {
        ingredients: [`250 g de ${long}`, `2 ${'mot '.repeat(60)}`],
        steps: [`${long} ${'étape '.repeat(80)}`],
      }),
    );
    return { page, long, id };
  }

  /** Elements sticking out of the viewport (the page would scroll sideways). */
  async function overflowing(page: Page) {
    return page.evaluate(() => {
      const width = document.documentElement.clientWidth;
      return [...document.body.querySelectorAll('*')]
        .filter((el) => el.getBoundingClientRect().right > width + 1)
        .slice(0, 5)
        .map((el) => `${el.tagName}.${String(el.className).slice(0, 60)}`);
    });
  }

  test('the recipe page does not scroll sideways with long words', async ({
    browser,
    page: adminPage,
  }) => {
    const { page, id } = await setup(browser, adminPage);
    await page.goto(`/recipes/${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await overflowing(page)).toEqual([]);
  });

  test('the editor does not scroll sideways with long words', async ({
    browser,
    page: adminPage,
  }) => {
    const { page, id, long } = await setup(browser, adminPage);
    await page.goto(`/recipes/${id}/edit`);
    await expect(page.getByLabel('Title')).toHaveValue(long);
    expect(await overflowing(page)).toEqual([]);
  });

  test('the list does not scroll sideways with a long title', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await setup(browser, adminPage);
    await page.goto('/recipes');
    await expect(page.getByTestId('recipe-card')).toHaveCount(1);
    expect(await overflowing(page)).toEqual([]);
  });
});

test.describe('hostile content', () => {
  test('a public step full of emphasis markers renders quickly', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'hostile');
    const id = await create(
      page.request,
      markdown('Emphases', { steps: [`${'*a_'.repeat(1500)} fin`] }),
    );
    await page.request.put(`/api/v1/recipes/${id}/visibility`, {
      data: { visibility: 'public' },
      headers: ORIGIN_HEADER,
    });
    const visitor = await newVisitor(browser);
    const started = Date.now();
    await visitor.goto(`/recipes/${id}`);
    await expect(visitor.getByRole('heading', { name: 'Emphases' })).toBeVisible();
    await expect(visitor.getByText('fin', { exact: false }).first()).toBeVisible();
    expect(Date.now() - started).toBeLessThan(2500);
  });
});

test.describe('drafts', () => {
  test('another account on the same browser is not offered the previous new-recipe draft', async ({
    browser,
    page: adminPage,
  }) => {
    const { page } = await newMember(browser, adminPage, 'draftA');
    await page.goto('/recipes/new');
    await page.getByLabel('Title').fill('Secret de A');
    await page.waitForTimeout(1200);
    const stored = await page.evaluate(() => Object.keys(localStorage));
    expect(stored.some((key) => key.startsWith('cookit:draft:'))).toBe(true);

    // Another account takes over the same browser storage (no sign-out in between).
    const invite = await createInvite(adminPage);
    await page.context().clearCookies();
    await registerWithApi(page.request, invite, uniqueName('draftB'));
    await page.goto('/recipes/new');
    await expect(page.getByLabel('Title')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restore them' })).toHaveCount(0);
    const left = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
    expect(left).not.toContain('Secret de A');
  });
});
