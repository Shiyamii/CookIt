import { expect, test } from '@playwright/test';
import { ADMIN_STATE, newMember, newVisitor, ORIGIN_HEADER } from './support';

// Runs alone, after the other tests (its own Playwright project): it closes the gallery to
// visitors, which the other tests rely on (the global setup opens it).

test.use({ storageState: ADMIN_STATE });

const MARKDOWN = `# Tarte des membres\n\nportions: 2\n\n---\n\n- 1 oeuf\n\n---\n\n1. Cuire.\n`;

test('a gallery for members only: visitors read no public recipe, share links still work', async ({
  browser,
  page: adminPage,
}) => {
  const setPublic = (publicGallery: boolean) =>
    adminPage.request.put('/api/v1/admin/settings', {
      data: { publicGallery },
      headers: ORIGIN_HEADER,
    });
  try {
    const author = await newMember(browser, adminPage, 'insider');
    const create = async (visibility: string) => {
      const res = await author.page.request.post('/api/v1/recipes/markdown', {
        data: { markdown: MARKDOWN, lang: 'fr' },
        headers: ORIGIN_HEADER,
      });
      const { id } = (await res.json()) as { id: string };
      const shared = await author.page.request.put(`/api/v1/recipes/${id}/visibility`, {
        data: { visibility },
        headers: ORIGIN_HEADER,
      });
      return { id, ...((await shared.json()) as { shareUrl: string | null }) };
    };
    const open = await create('public');
    const unlisted = await create('unlisted');

    // The admin closes the gallery from the settings page.
    await adminPage.goto('/admin/settings');
    const choice = adminPage.getByRole('checkbox', {
      name: 'Visitors without an account can see the gallery',
    });
    await expect(choice).toBeChecked();
    await choice.uncheck();
    await expect(adminPage.getByText('Public recipes are for members only.')).toBeVisible();
    await adminPage.reload();
    await expect(choice).not.toBeChecked();

    const visitor = await newVisitor(browser);
    const meta = await (await visitor.request.get('/api/v1/meta')).json();
    expect(meta.publicGallery).toBe(false);
    expect((await visitor.request.get(`/api/v1/recipes/${open.id}`)).status()).toBe(404);
    expect((await visitor.request.get('/api/v1/gallery')).status()).toBe(401);
    await visitor.goto('/');
    await expect(visitor.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
    await expect(visitor.getByRole('link', { name: 'Browse the gallery' })).toHaveCount(0);
    await expect(visitor.getByRole('link', { name: 'Gallery' })).toHaveCount(0);
    await visitor.goto('/gallery');
    await expect(visitor.getByText('The gallery of this site is for its members.')).toBeVisible();

    // A share link is an explicit share: it still works without an account.
    await visitor.goto(unlisted.shareUrl ?? '');
    await expect(visitor.getByRole('heading', { name: 'Tarte des membres' })).toBeVisible();

    // Members still read public recipes and the gallery.
    const reader = await newMember(browser, adminPage, 'insider');
    expect((await reader.page.request.get(`/api/v1/recipes/${open.id}`)).status()).toBe(200);
    expect((await reader.page.request.get('/api/v1/gallery')).status()).toBe(200);

    // Open again: visitors read it.
    await choice.check();
    await expect(adminPage.getByText('Public recipes are readable by anyone.')).toBeVisible();
    expect((await visitor.request.get(`/api/v1/recipes/${open.id}`)).status()).toBe(200);
  } finally {
    expect((await setPublic(true)).ok()).toBe(true);
  }
});

test('only an admin changes the site settings', async ({ browser, page: adminPage }) => {
  const member = await newMember(browser, adminPage, 'nosy');
  const answer = await member.page.request.put('/api/v1/admin/settings', {
    data: { publicGallery: false },
    headers: ORIGIN_HEADER,
  });
  expect(answer.status()).toBe(403);
  expect((await member.page.request.get('/api/v1/admin/settings')).status()).toBe(403);
  const invalid = await adminPage.request.put('/api/v1/admin/settings', {
    data: { publicGallery: 'no', extra: 1 },
    headers: ORIGIN_HEADER,
  });
  expect(invalid.status()).toBe(400);
});
