import { expect, test } from '@playwright/test';
import { sinkSubscription } from './push-sink';
import { ADMIN_STATE, newVisitor, ORIGIN_HEADER, signUp, uniqueName } from './support';

// The critical path of the plan, in one go and through the pages: an admin invites someone, who
// creates an account, adds a recipe, cooks it and starts a timer, closes the app, gets the
// notification from the server, and finds the alarm ringing when they come back.

test.use({ storageState: ADMIN_STATE });

const recipe = (title: string) => `# ${title}

> Un œuf mollet, rien de plus.

portions: 1

---

- 1 œuf
- 1 pincée de sel

---

1. Porter l'eau à ébullition.
2. Cuire l'œuf [8 s](timer:8s "cuisson").
3. Écaler et saler.
`;

test('invitation → account → recipe → cooking with a timer → notification with the app closed', async ({
  page: admin,
  browser,
}) => {
  test.setTimeout(90_000);

  // The admin invites someone from the Invitations page.
  const label = uniqueName('critical');
  await admin.goto('/admin/invites');
  await admin.getByLabel('Note').fill(label);
  await admin.getByRole('button', { name: 'Create an invitation' }).click();
  const link = await admin.getByRole('textbox', { name: 'Invitation link' }).inputValue();

  // They create their account from the link, and land on the home page.
  const page = await newVisitor(browser);
  const username = uniqueName('cook');
  await signUp(page, link, username);
  await expect(page.getByRole('heading', { name: /^Hello, / })).toBeVisible();
  await admin.reload();
  await expect(admin.getByTestId('invite-row').filter({ hasText: label })).toContainText('Used', {
    timeout: 10_000,
  });

  // They add a recipe (pasted markdown, previewed, saved).
  const title = `Œuf mollet ${label}`;
  await page.goto('/recipes/import');
  await page.getByLabel('Recipe in the CookIt markdown format').fill(recipe(title));
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByTestId('import-item')).toContainText(title);
  await page.getByRole('button', { name: /^Save (1 recipe|the recipe)$/ }).click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

  // This device receives notifications (a push service stand-in: see e2e/push-sink.ts).
  const phone = sinkSubscription('critical');
  const subscribed = await page.request.post('/api/v1/push/subscriptions', {
    headers: ORIGIN_HEADER,
    data: phone.json,
  });
  expect(subscribed.status()).toBe(200);

  // They cook it: step 2 has the timer.
  await page.getByRole('link', { name: 'Cook', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Step 1 of 3' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Step 2 of 3' })).toBeVisible();
  await page.getByRole('button', { name: /Start the timer/ }).click();
  await expect(page.getByTestId('cook-timer')).toContainText('cuisson');
  // Saved on the server, then the app is closed.
  await expect
    .poll(async () => {
      const res = await page.request.get('/api/v1/cook/session');
      const body = (await res.json()) as { session: { state: { timers: unknown[] } } | null };
      return body.session?.state.timers.length ?? 0;
    })
    .toBe(1);
  const context = page.context();
  await page.close();

  // The server sends the notification on time, with the dish and the timer name.
  await expect.poll(async () => (await phone.messages()).length, { timeout: 30_000 }).toBe(1);
  const [message] = await phone.messages();
  expect(message?.payload).toMatchObject({ title, body: 'cuisson', stopLabel: 'Stop' });

  // Back in the app: the alarm rings on any page until stopped.
  const back = await context.newPage();
  await back.goto('/');
  const alarm = back.getByRole('alert').filter({ hasText: 'Timer finished' });
  await expect(alarm).toBeVisible({ timeout: 10_000 });
  await expect(alarm).toContainText(`${title} · cuisson`);
  await alarm.getByRole('button', { name: 'Stop the alarm' }).click();
  await expect(alarm).toHaveCount(0);
  await context.close();
});
