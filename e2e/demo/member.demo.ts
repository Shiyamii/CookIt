import { expect, test, type Page } from '@playwright/test';

// The demo build (GitHub Pages): the API runs in the page, the data stays in the browser. Each
// test has its own browser context, so its own demo data.

/** Fails the test on any error of the page (the demo API throws in the page, not on a server). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('the member finds the demo recipes, edits one, and the change stays after a reload', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.goto('recipes');
  await expect(page.getByText('Demo: your changes stay in this browser.')).toBeVisible();
  const cards = page.getByTestId('recipe-card');
  await expect(cards).toHaveCount(6);
  // Added by link (a bookmark), copied; every recipe is shown in the interface language.
  await expect(
    cards.filter({ hasText: 'Goulash soup' }).getByLabel('Added to my recipes'),
  ).toBeVisible();
  await expect(cards.filter({ hasText: 'Yogurt cake' })).toBeVisible();
  await cards.filter({ hasText: 'Salted butter crêpes' }).click();
  await expect(page.getByRole('heading', { name: 'Salted butter crêpes', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Français' }).click();
  await expect(
    page.getByRole('heading', { name: 'Crêpes au beurre salé', level: 1 }),
  ).toBeVisible();

  // The editor works on the base language (French): edited, saved, still there after a reload.
  await page.goto('recipes');
  await cards.filter({ hasText: 'Beef bourguignon' }).click();
  await page.getByRole('link', { name: 'Edit the original (Français)' }).click();
  await expect(page.getByLabel('Title')).toHaveValue('Bœuf bourguignon');
  await page.getByLabel('Title').fill('Bourguignon de la démo');
  await page.getByRole('button', { name: 'Save' }).click();
  // Shown in English (its translation), the French version has the new title.
  await expect(page.getByRole('heading', { name: 'Beef bourguignon', level: 1 })).toBeVisible();
  const edited = page.getByRole('heading', { name: 'Bourguignon de la démo', level: 1 });
  await page.getByRole('button', { name: 'Français' }).click();
  await expect(edited).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Français' }).click();
  await expect(edited).toBeVisible();

  // A search runs in the page too.
  await page.goto('recipes');
  const search = page.getByRole('searchbox', { name: 'Search recipes' });
  await search.fill('quinoa');
  await expect(cards).toHaveCount(0);
  // Every word as a prefix, accents ignored, ingredients included.
  await search.fill('lentil echalote');
  await expect(cards).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('cooking with a timer, then the shopping list', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('recipes');
  await page.getByTestId('recipe-card').filter({ hasText: 'Salted butter crêpes' }).click();
  await page.getByRole('link', { name: 'Cook', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Step 1 of 5' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /Start the timer 1 h/ }).click();
  await expect(page.getByTestId('cook-timer').getByRole('timer')).toHaveText(/^(1:00:00|59:\d\d)$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Step 2 of 5' })).toBeVisible();

  await page.goto('recipes');
  await page.getByTestId('recipe-card').filter({ hasText: 'Beef bourguignon' }).click();
  await page.getByRole('button', { name: 'Add to the shopping list' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Add \d+ ingredients$/ })
    .click();
  await page.getByRole('link', { name: 'See the list' }).click();
  await expect(page.getByRole('heading', { name: 'Shopping list', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'To buy' }).getByRole('listitem').first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('the alarm, the members and the profile choice', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('account/alarm');
  await expect(page.getByRole('heading', { name: 'Alarm', level: 1 })).toBeVisible();

  await page.goto('members');
  const members = page.getByTestId('member-card');
  // Sam chose not to appear.
  await expect(members).toHaveCount(3);
  await members.filter({ hasText: 'Zsófia' }).click();
  await expect(page.getByRole('heading', { name: 'Zsófia', level: 1 })).toBeVisible();
  await expect(page.getByTestId('recipe-card')).toHaveCount(1);

  await page.goto('account/profile');
  const choice = page.getByRole('checkbox', { name: 'Appear in the members list' });
  await expect(choice).toBeChecked();
  await choice.uncheck();
  await page.goto('members');
  await expect(members).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('switching to the admin, then starting the demo again', async ({ page }) => {
  await page.goto('recipes');
  await page.getByRole('combobox', { name: 'Signed in as' }).click();
  await page.getByRole('option', { name: 'Admin · Camille' }).click();
  await expect(page.getByRole('combobox', { name: 'Signed in as' })).toHaveText('Admin · Camille');
  await expect(page.getByTestId('recipe-card')).toHaveCount(1);

  await page.getByRole('button', { name: 'Start again' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Start again' }).click();
  await expect(page.getByRole('combobox', { name: 'Signed in as' })).toHaveText('Member · Alex');
  await expect(page.getByTestId('recipe-card')).toHaveCount(6);
});

test('every page of the member opens without an error', async ({ page }) => {
  const errors = watchErrors(page);
  for (const path of [
    '',
    'gallery',
    'recipes/new',
    'recipes/new/editor',
    'recipes/new/wizard',
    'recipes/import',
    'recipes/import/ai',
    'cook',
    'shopping',
    'members',
    'account/profile',
    'account/notifications',
    'account/alarm',
    'about',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});
