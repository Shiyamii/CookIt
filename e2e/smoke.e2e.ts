import { expect, test } from '@playwright/test';

test.describe('server', () => {
  test('healthz reports the database as reachable', async ({ request }) => {
    const res = await request.get('/healthz');
    expect(res.ok()).toBe(true);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  test('unknown API routes return a JSON 404, not the SPA', async ({ request }) => {
    const res = await request.get('/api/v1/does-not-exist');
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found' });
  });
});

test.describe('app shell', () => {
  test('home page loads and reaches the API', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to CookIt' })).toBeVisible();
    const status = page.getByTestId('api-status');
    await expect(status).toHaveAttribute('data-status', 'ok');
    await expect(status).toHaveText('Connected');
  });

  test('language can be switched and is remembered', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Language' }).click();
    await page.getByRole('menuitemradio', { name: 'Français' }).click();

    await expect(page.getByRole('heading', { name: 'Bienvenue sur CookIt' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Bienvenue sur CookIt' })).toBeVisible();
  });

  test('theme can be switched and is remembered', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await page.getByRole('button', { name: 'Theme' }).click();
    await page.getByRole('menuitemradio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('client-side routes are served by the SPA, unknown ones show a 404 page', async ({
    page,
  }) => {
    const res = await page.goto('/some/unknown/route');
    expect(res?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

    await page.getByRole('link', { name: 'Back to home' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Welcome to CookIt' })).toBeVisible();
  });
});

test('the about page: what CookIt is, its version, its code and its image', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'About CookIt' }).click();
  await expect(page).toHaveURL('/about');
  await expect(page.getByRole('heading', { name: 'CookIt', level: 1 })).toBeVisible();
  await expect(page.getByText('Your self-hosted recipe book')).toBeVisible();
  await expect(page.getByText(/^Version /)).toBeVisible();
  const github = page.getByRole('link', { name: /Source code/ });
  await expect(github).toHaveAttribute('href', 'https://github.com/Shiyamii/CookIt');
  await expect(github).toHaveAttribute('target', '_blank');
  await expect(github).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.getByRole('link', { name: /Docker image/ })).toHaveAttribute(
    'href',
    'https://hub.docker.com/r/shiyamii/cookit',
  );
});
