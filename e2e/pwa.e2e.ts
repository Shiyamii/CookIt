import { EXAMPLE_RECIPES } from '@cookit/shared';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_STATE, newMember, ORIGIN_HEADER } from './support';

test.use({ storageState: ADMIN_STATE });

/** Waits until the service worker controls the page (its fetches go through it). */
async function controlled(page: Page) {
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 15_000,
    })
    .toBe(true);
}

test('installable: manifest, icons and caching headers', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.headers()['content-type']).toContain('application/manifest+json');
  const data = (await manifest.json()) as {
    name: string;
    display: string;
    start_url: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(data).toMatchObject({ name: 'CookIt', display: 'standalone', start_url: '/' });
  expect(data.icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512', '512x512']);
  expect(data.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  for (const path of [
    ...data.icons.map((icon) => icon.src),
    '/apple-touch-icon-180x180.png',
    '/badge-96x96.png',
  ]) {
    const icon = await request.get(path);
    expect(icon.status(), path).toBe(200);
    expect(icon.headers()['content-type']).toBe('image/png');
  }

  // A new version is picked up at once; built files (hashed names) are kept.
  expect((await request.get('/sw.js')).headers()['cache-control']).toBe('no-cache');
  expect((await request.get('/')).headers()['cache-control']).toBe('no-cache');
  const script = await page.locator('script[type="module"]').first().getAttribute('src');
  expect((await request.get(script ?? '')).headers()['cache-control']).toBe(
    'public, max-age=31536000, immutable',
  );
  expect((await request.get('/api/v1/units')).headers()['cache-control']).toBe('no-store');
});

test('the cooking mode works offline on a recipe already opened, reload included', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'offline');
  const created = await page.request.post('/api/v1/recipes/markdown', {
    headers: ORIGIN_HEADER,
    data: { markdown: EXAMPLE_RECIPES.fr, lang: 'fr' },
  });
  const id = ((await created.json()) as { id: string }).id;
  await page.goto(`/recipes/${id}`);
  await page.getByRole('link', { name: 'Cook', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Step 1 of 5' })).toBeVisible();
  await controlled(page);
  // Opened once with the service worker in control: the app and the recipe are kept.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Step 1 of 5' })).toBeVisible();
  await page.goto(`/recipes/${id}`);
  await expect(page.getByRole('heading', { name: 'Crêpes au beurre salé' })).toBeVisible();
  await page.goto('/cook');

  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByText('Offline: recipes already opened')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Crêpes au beurre salé' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Step 1 of 5' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: /^Start the timer 1 h/ }).click();
  await expect(page.getByTestId('cook-timer')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ingredients' }).click();
  await expect(page.getByRole('dialog')).toContainText('250 g de farine');
  await page.keyboard.press('Escape');
  // The recipe page itself, already visited, opens too.
  await page.goto(`/recipes/${id}`);
  await expect(page.getByRole('heading', { name: 'Crêpes au beurre salé' })).toBeVisible();

  await page.context().setOffline(false);
  await page.goto('/cook');
  await expect(page.getByRole('heading', { name: 'Step 2 of 5' })).toBeVisible();
  await expect
    .poll(async () => {
      const session = (await (await page.request.get('/api/v1/cook/session')).json()) as {
        session: { state: { items: { currentStep: number }[]; timers: unknown[] } } | null;
      };
      return [session.session?.state.items[0]?.currentStep, session.session?.state.timers.length];
    })
    .toEqual([1, 1]);
});

test('signing out removes the data kept for offline use', async ({ browser, page: adminPage }) => {
  const { page } = await newMember(browser, adminPage, 'offout');
  await page.goto('/recipes');
  await controlled(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My recipes' })).toBeVisible();
  const kept = () =>
    page.evaluate(async () => {
      const cache = await caches.open('cookit-api');
      const keys = await cache.keys();
      const me = await cache.match('/api/v1/me');
      return {
        recipes: keys.some((request) => new URL(request.url).pathname === '/api/v1/recipes'),
        user: me ? ((await me.json()) as { user: unknown }).user !== null : false,
      };
    });
  await expect.poll(kept).toEqual({ recipes: true, user: true });
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
  // Only what a signed-out visitor sees may be kept again.
  await expect.poll(kept).toEqual({ recipes: false, user: false });
});

test('a session ended elsewhere (expired, disabled) drops the data kept for offline use', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'offgone');
  await page.goto('/recipes');
  await controlled(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My recipes' })).toBeVisible();
  const kept = () =>
    page.evaluate(async () => {
      const keys = await (await caches.open('cookit-api')).keys();
      return keys.some((request) => new URL(request.url).pathname === '/api/v1/recipes');
    });
  await expect.poll(kept).toBe(true);
  // No sign-out here: the session is simply gone (as when it expires).
  await page.context().clearCookies();
  await page.goto('/recipes');
  await expect(page).toHaveURL(/\/login/);
  await expect.poll(kept).toBe(false);
});
