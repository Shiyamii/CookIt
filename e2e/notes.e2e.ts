import { expect, test, type APIRequestContext } from '@playwright/test';
import { ADMIN_STATE, newMember, newVisitor, ORIGIN_HEADER, uniqueName } from './support';

test.use({ storageState: ADMIN_STATE });

const recipe = (title: string, extra = '') =>
  `# ${title}\n\n> Une description assez longue.\n\n${extra}portions: 4\n\n---\n\n- 2 oeufs\n\n---\n\n1. Cuire.\n`;

async function createRecipe(request: APIRequestContext, markdown: string): Promise<string> {
  const res = await request.post('/api/v1/recipes/markdown', {
    headers: ORIGIN_HEADER,
    data: { markdown, lang: 'fr' },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

test('lists show the title, description and summary in the interface language', async ({
  browser,
  page: admin,
}) => {
  const { page } = await newMember(browser, admin, 'polyglot');
  const french = uniqueName('Tarte');
  const english = uniqueName('Pie');
  const id = await createRecipe(page.request, recipe(french, 'résumé: Une tarte du dimanche.\n'));
  const translated = await page.request.put(`/api/v1/recipes/${id}/translations/en`, {
    headers: ORIGIN_HEADER,
    data: {
      markdown: `# ${english}\n\n> A long enough description.\n\nsummary: A Sunday pie.\nservings: 4\n\n---\n\n- 2 eggs\n\n---\n\n1. Bake.\n`,
    },
  });
  expect(translated.status()).toBe(200);

  // The interface is in English: the English title and summary.
  await page.goto('/recipes');
  const card = page.getByTestId('recipe-card').filter({ hasText: english });
  await expect(card).toContainText('A Sunday pie.');
  await expect(page.getByTestId('recipe-card').filter({ hasText: french })).toHaveCount(0);

  // The API: the language asked for, else the base language; searched in both.
  const list = async (query: string) =>
    (
      (await (await page.request.get(`/api/v1/recipes?${query}`)).json()) as {
        recipes: { id: string; title: string; summary: string; lang: string }[];
      }
    ).recipes.find((item) => item.id === id);
  expect(await list('lang=en')).toMatchObject({
    title: english,
    summary: 'A Sunday pie.',
    lang: 'en',
  });
  expect(await list('lang=fr')).toMatchObject({ title: french, lang: 'fr' });
  expect(await list('lang=hu')).toMatchObject({ title: french, lang: 'fr' });
  expect(await list(`lang=en&q=${encodeURIComponent(english)}`)).toBeDefined();
  expect(await list(`lang=en&q=${encodeURIComponent(french)}`)).toBeDefined();
  expect((await page.request.get('/api/v1/recipes?lang=de')).status()).toBe(400);
});

test('the summary: in the markdown, the visual editor, the cards and the recipe page', async ({
  browser,
  page: admin,
}) => {
  const { page } = await newMember(browser, admin, 'summary');
  const title = uniqueName('Gratin');
  const id = await createRecipe(page.request, recipe(title, 'résumé: Fondant et doré.\n'));
  await page.goto(`/recipes/${id}`);
  await expect(page.getByText('Fondant et doré.')).toBeVisible();

  await page.goto(`/recipes/${id}/edit`);
  const field = page.getByLabel('Summary');
  await expect(field).toHaveValue('Fondant et doré.');
  await field.fill('Le gratin des soirs pressés.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(`/recipes/${id}`);
  await expect(page.getByText('Le gratin des soirs pressés.')).toBeVisible();
  await page.goto('/recipes');
  await expect(page.getByTestId('recipe-card').filter({ hasText: title })).toContainText(
    'Le gratin des soirs pressés.',
  );

  // Too long: refused with its own message.
  const long = await page.request.post('/api/v1/recipes/markdown', {
    headers: ORIGIN_HEADER,
    data: { markdown: recipe(uniqueName('Long'), `résumé: ${'x'.repeat(161)}\n`), lang: 'fr' },
  });
  expect(long.status()).toBe(422);
  expect(JSON.stringify(await long.json())).toContain('summary_too_long');
});

test('notes: the author’s for every reader, a private one for each reader', async ({
  browser,
  page: admin,
}) => {
  const { page: author } = await newMember(browser, admin, 'author');
  const title = uniqueName('Soupe');
  const id = await createRecipe(author.request, recipe(title));
  await author.goto(`/recipes/${id}`);
  await author.getByRole('button', { name: 'Add a word from the author' }).click();
  await author
    .getByRole('textbox', { name: 'A word from the author' })
    .fill('La soupe de ma grand-mère.');
  await author.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(author.getByRole('region', { name: 'A word from the author' })).toContainText(
    'La soupe de ma grand-mère.',
  );
  await author.getByRole('button', { name: 'Add a note' }).click();
  await author.getByRole('textbox', { name: 'My note' }).fill('Plus de poivre.');
  await author.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(author.getByRole('region', { name: 'My note' })).toContainText('Plus de poivre.');

  // A private recipe: nobody else can note it.
  const { page: reader } = await newMember(browser, admin, 'reader');
  const note = (text: string) =>
    reader.request.put(`/api/v1/recipes/${id}/note`, { headers: ORIGIN_HEADER, data: { text } });
  expect((await note('x')).status()).toBe(404);

  // Public: the reader sees the author's note, not the author's private one, and writes theirs.
  await author.request.put(`/api/v1/recipes/${id}/visibility`, {
    headers: ORIGIN_HEADER,
    data: { visibility: 'public' },
  });
  await reader.goto(`/recipes/${id}`);
  await expect(reader.getByRole('region', { name: 'A word from the author' })).toContainText(
    'La soupe de ma grand-mère.',
  );
  await expect(reader.getByText('Plus de poivre.')).toHaveCount(0);
  await expect(reader.getByRole('button', { name: 'Add a word from the author' })).toHaveCount(0);
  await reader.getByRole('button', { name: 'Add a note' }).click();
  await reader.getByRole('textbox', { name: 'My note' }).fill('Trop salée pour moi.');
  await reader.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(reader.getByRole('region', { name: 'My note' })).toContainText(
    'Trop salée pour moi.',
  );

  // Each one's note stays theirs; the author's note is the owner's only.
  await author.reload();
  await expect(author.getByText('Trop salée pour moi.')).toHaveCount(0);
  const hijack = await reader.request.put(`/api/v1/recipes/${id}/author-note`, {
    headers: ORIGIN_HEADER,
    data: { text: 'Piraté' },
  });
  expect(hijack.status()).toBe(404);

  // Signed out: the author's note only.
  const visitor = await newVisitor(browser);
  await visitor.goto(`/recipes/${id}`);
  await expect(visitor.getByText('La soupe de ma grand-mère.')).toBeVisible();
  await expect(visitor.getByRole('region', { name: 'My note' })).toHaveCount(0);
  expect(
    (
      await visitor.request.put(`/api/v1/recipes/${id}/note`, {
        headers: ORIGIN_HEADER,
        data: { text: 'x' },
      })
    ).status(),
  ).toBe(401);
  await visitor.context().close();

  // Removing a note.
  await reader.getByRole('button', { name: 'Edit' }).last().click();
  await reader.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(reader.getByRole('button', { name: 'Add a note' })).toBeVisible();
  expect((await note('y'.repeat(2001))).status()).toBe(400);
});
