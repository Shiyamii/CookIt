import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN_STATE, newMember, newVisitor, ORIGIN_HEADER, uniqueName } from './support';

test.use({ storageState: ADMIN_STATE });

const recipe = (title: string) => `# ${title}

portions: 4

---

- 2 pommes

---

1. Cuire.
`;

/** A picture drawn by the browser (as a user's camera would give one), as file bytes. */
async function picture(page: Page, width: number, height: number, type = 'image/png') {
  if (page.url() === 'about:blank') await page.goto('/');
  const base64 = await page.evaluate(
    async ([w, h, mime]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#c0392b';
      context.fillRect(0, 0, w, h);
      context.fillStyle = '#27ae60';
      context.fillRect(0, 0, w / 2, h / 2);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), mime));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let text = '';
      for (const byte of bytes) text += String.fromCharCode(byte);
      return btoa(text);
    },
    [width, height, type] as const,
  );
  return Buffer.from(base64, 'base64');
}

/** Dimensions of a served picture, as the browser decodes it. */
async function servedSize(page: Page, url: string) {
  return page.evaluate(async (src) => {
    const bitmap = await createImageBitmap(await (await fetch(src)).blob());
    return { width: bitmap.width, height: bitmap.height };
  }, url);
}

async function createRecipe(request: APIRequestContext, title = 'Tarte fine'): Promise<string> {
  const res = await request.post('/api/v1/recipes/markdown', {
    headers: ORIGIN_HEADER,
    data: { markdown: recipe(title), lang: 'fr' },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

type Detail = { images: { id: string; url: string; thumbUrl: string }[] };

async function images(request: APIRequestContext, id: string) {
  return ((await (await request.get(`/api/v1/recipes/${id}`)).json()) as Detail).images;
}

/** Uploads a photo through the API, the way the page sends it (already resized). */
function upload(
  request: APIRequestContext,
  id: string,
  files: { image: Buffer; thumb?: Buffer; type?: string },
  headers: Record<string, string> = ORIGIN_HEADER,
) {
  const type = files.type ?? 'image/webp';
  return request.post(`/api/v1/recipes/${id}/images`, {
    headers,
    multipart: {
      image: { name: 'image', mimeType: type, buffer: files.image },
      ...(files.thumb && { thumb: { name: 'thumb', mimeType: type, buffer: files.thumb } }),
    },
  });
}

async function setVisibility(request: APIRequestContext, id: string, visibility: string) {
  const res = await request.put(`/api/v1/recipes/${id}/visibility`, {
    headers: ORIGIN_HEADER,
    data: { visibility },
  });
  expect(res.ok()).toBe(true);
}

test('the owner adds photos, picks the cover, reorders and deletes them', async ({ page }) => {
  const title = uniqueName('Tarte');
  const id = await createRecipe(page.request, title);
  await page.goto(`/recipes/${id}`);
  const files = [
    { name: 'big.png', mimeType: 'image/png', buffer: await picture(page, 2400, 1800) },
    { name: 'tall.png', mimeType: 'image/png', buffer: await picture(page, 600, 900) },
  ];
  await page.goto(`/recipes/${id}`);
  await page.getByLabel('Add photos').setInputFiles(files);
  await expect(page.getByTestId('photo')).toHaveCount(2);

  // Resized in the browser before sending: WebP, at most 1600 px, thumbnail 480 px.
  const [first, second] = await images(page.request, id);
  expect(await servedSize(page, first!.url)).toEqual({ width: 1600, height: 1200 });
  expect(await servedSize(page, first!.thumbUrl)).toEqual({ width: 480, height: 360 });
  expect(await servedSize(page, second!.url)).toEqual({ width: 600, height: 900 });
  const served = await page.request.get(first!.url);
  expect(served.headers()['content-type']).toBe('image/webp');

  // The cover is shown on the page and opens full size.
  await page.getByRole('button', { name: `Open photo 1 of 2: ${title}` }).click();
  const viewer = page.getByRole('dialog', { name: `${title}: photo 1 of 2` });
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: 'Next photo' }).click();
  await expect(page.getByRole('dialog', { name: `${title}: photo 2 of 2` })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Make cover: photo 2' }).click();
  await expect
    .poll(async () => (await images(page.request, id)).map((image) => image.id))
    .toEqual([second!.id, first!.id]);
  // The page shows the new order before the next move.
  const firstPhoto = page.getByTestId('photo').first().locator('img');
  await expect(firstPhoto).toHaveAttribute('src', second!.thumbUrl);
  await page.getByRole('button', { name: 'Move photo 1 later' }).click();
  await expect
    .poll(async () => (await images(page.request, id)).map((image) => image.id))
    .toEqual([first!.id, second!.id]);
  await expect(firstPhoto).toHaveAttribute('src', first!.thumbUrl);

  // In the list, the cover's thumbnail.
  await page.goto('/recipes');
  const card = page.getByTestId('recipe-card').filter({ hasText: title });
  await expect(card.locator('img')).toHaveAttribute('src', first!.thumbUrl);

  await page.goto(`/recipes/${id}`);
  await page.getByRole('button', { name: 'Delete photo 1' }).click();
  await expect(page.getByTestId('photo')).toHaveCount(1);
  expect((await page.request.get(first!.url)).status()).toBe(404);
});

test('a recipe photo is seen by whoever may read the recipe', async ({ browser, page }) => {
  const title = uniqueName('Galette');
  const id = await createRecipe(page.request, title);
  const webp = await picture(page, 40, 30, 'image/webp');
  expect((await upload(page.request, id, { image: webp, thumb: webp })).status()).toBe(201);
  let [image] = await images(page.request, id);
  const { page: member } = await newMember(browser, page, 'viewer');
  const visitor = await newVisitor(browser);
  const status = async (who: Page, url = image!.url) => (await who.request.get(url)).status();

  // Private: the owner only (never the SPA page for anyone else).
  const own = await page.request.get(image!.url);
  expect(own.status()).toBe(200);
  expect(own.headers()['cache-control']).toBe('private, no-cache');
  // Opened as a document, a picture can run nothing (sandboxed, no source allowed).
  expect(own.headers()['content-security-policy']).toContain("default-src 'none'");
  expect(own.headers()['content-security-policy']).toContain('sandbox');
  expect(own.headers()['x-content-type-options']).toBe('nosniff');
  expect(await status(member)).toBe(404);
  expect(await status(visitor)).toBe(404);
  expect(await status(visitor, image!.thumbUrl)).toBe(404);
  expect((await visitor.request.get(image!.url)).headers()['content-type']).not.toContain('html');

  // Unchanged picture: 304 without its bytes.
  const again = await page.request.get(image!.url, {
    headers: { 'If-None-Match': own.headers()['etag']! },
  });
  expect(again.status()).toBe(304);

  // Unlisted: the URL works like the share link. A new link gives new URLs: the old ones are
  // cut off with the old link.
  await setVisibility(page.request, id, 'unlisted');
  expect(await status(visitor)).toBe(404);
  const [shared] = await images(page.request, id);
  expect(shared!.id).not.toBe(image!.id);
  expect(await status(visitor, shared!.url)).toBe(200);
  await setVisibility(page.request, id, 'unlisted');
  expect(await status(visitor, shared!.url)).toBe(200);
  image = shared;

  // Public: anyone, kept by the browser.
  await setVisibility(page.request, id, 'public');
  const open = await visitor.request.get(image!.url);
  expect(open.status()).toBe(200);
  expect(open.headers()['cache-control']).toBe('private, max-age=31536000, immutable');
  const gallery = (await (
    await visitor.request.get(`/api/v1/gallery?q=${encodeURIComponent(title)}`)
  ).json()) as { recipes: { id: string; cover: string | null }[] };
  expect(gallery.recipes.find((recipe) => recipe.id === id)?.cover).toBe(image!.thumbUrl);

  // Back to private: gone for the others again.
  await setVisibility(page.request, id, 'private');
  expect(await status(visitor)).toBe(404);

  // "Add to my library" copies the photos; deleting the recipe deletes its own.
  await setVisibility(page.request, id, 'public');
  const copy = await member.request.post(`/api/v1/recipes/${id}/copy`, {
    headers: ORIGIN_HEADER,
    data: {},
  });
  const copyId = ((await copy.json()) as { id: string }).id;
  const [copied] = await images(member.request, copyId);
  expect(copied!.id).not.toBe(image!.id);
  await page.request.delete(`/api/v1/recipes/${id}`, { headers: ORIGIN_HEADER });
  expect(await status(page)).toBe(404);
  expect(await status(member, copied!.url)).toBe(200);
  await member.context().close();
  await visitor.context().close();
});

test('uploads that are not resized pictures are refused', async ({ browser, page }) => {
  const id = await createRecipe(page.request);
  const webp = await picture(page, 40, 30, 'image/webp');
  const png = await picture(page, 40, 30, 'image/png');
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );
  const huge = await picture(page, 1700, 100, 'image/webp');
  const jpeg = await picture(page, 40, 30, 'image/jpeg');

  const refused = async (files: Parameters<typeof upload>[2], status: number, error: string) => {
    const res = await upload(page.request, id, files);
    expect(res.status(), error).toBe(status);
    expect(((await res.json()) as { error: string }).error).toBe(error);
  };
  await refused({ image: png, thumb: png, type: 'image/webp' }, 400, 'invalid_image');
  await refused({ image: svg, thumb: webp, type: 'image/svg+xml' }, 400, 'invalid_image');
  await refused({ image: huge, thumb: webp }, 400, 'invalid_image');
  await refused({ image: webp, thumb: jpeg }, 400, 'invalid_image');
  await refused({ image: webp }, 400, 'invalid_input');
  const json = await page.request.post(`/api/v1/recipes/${id}/images`, {
    headers: ORIGIN_HEADER,
    data: { image: webp.toString('base64') },
  });
  expect(json.status()).toBe(400);

  // Six at most.
  for (let i = 0; i < 6; i++) {
    expect((await upload(page.request, id, { image: webp, thumb: webp })).status()).toBe(201);
  }
  await refused({ image: webp, thumb: webp }, 409, 'too_many_images');

  // The order must name every photo once.
  const ids = (await images(page.request, id)).map((image) => image.id);
  const order = (body: unknown) =>
    page.request.put(`/api/v1/recipes/${id}/images`, { headers: ORIGIN_HEADER, data: body });
  expect((await order({ ids: ids.slice(1) })).status()).toBe(400);
  expect((await order({ ids: [...ids.slice(1), ids[1]] })).status()).toBe(400);
  expect((await order({ ids: [...ids].reverse() })).status()).toBe(200);

  // Someone else's recipe, no account, another site.
  const { page: member } = await newMember(browser, page, 'intruder');
  expect((await upload(member.request, id, { image: webp, thumb: webp })).status()).toBe(404);
  expect(
    (
      await member.request.delete(`/api/v1/recipes/${id}/images/${ids[0]}`, {
        headers: ORIGIN_HEADER,
      })
    ).status(),
  ).toBe(404);
  const visitor = await newVisitor(browser);
  expect((await upload(visitor.request, id, { image: webp, thumb: webp })).status()).toBe(401);
  const crossSite = await upload(
    page.request,
    id,
    { image: webp, thumb: webp },
    { Origin: 'https://evil.example' },
  );
  expect(crossSite.status()).toBe(403);
  expect(await images(page.request, id)).toHaveLength(6);
  await member.context().close();
  await visitor.context().close();
});

test('a member changes their display name and profile picture', async ({
  browser,
  page: admin,
}) => {
  const { page, username } = await newMember(browser, admin, 'chef');
  await page.goto('/account/profile');
  await expect(page.getByRole('heading', { name: 'Profile', level: 1 })).toBeVisible();

  await page.getByLabel('Display name').fill('  Chef Zoé  ');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Name saved.')).toBeVisible();
  const me = async () =>
    (
      (await (await page.request.get('/api/v1/me')).json()) as {
        user: { name: string; image: string | null; username: string };
      }
    ).user;
  expect(await me()).toMatchObject({ name: 'Chef Zoé', image: null });
  expect((await me()).username.toLowerCase()).toBe(username.toLowerCase());

  // An empty name is refused before sending.
  await page.getByLabel('Display name').fill('   ');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Enter a name (100 characters at most).')).toBeVisible();

  // A picture: cropped to a square of 256 px at most, shown in the menu.
  await page.getByLabel('Add a picture').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: await picture(page, 900, 600),
  });
  await expect.poll(async () => (await me()).image).toMatch(/^\/images\/avatars\/[0-9a-f-]{36}$/);
  const image = (await me()).image!;
  expect(await servedSize(page, image)).toEqual({ width: 256, height: 256 });
  await expect(
    page.getByRole('button', { name: 'Account' }).locator(`img[src="${image}"]`),
  ).toBeVisible();

  // Others see the name and picture on the member's public recipes.
  const id = await createRecipe(page.request);
  await setVisibility(page.request, id, 'public');
  const visitor = await newVisitor(browser);
  const detail = (await (await visitor.request.get(`/api/v1/recipes/${id}`)).json()) as {
    ownerName: string;
    ownerImage: string | null;
  };
  expect(detail).toMatchObject({ ownerName: 'Chef Zoé', ownerImage: image });
  expect((await visitor.request.get(image)).status()).toBe(200);
  await visitor.goto(`/recipes/${id}`);
  await expect(visitor.getByText('By Chef Zoé')).toBeVisible();

  // A new picture replaces the old one (new URL); removing it leaves none.
  await page
    .getByLabel('Change the picture')
    .setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: await picture(page, 50, 50) });
  await expect.poll(async () => (await me()).image).not.toBe(image);
  expect((await page.request.get(image)).status()).toBe(404);
  await page.getByRole('button', { name: 'Remove' }).click();
  await expect.poll(async () => (await me()).image).toBeNull();

  // Only WebP/JPEG within the limits, only for oneself.
  const refused = await page.request.put('/api/v1/me/avatar', {
    headers: ORIGIN_HEADER,
    multipart: {
      image: { name: 'a', mimeType: 'image/png', buffer: await picture(page, 40, 40) },
    },
  });
  expect(refused.status()).toBe(400);
  const anonymous = await visitor.request.put('/api/v1/me/avatar', {
    headers: ORIGIN_HEADER,
    multipart: {
      image: {
        name: 'a',
        mimeType: 'image/webp',
        buffer: await picture(page, 40, 40, 'image/webp'),
      },
    },
  });
  expect(anonymous.status()).toBe(401);
  // Better Auth's own route still refuses the picture field.
  const direct = await page.request.post('/api/v1/auth/update-user', {
    headers: ORIGIN_HEADER,
    data: { image: 'https://evil.example/me.png' },
  });
  expect(direct.status()).toBe(400);
  expect((await me()).image).toBeNull();
  await visitor.context().close();
});

test('an unknown picture is a 404, not the app page', async ({ request }) => {
  for (const path of [
    '/images/recipes/00000000-0000-4000-8000-000000000000',
    '/images/recipes/00000000-0000-4000-8000-000000000000/thumb',
    '/images/avatars/00000000-0000-4000-8000-000000000000',
    '/images/recipes/not-an-id',
    '/images/whatever',
  ]) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(404);
    expect(res.headers()['content-type'] ?? '', path).not.toContain('html');
  }
});
