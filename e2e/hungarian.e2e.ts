import { expect, test } from '@playwright/test';
import { ADMIN_STATE, newMember, ORIGIN_HEADER } from './support';

test.use({ storageState: ADMIN_STATE });

const LECSO = `# Lecsó

> Nyári egytálétel.

adag: 4

---

- 50 dkg paprika
- 2 fej vöröshagyma
- 3 ek olaj
- 4 tojás

---

1. Pirítsd üvegesre a hagymát [10 percig](timer:10m "hagyma").
2. Add hozzá a paprikát, és párold [15 percig](timer:15m).
`;

test('the interface in Hungarian is kept in the profile', async ({ browser, page: adminPage }) => {
  const { page } = await newMember(browser, adminPage, 'magyar');
  await page.goto('/recipes');
  await page.getByRole('button', { name: 'Language' }).click();
  await page.getByRole('menuitemradio', { name: 'Magyar' }).click();
  await expect(page.getByRole('heading', { name: 'Receptjeim' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
  await expect
    .poll(
      async () =>
        (
          (await (await page.request.get('/api/v1/me')).json()) as {
            user: { locale: string };
          }
        ).user.locale,
    )
    .toBe('hu');

  // Another browser of the same account opens in Hungarian, whatever it chose before.
  const context = await browser.newContext({ storageState: await page.context().storageState() });
  const other = await context.newPage();
  await other.addInitScript(() => localStorage.setItem('cookit.locale', 'en'));
  await other.goto('/recipes');
  await expect(other.getByRole('heading', { name: 'Receptjeim' })).toBeVisible();
  await context.close();
});

test('a Hungarian recipe is read, scaled and found by its inflected words', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'lecso');
  const created = await page.request.post('/api/v1/recipes/markdown', {
    headers: ORIGIN_HEADER,
    data: { markdown: LECSO, lang: 'hu' },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  const detail = (await (await page.request.get(`/api/v1/recipes/${id}`)).json()) as {
    lang: string;
    servings: number;
    title: string;
  };
  expect(detail).toMatchObject({ lang: 'hu', servings: 4, title: 'Lecsó' });

  // Hungarian stemming: `tojást` (accusative) finds `tojás`, `paprikát` finds `paprika`.
  for (const query of ['tojást', 'paprikát', 'lecso']) {
    const found = (await (
      await page.request.get(`/api/v1/recipes?q=${encodeURIComponent(query)}`)
    ).json()) as { recipes: { id: string }[] };
    expect(
      found.recipes.map((item) => item.id),
      query,
    ).toContain(id);
  }

  await page.goto(`/recipes/${id}`);
  await page.getByRole('button', { name: 'More servings' }).click();
  await page.getByRole('button', { name: 'More servings' }).click();
  // 6 servings: × 1.5, Hungarian decimal comma for the oil, units kept as written.
  await expect(page.getByText('75 dkg paprika')).toBeVisible();
  await expect(page.getByText('3 fej vöröshagyma')).toBeVisible();
  await expect(page.getByText('4 ½ ek olaj')).toBeVisible();
});

test('the starting units and tags have Hungarian names', async ({ request }) => {
  const units = (await (await request.get('/api/v1/units')).json()) as {
    slug: string;
    labels: Record<string, string>;
    aliases: Record<string, string[]>;
  }[];
  const bySlug = new Map(units.map((unit) => [unit.slug, unit]));
  expect(bySlug.get('dkg')?.labels.hu).toBe('dekagramm');
  expect(bySlug.get('cuillere-a-soupe')?.aliases.hu).toContain('ek');
  expect(bySlug.get('tete')?.aliases.hu).toEqual(['fej']);

  const categories = (await (await request.get('/api/v1/tags')).json()) as {
    slug: string;
    labels: Record<string, string>;
    tags: { slug: string }[];
  }[];
  const cuisine = categories.find((category) => category.slug === 'cuisine');
  expect(cuisine?.labels.hu).toBe('Konyha');
  expect(cuisine?.tags.map((tag) => tag.slug)).toContain('hongroise');
});
