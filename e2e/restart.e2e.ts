import { EXAMPLE_RECIPES } from '@cookit/shared';
import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { sinkSubscription } from './push-sink';
import { ADMIN_STATE, BASE_URL, newMember, ORIGIN_HEADER } from './support';

// Run alone, after the other projects (playwright.config.ts): it stops the app container.
test.use({ storageState: ADMIN_STATE });

const container = process.env.E2E_CONTAINER ?? 'cookit-app-1';
const docker = (...args: string[]) => execFileSync('docker', args, { stdio: 'ignore' });

async function healthy(): Promise<boolean> {
  try {
    return (await fetch(`${BASE_URL}/healthz`)).ok;
  } catch {
    return false;
  }
}

test('a timer that ends while the container is down is sent once it is back', async ({
  browser,
  page: adminPage,
}) => {
  test.setTimeout(120_000);
  const { page } = await newMember(browser, adminPage, 'restart');
  const created = await page.request.post('/api/v1/recipes/markdown', {
    headers: ORIGIN_HEADER,
    data: { markdown: EXAMPLE_RECIPES.fr, lang: 'fr' },
  });
  const recipeId = ((await created.json()) as { id: string }).id;
  const device = sinkSubscription();
  expect(
    (
      await page.request.post('/api/v1/push/subscriptions', {
        headers: ORIGIN_HEADER,
        data: device.json,
      })
    ).status(),
  ).toBe(200);

  const { serverNow } = (await (await page.request.get('/api/v1/cook/session')).json()) as {
    serverNow: string;
  };
  const endsAt = Date.parse(serverNow) + 8000;
  const saved = await page.request.put('/api/v1/cook/session', {
    headers: ORIGIN_HEADER,
    data: {
      state: {
        items: [
          {
            recipeId,
            lang: 'fr',
            servings: 4,
            currentStep: 1,
            checkedIngredients: [],
            color: 'chart-1',
          },
        ],
        timers: [
          {
            id: crypto.randomUUID(),
            recipeId,
            recipeTitle: 'Crêpes au beurre salé',
            label: 'repos de la pâte',
            durationSeconds: 8,
            endsAt: new Date(endsAt).toISOString(),
            step: 1,
            slot: 0,
          },
        ],
      },
    },
  });
  expect(saved.status()).toBe(200);

  docker('stop', container);
  try {
    // Ends while the server is down.
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, endsAt - Date.now()) + 3000));
    expect(await device.messages()).toHaveLength(0);
  } finally {
    docker('start', container);
  }
  await expect.poll(healthy, { timeout: 60_000 }).toBe(true);
  await expect.poll(async () => (await device.messages()).length, { timeout: 20_000 }).toBe(1);
  const [message] = await device.messages();
  expect(message?.payload).toMatchObject({
    title: 'Crêpes au beurre salé',
    body: 'repos de la pâte',
  });
});
