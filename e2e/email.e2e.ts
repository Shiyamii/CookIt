import { expect, test, type Browser, type Page } from '@playwright/test';
import { linkIn, mailsTo, waitForMail } from './mailpit';
import {
  ADMIN,
  ADMIN_STATE,
  newMember,
  newVisitor,
  ORIGIN_HEADER,
  PASSWORD,
  registerWithApi,
  totpCode,
  uniqueName,
} from './support';

test.use({ storageState: ADMIN_STATE });

/** The path and fragment of an absolute link (the tests may reach the app under another host). */
const pathOf = (url: string) => {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.hash}`;
};

test('email is announced by the server', async ({ page }) => {
  const meta = (await (await page.request.get('/api/v1/meta')).json()) as { email: boolean };
  expect(meta.email).toBe(true);
});

test('an invitation by email: sent in the language chosen, opened, account created', async ({
  browser,
  page: admin,
}) => {
  const username = uniqueName('mailed');
  const email = `${username}@example.com`;
  await admin.goto('/admin/invites');
  await admin.getByLabel('Email (optional)').fill(email.toUpperCase());
  await admin.getByRole('combobox', { name: 'Language of the email' }).click();
  await admin.getByRole('option', { name: 'Français' }).click();
  await admin.getByRole('button', { name: 'Send the invitation' }).click();
  await expect(admin.getByText(`Invitation sent to ${email.toUpperCase()}.`)).toBeVisible();
  // Other tests create invites at the same time: the row of this address.
  await expect(admin.getByTestId('invite-row').filter({ hasText: `Sent to ${email}` })).toHaveCount(
    1,
  );

  const mail = await waitForMail(email);
  expect(mail.subject).toBe(`${ADMIN.username} vous invite sur CookIt`);
  expect(mail.from).toBe('CookIt <cookit@localhost>');
  expect(mail.html).toContain('<html lang="fr"');
  // The theme's primary color on the button.
  expect(mail.html.toLowerCase()).toContain('#afbea5');
  const link = linkIn(mail);
  expect(mail.text).toContain(`Créer mon compte: ${link}`);

  // The link opens the sign-up page in French, with the address filled in.
  const page = await newVisitor(browser);
  await page.goto(pathOf(link));
  await expect(page.getByRole('heading', { name: 'Créer votre compte' })).toBeVisible();
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
  await page.getByLabel('Nom d’utilisateur').fill(username);
  await page.getByLabel('Mot de passe', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirmer le mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: /^Bonjour, / })).toBeVisible();
  await page.context().close();
});

test('an invitation to an address an account has is refused', async ({ page: admin }) => {
  const res = await admin.request.post('/api/v1/admin/invites', {
    headers: ORIGIN_HEADER,
    data: { email: ADMIN.email.toUpperCase() },
  });
  expect(res.status()).toBe(409);
  expect(await res.json()).toEqual({ error: 'email_taken' });

  await admin.goto('/admin/invites');
  await admin.getByLabel('Email (optional)').fill(ADMIN.email);
  await admin.getByRole('button', { name: 'Send the invitation' }).click();
  await expect(admin.getByRole('alert')).toHaveText('An account already uses this email.');
});

test('the admin sends a test email to their own address', async ({ page: admin }) => {
  const before = (await mailsTo(ADMIN.email)).length;
  await admin.goto('/admin/invites');
  await expect(admin.getByText('The server sends emails')).toBeVisible();
  await admin.getByRole('button', { name: 'Send me a test email' }).click();
  await expect(admin.getByText(`Test email sent to ${ADMIN.email}.`)).toBeVisible();
  const mail = await waitForMail(ADMIN.email, before + 1);
  expect(mail.subject).toBe('CookIt test email');
});

/**
 * A member invited by email, who signed up with that address (so it is verified): only such an
 * address ever gets reset links. Their page is signed in.
 */
async function emailedMember(browser: Browser, admin: Page, prefix: string) {
  const username = uniqueName(prefix);
  const email = `${username}@example.com`;
  const res = await admin.request.post('/api/v1/admin/invites', {
    headers: ORIGIN_HEADER,
    data: { email },
  });
  expect(await res.json()).toMatchObject({ emailed: true });
  const page = await newVisitor(browser);
  await registerWithApi(page.request, linkIn(await waitForMail(email)), username);
  return { page, username, email };
}

async function askReset(page: Page, identifier: string) {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
  await page.getByLabel('Username or email').fill(identifier);
  await page.getByRole('button', { name: 'Send the link' }).click();
  await expect(page.getByRole('status')).toContainText('If an account matches, an email is on');
}

test('forgot password: a link by email, a new password, and two-step verification kept', async ({
  browser,
  page: admin,
}) => {
  const { page: member, username, email } = await emailedMember(browser, admin, 'forgetful');
  // Two-step verification on, through the API.
  const enable = await member.request.post('/api/v1/auth/two-factor/enable', {
    headers: ORIGIN_HEADER,
    data: { password: PASSWORD },
  });
  const { totpURI } = (await enable.json()) as { totpURI: string };
  const secret = new URL(totpURI).searchParams.get('secret') ?? '';
  const verify = await member.request.post('/api/v1/auth/two-factor/verify-totp', {
    headers: ORIGIN_HEADER,
    data: { code: totpCode(secret) },
  });
  expect(verify.ok()).toBe(true);

  const visitor = await newVisitor(browser);
  await askReset(visitor, username.toUpperCase());
  // The invitation was the first email.
  const mail = await waitForMail(email, 2);
  expect(mail.subject).toBe('Choose a new CookIt password');
  expect(mail.text).toContain(username);

  await visitor.goto(pathOf(linkIn(mail)));
  await expect(visitor.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  // An emailed link does not turn two-step verification off: the page does not say it does.
  await expect(visitor.getByText(/two-step verification/i)).toHaveCount(0);
  const newPassword = 'another long password';
  await visitor.getByLabel('New password').fill(newPassword);
  await visitor.getByLabel('Confirm the password').fill(newPassword);
  await visitor.getByRole('button', { name: 'Save the password' }).click();
  await expect(visitor.getByRole('status')).toBeVisible();

  // The old session is gone; the new password works, and still asks for the code.
  expect(await (await member.request.get('/api/v1/me')).json()).toEqual({ user: null });
  const signIn = await visitor.request.post('/api/v1/auth/sign-in/username', {
    headers: ORIGIN_HEADER,
    data: { username, password: newPassword },
  });
  expect(signIn.ok()).toBe(true);
  expect(await signIn.json()).toMatchObject({ twoFactorRedirect: true });

  // The link worked once.
  const again = await visitor.request.post('/api/v1/password-reset/check', {
    headers: ORIGIN_HEADER,
    data: { token: new URL(linkIn(mail)).hash.slice('#token='.length) },
  });
  expect(again.status()).toBe(404);
  await visitor.context().close();
  await member.context().close();
});

test('forgot password never tells whether an account exists', async ({ browser, page: admin }) => {
  const { username, email } = await emailedMember(browser, admin, 'private');
  const visitor = await newVisitor(browser);
  const ask = (identifier: unknown) =>
    visitor.request.post('/api/v1/password-reset/request', {
      headers: ORIGIN_HEADER,
      data: { identifier },
    });

  const known = await ask(email);
  const unknown = await ask(`${uniqueName('nobody')}@example.com`);
  expect(known.status()).toBe(200);
  expect(unknown.status()).toBe(200);
  expect(await known.json()).toEqual(await unknown.json());
  await waitForMail(email, 2);

  // Through the page, an unknown name gets the same message.
  await askReset(visitor, uniqueName('nobody'));

  // The latest emailed link replaces the previous one; an admin's link is left alone.
  await ask(username);
  const second = await waitForMail(email, 3);
  const first = (await mailsTo(email))[1]!;
  const check = async (link: string) =>
    (
      await visitor.request.post('/api/v1/password-reset/check', {
        headers: ORIGIN_HEADER,
        data: { token: new URL(link).hash.slice('#token='.length) },
      })
    ).status();
  expect(await check(linkIn(first))).toBe(404);
  expect(await check(linkIn(second))).toBe(200);

  expect((await ask('')).status()).toBe(400);
  expect((await ask('x'.repeat(300))).status()).toBe(400);
  await visitor.context().close();
});

test('an address never verified gets no reset link', async ({ browser, page: admin }) => {
  // Signed up from a link handed over by hand: the address was typed, never proven.
  const { username, email } = await newMember(browser, admin, 'unverified');
  const visitor = await newVisitor(browser);
  await askReset(visitor, username);
  // The request was answered as usual; give a sent email time to show up, then check none did.
  await visitor.waitForTimeout(1500);
  expect(await mailsTo(email)).toHaveLength(0);
  await visitor.context().close();
});
