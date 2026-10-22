import { EXAMPLE_RECIPES } from '@cookit/shared';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { ADMIN_STATE, newMember, newVisitor, ORIGIN_HEADER, uniqueName } from './support';

test.use({ storageState: ADMIN_STATE });

const recipe = (title: string, steps = '1. Cuire.\n') =>
  `# ${title}\n\nportions: 4\n\n---\n\n- 2 oeufs\n\n---\n\n${steps}`;

async function createRecipe(request: APIRequestContext, markdown: string): Promise<string> {
  const res = await request.post('/api/v1/recipes/markdown', {
    headers: ORIGIN_HEADER,
    data: { markdown, lang: 'fr' },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

type Idea = { recipe: { id: string; title: string } | null };

async function idea(request: APIRequestContext, query: string) {
  const res = await request.get(`/api/v1/recipes/idea?${query}`);
  return { status: res.status(), body: res.ok() ? ((await res.json()) as Idea) : undefined };
}

test('a new member is greeted and invited to add a first recipe', async ({
  browser,
  page: admin,
}) => {
  const { page } = await newMember(browser, admin, 'newcomer');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^Hello, newcomer/i, level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cooking in progress' })).toHaveCount(0);
  await expect(page.getByText('You have no recipes yet.')).toBeVisible();
  await page.getByRole('link', { name: 'Add a recipe' }).click();
  await expect(page).toHaveURL('/recipes/new');
});

test('recent recipes and the idea of the day', async ({ browser, page: admin }) => {
  const { page } = await newMember(browser, admin, 'regular');
  const titles = [uniqueName('Soupe'), uniqueName('Gratin'), uniqueName('Tarte')];
  for (const title of titles) await createRecipe(page.request, recipe(title));

  await page.goto('/');
  const recent = page.getByRole('region', { name: 'Your recent recipes' });
  // The one changed last first.
  await expect(recent.getByTestId('recipe-card').first()).toContainText(titles[2]!);
  await expect(recent.getByTestId('recipe-card')).toHaveCount(3);

  // The same idea after a reload; another one on demand.
  const card = page.getByTestId('home-idea');
  const first = await card.getByRole('heading', { level: 3 }).textContent();
  await page.reload();
  await expect(card.getByRole('heading', { level: 3 })).toHaveText(first!);
  await page.getByRole('button', { name: 'Another idea' }).click();
  await expect(card.getByRole('heading', { level: 3 })).not.toHaveText(first!);
  await card.getByRole('link', { name: 'See the recipe' }).click();
  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
});

test('the idea of the day: stable per day, never a private recipe of someone else', async ({
  browser,
  page: admin,
}) => {
  const { page: owner } = await newMember(browser, admin, 'secretive');
  const secret = await createRecipe(owner.request, recipe(uniqueName('Secret')));
  const draft = await createRecipe(
    owner.request,
    `# ${uniqueName('Brouillon')}\n\nportions: 2\n\n---\n\n- 1 oeuf\n\n---\n`,
  );
  const { page: reader } = await newMember(browser, admin, 'reader');
  // Two recipes of their own at least: there is always another idea to give.
  for (const name of ['Mienne', 'Autre']) {
    await createRecipe(reader.request, recipe(uniqueName(name)));
  }

  const day = 'day=2026-10-22';
  const once = await idea(reader.request, day);
  expect(once.status).toBe(200);
  expect((await idea(reader.request, day)).body).toEqual(once.body);
  const seen = new Set<string>();
  for (let n = 0; n < 30; n++) {
    const id = (await idea(reader.request, `${day}&n=${n}`)).body?.recipe?.id;
    if (id) seen.add(id);
  }
  expect(seen.has(secret)).toBe(false);
  expect(seen.has(draft)).toBe(false);
  // The owner's own recipes are in, a recipe without steps never.
  const own = new Set<string>();
  for (let n = 0; n < 60; n++) {
    const id = (await idea(owner.request, `${day}&n=${n}`)).body?.recipe?.id;
    if (id) own.add(id);
  }
  expect(own.has(draft)).toBe(false);
  // "Another idea" never gives the one shown back.
  const shown = once.body!.recipe!.id;
  for (let n = 1; n < 6; n++) {
    expect(
      (await idea(reader.request, `${day}&n=${n}&exclude=${shown}`)).body?.recipe?.id,
    ).not.toBe(shown);
  }

  // Checked input, signed in only.
  expect((await idea(reader.request, 'day=22-10-2026')).status).toBe(400);
  expect((await idea(reader.request, `${day}&exclude=nope`)).status).toBe(400);
  expect((await idea(reader.request, `${day}&n=-1`)).status).toBe(400);
  const visitor = await newVisitor(browser);
  expect((await idea(visitor.request, day)).status).toBe(401);
  await visitor.context().close();
});

test('the cooking in progress is shown with its next timer, and resumed', async ({
  browser,
  page: admin,
}) => {
  const { page } = await newMember(browser, admin, 'busycook');
  const id = await createRecipe(page.request, EXAMPLE_RECIPES.fr);
  const title = (
    (await (await page.request.get(`/api/v1/recipes/${id}`)).json()) as {
      title: string;
    }
  ).title;
  const { serverNow } = (await (await page.request.get('/api/v1/cook/session')).json()) as {
    serverNow: string;
  };
  const now = Date.parse(serverNow);
  const timer = (n: number, seconds: number, label: string) => ({
    id: `00000000-0000-4000-8000-00000000000${n}`,
    recipeId: id,
    recipeTitle: title,
    label,
    durationSeconds: 600,
    endsAt: new Date(now + seconds * 1000).toISOString(),
    step: null,
    slot: null,
  });
  const saved = await page.request.put('/api/v1/cook/session', {
    headers: ORIGIN_HEADER,
    data: {
      state: {
        items: [
          {
            recipeId: id,
            lang: 'fr',
            servings: 4,
            currentStep: 2,
            checkedIngredients: [],
            color: 'chart-1',
          },
        ],
        timers: [timer(1, 600, 'four'), timer(2, 300, 'pâte'), timer(3, -30, 'beurre')],
      },
    },
  });
  expect(saved.status()).toBe(200);

  await page.goto('/');
  const cooking = page.getByRole('region', { name: 'Cooking in progress' });
  await expect(cooking).toContainText(title);
  await expect(cooking).toContainText('Step 3');
  await expect(cooking).toContainText(`Next timer: pâte (${title}), ends at`);
  await expect(cooking).toContainText('1 timer has finished');
  await cooking.getByRole('link', { name: 'Resume cooking' }).click();
  await expect(page).toHaveURL('/cook');

  // Once the session is over, nothing to resume.
  await page.request.delete('/api/v1/cook/session', { headers: ORIGIN_HEADER });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^Hello, / })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cooking in progress' })).toHaveCount(0);
});
