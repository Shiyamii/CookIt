import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';

// What needs a real server says so before the visitor tries; the zip export works in the page.

const NOTE = 'Not in the demo: this needs a real CookIt server.';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test('security, pictures, URL import and notifications show a note instead', async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto('account/security');
  await expect(page.getByRole('heading', { name: 'Security', level: 1 })).toBeVisible();
  await expect(page.getByRole('note')).toHaveText(NOTE);
  await expect(page.getByRole('button', { name: /password/i })).toHaveCount(0);

  await page.goto('account/profile');
  await expect(page.getByRole('note')).toHaveText(NOTE);
  await expect(page.getByText('Add a picture')).toHaveCount(0);

  await page.goto('recipes');
  await page.getByTestId('recipe-card').filter({ hasText: 'Bœuf bourguignon' }).click();
  await expect(page.getByRole('note')).toHaveText(NOTE);
  await expect(page.getByText('Add photos')).toHaveCount(0);

  await page.goto('recipes/import');
  await expect(page.getByRole('note')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Web page' }).click();
  await expect(page.getByRole('note')).toHaveText(NOTE);

  await page.goto('account/notifications');
  await expect(page.getByRole('note')).toHaveText(NOTE);
  await expect(page.getByTestId('push-status')).toHaveCount(0);
  // The help for each system stays.
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('the sign-up page of an invitation says accounts need a real server', async ({ page }) => {
  await page.goto('');
  await page.getByRole('combobox', { name: 'Signed in as' }).click();
  await page.getByRole('option', { name: 'Admin · Camille' }).click();
  await page.goto('admin/invites');
  await page.getByRole('button', { name: 'Create an invitation' }).click();
  const link = await page.getByRole('textbox', { name: 'Invitation link' }).inputValue();
  await page.goto(link);
  await expect(page.getByRole('note')).toHaveText(NOTE);
});

test('"Export all my recipes" downloads the zip made in the page', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('recipes?scope=mine');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export all my recipes (.zip)' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('cookit-recipes.zip');
  const names = Object.keys(unzipSync(await readFile(await file.path())));
  expect(names.length).toBeGreaterThan(0);
  expect(names.every((name) => name.endsWith('.md'))).toBe(true);
  expect(errors).toEqual([]);
});

test('the about page of the demo does not link to the demo', async ({ page }) => {
  await page.goto('about');
  await expect(page.getByRole('link', { name: /Source code/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Online demo/ })).toHaveCount(0);
});
