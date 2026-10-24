import { EXAMPLE_RECIPES } from '@cookit/shared';
import { expect, test, type Page } from '@playwright/test';
import { sinkSubscription } from './push-sink';
import { ADMIN_STATE, newMember, newVisitor, ORIGIN_HEADER } from './support';

test.use({ storageState: ADMIN_STATE });

async function createRecipe(page: Page): Promise<string> {
  const response = await page.request.post('/api/v1/recipes/markdown', {
    headers: ORIGIN_HEADER,
    data: { markdown: EXAMPLE_RECIPES.fr, lang: 'fr' },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** A cooking session with one timer ending `inMs` after the server time. */
async function startTimer(page: Page, recipeId: string, inMs: number, label = 'repos') {
  const { serverNow } = (await (await page.request.get('/api/v1/cook/session')).json()) as {
    serverNow: string;
  };
  const timer = {
    id: crypto.randomUUID(),
    recipeId,
    recipeTitle: 'Crêpes au beurre salé',
    label,
    durationSeconds: 600,
    endsAt: new Date(Date.parse(serverNow) + inMs).toISOString(),
    step: null,
    slot: null,
  };
  const item = {
    recipeId,
    lang: 'fr',
    servings: 4,
    currentStep: 0,
    checkedIngredients: [],
    color: 'chart-1',
  };
  const res = await page.request.put('/api/v1/cook/session', {
    headers: ORIGIN_HEADER,
    data: { state: { items: [item], timers: [timer] } },
  });
  expect(res.status()).toBe(200);
  return timer;
}

const sessionTimers = async (page: Page) =>
  (
    (await (await page.request.get('/api/v1/cook/session')).json()) as {
      session: { state: { timers: { id: string; endsAt: string }[] } } | null;
    }
  ).session?.state.timers ?? [];

test('alarm settings: the account’s, saved on the server, and this device’s own', async ({
  browser,
  page: admin,
}) => {
  const { page } = await newMember(browser, admin, 'alarm');
  await page.goto('/');
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('menuitem', { name: 'Alarm' }).click();
  await expect(page.getByRole('heading', { name: 'Alarm', level: 1 })).toBeVisible();

  const account = page.locator('[data-slot="card"]').filter({ hasText: 'For your account' });
  await account.getByRole('combobox', { name: 'Sound' }).click();
  await page.getByRole('option', { name: 'Bell' }).click();
  await account.getByRole('checkbox', { name: 'Vibrate (phones)' }).click();
  await account.getByRole('button', { name: 'Listen' }).click();
  await account.getByRole('button', { name: 'Save' }).click();
  await expect(account.getByRole('status')).toHaveText('Saved.');
  expect(await (await page.request.get('/api/v1/me/alarm')).json()).toEqual({
    sound: 'bell',
    volume: 80,
    vibrate: false,
    repeat: true,
  });

  // This device: its own settings, starting from the account's, kept after a reload.
  const device = page.locator('[data-slot="card"]').filter({ hasText: 'On this device' });
  await device.getByRole('checkbox', { name: 'Use settings of its own on this device' }).click();
  await expect(device.getByRole('combobox', { name: 'Sound' })).toHaveText('Bell');
  await device.getByRole('combobox', { name: 'Sound' }).click();
  await page.getByRole('option', { name: 'Soft' }).click();
  await device.getByRole('checkbox', { name: 'Ring until stopped' }).click();
  await page.reload();
  await expect(device.getByRole('combobox', { name: 'Sound' })).toHaveText('Soft');
  await expect(device.getByRole('checkbox', { name: 'Ring until stopped' })).not.toBeChecked();
  // The account's settings did not change.
  expect(
    ((await (await page.request.get('/api/v1/me/alarm')).json()) as { sound: string }).sound,
  ).toBe('bell');

  // Checked input.
  const bad = await page.request.put('/api/v1/me/alarm', {
    headers: ORIGIN_HEADER,
    data: { sound: 'siren', volume: 80, vibrate: true, repeat: true },
  });
  expect(bad.status()).toBe(400);
  const visitor = await newVisitor(browser);
  expect((await visitor.request.get('/api/v1/me/alarm')).status()).toBe(401);
  await visitor.context().close();
});

test('a finished timer rings on any page until stopped; +1 min re-arms it', async ({
  browser,
  page: admin,
}) => {
  const { page } = await newMember(browser, admin, 'ringing');
  const recipeId = await createRecipe(page);
  const timer = await startTimer(page, recipeId, 1500, 'repos de la pâte');

  await page.goto('/recipes');
  const banner = page.getByRole('alert').filter({ hasText: 'Timer finished' });
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await expect(banner).toContainText('Crêpes au beurre salé · repos de la pâte');

  // +1 min: running again, the alarm goes away.
  await banner.getByRole('button', { name: 'Add 1 min to repos de la pâte' }).click();
  await expect(banner).toHaveCount(0);
  await expect
    .poll(async () => Date.parse((await sessionTimers(page))[0]?.endsAt ?? '0'))
    .toBeGreaterThan(Date.parse(timer.endsAt) + 50_000);

  // Finished again (set through the API), then stopped: the timer leaves the session.
  await startTimer(page, recipeId, 1000);
  await page.goto('/');
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await banner.getByRole('button', { name: 'Stop the alarm' }).click();
  await expect(banner).toHaveCount(0);
  await expect.poll(async () => (await sessionTimers(page)).length).toBe(0);
});

test(
  'with the app closed, the notification comes back until stopped',
  { tag: '@server' },
  async ({ browser, page: admin }) => {
    test.setTimeout(120_000);
    const { page } = await newMember(browser, admin, 'reminded');
    const recipeId = await createRecipe(page);
    const phone = sinkSubscription();
    const subscribed = await page.request.post('/api/v1/push/subscriptions', {
      headers: ORIGIN_HEADER,
      data: phone.json,
    });
    expect(subscribed.status()).toBe(200);
    const timer = await startTimer(page, recipeId, 1000);

    await expect.poll(async () => (await phone.messages()).length, { timeout: 20_000 }).toBe(1);
    const [first] = await phone.messages();
    expect(first?.payload).toMatchObject({
      tag: `timer-${timer.id}`,
      timerId: timer.id,
      stopLabel: 'Stop',
    });
    // A reminder 30 s later, the same notification again.
    await expect.poll(async () => (await phone.messages()).length, { timeout: 45_000 }).toBe(2);
    const [, second] = await phone.messages();
    expect(second!.receivedAt - first!.receivedAt).toBeGreaterThanOrEqual(29_000);
    expect(second?.payload).toEqual(first?.payload);

    // "Stop" on the notification (what the service worker sends): no more reminders.
    const stop = await page.request.post(`/api/v1/cook/timers/${timer.id}/stop`, {
      headers: ORIGIN_HEADER,
      data: {},
    });
    expect(stop.status()).toBe(200);
    expect(await sessionTimers(page)).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 40_000));
    expect(await phone.messages()).toHaveLength(2);

    // Checked input, signed in only.
    expect(
      (
        await page.request.post('/api/v1/cook/timers/not-an-id/stop', {
          headers: ORIGIN_HEADER,
          data: {},
        })
      ).status(),
    ).toBe(400);
    const visitor = await newVisitor(browser);
    expect(
      (
        await visitor.request.post(`/api/v1/cook/timers/${timer.id}/stop`, {
          headers: ORIGIN_HEADER,
          data: {},
        })
      ).status(),
    ).toBe(401);
    await visitor.context().close();
  },
);

test(
  'without "ring until stopped", one notification only',
  { tag: '@server' },
  async ({ browser, page: admin }) => {
    test.setTimeout(90_000);
    const { page } = await newMember(browser, admin, 'once');
    const saved = await page.request.put('/api/v1/me/alarm', {
      headers: ORIGIN_HEADER,
      data: { sound: 'classic', volume: 80, vibrate: true, repeat: false },
    });
    expect(saved.status()).toBe(200);
    const recipeId = await createRecipe(page);
    const phone = sinkSubscription();
    await page.request.post('/api/v1/push/subscriptions', {
      headers: ORIGIN_HEADER,
      data: phone.json,
    });
    await startTimer(page, recipeId, 1000);
    await expect.poll(async () => (await phone.messages()).length, { timeout: 20_000 }).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 40_000));
    expect(await phone.messages()).toHaveLength(1);
  },
);
