import { expect, test, type Page } from '@playwright/test';

// The demo build, switched to the demo admin (Camille) from the demo banner.

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    // A refused action of the demo (501) is reported by the page, not an error of the app.
    if (message.type() === 'error' && !message.text().includes('501')) {
      errors.push(message.text());
    }
  });
  return errors;
}

async function asAdmin(page: Page) {
  await page.goto('');
  await page.getByRole('combobox', { name: 'Signed in as' }).click();
  await page.getByRole('option', { name: 'Admin · Camille' }).click();
  await expect(page.getByRole('combobox', { name: 'Signed in as' })).toHaveText('Admin · Camille');
}

test('the admin manages the members: list, disable, and no password link in the demo', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await asAdmin(page);
  await page.goto('admin/users');
  const sam = page.getByTestId('user-row').filter({ hasText: '@Sam' });
  await expect(page.getByTestId('user-row')).toHaveCount(4);

  await sam.getByRole('button', { name: 'Put in the members list' }).click();
  await expect(sam.getByText('In the members list')).toBeVisible();
  await sam.getByRole('button', { name: 'Disable' }).click();
  await expect(sam.getByText('Disabled')).toBeVisible();
  await page.reload();
  await expect(sam.getByText('Disabled')).toBeVisible();

  // Disabled: in no list.
  await page.goto('members');
  await expect(page.getByTestId('member-card').filter({ hasText: 'Sam' })).toHaveCount(0);

  // A password reset link needs the real server.
  await page.goto('admin/users');
  await sam.getByRole('button', { name: 'Password reset link' }).click();
  await expect(
    page.getByText('Not available in the demo: it needs a real CookIt server.'),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('the admin creates and revokes an invitation', async ({ page }) => {
  const errors = watchErrors(page);
  await asAdmin(page);
  await page.goto('admin/invites');
  await page.getByLabel('Note').fill('Pour Dominique');
  await page.getByRole('button', { name: 'Create an invitation' }).click();
  const link = await page.getByRole('textbox', { name: 'Invitation link' }).inputValue();
  expect(link).toMatch(/\/CookIt\/invite#token=[A-Za-z0-9_-]{43}$/);
  const row = page.getByTestId('invite-row').filter({ hasText: 'Pour Dominique' });
  await expect(row).toContainText('Pending');
  await row.getByRole('button', { name: 'Revoke' }).click();
  await expect(row).toContainText('Revoked');
  expect(errors).toEqual([]);
});

test('the admin changes the tags, the units and the site settings', async ({ page }) => {
  const errors = watchErrors(page);
  await asAdmin(page);
  await page.goto('admin/tags');
  await page.getByRole('button', { name: 'Add a category' }).click();
  const form = page.getByRole('form');
  await form.getByLabel('Name (English)').fill('Season');
  await form.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('region', { name: 'Season' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Season' })).toBeVisible();

  await page.goto('admin/units');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  await page.goto('admin/settings');
  const choice = page.getByRole('checkbox', {
    name: 'Visitors without an account can see the gallery',
  });
  await expect(choice).toBeChecked();
  await choice.uncheck();
  await expect(page.getByText('Public recipes are for members only.')).toBeVisible();
  expect(errors).toEqual([]);
});
