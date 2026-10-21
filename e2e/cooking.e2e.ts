import { EXAMPLE_RECIPES } from '@cookit/shared';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_STATE, newMember, ORIGIN_HEADER } from './support';

test.use({ storageState: ADMIN_STATE });

async function createRecipe(page: Page, markdown = EXAMPLE_RECIPES.fr): Promise<string> {
  const response = await page.request.post('/api/v1/recipes/markdown', {
    headers: ORIGIN_HEADER,
    data: { markdown, lang: 'fr' },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

type Session = {
  session: {
    version: number;
    state: {
      items: {
        recipeId: string;
        currentStep: number;
        checkedIngredients: number[];
        color: string;
      }[];
      timers: { id: string; endsAt: string; label: string }[];
    };
  } | null;
  serverNow: string;
};

async function session(page: Page): Promise<Session> {
  return (await (await page.request.get('/api/v1/cook/session')).json()) as Session;
}

test('reloading or changing device finds the same step, ingredients and timers', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'cook');
  const id = await createRecipe(page);
  await page.goto(`/recipes/${id}`);
  await page.getByRole('button', { name: 'More servings' }).click();
  await page.getByRole('link', { name: 'Cook', exact: true }).click();
  await expect(page).toHaveURL(/\/cook$/);
  await expect(page.getByRole('heading', { name: 'Step 1 of 5' })).toBeVisible();
  await expect(page.getByText('Pâte', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Step 2 of 5' })).toBeVisible();
  await page.getByRole('button', { name: /Start the timer 1 h/ }).click();
  const timers = page.getByTestId('cook-timer');
  await expect(timers).toHaveCount(1);
  await expect(timers.first()).toContainText('repos de la pâte');
  await expect(timers.first().getByRole('timer')).toHaveText(/^(1:00:00|59:\d\d)$/);

  // Ingredients: scaled to 5 servings, checked in the drawer.
  await page.getByRole('button', { name: 'Ingredients' }).click();
  const drawer = page.getByRole('dialog', { name: 'Ingredients' });
  await expect(drawer).toContainText('315 g de farine');
  await drawer.getByRole('checkbox').first().click();
  await expect(drawer.getByRole('checkbox').first()).toBeChecked();
  await page.keyboard.press('Escape');

  // Saved on the server at each event.
  await expect
    .poll(async () => (await session(page)).session?.state.items[0]?.checkedIngredients)
    .toEqual([0]);
  const saved = await session(page);
  expect(saved.session?.state.items[0]).toMatchObject({ recipeId: id, currentStep: 1 });
  const endsAt = Date.parse(saved.session?.state.timers[0]?.endsAt ?? '');
  expect(Math.abs(endsAt - (Date.parse(saved.serverNow) + 3600_000))).toBeLessThan(10_000);

  // Reload: same step, same timer (counting from its end time), same ingredients.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Step 2 of 5' })).toBeVisible();
  await expect(page.getByTestId('cook-timer').getByRole('timer')).toHaveText(/^59:\d\d$/);
  await expect(page.getByRole('button', { name: /Timer 1 h: 59:\d\d left/ })).toBeVisible();
  await page.getByRole('button', { name: 'Ingredients' }).click();
  await expect(page.getByRole('dialog').getByRole('checkbox').first()).toBeChecked();
  await page.keyboard.press('Escape');

  // Another device of the same user.
  const other = await browser.newContext({ storageState: await page.context().storageState() });
  const device = await other.newPage();
  await device.goto('/cook');
  await expect(device.getByRole('heading', { name: 'Step 2 of 5' })).toBeVisible();
  await expect(device.getByTestId('cook-timer')).toHaveCount(1);
  await device.getByRole('button', { name: 'Next' }).click();
  await expect(device.getByRole('heading', { name: 'Step 3 of 5' })).toBeVisible();
  await expect.poll(async () => (await session(page)).session?.state.items[0]?.currentStep).toBe(2);

  // The first device catches up when it reloads the session.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Step 3 of 5' })).toBeVisible();
  await other.close();
});

test('timers: +1 min, cancel, and a finished timer rings until dismissed', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'timers');
  const id = await createRecipe(page);
  await page.goto(`/recipes/${id}`);
  await page.getByRole('link', { name: 'Cook', exact: true }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /Start the timer 1 h/ }).click();
  const timer = page.getByTestId('cook-timer');
  await expect(timer).toHaveCount(1);
  // The same step timer is not started twice.
  await page.getByRole('button', { name: /Timer 1 h:/ }).click();
  await expect(timer).toHaveCount(1);

  const before = Date.parse((await session(page)).session?.state.timers[0]?.endsAt ?? '');
  await timer.getByRole('button', { name: '1 min' }).click();
  await expect
    .poll(async () => Date.parse((await session(page)).session?.state.timers[0]?.endsAt ?? ''))
    .toBe(before + 60_000);
  await expect(timer.getByRole('timer')).toHaveText(/^1:00:\d\d$/);

  await timer.getByRole('button', { name: 'Cancel the timer' }).click();
  await expect(timer).toHaveCount(0);
  await expect.poll(async () => (await session(page)).session?.state.timers.length).toBe(0);

  // A timer that has ended (set through the API): "Done!" until dismissed.
  const current = await session(page);
  const state = current.session?.state;
  const ended = await page.request.put('/api/v1/cook/session', {
    headers: ORIGIN_HEADER,
    data: {
      state: {
        ...state,
        timers: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            recipeId: id,
            recipeTitle: 'Crêpes au beurre salé',
            label: 'four',
            durationSeconds: 60,
            endsAt: new Date(Date.parse(current.serverNow) - 5000).toISOString(),
            step: null,
            slot: null,
          },
        ],
      },
    },
  });
  expect(ended.status()).toBe(200);
  await page.reload();
  await expect(timer).toContainText('Done!');
  await timer.getByRole('button', { name: 'OK' }).click();
  await expect(timer).toHaveCount(0);
});

test('two recipes with two timers each stay readable and correct after reload', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'multi');
  const crepes = await createRecipe(page);
  const english = await createRecipe(page, EXAMPLE_RECIPES.en);
  const timers = page.getByTestId('cook-timer');
  const cards = page.getByTestId('cook-card');

  // First recipe: two timers of step 4.
  await page.goto(`/recipes/${crepes}`);
  await page.getByRole('link', { name: 'Cook', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Step 4 of 5' })).toBeVisible();
  await page.getByRole('button', { name: /^Start the timer 1 min \(/ }).click();
  await page.getByRole('button', { name: /^Start the timer 1 min 30/ }).click();
  await expect(timers).toHaveCount(2);

  // Second recipe: added to the session, shown, the first one keeps its progress.
  await page.goto(`/recipes/${english}`);
  await page.getByRole('link', { name: 'Cook', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Salted butter crêpes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Step 1 of 5' })).toBeVisible();
  await expect(cards).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Crêpes au beurre salé: step 4 of 5' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /^Start the timer 1 h/ }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /^Start the timer 1 min 30/ }).click();
  await expect(timers).toHaveCount(4);

  const check = async () => {
    // One bar for all, in the order they end, each naming its dish.
    await expect(timers.nth(0)).toContainText('Crêpes au beurre salé');
    await expect(timers.nth(0).getByRole('timer')).toHaveText(/^(1:00|0:\d\d)$/);
    await expect(timers.nth(1)).toContainText('Crêpes au beurre salé');
    await expect(timers.nth(1)).toContainText('première face');
    await expect(timers.nth(2)).toContainText('Salted butter crêpes');
    await expect(timers.nth(2)).toContainText('first side');
    await expect(timers.nth(3)).toContainText('Salted butter crêpes');
    await expect(timers.nth(3)).toContainText('batter rest');
    await expect(timers.nth(3).getByRole('timer')).toHaveText(/^59:\d\d$/);
  };
  await check();
  await expect.poll(async () => (await session(page)).session?.state.timers.length).toBe(4);
  const saved = await session(page);
  expect(
    saved.session?.state.items.map((item) => [item.recipeId, item.currentStep, item.color]),
  ).toEqual([
    [crepes, 3, 'chart-1'],
    [english, 3, 'chart-2'],
  ]);

  // Reload: the same recipe shown, the same cards and timers.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Salted butter crêpes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Step 4 of 5' })).toBeVisible();
  await expect(cards).toHaveCount(2);
  await check();

  // Switching recipe keeps each one's state.
  await page.getByRole('button', { name: 'Crêpes au beurre salé: step 4 of 5' }).click();
  await expect(page.getByRole('heading', { name: 'Crêpes au beurre salé' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Timer 1 min 30: .* left$/ })).toBeVisible();
  // A timer's name shows its recipe.
  await timers
    .nth(3)
    .getByRole('button', { name: /Salted butter crêpes/ })
    .click();
  await expect(page.getByRole('heading', { name: 'Salted butter crêpes' })).toBeVisible();

  // Removing a recipe takes its timers; the other goes on.
  await page.getByRole('button', { name: 'Remove from cooking' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Remove from cooking' }).click();
  await expect(cards).toHaveCount(1);
  await expect(timers).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Crêpes au beurre salé' })).toBeVisible();
  await expect.poll(async () => (await session(page)).session?.state.items.length).toBe(1);

  // Finishing the last recipe ends the session.
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Finish' }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${crepes}$`));
  await expect.poll(async () => (await session(page)).session).toBeNull();
  await page.goto('/cook');
  await expect(page.getByText('Nothing is cooking.')).toBeVisible();
});

test('a full session refuses another recipe; stopping ends everything', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'full');
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) ids.push(await createRecipe(page));
  const items = ids.slice(0, 5).map((recipeId, i) => ({
    recipeId,
    lang: 'fr',
    servings: 4,
    currentStep: 0,
    checkedIngredients: [],
    color: `chart-${i + 1}`,
  }));
  const put = await page.request.put('/api/v1/cook/session', {
    headers: ORIGIN_HEADER,
    data: { state: { items, timers: [] } },
  });
  expect(put.status()).toBe(200);

  await page.goto(`/recipes/${ids[5]}`);
  await page.getByRole('link', { name: 'Cook', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Up to 5 recipes');
  await expect(page.getByTestId('cook-card')).toHaveCount(5);
  await expect(page.getByRole('link', { name: 'Add a recipe' })).toHaveCount(0);
  await page.getByRole('alert').getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await session(page)).session?.state.items).toHaveLength(5);

  await page.getByRole('button', { name: 'Stop cooking' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Stop cooking' }).click();
  await expect.poll(async () => (await session(page)).session).toBeNull();
});

test('a recipe without steps cannot be cooked', async ({ browser, page: adminPage }) => {
  const { page } = await newMember(browser, adminPage, 'nosteps');
  const id = await createRecipe(page, '# Idée\n\nportions: 2\n\n---\n\n- 1 oeuf\n\n---\n');
  await page.goto(`/recipes/${id}`);
  await expect(page.getByRole('button', { name: 'Cook', exact: true })).toBeDisabled();
  await expect(page.getByText('This recipe has no steps yet')).toBeVisible();
});

test('cooking API: own session only, input checked', async ({ browser, page: adminPage }) => {
  const { page } = await newMember(browser, adminPage, 'cookapi');
  const { page: other } = await newMember(browser, adminPage, 'cookother');
  const id = await createRecipe(page);
  const item = {
    recipeId: id,
    lang: 'fr',
    servings: 4,
    currentStep: 1,
    checkedIngredients: [],
    color: 'chart-1',
  };
  const put = (p: Page, state: unknown) =>
    p.request.put('/api/v1/cook/session', { headers: ORIGIN_HEADER, data: { state } });

  expect((await put(page, { items: [item], timers: [] })).status()).toBe(200);
  expect((await session(other)).session).toBeNull();

  const old = {
    id: '44444444-4444-4444-8444-444444444444',
    recipeId: id,
    recipeTitle: 'x',
    label: '',
    durationSeconds: 60,
    endsAt: new Date(Date.now() - 3 * 24 * 3600_000).toISOString(),
    step: null,
    slot: null,
  };
  const refused = await put(page, { items: [item], timers: [old] });
  expect(refused.status()).toBe(400);
  expect(await refused.json()).toEqual({ error: 'invalid_timer' });
  expect((await put(page, { items: [item, item], timers: [] })).status()).toBe(400);
  expect((await put(page, { items: [{ ...item, extra: 1 }], timers: [] })).status()).toBe(400);
  expect((await session(page)).session?.state.items).toEqual([item]);

  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  expect((await visitor.request.get('/api/v1/cook/session')).status()).toBe(401);
  await visitor.close();
});

test('offline: steps are kept locally and sent when the network is back', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'cookoff');
  const context = page.context();
  const id = await createRecipe(page);
  await page.goto(`/recipes/${id}`);
  await page.getByRole('link', { name: 'Cook', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Step 1 of 5' })).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Step 3 of 5' })).toBeVisible();
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await expect.poll(async () => (await session(page)).session?.state.items[0]?.currentStep).toBe(2);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Step 3 of 5' })).toBeVisible();
});
