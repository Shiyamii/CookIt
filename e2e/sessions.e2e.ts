import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  ADMIN,
  ADMIN_STATE,
  BASE_URL,
  createInvite,
  newAnonymousContext,
  newMember,
  newVisitor,
  ORIGIN_HEADER,
  PASSWORD,
  signIn,
  tokenOf,
  uniqueName,
  userId,
} from './support';

async function me(request: APIRequestContext) {
  return ((await (await request.get('/api/v1/me')).json()) as { user: Record<string, unknown> })
    .user;
}

test.describe('sign-in', () => {
  test.use({ storageState: ADMIN_STATE });

  test('works with the email as well as the username', async ({ page, browser }) => {
    const member = await newMember(browser, page, 'bymail');
    const visitor = await newVisitor(browser);
    await signIn(visitor, member.email, PASSWORD);
    await expect(visitor.getByRole('button', { name: 'Account' })).toBeVisible();
    expect((await me(visitor.request))?.username).toBe(member.username);
  });

  test('ignores the case of the username and of the email', async ({ page, browser }) => {
    const member = await newMember(browser, page, 'casing');
    for (const [route, body] of [
      ['username', { username: member.username.toUpperCase(), password: PASSWORD }],
      ['email', { email: member.email.toUpperCase(), password: PASSWORD }],
    ] as const) {
      const visitor = await newVisitor(browser);
      const res = await visitor.request.post(`/api/v1/auth/sign-in/${route}`, {
        data: body,
        headers: ORIGIN_HEADER,
      });
      expect(res.status(), route).toBe(200);
      expect((await me(visitor.request))?.username, route).toBe(member.username);
    }
  });

  test('a wrong password with an email gets the email wording', async ({ page, browser }) => {
    const member = await newMember(browser, page, 'wrongmail');
    const visitor = await newVisitor(browser);
    await signIn(visitor, member.email, 'not the right password');
    await expect(visitor.getByRole('alert')).toHaveText('Wrong email or password.');
  });

  test('a signed-in user visiting the sign-in page is sent home', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { name: 'Welcome to CookIt' })).toBeVisible();
  });
});

test.describe('sign-in redirect', () => {
  test('goes back to the page that asked for a sign-in', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin%2Fusers$/);
    await page.getByLabel('Username or email').fill(ADMIN.username);
    await page.getByLabel('Password').fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL('/admin/users');
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  });

  test.describe('with a member', () => {
    test.use({ storageState: ADMIN_STATE });

    test('never leaves the site', async ({ page, browser }) => {
      const member = await newMember(browser, page, 'redirect');
      for (const target of ['//evil.example', 'https://evil.example', 'javascript:alert(1)']) {
        const visitor = await newVisitor(browser);
        await visitor.goto(`/login?redirect=${encodeURIComponent(target)}`);
        await visitor.getByLabel('Username or email').fill(member.username);
        await visitor.getByLabel('Password').fill(PASSWORD);
        await visitor.getByRole('button', { name: 'Sign in', exact: true }).click();
        await expect(visitor.getByRole('button', { name: 'Account' })).toBeVisible();
        expect(visitor.url(), target).toBe(`${BASE_URL}/`);
        await visitor.context().close();
      }
    });
  });
});

test.describe('sign-out', () => {
  test.use({ storageState: ADMIN_STATE });

  test('the account menu signs out and ends the session on the server', async ({
    page,
    browser,
  }) => {
    const member = await newMember(browser, page, 'leaver');
    const cookies = await member.page.context().cookies();
    await member.page.goto('/');
    await member.page.getByRole('button', { name: 'Account' }).click();
    await member.page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(member.page).toHaveURL('/login');
    await expect(member.page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    expect(await me(member.page.request)).toBeNull();

    // The old session cookie, replayed from elsewhere, is dead too.
    const replay = await newAnonymousContext(browser);
    await replay.addCookies(cookies);
    expect(await me(replay.request)).toBeNull();
    await replay.close();
  });
});

test.describe('profile', () => {
  test.use({ storageState: ADMIN_STATE });

  test('/api/v1/me returns exactly the public fields of the signed-in user', async ({
    page,
    browser,
  }) => {
    const visitor = await newVisitor(browser);
    const username = uniqueName('Mixed');
    const res = await visitor.request.post('/api/v1/register', {
      data: {
        token: tokenOf(await createInvite(page)),
        username,
        email: `${username}@Example.com`,
        name: '  Chef Example  ',
        password: PASSWORD,
        locale: 'fr',
      },
      headers: ORIGIN_HEADER,
    });
    expect(res.ok()).toBe(true);
    expect(await me(visitor.request)).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
      name: 'Chef Example',
      email: `${username.toLowerCase()}@example.com`,
      username,
      role: 'user',
      locale: 'fr',
      image: null,
    });
    expect(await me(page.context().request)).toMatchObject({
      username: ADMIN.username,
      role: 'admin',
    });
  });

  test('update-user only accepts the name and the language', async ({ page, browser }) => {
    const member = await newMember(browser, page, 'profile');
    const update = (data: unknown) =>
      member.page.request.post('/api/v1/auth/update-user', { data, headers: ORIGIN_HEADER });

    for (const data of [
      { username: uniqueName('renamed') },
      { displayUsername: 'e2e_admin' },
      { image: 'https://example.com/me.png' },
      { role: 'admin' },
      { name: 'Ok', role: 'admin' },
      { disabledAt: null },
      { email: 'other@example.com' },
      { locale: 'de' },
      { name: 'x'.repeat(101) },
    ]) {
      const res = await update(data);
      expect(res.status(), JSON.stringify(data)).toBe(400);
    }
    expect(await me(member.page.request)).toMatchObject({
      username: member.username,
      name: member.username,
      role: 'user',
      locale: 'en',
    });

    expect((await update({ name: 'New Name', locale: 'fr' })).status()).toBe(200);
    expect(await me(member.page.request)).toMatchObject({
      username: member.username,
      name: 'New Name',
      role: 'user',
      locale: 'fr',
    });
  });

  test('the language chosen while signed in follows the user to another browser', async ({
    page,
    browser,
  }) => {
    const member = await newMember(browser, page, 'polyglot');
    await member.page.goto('/');
    await expect(member.page.getByRole('heading', { name: 'Welcome to CookIt' })).toBeVisible();
    const saved = member.page.waitForResponse((res) =>
      res.url().endsWith('/api/v1/auth/update-user'),
    );
    await member.page.getByRole('button', { name: 'Language' }).click();
    await member.page.getByRole('menuitemradio', { name: 'Français' }).click();
    expect((await saved).status()).toBe(200);
    expect((await me(member.page.request))?.locale).toBe('fr');

    const elsewhere = await newVisitor(browser);
    const signIn = await elsewhere.request.post('/api/v1/auth/sign-in/username', {
      data: { username: member.username, password: PASSWORD },
      headers: ORIGIN_HEADER,
    });
    expect(signIn.ok()).toBe(true);
    await elsewhere.goto('/');
    await expect(elsewhere.getByRole('heading', { name: 'Bienvenue sur CookIt' })).toBeVisible();
    await expect(elsewhere.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('signed out, a language choice stays in the browser and the profile wins at sign-in', async ({
    page,
    browser,
  }) => {
    const member = await newMember(browser, page, 'english');
    const visitor = await newVisitor(browser);
    let profileUpdates = 0;
    visitor.on('request', (req) => {
      if (req.url().endsWith('/api/v1/auth/update-user')) profileUpdates += 1;
    });
    await visitor.goto('/');
    await visitor.getByRole('button', { name: 'Language' }).click();
    await visitor.getByRole('menuitemradio', { name: 'Français' }).click();
    await expect(visitor.getByRole('heading', { name: 'Bienvenue sur CookIt' })).toBeVisible();

    const res = await visitor.request.post('/api/v1/auth/sign-in/username', {
      data: { username: member.username, password: PASSWORD },
      headers: ORIGIN_HEADER,
    });
    expect(res.ok()).toBe(true);
    await visitor.goto('/');
    await expect(visitor.getByRole('heading', { name: 'Welcome to CookIt' })).toBeVisible();
    expect(profileUpdates).toBe(0);
    expect((await me(visitor.request))?.locale).toBe('en');
  });
});

test.describe('disabled accounts', () => {
  test.use({ storageState: ADMIN_STATE });

  test('their session no longer works on any account route', async ({ page, browser }) => {
    const member = await newMember(browser, page, 'frozen');
    const disable = await page.request.post(
      `/api/v1/admin/users/${await userId(page, member.username)}/disable`,
      { headers: ORIGIN_HEADER },
    );
    expect(disable.status()).toBe(200);

    const request = member.page.request;
    const session = await request.get('/api/v1/auth/get-session');
    expect(session.status()).toBe(200);
    expect(await session.json()).toBeNull();
    expect((await request.get('/api/v1/auth/list-sessions')).status()).toBe(401);
    for (const [path, data] of [
      ['/api/v1/auth/change-password', { currentPassword: PASSWORD, newPassword: `${PASSWORD}2` }],
      ['/api/v1/auth/update-user', { name: 'Still here' }],
      ['/api/v1/auth/revoke-other-sessions', {}],
    ] as const) {
      const res = await request.post(path, { data, headers: ORIGIN_HEADER });
      expect(res.status(), path).toBe(401);
    }
  });

  test('signing in by email is refused with the same message as a wrong password', async ({
    page,
    browser,
  }) => {
    const member = await newMember(browser, page, 'frozenmail');
    await page.request.post(`/api/v1/admin/users/${await userId(page, member.username)}/disable`, {
      headers: ORIGIN_HEADER,
    });
    const visitor = await newVisitor(browser);
    await signIn(visitor, member.email, PASSWORD);
    await expect(visitor.getByRole('alert')).toHaveText('Wrong email or password.');
    expect(await me(visitor.request)).toBeNull();
  });
});

test.describe('cross-site request protection', () => {
  test.use({ storageState: ADMIN_STATE });

  test('state-changing requests without our Origin are refused', async ({ page }) => {
    const request = page.request;
    const variants: Record<string, string>[] = [
      {},
      { Origin: 'null' },
      { Origin: `${BASE_URL}.evil.example` },
    ];
    for (const headers of variants) {
      const signIn = await request.post('/api/v1/auth/sign-in/username', {
        data: { username: ADMIN.username, password: ADMIN.password },
        headers,
      });
      expect(signIn.status(), JSON.stringify(headers)).toBe(403);
      const invite = await request.post('/api/v1/admin/invites', { data: {}, headers });
      expect(invite.status(), JSON.stringify(headers)).toBe(403);
    }
    // Reading stays possible without an Origin.
    expect((await request.get('/api/v1/admin/invites')).status()).toBe(200);
  });
});

test.describe('security headers', () => {
  test('the SPA and the API are served with a strict CSP', async ({ request }) => {
    for (const path of ['/', '/login', '/api/v1/meta']) {
      const res = await request.get(path);
      const headers = res.headers();
      const csp = headers['content-security-policy'] ?? '';
      expect(csp, path).toContain("default-src 'self'");
      expect(csp, path).toContain("script-src 'self'");
      expect(csp, path).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/);
      expect(csp, path).toContain("object-src 'none'");
      expect(csp, path).toContain("frame-ancestors 'none'");
      expect(headers['x-content-type-options'], path).toBe('nosniff');
      expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    }
  });

  test.describe('signed in as admin', () => {
    test.use({ storageState: ADMIN_STATE });

    test('pages load without any CSP violation', async ({ page }) => {
      const violations: string[] = [];
      page.on('console', (message) => {
        if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
      });
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          console.error(`Content Security Policy violation: ${event.violatedDirective}`);
        });
      });
      for (const path of [
        '/',
        '/admin/invites',
        '/admin/users',
        '/admin/tags',
        '/admin/units',
        '/account/profile',
        '/account/security',
        '/account/notifications',
        '/recipes',
        '/gallery',
        // Lazily loaded pages (their own chunks).
        '/recipes/new',
        '/recipes/new/editor',
        '/recipes/new/wizard',
        '/recipes/import',
        '/recipes/import/ai',
        '/cook',
        // Unknown recipe: the translation page's chunk still loads (then "not found").
        '/recipes/00000000-0000-4000-8000-000000000000/translate/en',
        '/some/unknown/route',
      ]) {
        await page.goto(path);
        await page.getByRole('heading').first().waitFor();
      }
      await page.getByRole('button', { name: 'Account' }).click();
      await page.getByRole('menuitem', { name: 'Invitations' }).waitFor();
      await page.keyboard.press('Escape');
      expect(violations).toEqual([]);
    });
  });
});
