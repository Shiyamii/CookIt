import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN_STATE, newMember, newVisitor, ORIGIN_HEADER, uniqueName } from './support';

test.use({ storageState: ADMIN_STATE });

async function createRecipe(
  request: APIRequestContext,
  title: string,
  ingredients: string,
): Promise<string> {
  const res = await request.post('/api/v1/recipes/markdown', {
    headers: ORIGIN_HEADER,
    data: {
      markdown: `# ${title}\n\nportions: 4\n\n---\n\n${ingredients}\n\n---\n\n1. Mélanger.\n`,
      lang: 'fr',
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

type ListResponse = {
  list: {
    version: number;
    state: {
      recipes: { title: string; servings: number }[];
      entries: { text: string; checked: boolean; recipeId: string | null }[];
    };
  } | null;
};

async function serverList(page: Page): Promise<ListResponse> {
  return (await (await page.request.get('/api/v1/shopping/list')).json()) as ListResponse;
}

const list = (page: Page) => page.getByRole('list', { name: 'Shopping list' });

test('ingredients of recipes are added, merged, checked off and cleared', async ({
  browser,
  page: admin,
}) => {
  const { page } = await newMember(browser, admin, 'shopper');
  const crepes = uniqueName('Crêpes');
  const gateau = uniqueName('Gâteau');
  const crepesId = await createRecipe(
    page.request,
    crepes,
    '- 250 g de farine\n- 3 œufs\n- 50 cl de lait\n- 1 pincée de sel',
  );
  const gateauId = await createRecipe(page.request, gateau, '- 250 g farine\n- 2 oeufs');

  // From the recipe page, for 8 servings, without the salt (already at home).
  await page.goto(`/recipes/${crepesId}`);
  await page.getByRole('button', { name: 'More servings' }).click();
  await page.getByRole('button', { name: 'More servings' }).click();
  await page.getByRole('button', { name: 'More servings' }).click();
  await page.getByRole('button', { name: 'More servings' }).click();
  await page.getByRole('button', { name: 'Add to the shopping list' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Ingredients for 8 servings');
  await dialog.getByRole('checkbox', { name: '2 pincée de sel' }).click();
  await dialog.getByRole('button', { name: 'Add 3 ingredients' }).click();
  await expect(page.getByText('Added to the shopping list.')).toBeVisible();

  await page.goto(`/recipes/${gateauId}`);
  await page.getByRole('button', { name: 'Add to the shopping list' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add 2 ingredients' }).click();
  await page.getByRole('link', { name: 'See the list' }).click();

  await expect(page).toHaveURL('/shopping');
  await expect(page.getByRole('heading', { name: 'Shopping list', level: 1 })).toBeVisible();
  // 500 g + 250 g of flour, 6 + 2 eggs: one line each, from both recipes.
  await expect(list(page).getByRole('listitem')).toHaveCount(3);
  await expect(list(page).getByRole('listitem').nth(0)).toContainText('750 g de farine');
  await expect(list(page).getByRole('listitem').nth(0)).toContainText(`${crepes}, ${gateau}`);
  await expect(list(page).getByRole('listitem').nth(1)).toContainText('8 œufs');
  await expect(list(page).getByRole('listitem').nth(2)).toContainText('100 cl de lait');
  await expect(page.getByText('3 items left to buy')).toBeVisible();

  // A free item, then the shopping itself.
  await page.getByRole('textbox', { name: 'Item to add' }).fill('Papier toilette');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(list(page).getByRole('listitem')).toHaveCount(4);
  await list(page)
    .getByRole('checkbox', { name: /farine/ })
    .click();
  await list(page)
    .getByRole('checkbox', { name: /Papier toilette/ })
    .click();
  await expect(page.getByText('2 items left to buy')).toBeVisible();
  // Checked lines go last.
  await expect(list(page).getByRole('listitem').nth(0)).toContainText('8 œufs');

  // Saved on the server: another device sees the same list.
  await expect
    .poll(async () => (await serverList(page)).list?.state.entries.filter((e) => e.checked).length)
    .toBe(3);
  await page.reload();
  await expect(page.getByText('2 items left to buy')).toBeVisible();

  // The home page reminds what is left to buy.
  await page.goto('/');
  await page.getByRole('link', { name: '2 items to buy' }).click();
  await expect(page).toHaveURL('/shopping');

  await page.getByRole('button', { name: 'Remove the checked items (2)' }).click();
  await expect(list(page).getByRole('listitem')).toHaveCount(2);
  await expect(list(page).getByRole('listitem').nth(0)).toContainText('8 œufs');

  // Removing a recipe takes its items away; emptying the list asks first.
  await page.getByRole('button', { name: `Remove ${crepes} from the list` }).click();
  await expect(list(page).getByRole('listitem')).toHaveCount(1);
  await expect(list(page).getByRole('listitem').nth(0)).toContainText('2 oeufs');
  await page.getByRole('button', { name: 'Empty the list' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Empty the list' }).click();
  await expect(page.getByText('Your shopping list is empty.')).toBeVisible();
  await expect
    .poll(async () => (await serverList(page)).list?.state)
    .toEqual({
      recipes: [],
      entries: [],
    });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^Hello, / })).toBeVisible();
  await expect(page.getByRole('link', { name: /items? to buy/ })).toHaveCount(0);
});

test('adding a recipe again replaces it', async ({ browser, page: admin }) => {
  const { page } = await newMember(browser, admin, 'shopper');
  const title = uniqueName('Soupe');
  const id = await createRecipe(page.request, title, '- 1 kg de carottes\n- 1 oignon');
  await page.goto(`/recipes/${id}`);
  await page.getByRole('button', { name: 'Add to the shopping list' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add 2 ingredients' }).click();
  await page.getByRole('button', { name: 'Fewer servings' }).click();
  await page.getByRole('button', { name: 'Fewer servings' }).click();
  await page.getByRole('button', { name: 'Add to the shopping list' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'This recipe is already in the list (for 4 servings): it will be replaced.',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Add 2 ingredients' }).click();
  await page.goto('/shopping');
  await expect(list(page).getByRole('listitem')).toHaveCount(2);
  await expect(list(page).getByRole('listitem').nth(0)).toContainText('0,5 kg de carottes');
  await expect(page.getByRole('region', { name: 'Recipes in the list' })).toContainText(
    '2 servings',
  );
});

test('the list is checked off offline and sent when the network returns', async ({
  browser,
  page: admin,
}) => {
  const { page } = await newMember(browser, admin, 'offline');
  await page.goto('/shopping');
  await page.getByRole('textbox', { name: 'Item to add' }).fill('Pain');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect.poll(async () => (await serverList(page)).list?.state.entries.length).toBe(1);

  await page.context().setOffline(true);
  await list(page).getByRole('checkbox', { name: 'Pain' }).click();
  await page.getByRole('textbox', { name: 'Item to add' }).fill('Beurre');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('1 item left to buy')).toBeVisible();
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await expect
    .poll(async () =>
      (await serverList(page)).list?.state.entries.map((entry) => [entry.text, entry.checked]),
    )
    .toEqual([
      ['Pain', true],
      ['Beurre', false],
    ]);
});

test('the shopping list API: own list only, checked input', async ({ browser, page: admin }) => {
  const { page: owner } = await newMember(browser, admin, 'owner');
  const { page: other } = await newMember(browser, admin, 'other');
  const recipeId = '11111111-1111-4111-8111-111111111111';
  const entry = {
    id: '22222222-2222-4222-8222-222222222222',
    recipeId,
    text: '2 œufs',
    name: 'œufs',
    quantity: null,
    checked: false,
  };
  const recipe = { recipeId, title: 'Crêpes', servings: 4, lang: 'fr' };
  const put = (page: Page, state: unknown) =>
    page.request.put('/api/v1/shopping/list', { headers: ORIGIN_HEADER, data: { state } });

  expect((await serverList(owner)).list).toBeNull();
  const saved = await put(owner, { recipes: [recipe], entries: [entry] });
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toEqual({ version: 1 });
  expect((await serverList(owner)).list?.state.entries).toEqual([entry]);
  // Another account has its own list.
  expect((await serverList(other)).list).toBeNull();

  // An item of a recipe that is not in the list, a control character, too many items, extra keys.
  expect((await put(owner, { recipes: [], entries: [entry] })).status()).toBe(400);
  expect(
    (await put(owner, { recipes: [recipe], entries: [{ ...entry, text: 'a\u0000b' }] })).status(),
  ).toBe(400);
  const many = Array.from({ length: 301 }, (_, i) => ({
    ...entry,
    id: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`,
    recipeId: null,
  }));
  expect((await put(owner, { recipes: [], entries: many })).status()).toBe(400);
  expect((await put(owner, { recipes: [recipe], entries: [entry], extra: 1 })).status()).toBe(400);
  expect((await serverList(owner)).list?.version).toBe(1);

  // Signed in only, same origin only.
  const visitor = await newVisitor(browser);
  expect((await visitor.request.get('/api/v1/shopping/list')).status()).toBe(401);
  expect(
    (
      await owner.request.put('/api/v1/shopping/list', {
        data: { state: { recipes: [], entries: [] } },
        headers: { Origin: 'https://evil.example' },
      })
    ).status(),
  ).toBe(403);
  await visitor.context().close();
});
