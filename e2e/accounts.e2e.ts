import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  ADMIN_STATE,
  cli,
  createInvite,
  createResetLink,
  newAnonymousContext,
  newMember,
  newVisitor,
  ORIGIN_HEADER,
  PASSWORD,
  registerWithApi,
  signIn,
  signUp,
  tokenOf,
  uniqueName,
  userId,
} from './support';

const BAD_TOKEN = 'A'.repeat(43);
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

/** Whether an invitation link can still be used (the check the sign-up page does). */
async function inviteUsable(request: APIRequestContext, url: string): Promise<boolean> {
  const res = await request.post('/api/v1/invites/check', {
    data: { token: tokenOf(url) },
    headers: ORIGIN_HEADER,
  });
  return res.ok();
}

/** Whether a password reset link can still be used. */
async function resetLinkUsable(request: APIRequestContext, url: string): Promise<boolean> {
  const res = await request.post('/api/v1/password-reset/check', {
    data: { token: tokenOf(url) },
    headers: ORIGIN_HEADER,
  });
  return res.ok();
}

test.describe('sign-up requires a valid invitation', () => {
  test('the API refuses an unknown token and requests from another origin', async ({ request }) => {
    const body = {
      token: BAD_TOKEN,
      username: uniqueName('nobody'),
      email: 'nobody@example.com',
      password: PASSWORD,
      locale: 'en',
    };
    const forged = await request.post('/api/v1/register', { data: body, headers: ORIGIN_HEADER });
    expect(forged.status()).toBe(400);
    expect(await forged.json()).toEqual({ error: 'invalid_token' });

    const crossSite = await request.post('/api/v1/register', {
      data: body,
      headers: { Origin: 'https://evil.example' },
    });
    expect(crossSite.status()).toBe(403);

    // Better Auth's own sign-up route is not reachable.
    const native = await request.post('/api/v1/auth/sign-up/email', {
      data: { email: 'x@example.com', password: PASSWORD, name: 'x' },
      headers: ORIGIN_HEADER,
    });
    expect(native.status()).toBe(404);
  });

  test('an invalid or missing link shows an error page', async ({ page }) => {
    for (const path of [`/invite#token=${BAD_TOKEN}`, '/invite', `/setup#token=${BAD_TOKEN}`]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'This link does not work' })).toBeVisible();
    }
  });

  test('no new first-admin link once an admin exists', () => {
    const result = cli('setup-link');
    expect(result.ok).toBe(false);
    expect(result.output).toContain('already exists');
  });
});

test.describe('signed-out visitors', () => {
  test('admin pages send to the sign-in page', async ({ page }) => {
    await page.goto('/admin/invites');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fadmin%2Finvites$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('a wrong password is refused', async ({ page }) => {
    await signIn(page, 'e2e_admin', 'not the right password');
    await expect(page.getByRole('alert')).toHaveText('Wrong username or password.');
  });

  test('admin API routes require a session', async ({ request }) => {
    expect((await request.get('/api/v1/admin/users')).status()).toBe(401);
    expect((await request.get('/api/v1/admin/invites')).status()).toBe(401);
  });
});

test.describe('invitations (admin)', () => {
  test.use({ storageState: ADMIN_STATE });

  test('an invitation created in the admin page works exactly once', async ({ page, browser }) => {
    const label = uniqueName('guest');
    await page.goto('/admin/invites');
    await page.getByLabel('Note').fill(label);
    await page.getByRole('button', { name: 'Create an invitation' }).click();
    const link = await page.getByRole('textbox', { name: 'Invitation link' }).inputValue();
    expect(link).toMatch(/\/invite#token=[A-Za-z0-9_-]{43}$/);
    await expect(page.getByTestId('invite-row').filter({ hasText: label })).toContainText(
      'Pending',
    );

    const visitor = await newVisitor(browser);
    const username = uniqueName('guest');
    await signUp(visitor, link, username);
    await expect(visitor.getByRole('heading', { name: /^Hello, / })).toBeVisible();
    await expect(visitor.getByRole('button', { name: 'Account' })).toBeVisible();

    // Used: the same link no longer works, even in another browser.
    const other = await newVisitor(browser);
    await other.goto(link);
    await expect(other.getByRole('heading', { name: 'This link does not work' })).toBeVisible();

    await page.reload();
    const row = page.getByTestId('invite-row').filter({ hasText: label });
    await expect(row).toContainText('Used');
    await expect(row).toContainText(username);
  });

  test('a revoked invitation no longer works', async ({ page, browser }) => {
    const label = uniqueName('revoked');
    const link = await createInvite(page, label);
    await page.goto('/admin/invites');
    const row = page.getByTestId('invite-row').filter({ hasText: label });
    await row.getByRole('button', { name: 'Revoke' }).click();
    await expect(row).toContainText('Revoked');

    const visitor = await newVisitor(browser);
    await visitor.goto(link);
    await expect(visitor.getByRole('heading', { name: 'This link does not work' })).toBeVisible();
    const res = await visitor.request.post('/api/v1/register', {
      data: {
        token: link.split('#token=')[1],
        username: uniqueName('late'),
        email: 'late@example.com',
        password: PASSWORD,
        locale: 'en',
      },
      headers: ORIGIN_HEADER,
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('users (admin)', () => {
  test.use({ storageState: ADMIN_STATE });

  test('admin pages never scroll sideways, even with long names', async ({ page, browser }) => {
    const visitor = await newVisitor(browser);
    await registerWithApi(
      visitor.request,
      await createInvite(page, 'x'.repeat(100)),
      uniqueName('a'.repeat(15)),
    );
    for (const path of ['/admin/users', '/admin/invites']) {
      await page.goto(path);
      await page.getByRole('list').first().waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test('a regular user cannot use admin pages or routes', async ({ page, browser }) => {
    const visitor = await newVisitor(browser);
    await registerWithApi(visitor.request, await createInvite(page), uniqueName('plain'));
    expect((await visitor.request.get('/api/v1/admin/users')).status()).toBe(403);
    const invite = await visitor.request.post('/api/v1/admin/invites', {
      data: {},
      headers: ORIGIN_HEADER,
    });
    expect(invite.status()).toBe(403);
    await visitor.goto('/admin/users');
    await expect(visitor.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('disable, enable, reset the password and delete a user', async ({ page, browser }) => {
    const username = uniqueName('member');
    const member = await newVisitor(browser);
    await registerWithApi(member.request, await createInvite(page), username);

    await page.goto('/admin/users');
    const row = page.getByTestId('user-row').filter({ hasText: `@${username}` });

    // Disabled: signed out everywhere and cannot sign in.
    await row.getByRole('button', { name: 'Disable' }).click();
    await expect(row).toContainText('Disabled');
    expect(await (await member.request.get('/api/v1/me')).json()).toEqual({ user: null });
    await signIn(member, username, PASSWORD);
    await expect(member.getByRole('alert')).toHaveText('Wrong username or password.');

    await row.getByRole('button', { name: 'Enable' }).click();
    await expect(row).not.toContainText('Disabled');

    // Password reset link, used by the member.
    await row.getByRole('button', { name: 'Password reset link' }).click();
    const link = await page.getByRole('textbox', { name: 'Password reset link' }).inputValue();
    expect(link).toMatch(/\/reset-password#token=/);
    await member.goto(link);
    await member.getByLabel('New password').fill('another good password');
    await member.getByLabel('Confirm the password').fill('another good password');
    await member.getByRole('button', { name: 'Save the password' }).click();
    await expect(member.getByRole('status')).toContainText('Your password has been changed');
    // Reopening the very same URL would only be a fragment change, without reloading the page.
    await member.goto('/');
    await member.goto(link);
    await expect(member.getByRole('heading', { name: 'This link does not work' })).toBeVisible();
    await signIn(member, username, 'another good password');
    await expect(member.getByRole('button', { name: 'Account' })).toBeVisible();

    // The admin cannot act on their own account.
    await expect(page.getByTestId('user-row').filter({ hasText: '@e2e_admin' })).toContainText(
      'This is you.',
    );

    await row.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(row).toHaveCount(0);
    expect(await (await member.request.get('/api/v1/me')).json()).toEqual({ user: null });
  });
});

test.describe('sign-up form', () => {
  test.use({ storageState: ADMIN_STATE });

  test('invalid fields are flagged and nothing is sent', async ({ page, browser }) => {
    const link = await createInvite(page);
    const visitor = await newVisitor(browser);
    let registerRequests = 0;
    visitor.on('request', (req) => {
      if (req.url().endsWith('/api/v1/register')) registerRequests += 1;
    });

    await visitor.goto(link);
    await visitor.getByLabel('Username').fill('a!');
    await visitor.getByLabel('Email').fill('not-an-email');
    await visitor.getByLabel('Password', { exact: true }).fill('short');
    await visitor.getByLabel('Confirm the password').fill('different');
    await visitor.getByRole('button', { name: 'Create my account' }).click();

    await expect(
      visitor.getByText('Use 3 to 30 letters, digits, dots or underscores.'),
    ).toBeVisible();
    await expect(visitor.getByText('Enter a valid email address.')).toBeVisible();
    await expect(
      visitor.getByText('The password must be 10 to 128 characters long.'),
    ).toBeVisible();
    await expect(visitor.getByText('The two passwords do not match.')).toBeVisible();
    for (const field of [
      visitor.getByLabel('Username'),
      visitor.getByLabel('Email'),
      visitor.getByLabel('Password', { exact: true }),
      visitor.getByLabel('Confirm the password'),
    ]) {
      await expect(field).toHaveAttribute('aria-invalid', 'true');
    }
    expect(registerRequests).toBe(0);
    expect(await inviteUsable(visitor.request, link)).toBe(true);
  });

  test('a mismatched confirmation alone blocks the sign-up', async ({ page, browser }) => {
    const link = await createInvite(page);
    const visitor = await newVisitor(browser);
    const username = uniqueName('mismatch');
    await visitor.goto(link);
    await visitor.getByLabel('Username').fill(username);
    await visitor.getByLabel('Email').fill(`${username}@example.com`);
    await visitor.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await visitor.getByLabel('Confirm the password').fill(`${PASSWORD}!`);
    await visitor.getByRole('button', { name: 'Create my account' }).click();

    await expect(visitor.getByText('The two passwords do not match.')).toBeVisible();
    await expect(visitor.getByLabel('Username')).not.toHaveAttribute('aria-invalid', 'true');
    // The token was read, then removed from the address bar (browser history).
    await expect(visitor).toHaveURL(/\/invite$/);
    expect(await inviteUsable(visitor.request, link)).toBe(true);
  });

  test('a taken username is reported, whatever its case, and the invitation still works', async ({
    page,
    browser,
  }) => {
    const existing = await newMember(browser, page, 'taken');
    const link = await createInvite(page);
    const visitor = await newVisitor(browser);
    await visitor.goto(link);
    await visitor.getByLabel('Username').fill(existing.username.toUpperCase());
    await visitor.getByLabel('Email').fill(`${uniqueName('fresh')}@example.com`);
    await visitor.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await visitor.getByLabel('Confirm the password').fill(PASSWORD);
    await visitor.getByRole('button', { name: 'Create my account' }).click();
    await expect(visitor.getByRole('alert')).toHaveText('This username is already taken.');

    // The failed attempt did not consume the invitation: fixing the username is enough.
    await visitor.getByLabel('Username').fill(uniqueName('fresh'));
    await visitor.getByRole('button', { name: 'Create my account' }).click();
    await expect(visitor.getByRole('button', { name: 'Account' })).toBeVisible();
  });

  test('a taken email is reported, whatever its case', async ({ page, browser }) => {
    const existing = await newMember(browser, page, 'mail');
    const link = await createInvite(page);
    const visitor = await newVisitor(browser);
    await visitor.goto(link);
    await visitor.getByLabel('Username').fill(uniqueName('other'));
    await visitor.getByLabel('Email').fill(existing.email.toUpperCase());
    await visitor.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await visitor.getByLabel('Confirm the password').fill(PASSWORD);
    await visitor.getByRole('button', { name: 'Create my account' }).click();
    await expect(visitor.getByRole('alert')).toHaveText('An account already uses this email.');
    expect(await inviteUsable(visitor.request, link)).toBe(true);
  });

  test('concurrent sign-ups with the same invitation: exactly one succeeds', async ({
    page,
    browser,
  }) => {
    const link = await createInvite(page);
    const attempts = 5;
    const contexts = await Promise.all(
      Array.from({ length: attempts }, () => newAnonymousContext(browser)),
    );
    const usernames = contexts.map(() => uniqueName('race'));
    const responses = await Promise.all(
      contexts.map((context, i) =>
        context.request.post('/api/v1/register', {
          data: {
            token: tokenOf(link),
            username: usernames[i],
            email: `${usernames[i]}@example.com`,
            password: PASSWORD,
            locale: 'en',
          },
          headers: ORIGIN_HEADER,
        }),
      ),
    );
    const statuses = responses.map((res) => res.status());
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 400)).toHaveLength(attempts - 1);
    for (const res of responses.filter((r) => r.status() === 400)) {
      expect(await res.json()).toEqual({ error: 'invalid_token' });
    }

    // Only the winner has an account.
    const users = (await (await page.request.get('/api/v1/admin/users')).json()) as {
      username: string;
    }[];
    const created = usernames.filter((name) => users.some((user) => user.username === name));
    expect(created).toEqual([usernames[statuses.indexOf(200)]]);
    await Promise.all(contexts.map((context) => context.close()));
  });

  test('the new session cookie is httpOnly and sameSite=Lax', async ({ page, browser }) => {
    const member = await newMember(browser, page, 'cookie');
    const cookies = await member.page.context().cookies();
    const session = cookies.find((cookie) => cookie.name.endsWith('session_token'));
    expect(session, cookies.map((cookie) => cookie.name).join(', ')).toBeDefined();
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Lax');
  });
});

test.describe('invitation API (admin)', () => {
  test.use({ storageState: ADMIN_STATE });

  test('invitation settings are validated', async ({ page }) => {
    for (const data of [
      { expiresInDays: 0 },
      { expiresInDays: 91 },
      { expiresInDays: 1.5 },
      { expiresInDays: '7' },
      { label: 'x'.repeat(101) },
    ]) {
      const res = await page.request.post('/api/v1/admin/invites', {
        data,
        headers: ORIGIN_HEADER,
      });
      expect(res.status(), JSON.stringify(data)).toBe(400);
    }
    const ok = await page.request.post('/api/v1/admin/invites', {
      data: { expiresInDays: 90 },
      headers: ORIGIN_HEADER,
    });
    expect(ok.status()).toBe(201);
  });

  test('a used or unknown invitation cannot be revoked', async ({ page, browser }) => {
    const label = uniqueName('used');
    const link = await createInvite(page, label);
    const visitor = await newVisitor(browser);
    await registerWithApi(visitor.request, link, uniqueName('used'));

    const invites = (await (await page.request.get('/api/v1/admin/invites')).json()) as {
      id: string;
      label: string | null;
    }[];
    const invite = invites.find((item) => item.label === label);
    expect(invite).toBeDefined();
    for (const id of [invite?.id, UNKNOWN_ID]) {
      const res = await page.request.post(`/api/v1/admin/invites/${id}/revoke`, {
        headers: ORIGIN_HEADER,
      });
      expect(res.status(), id).toBe(404);
    }
    // The account created from it is untouched.
    const me = (await (await visitor.request.get('/api/v1/me')).json()) as { user: unknown };
    expect(me.user).not.toBeNull();
  });

  test('user actions on an unknown account answer 404', async ({ page }) => {
    for (const [method, path] of [
      ['post', `/api/v1/admin/users/${UNKNOWN_ID}/disable`],
      ['post', `/api/v1/admin/users/${UNKNOWN_ID}/enable`],
      ['post', `/api/v1/admin/users/${UNKNOWN_ID}/reset-link`],
      ['delete', `/api/v1/admin/users/${UNKNOWN_ID}`],
    ] as const) {
      const res = await page.request[method](path, { headers: ORIGIN_HEADER });
      expect(res.status(), `${method} ${path}`).toBe(404);
    }
  });
});

test.describe('password reset links', () => {
  test.use({ storageState: ADMIN_STATE });

  test('a newer link invalidates the previous one', async ({ page, browser }) => {
    const member = await newMember(browser, page, 'relink');
    const id = await userId(page, member.username);
    const first = await createResetLink(page, id);
    const second = await createResetLink(page, id);

    expect(await resetLinkUsable(member.page.request, first)).toBe(false);
    expect(await resetLinkUsable(member.page.request, second)).toBe(true);
    const res = await member.page.request.post('/api/v1/password-reset', {
      data: { token: tokenOf(first), password: 'another good password' },
      headers: ORIGIN_HEADER,
    });
    expect(res.status()).toBe(400);
    await member.page.goto(first);
    await expect(
      member.page.getByRole('heading', { name: 'This link does not work' }),
    ).toBeVisible();
  });

  test('changing the password invalidates a pending link', async ({ page, browser }) => {
    const member = await newMember(browser, page, 'changer');
    const link = await createResetLink(page, await userId(page, member.username));
    const change = await member.page.request.post('/api/v1/auth/change-password', {
      data: { currentPassword: PASSWORD, newPassword: 'a brand new password' },
      headers: ORIGIN_HEADER,
    });
    expect(change.status()).toBe(200);
    expect(await resetLinkUsable(member.page.request, link)).toBe(false);
  });

  test('using a link signs the user out everywhere and replaces the password', async ({
    page,
    browser,
  }) => {
    const member = await newMember(browser, page, 'resetout');
    const link = await createResetLink(page, await userId(page, member.username));
    const stranger = await newVisitor(browser);
    const res = await stranger.request.post('/api/v1/password-reset', {
      data: { token: tokenOf(link), password: 'another good password' },
      headers: ORIGIN_HEADER,
    });
    expect(res.status()).toBe(200);
    expect(await (await member.page.request.get('/api/v1/me')).json()).toEqual({ user: null });

    const old = await stranger.request.post('/api/v1/auth/sign-in/username', {
      data: { username: member.username, password: PASSWORD },
      headers: ORIGIN_HEADER,
    });
    expect(old.status()).toBe(401);
    const fresh = await stranger.request.post('/api/v1/auth/sign-in/username', {
      data: { username: member.username, password: 'another good password' },
      headers: ORIGIN_HEADER,
    });
    expect(fresh.status()).toBe(200);
  });

  test('the reset form flags a short password and a mismatched confirmation', async ({
    page,
    browser,
  }) => {
    const member = await newMember(browser, page, 'resetform');
    const link = await createResetLink(page, await userId(page, member.username));
    const visitor = await newVisitor(browser);
    await visitor.goto(link);
    await visitor.getByLabel('New password').fill('short');
    await visitor.getByLabel('Confirm the password').fill('shorter');
    await visitor.getByRole('button', { name: 'Save the password' }).click();
    await expect(
      visitor.getByText('The password must be 10 to 128 characters long.'),
    ).toBeVisible();
    await expect(visitor.getByText('The two passwords do not match.')).toBeVisible();
    expect(await resetLinkUsable(visitor.request, link)).toBe(true);
  });
});

test.describe('rescue CLI', () => {
  test.use({ storageState: ADMIN_STATE });

  test('admin:reset-link refuses an unknown user or a missing name', () => {
    const unknown = cli('admin:reset-link', uniqueName('nobody'));
    expect(unknown.ok).toBe(false);
    expect(unknown.output).toContain('No user named');
    const missing = cli('admin:reset-link');
    expect(missing.ok).toBe(false);
    expect(missing.output).toContain('Usage');
  });

  test('admin:reset-link gives a working link, whatever the case of the username', async ({
    page,
    browser,
  }) => {
    const member = await newMember(browser, page, 'rescued');
    const result = cli('admin:reset-link', member.username.toUpperCase());
    expect(result.ok, result.output).toBe(true);
    const url = /\S+#token=[A-Za-z0-9_-]+/.exec(result.output)?.[0] ?? '';
    expect(url).toMatch(/\/reset-password#token=/);
    expect(await resetLinkUsable(member.page.request, url)).toBe(true);
  });
});
