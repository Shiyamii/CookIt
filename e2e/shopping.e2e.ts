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
      lines: {
        name: string;
        checked: boolean;
        keys: string[];
        entries: { name: string; recipeId: string | null }[];
      }[];
    };
  } | null;
};

async function serverList(page: Page): Promise<ListResponse> {
  return (await (await page.request.get('/api/v1/shopping/list')).json()) as ListResponse;
}

const toBuy = (page: Page) => page.getByRole('list', { name: 'To buy' });
const basket = (page: Page) => page.getByRole('list', { name: 'In the basket' });

async function addToList(page: Page, id: string, count: number) {
  await page.goto(`/recipes/${id}`);
  await page.getByRole('button', { name: 'Add to the shopping list' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: `Add ${count} ingredient${count > 1 ? 's' : ''}` })
    .click();
  await expect(page.getByText('Added to the shopping list.')).toBeVisible();
}

test('ingredients of recipes are added, one line per ingredient, checked off and cleared', async ({
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
  const gateauId = await createRecipe(page.request, gateau, '- 1 tasse farine\n- 2 oeufs');

  // From the recipe page, for 8 servings, without the salt (already at home).
  await page.goto(`/recipes/${crepesId}`);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'More servings' }).click();
  await page.getByRole('button', { name: 'Add to the shopping list' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Ingredients for 8 servings');
  await dialog.getByRole('checkbox', { name: '2 pincée de sel' }).click();
  await dialog.getByRole('button', { name: 'Add 3 ingredients' }).click();
  await expect(page.getByText('Added to the shopping list.')).toBeVisible();

  await addToList(page, gateauId, 2);
  await page.getByRole('link', { name: 'See the list' }).click();

  await expect(page).toHaveURL('/shopping');
  await expect(page.getByRole('heading', { name: 'Shopping list', level: 1 })).toBeVisible();
  // Flour in grams and in cups, 6 + 2 eggs: one line each, with every recipe's quantity.
  const lines = toBuy(page).getByRole('listitem');
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(0)).toContainText('Farine (500 g · 1 tasse)');
  await expect(lines.nth(0)).toContainText(`${crepes}, ${gateau}`);
  await expect(lines.nth(1)).toContainText('Œufs (6 · 2 = 8)');
  await expect(lines.nth(2)).toContainText('Lait (100 cl)');
  await expect(page.getByText('3 items left to buy')).toBeVisible();

  // A free item, then the shopping itself: checked lines go to the basket.
  await page.getByRole('textbox', { name: 'Item to add' }).fill('Papier toilette');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(lines).toHaveCount(4);
  await toBuy(page)
    .getByRole('checkbox', { name: /Farine/ })
    .click();
  await toBuy(page)
    .getByRole('checkbox', { name: /Papier toilette/ })
    .click();
  await expect(page.getByText('2 items left to buy')).toBeVisible();
  await expect(lines.nth(0)).toContainText('Œufs');
  await expect(page.getByRole('heading', { name: 'In the basket (2)' })).toBeVisible();
  await expect(basket(page).getByRole('listitem')).toHaveCount(2);

  // Saved on the server: another device sees the same list.
  await expect
    .poll(async () => (await serverList(page)).list?.state.lines.filter((l) => l.checked).length)
    .toBe(2);
  await page.reload();
  await expect(page.getByText('2 items left to buy')).toBeVisible();

  // The home page reminds what is left to buy.
  await page.goto('/');
  await page.getByRole('link', { name: '2 items to buy' }).click();
  await expect(page).toHaveURL('/shopping');

  await page.getByRole('button', { name: 'Remove the checked items (2)' }).click();
  await expect(lines).toHaveCount(2);
  await expect(basket(page)).toHaveCount(0);

  // Removing a recipe takes its ingredients away; emptying the list asks first.
  await page.getByRole('button', { name: `Remove ${crepes} from the list` }).click();
  await expect(lines).toHaveCount(1);
  await expect(lines.nth(0)).toContainText('Œufs (2)');
  await page.getByRole('button', { name: 'Empty the list' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Empty the list' }).click();
  await expect(page.getByText('Your shopping list is empty.')).toBeVisible();
  await expect
    .poll(async () => (await serverList(page)).list?.state)
    .toEqual({ recipes: [], lines: [] });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /^Hello, / })).toBeVisible();
  await expect(page.getByRole('link', { name: /items? to buy/ })).toHaveCount(0);
});

test('lines are moved at any time, grouped (and stay grouped) and split', async ({
  browser,
  page: admin,
}) => {
  const { page } = await newMember(browser, admin, 'organizer');
  const cookies = uniqueName('Cookies');
  const pain = uniqueName('Pain');
  await addToList(
    page,
    await createRecipe(page.request, cookies, '- 200 g de farine\n- 100 g de sucre\n- 1 oeuf'),
    3,
  );
  await page.goto('/shopping');
  const lines = toBuy(page).getByRole('listitem');
  // Moving is always there: arrows and the handle, no mode to turn on.

  // Arrows.
  await page.getByRole('button', { name: 'Move Oeuf up' }).click();
  await expect(lines.nth(1)).toContainText('Oeuf');
  await expect(page.getByRole('button', { name: 'Move Farine up' })).toBeDisabled();
  await page.getByRole('button', { name: 'Move Farine down' }).click();
  await expect(lines.nth(0)).toContainText('Oeuf');
  await expect(lines.nth(1)).toContainText('Farine');

  // Drag and drop by the handle: sucre to the top.
  const handle = page.getByRole('button', { name: 'Move Sucre', exact: true });
  const from = (await handle.boundingBox())!;
  const to = (await lines.nth(0).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
  await page.mouse.move(from.x + from.width / 2, to.y + 2, { steps: 10 });
  await page.mouse.up();
  await expect(lines.nth(0)).toContainText('Sucre');
  await expect
    .poll(async () => (await serverList(page)).list?.state.lines.map((l) => l.name))
    .toEqual(['sucre', 'oeuf', 'farine']);

  // Only the handle drags: pulling the text of a line moves nothing (on a phone, it scrolls).
  const text = (await lines.nth(2).getByText('Farine (200 g)').boundingBox())!;
  await page.mouse.move(text.x + 10, text.y + text.height / 2);
  await page.mouse.down();
  await page.mouse.move(text.x + 10, to.y + 2, { steps: 10 });
  await page.mouse.up();
  await expect(lines.nth(0)).toContainText('Sucre');
  await expect(lines.nth(2)).toContainText('Farine');

  // A recipe with `farine T55`: its own line, grouped by hand with `farine`.
  const painId = await createRecipe(page.request, pain, '- 500 g de farine T55');
  await addToList(page, painId, 1);
  await page.goto('/shopping');
  await expect(lines).toHaveCount(4);
  await page.getByRole('button', { name: 'Group lines' }).click();
  await expect(page.getByText('Tick the lines to group into one')).toBeVisible();
  await toBuy(page)
    .getByRole('checkbox', { name: /^Farine \(200 g\)/ })
    .click();
  await toBuy(page)
    .getByRole('checkbox', { name: /^Farine T55/ })
    .click();
  await page.getByRole('button', { name: 'Group (2)' }).click();
  const naming = page.getByRole('dialog');
  await expect(naming.getByRole('textbox', { name: 'Name of the line' })).toHaveValue('farine');
  await naming.getByRole('textbox', { name: 'Name of the line' }).fill('Farine de blé');
  await naming.getByRole('button', { name: 'Group', exact: true }).click();
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(2)).toContainText('Farine de blé (200 g · 500 g = 700 g)');

  // Added again, `farine T55` goes back to the grouped line.
  await addToList(page, painId, 1);
  await page.goto('/shopping');
  await expect(lines).toHaveCount(3);
  await expect(lines.nth(2)).toContainText('Farine de blé (200 g · 500 g = 700 g)');

  // Split: one line per ingredient again.
  await page.getByRole('button', { name: 'Group lines' }).click();
  await page.getByRole('button', { name: 'Separate Farine de blé' }).click();
  await expect(lines).toHaveCount(4);
  await expect(lines.nth(2)).toContainText('Farine (200 g)');
  await expect(lines.nth(3)).toContainText('Farine T55 (500 g)');
});

test('adding a recipe again replaces it', async ({ browser, page: admin }) => {
  const { page } = await newMember(browser, admin, 'shopper');
  const title = uniqueName('Soupe');
  const id = await createRecipe(page.request, title, '- 1 kg de carottes\n- 1 oignon');
  await addToList(page, id, 2);
  await page.getByRole('button', { name: 'Fewer servings' }).click();
  await page.getByRole('button', { name: 'Fewer servings' }).click();
  await page.getByRole('button', { name: 'Add to the shopping list' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'This recipe is already in the list (for 4 servings): it will be replaced.',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Add 2 ingredients' }).click();
  await page.goto('/shopping');
  await expect(toBuy(page).getByRole('listitem')).toHaveCount(2);
  await expect(toBuy(page).getByRole('listitem').nth(0)).toContainText('Carottes (0,5 kg)');
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
  await expect.poll(async () => (await serverList(page)).list?.state.lines.length).toBe(1);

  await page.context().setOffline(true);
  await toBuy(page).getByRole('checkbox', { name: 'Pain' }).click();
  await page.getByRole('textbox', { name: 'Item to add' }).fill('Beurre');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('1 item left to buy')).toBeVisible();
  await page.context().setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  await expect
    .poll(async () =>
      (await serverList(page)).list?.state.lines.map((line) => [line.name, line.checked]),
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
    name: 'œufs',
    quantity: { value: 2, unit: null, unitText: '', rounding: 'fraction' },
  };
  const line = {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'œufs',
    keys: ['oeuf'],
    checked: false,
    entries: [entry],
  };
  const recipe = { recipeId, title: 'Crêpes', servings: 4, lang: 'fr' };
  const put = (page: Page, state: unknown) =>
    page.request.put('/api/v1/shopping/list', { headers: ORIGIN_HEADER, data: { state } });

  expect((await serverList(owner)).list).toBeNull();
  const saved = await put(owner, { recipes: [recipe], lines: [line] });
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toEqual({ version: 1 });
  expect((await serverList(owner)).list?.state.lines).toEqual([line]);
  // Another account has its own list.
  expect((await serverList(other)).list).toBeNull();

  // An ingredient of a recipe that is not in the list, a control character, an empty line, too
  // many ingredients, extra keys, the shape before lines.
  expect((await put(owner, { recipes: [], lines: [line] })).status()).toBe(400);
  expect(
    (await put(owner, { recipes: [recipe], lines: [{ ...line, name: 'a\u0000b' }] })).status(),
  ).toBe(400);
  expect((await put(owner, { recipes: [], lines: [{ ...line, entries: [] }] })).status()).toBe(400);
  const many = Array.from({ length: 301 }, (_, i) => ({
    ...entry,
    id: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`,
    recipeId: null,
  }));
  expect(
    (await put(owner, { recipes: [], lines: [{ ...line, keys: [], entries: many }] })).status(),
  ).toBe(400);
  expect((await put(owner, { recipes: [recipe], lines: [line], extra: 1 })).status()).toBe(400);
  expect((await put(owner, { recipes: [], entries: [] })).status()).toBe(400);
  expect((await serverList(owner)).list?.version).toBe(1);

  // Signed in only, same origin only.
  const visitor = await newVisitor(browser);
  expect((await visitor.request.get('/api/v1/shopping/list')).status()).toBe(401);
  expect(
    (
      await owner.request.put('/api/v1/shopping/list', {
        data: { state: { recipes: [], lines: [] } },
        headers: { Origin: 'https://evil.example' },
      })
    ).status(),
  ).toBe(403);
  await visitor.context().close();
});
