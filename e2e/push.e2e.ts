import { EXAMPLE_RECIPES } from '@cookit/shared';
import { expect, test, type Page } from '@playwright/test';
import { sinkSubscription } from './push-sink';
import { ADMIN_STATE, newMember, ORIGIN_HEADER, userId } from './support';

test.use({ storageState: ADMIN_STATE });

async function createRecipe(page: Page, markdown = EXAMPLE_RECIPES.fr): Promise<string> {
  const response = await page.request.post('/api/v1/recipes/markdown', {
    headers: ORIGIN_HEADER,
    data: { markdown, lang: 'fr' },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

const subscribe = (page: Page, subscription: unknown) =>
  page.request.post('/api/v1/push/subscriptions', {
    headers: ORIGIN_HEADER,
    data: subscription,
  });

/** Starts a timer of `recipeId` ending `inMs` after the server time (through the cooking API). */
async function startTimer(page: Page, recipeId: string, inMs: number, label = 'repos de la pâte') {
  const now = Date.parse(
    ((await (await page.request.get('/api/v1/cook/session')).json()) as { serverNow: string })
      .serverNow,
  );
  const endsAt = now + inMs;
  const timer = {
    id: crypto.randomUUID(),
    recipeId,
    recipeTitle: 'Crêpes au beurre salé',
    label,
    durationSeconds: Math.max(1, Math.round(inMs / 1000)),
    endsAt: new Date(endsAt).toISOString(),
    step: 1,
    slot: 0,
  };
  const item = {
    recipeId,
    lang: 'fr',
    servings: 4,
    currentStep: 1,
    checkedIngredients: [],
    color: 'chart-1',
  };
  const response = await page.request.put('/api/v1/cook/session', {
    headers: ORIGIN_HEADER,
    data: { state: { items: [item], timers: [timer] } },
  });
  expect(response.status()).toBe(200);
  return { endsAt, timer, item };
}

test('a finished timer is sent to every device of its user, with the page closed', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'push');
  const { page: other } = await newMember(browser, adminPage, 'pushother');
  const recipeId = await createRecipe(page);
  const phone = sinkSubscription();
  const laptop = sinkSubscription();
  const stranger = sinkSubscription();
  expect((await subscribe(page, phone.json)).status()).toBe(200);
  expect((await subscribe(page, laptop.json)).status()).toBe(200);
  expect((await subscribe(other, stranger.json)).status()).toBe(200);

  const { endsAt, timer } = await startTimer(page, recipeId, 3000);
  // No page open: only the server can send it.
  for (const p of page.context().pages()) await p.close();

  await expect.poll(async () => (await phone.messages()).length, { timeout: 20_000 }).toBe(1);
  const [message] = await phone.messages();
  expect(message?.payload).toEqual({
    title: 'Crêpes au beurre salé',
    body: 'repos de la pâte',
    url: `/cook?show=${recipeId}`,
    tag: `timer-${timer.id}`,
    timerId: timer.id,
    stopLabel: 'Stop',
  });
  expect(message?.headers).toMatchObject({ ttl: '600', urgency: 'high', encoding: 'aes128gcm' });
  expect(message?.headers.authorization).toMatch(/^vapid t=.+, k=.+/);
  // On time: not before the end, within a scheduler run (~5 s) after it.
  expect(message!.receivedAt).toBeGreaterThanOrEqual(endsAt - 1000);
  expect(message!.receivedAt).toBeLessThan(endsAt + 10_000);
  await expect.poll(async () => (await laptop.messages()).length).toBe(1);

  // Sent once, and only to its user.
  await new Promise((resolve) => setTimeout(resolve, 7000));
  expect(await phone.messages()).toHaveLength(1);
  expect(await stranger.messages()).toHaveLength(0);
});

test('dead subscriptions are deleted; cancelled timers and disabled users get nothing', async ({
  browser,
  page: adminPage,
}) => {
  const { page, username } = await newMember(browser, adminPage, 'pushgone');
  const recipeId = await createRecipe(page);
  const gone = sinkSubscription('gone');
  const alive = sinkSubscription();
  await subscribe(page, gone.json);
  await subscribe(page, alive.json);

  // A timer cancelled before its end is never sent.
  const { item } = await startTimer(page, recipeId, 3000);
  await page.request.put('/api/v1/cook/session', {
    headers: ORIGIN_HEADER,
    data: { state: { items: [item], timers: [] } },
  });
  // A timer that ended before the server knew of it (started offline): the device rang itself.
  await startTimer(page, recipeId, -60_000);
  await new Promise((resolve) => setTimeout(resolve, 9000));
  expect(await alive.messages()).toHaveLength(0);

  await startTimer(page, recipeId, 1000);
  await expect.poll(async () => (await alive.messages()).length, { timeout: 20_000 }).toBe(1);
  // The push service said 410: that subscription is gone.
  expect(await gone.messages()).toHaveLength(1);
  const devices = (await (await page.request.get('/api/v1/push/subscriptions')).json()) as {
    devices: { endpoint: string }[];
  };
  expect(devices.devices.map((device) => device.endpoint)).toEqual([alive.json.endpoint]);

  // A disabled account is not notified.
  await startTimer(page, recipeId, 4000);
  const id = await userId(adminPage, username);
  expect(
    (
      await adminPage.request.post(`/api/v1/admin/users/${id}/disable`, { headers: ORIGIN_HEADER })
    ).ok(),
  ).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 11_000));
  expect(await alive.messages()).toHaveLength(1);
});

test('push API: own subscriptions only, push services only, test notification', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'pushapi');
  const { page: other } = await newMember(browser, adminPage, 'pushapi2');
  const key = (await (await page.request.get('/api/v1/push/key')).json()) as {
    publicKey: string;
  };
  expect(key.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);

  const device = sinkSubscription();
  const refused = await subscribe(page, {
    ...device.json,
    endpoint: 'https://example.com/push/x',
  });
  expect(refused.status()).toBe(400);
  expect(await refused.json()).toEqual({ error: 'unsupported_push_service' });
  expect(
    (await subscribe(page, { ...device.json, endpoint: 'http://fcm.googleapis.com/x' })).status(),
  ).toBe(400);
  expect(
    (await subscribe(page, { ...device.json, keys: { p256dh: 'x', auth: 'y' } })).status(),
  ).toBe(400);
  expect((await subscribe(page, { ...device.json, extra: 1 })).status()).toBe(400);

  expect((await subscribe(page, device.json)).status()).toBe(200);
  // Someone else cannot remove it.
  await other.request.delete('/api/v1/push/subscriptions', {
    headers: ORIGIN_HEADER,
    data: { endpoint: device.json.endpoint },
  });
  const list = async (p: Page) =>
    ((await (await p.request.get('/api/v1/push/subscriptions')).json()) as { devices: unknown[] })
      .devices;
  expect(await list(page)).toHaveLength(1);

  // The test notification.
  const sent = await page.request.post('/api/v1/push/test', { headers: ORIGIN_HEADER });
  expect(await sent.json()).toEqual({ sent: 1 });
  const [message] = await device.messages();
  expect(message?.payload).toMatchObject({ title: 'CookIt', url: '/account/notifications' });

  // Knowing the endpoint is not enough to take it (other keys: unchanged).
  const thief = sinkSubscription();
  expect((await subscribe(other, { ...thief.json, endpoint: device.json.endpoint })).status()).toBe(
    200,
  );
  expect(await list(page)).toHaveLength(1);
  expect(await list(other)).toHaveLength(0);
  // The same browser signed in with another account: the subscription changes hands.
  expect((await subscribe(other, device.json)).status()).toBe(200);
  expect(await list(page)).toHaveLength(0);
  expect(await list(other)).toHaveLength(1);
  await other.request.delete('/api/v1/push/subscriptions', {
    headers: ORIGIN_HEADER,
    data: { endpoint: device.json.endpoint },
  });
  expect(await list(other)).toHaveLength(0);

  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  expect((await visitor.request.get('/api/v1/push/key')).status()).toBe(401);
  await visitor.close();
});

test('notifications page, cooking notice, service worker and manifest', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'pushui');
  // Headless Chromium denies notifications unless they are granted.
  await page.context().grantPermissions(['notifications']);
  await page.goto('/recipes');
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Notifications' }).click();
  await expect(page).toHaveURL(/\/account\/notifications$/);
  await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible();
  await expect(page.getByTestId('push-status')).toHaveText(/Notifications are off/);
  await expect(page.getByRole('button', { name: 'Turn on notifications' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /iPhone and iPad/ })).toBeVisible();

  // The service worker that shows the notifications.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration?.active?.scriptURL ?? null;
      }),
    )
    .toMatch(/\/sw\.js$/);
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ name: 'CookIt', display: 'standalone' });

  // Cooking: told that the page must stay open; a notification opens the right recipe.
  const first = await createRecipe(page);
  const second = await createRecipe(page, EXAMPLE_RECIPES.en);
  await page.goto(`/recipes/${first}`);
  await page.getByRole('link', { name: 'Cook', exact: true }).click();
  await expect(page.getByTestId('push-notice')).toContainText('Notifications are off');
  await page.goto(`/recipes/${second}`);
  await page.getByRole('link', { name: 'Cook', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Salted butter crêpes' })).toBeVisible();
  await page.goto(`/cook?show=${first}`);
  await expect(page.getByRole('heading', { name: 'Crêpes au beurre salé' })).toBeVisible();
  await expect(page).toHaveURL(/\/cook$/);
});
