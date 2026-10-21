import { EXAMPLE_RECIPES } from '@cookit/shared';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_STATE, newMember, newVisitor, ORIGIN_HEADER } from './support';

test.use({ storageState: ADMIN_STATE });

async function createFrenchRecipe(page: Page): Promise<string> {
  const response = await page.request.post('/api/v1/recipes/markdown', {
    headers: ORIGIN_HEADER,
    data: { markdown: EXAMPLE_RECIPES.fr, lang: 'fr' },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

test('import with an AI: the prompt is generated, the pasted answer is previewed and saved', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'ai');
  await page.goto('/recipes/new');
  await page.getByRole('link', { name: /With an AI/ }).click();
  await expect(page).toHaveURL(/\/recipes\/import\/ai$/);
  await expect(page.getByRole('tab', { name: 'With an AI' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  // The prompt: rules, the tag list of the database and a complete example.
  await page.getByText('Show the prompt').click();
  const prompt = page.getByRole('textbox', { name: 'Prompt' });
  await expect(prompt).toHaveValue(/Make nothing up/);
  await expect(prompt).toHaveValue(/dessert \(Dessert\)/);
  await expect(prompt).toHaveValue(/timer:1h "batter rest"/);

  // An answer with a sentence around its code block.
  const recipe = EXAMPLE_RECIPES.en.replace('servings: 4', 'servings: 4\ntags: dessert, unknown');
  await page
    .getByLabel('Answer of the AI')
    .fill(`Sure! Here is the recipe:\n\n\`\`\`markdown\n${recipe}\`\`\`\n\nEnjoy.`);
  await page.getByRole('button', { name: 'Preview' }).click();

  const item = page.getByTestId('import-item');
  await expect(item.getByRole('heading', { name: 'Salted butter crêpes' })).toBeVisible();
  await expect(item.getByRole('button', { name: 'Dessert', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(item.getByTestId('ignored-tags')).toContainText('unknown');
  await page.getByRole('button', { name: 'Save 1 recipe' }).click();

  await expect(page).toHaveURL(/\/recipes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Salted butter crêpes' })).toBeVisible();
  await expect(page.getByTitle(/batter rest/)).toBeVisible();
});

test('add a translation: prompt, live structure warnings, save, then switch languages', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'translate');
  const id = await createFrenchRecipe(page);
  await page.goto(`/recipes/${id}`);
  await expect(page.getByRole('group', { name: 'Language of the recipe' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Add a translation (English)' }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${id}/translate/en$`));

  // The prompt holds the recipe in French and asks for English.
  await page.getByText('Show the prompt').click();
  const prompt = page.getByRole('textbox', { name: 'Prompt' });
  await expect(prompt).toHaveValue(/From: French\. To: English\./);
  await expect(prompt).toHaveValue(/# Crêpes au beurre salé/);
  await expect(prompt).not.toHaveValue(/tags:/);

  // A step and a timer missing: readable warnings, live.
  const answer = page.getByLabel('Translated recipe (English)');
  await answer.fill(
    EXAMPLE_RECIPES.en
      .replace('3. Top with the rest of the butter and the sugar.\n', '')
      .replace('[1 h](timer:1h "batter rest")', 'an hour'),
  );
  await expect(page.getByText('Group 2: 2 items instead of 3.')).toBeVisible();
  await expect(page.getByText('Step 2: the timers differ from the original.')).toBeVisible();

  // The correct answer: no warning, saved, shown in English.
  await answer.fill(`\`\`\`markdown\n${EXAMPLE_RECIPES.en}\`\`\``);
  await expect(page.getByText(/instead of/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Save the translation' }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${id}\\?lang=en$`));
  await expect(page.getByRole('heading', { name: 'Salted butter crêpes' })).toBeVisible();

  const languages = page.getByRole('group', { name: 'Language of the recipe' });
  await languages.getByRole('button', { name: 'Français' }).click();
  await expect(page.getByRole('heading', { name: 'Crêpes au beurre salé' })).toBeVisible();
  await languages.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Salted butter crêpes' })).toBeVisible();

  // Editing it again starts from the saved translation; then it is deleted.
  await page.getByRole('link', { name: 'Edit the translation (English)' }).click();
  await expect(page.getByLabel('Translated recipe (English)')).toHaveValue(
    /# Salted butter crêpes/,
  );
  await page.getByRole('button', { name: 'Delete the translation' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete the translation' })
    .click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${id}$`));
  await expect(page.getByRole('heading', { name: 'Crêpes au beurre salé' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add a translation (English)' })).toBeVisible();
});

test('a structure mismatch is saved with a warning', async ({ browser, page: adminPage }) => {
  const { page } = await newMember(browser, adminPage, 'mismatch');
  const id = await createFrenchRecipe(page);
  await page.goto(`/recipes/${id}/translate/en`);
  await page
    .getByLabel('Translated recipe (English)')
    .fill(EXAMPLE_RECIPES.en.replace('3. Top with the rest of the butter and the sugar.\n', ''));
  await page.getByRole('button', { name: 'Save the translation' }).click();
  const status = page.getByRole('status').filter({ hasText: 'Translation saved' });
  await expect(status).toContainText('Group 2: 2 items instead of 3.');
  await status.getByRole('button', { name: 'Back to the recipe' }).click();
  await expect(page.getByRole('heading', { name: 'Salted butter crêpes' })).toBeVisible();
});

test('translations API: base language refused, owner only, readable with the recipe', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'trapi');
  const { page: other } = await newMember(browser, adminPage, 'trother');
  const id = await createFrenchRecipe(page);
  const url = (lang: string) => `/api/v1/recipes/${id}/translations/${lang}`;
  const put = (p: Page, lang: string) =>
    p.request.put(url(lang), { headers: ORIGIN_HEADER, data: { markdown: EXAMPLE_RECIPES.en } });

  expect((await put(page, 'fr')).status()).toBe(400);
  expect((await put(page, 'de')).status()).toBe(404);
  expect((await put(other, 'en')).status()).toBe(404);
  const invalid = await page.request.put(url('en'), {
    headers: ORIGIN_HEADER,
    data: { markdown: 'not a recipe' },
  });
  expect(invalid.status()).toBe(422);

  const saved = await put(page, 'en');
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject({ warnings: [] });

  // Private: nobody else reads it, in any language.
  expect((await other.request.get(`/api/v1/recipes/${id}?lang=en`)).status()).toBe(404);

  // Public: anyone reads it in English, or falls back to the base language.
  await page.request.put(`/api/v1/recipes/${id}/visibility`, {
    headers: ORIGIN_HEADER,
    data: { visibility: 'public' },
  });
  const visitor = await newVisitor(browser);
  const en = await (await visitor.request.get(`/api/v1/recipes/${id}?lang=en`)).json();
  expect(en).toMatchObject({
    lang: 'en',
    baseLang: 'fr',
    languages: ['fr', 'en'],
    title: 'Salted butter crêpes',
  });
  const fallback = await (await visitor.request.get(`/api/v1/recipes/${id}`)).json();
  expect(fallback).toMatchObject({ lang: 'fr', title: 'Crêpes au beurre salé' });
  expect((await visitor.request.get(`/api/v1/recipes/${id}?lang=xx`)).status()).toBe(400);

  // "Add to my library" keeps the translation.
  const copy = await other.request.post(`/api/v1/recipes/${id}/copy`, {
    headers: ORIGIN_HEADER,
    data: {},
  });
  const copyId = ((await copy.json()) as { id: string }).id;
  expect(await (await other.request.get(`/api/v1/recipes/${copyId}?lang=en`)).json()).toMatchObject(
    { lang: 'en', title: 'Salted butter crêpes' },
  );

  expect((await other.request.delete(url('en'), { headers: ORIGIN_HEADER })).status()).toBe(404);
  expect((await page.request.delete(url('en'), { headers: ORIGIN_HEADER })).status()).toBe(200);
  expect((await page.request.delete(url('en'), { headers: ORIGIN_HEADER })).status()).toBe(404);
});
