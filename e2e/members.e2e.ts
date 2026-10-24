import { expect, test, type APIRequestContext } from '@playwright/test';
import { ADMIN_STATE, newMember, newVisitor, ORIGIN_HEADER, userId } from './support';

test.use({ storageState: ADMIN_STATE });

const MARKDOWN = (title: string) =>
  `# ${title}\n\nportions: 2\n\n---\n\n- 1 oeuf\n\n---\n\n1. Cuire.\n`;

async function createRecipe(request: APIRequestContext, title: string, visibility: string) {
  const res = await request.post('/api/v1/recipes/markdown', {
    data: { markdown: MARKDOWN(title), lang: 'fr' },
    headers: ORIGIN_HEADER,
  });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  const shared = await request.put(`/api/v1/recipes/${id}/visibility`, {
    data: { visibility },
    headers: ORIGIN_HEADER,
  });
  expect(shared.ok()).toBe(true);
  return id;
}

const listedNames = async (request: APIRequestContext) =>
  ((await (await request.get('/api/v1/members')).json()) as { username: string }[]).map(
    (member) => member.username,
  );

test('members choose to appear in the list; any member page shows their public recipes', async ({
  browser,
  page: adminPage,
}) => {
  const author = await newMember(browser, adminPage, 'listed');
  const reader = await newMember(browser, adminPage, 'looker');
  const shown = await createRecipe(author.page.request, 'Tarte du membre', 'public');
  await createRecipe(author.page.request, 'Tarte secrète', 'private');

  // Not in the list until they choose to be.
  expect(await listedNames(reader.page.request)).not.toContain(author.username);
  await author.page.goto('/account/profile');
  const choice = author.page.getByRole('checkbox', { name: 'Appear in the members list' });
  await expect(choice).not.toBeChecked();
  await choice.check();
  await expect(choice).toBeChecked();
  await author.page.reload();
  await expect(choice).toBeChecked();

  // In the list, found by search, with their public recipes only.
  await reader.page.goto('/members');
  await reader.page.getByRole('searchbox', { name: 'Find a member' }).fill(author.username);
  const card = reader.page.getByTestId('member-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('1 public recipe');
  await card.click();
  await expect(reader.page).toHaveURL(new RegExp(`/members/${author.username}$`, 'i'));
  await expect(reader.page.getByRole('heading', { name: author.username, level: 1 })).toBeVisible();
  await expect(reader.page.getByTestId('recipe-card')).toHaveCount(1);
  await expect(reader.page.getByTestId('recipe-card')).toContainText('Tarte du membre');

  // From a recipe, its author's page.
  await reader.page.goto(`/recipes/${shown}`);
  await reader.page.getByRole('link', { name: `By ${author.username}` }).click();
  await expect(reader.page).toHaveURL(new RegExp(`/members/${author.username}$`, 'i'));

  // An admin takes them out of the list: their page still opens from their recipes.
  await adminPage.goto('/admin/users');
  const row = adminPage.getByTestId('user-row').filter({ hasText: `@${author.username}` });
  await expect(row.getByText('In the members list')).toBeVisible();
  await row.getByRole('button', { name: 'Take out of the members list' }).click();
  await expect(row.getByRole('button', { name: 'Put in the members list' })).toBeVisible();
  expect(await listedNames(reader.page.request)).not.toContain(author.username);
  const page = await (await reader.page.request.get(`/api/v1/members/${author.username}`)).json();
  expect(page).toMatchObject({ username: author.username, publicRecipes: 1 });
  expect(page).not.toHaveProperty('listed');

  // The user sees the change in their profile.
  await author.page.reload();
  await expect(choice).not.toBeChecked();
});

test('members are for signed-in users; disabled and unknown accounts have no page', async ({
  browser,
  page: adminPage,
}) => {
  const member = await newMember(browser, adminPage, 'hidden');
  // Neither listed nor with a public recipe: no page for others (guessing tells nothing).
  expect((await adminPage.request.get(`/api/v1/members/${member.username}`)).status()).toBe(404);
  const own = await (await member.page.request.get(`/api/v1/members/${member.username}`)).json();
  expect(own).toMatchObject({ username: member.username, listed: false });
  const visitor = await newVisitor(browser);
  expect((await visitor.request.get('/api/v1/members')).status()).toBe(401);
  expect((await visitor.request.get(`/api/v1/members/${member.username}`)).status()).toBe(401);
  expect((await visitor.request.get('/api/v1/me/listed')).status()).toBe(401);
  await visitor.goto('/members');
  await expect(visitor).toHaveURL(/\/login/);

  const listed = await member.page.request.put('/api/v1/me/listed', {
    data: { listed: 'yes' },
    headers: ORIGIN_HEADER,
  });
  expect(listed.status()).toBe(400);

  // Disabled: in no list, no page.
  await member.page.request.put('/api/v1/me/listed', {
    data: { listed: true },
    headers: ORIGIN_HEADER,
  });
  const id = await userId(adminPage, member.username);
  await adminPage.request.post(`/api/v1/admin/users/${id}/disable`, { headers: ORIGIN_HEADER });
  expect(await listedNames(adminPage.request)).not.toContain(member.username);
  expect((await adminPage.request.get(`/api/v1/members/${member.username}`)).status()).toBe(404);
  expect((await adminPage.request.get('/api/v1/members/nobody_here')).status()).toBe(404);
  expect((await adminPage.request.get('/api/v1/members/not%20a%20name')).status()).toBe(404);
});
