import type { AccountSecurity } from '@cookit/shared';
import { expect, test, type Page } from '@playwright/test';
import {
  addVirtualAuthenticator,
  ADMIN_STATE,
  createResetLink,
  newMember,
  newVisitor,
  ORIGIN_HEADER,
  PASSWORD,
  signIn,
  totpCode,
  userId,
} from './support';

test.use({ storageState: ADMIN_STATE });

/** Signs the page out through the API, keeping the browser (and its virtual authenticator). */
async function signOut(page: Page) {
  const res = await page.request.post('/api/v1/auth/sign-out', {
    data: {},
    headers: ORIGIN_HEADER,
  });
  expect(res.ok()).toBe(true);
}

async function expectSignedIn(page: Page) {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();
}

async function expectSignedOut(page: Page) {
  expect(await (await page.request.get('/api/v1/me')).json()).toEqual({ user: null });
}

/** A card of the security page, by its heading (several cards have a "Password" field). */
function card(page: Page, heading: string) {
  return page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByRole('heading', { name: heading, level: 2 }) });
}

function twoFactorCard(page: Page) {
  return card(page, 'Two-step verification');
}

/** Turns 2FA on from the security page and returns the TOTP secret and the backup codes. */
async function enableTwoFactor(page: Page): Promise<{ secret: string; backupCodes: string[] }> {
  await page.goto('/account/security');
  await page.getByRole('button', { name: 'Turn on' }).click();
  await twoFactorCard(page).getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('img', { name: 'QR code for the authenticator app' })).toBeVisible();
  const secret = (await page.getByTestId('totp-secret').textContent()) ?? '';
  await page.getByLabel('Code', { exact: true }).fill(totpCode(secret));
  await page.getByRole('button', { name: 'Turn on' }).click();
  const codes = page.getByTestId('backup-codes').getByRole('listitem');
  await expect(codes).toHaveCount(10);
  const backupCodes = await codes.allTextContents();
  await page.getByRole('button', { name: 'I saved them' }).click();
  await expect(page.getByText('On', { exact: true })).toBeVisible();
  return { secret, backupCodes };
}

/** The passkeys card of the security page (the other cards have password fields too). */
function passkeysCard(page: Page) {
  return card(page, 'Passkeys');
}

/** Fills the "add a passkey" form of the security page (already open) and sends it. */
async function submitNewPasskey(page: Page, name = '', password = PASSWORD) {
  const passkeys = passkeysCard(page);
  if (name) await passkeys.getByLabel('Name of the new passkey').fill(name);
  await passkeys.getByLabel('Password', { exact: true }).fill(password);
  await passkeys.getByRole('button', { name: 'Add a passkey' }).click();
}

async function security(page: Page): Promise<AccountSecurity> {
  const res = await page.request.get('/api/v1/me/security');
  expect(res.ok()).toBe(true);
  return (await res.json()) as AccountSecurity;
}

/** Adds a passkey from the security page and returns its id. */
async function addPasskey(page: Page, name: string): Promise<string> {
  await page.goto('/account/security');
  await submitNewPasskey(page, name);
  await expect(page.getByText('Passkey added.')).toBeVisible();
  const found = (await security(page)).passkeys.find((passkey) => passkey.name === name);
  if (!found) throw new Error(`No passkey ${name}`);
  return found.id;
}

/** A 6-digit code the authenticator app does not show around now (TOTP accepts ±1 period). */
function wrongTotp(secret: string): string {
  const now = Date.now();
  const valid = new Set([-30_000, 0, 30_000].map((shift) => totpCode(secret, now + shift)));
  return ['000000', '111111', '222222', '333333'].find((code) => !valid.has(code)) ?? '444444';
}

/**
 * Rewrites the WebAuthn options sent by the server so that the browser does not ask the
 * authenticator to verify the user: only the server-side check can then refuse the answer.
 */
async function discourageUserVerification(page: Page, path: string) {
  await page.route(`**/api/v1/auth/passkey/${path}`, async (route) => {
    const response = await route.fetch();
    const options = (await response.json()) as {
      userVerification?: string;
      authenticatorSelection?: { userVerification?: string };
    };
    if (options.authenticatorSelection) {
      options.authenticatorSelection.userVerification = 'discouraged';
    }
    if ('userVerification' in options) options.userVerification = 'discouraged';
    await route.fulfill({ response, json: options });
  });
}

test('two-step verification: setup, code at sign-in, single-use backup codes, turning off', async ({
  browser,
  page: adminPage,
}) => {
  const { page, username } = await newMember(browser, adminPage, 'totp');
  const { secret, backupCodes } = await enableTwoFactor(page);

  // The password alone no longer signs in.
  await signOut(page);
  await signIn(page, username, PASSWORD);
  await expect(page.getByRole('heading', { name: 'Two-step verification' })).toBeVisible();
  await page.getByLabel('Code', { exact: true }).fill(wrongTotp(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert')).toContainText('Wrong code');
  await page.getByLabel('Code', { exact: true }).fill(totpCode(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expectSignedIn(page);

  // A backup code works once.
  const [backup] = backupCodes;
  for (const attempt of ['first', 'second']) {
    await signOut(page);
    await signIn(page, username, PASSWORD);
    await page.getByRole('button', { name: 'Use a backup code instead' }).click();
    await page.getByLabel('Backup code').fill(backup ?? '');
    await page.getByRole('button', { name: 'Verify' }).click();
    if (attempt === 'first') await expectSignedIn(page);
    else await expect(page.getByRole('alert')).toContainText('already used');
  }
  await page.getByRole('button', { name: 'Use the authenticator app instead' }).click();
  await page.getByLabel('Code', { exact: true }).fill(totpCode(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expectSignedIn(page);

  // Turning it off asks for the password again.
  await page.goto('/account/security');
  await page.getByRole('button', { name: 'Turn off' }).click();
  await twoFactorCard(page).getByLabel('Password', { exact: true }).fill('not my password at all');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('alert')).toContainText('Wrong password');
  await twoFactorCard(page).getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Off', { exact: true })).toBeVisible();

  await signOut(page);
  await signIn(page, username, PASSWORD);
  await expectSignedIn(page);
});

test('passkeys: add, sign in without a password, rename, delete', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'passkey');
  await addVirtualAuthenticator(page);

  await page.goto('/account/security');
  await expect(page.getByText('No passkey yet.')).toBeVisible();
  await expect(passkeysCard(page).getByRole('button', { name: 'Add a passkey' })).toBeDisabled();
  await submitNewPasskey(page, 'My laptop');
  await expect(page.getByText('Passkey added.')).toBeVisible();
  await expect(page.getByTestId('passkey-row')).toHaveCount(1);
  await expect(page.getByTestId('passkey-row')).toContainText('My laptop');

  await signOut(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expectSignedIn(page);

  await page.goto('/account/security');
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Work laptop');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('passkey-row')).toContainText('Work laptop');

  await page.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('No passkey yet.')).toBeVisible();

  // The authenticator still holds the credential, but the site forgot it.
  await signOut(page);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page.getByRole('alert')).toContainText('not known here');
});

test('a password reset link turns two-step verification off and removes passkeys', async ({
  browser,
  page: adminPage,
}) => {
  const { page, username } = await newMember(browser, adminPage, 'lost');
  await addVirtualAuthenticator(page);
  await enableTwoFactor(page);
  await submitNewPasskey(page);
  await expect(page.getByTestId('passkey-row')).toHaveCount(1);

  const link = await createResetLink(adminPage, await userId(adminPage, username));
  const visitor = await newVisitor(browser);
  await visitor.goto(link);
  await expect(visitor.getByText('turns off two-step verification')).toBeVisible();
  const newPassword = 'my brand new password';
  await visitor.getByLabel('New password').fill(newPassword);
  await visitor.getByLabel('Confirm the password').fill(newPassword);
  await visitor.getByRole('button', { name: 'Save the password' }).click();
  await expect(visitor.getByRole('status')).toBeVisible();

  await signIn(visitor, username, newPassword);
  await expectSignedIn(visitor);
  await visitor.goto('/account/security');
  await expect(visitor.getByText('Off', { exact: true })).toBeVisible();
  await expect(visitor.getByText('No passkey yet.')).toBeVisible();
});

test('API: strict bodies, sign-in-only routes, passkeys of others', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'strict');
  const post = (path: string, data: unknown) =>
    page.request.post(`/api/v1/auth${path}`, { data, headers: ORIGIN_HEADER });

  // Unknown fields never reach Better Auth (`issuer` would rename the TOTP entry, `trustDevice`
  // would skip 2FA for 30 days).
  expect((await post('/two-factor/enable', { password: PASSWORD, issuer: 'Evil' })).status()).toBe(
    400,
  );
  expect(
    (await post('/two-factor/verify-totp', { code: '123456', trustDevice: true })).status(),
  ).toBe(400);
  expect((await post('/two-factor/verify-totp', { code: 'abcdef' })).status()).toBe(400);
  // Better Auth's own passkey list is not exposed: ours carries no key material.
  expect((await page.request.get('/api/v1/auth/passkey/list-user-passkeys')).status()).toBe(404);
  const security = await page.request.get('/api/v1/me/security');
  expect(await security.json()).toEqual({ twoFactorEnabled: false, passkeys: [] });

  // Without a session: management routes are refused, the sign-in ones need a challenge.
  const anonymous = await newVisitor(browser);
  expect((await anonymous.request.get('/api/v1/me/security')).status()).toBe(401);
  const enable = await anonymous.request.post('/api/v1/auth/two-factor/enable', {
    data: { password: PASSWORD },
    headers: ORIGIN_HEADER,
  });
  expect(enable.status()).toBe(401);
  const verify = await anonymous.request.post('/api/v1/auth/two-factor/verify-totp', {
    data: { code: '123456' },
    headers: ORIGIN_HEADER,
  });
  expect(verify.status()).toBe(401);

  // Someone else's (or an unknown) passkey cannot be deleted.
  const unknown = await post('/passkey/delete-passkey', {
    id: 'not-a-passkey-of-mine',
    password: PASSWORD,
  });
  expect(unknown.status()).toBe(404);
});

test('API: adding or deleting a passkey needs the password', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'pkpass');
  const post = (path: string, data: unknown) =>
    page.request.post(`/api/v1/auth${path}`, { data, headers: ORIGIN_HEADER });

  // Better Auth's GET (session alone) is gone.
  const get = await page.request.get('/api/v1/auth/passkey/generate-register-options');
  expect(get.status()).toBe(404);

  const wrong = await post('/passkey/generate-register-options', { password: 'not my password' });
  expect(wrong.status()).toBe(400);
  expect(await wrong.json()).toMatchObject({ code: 'INVALID_PASSWORD' });
  expect((await post('/passkey/generate-register-options', {})).status()).toBe(400);
  const extra = { password: PASSWORD, authenticatorAttachment: 'cross-platform' };
  expect((await post('/passkey/generate-register-options', extra)).status()).toBe(400);
  const right = await post('/passkey/generate-register-options', { password: PASSWORD });
  expect(right.status()).toBe(200);
  expect(await right.json()).toHaveProperty('challenge');

  // The password is checked first: a wrong one says nothing about the passkey id.
  const remove = await post('/passkey/delete-passkey', { id: 'any', password: 'not my password' });
  expect(remove.status()).toBe(400);
  expect(await remove.json()).toMatchObject({ code: 'INVALID_PASSWORD' });
  expect((await post('/passkey/delete-passkey', { id: 'any' })).status()).toBe(400);

  // Without a session, neither route answers.
  const anonymous = await newVisitor(browser);
  const anonymousAdd = await anonymous.request.post(
    '/api/v1/auth/passkey/generate-register-options',
    { data: { password: PASSWORD }, headers: ORIGIN_HEADER },
  );
  expect(anonymousAdd.status()).toBe(401);
});

test('passkeys: a wrong password neither adds nor deletes one', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'pkwrong');
  const authenticator = await addVirtualAuthenticator(page);
  await page.goto('/account/security');
  await submitNewPasskey(page, 'Laptop', 'not my password');
  await expect(passkeysCard(page).getByRole('alert')).toContainText('Wrong password');
  expect((await security(page)).passkeys).toEqual([]);
  expect(await authenticator.credentialCount()).toBe(0);

  await submitNewPasskey(page, 'Laptop');
  await expect(page.getByTestId('passkey-row')).toHaveCount(1);

  await page.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('button', { name: 'Delete' })).toBeDisabled();
  await dialog.getByLabel('Password', { exact: true }).fill('not my password');
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('alert')).toContainText('Wrong password');
  expect((await security(page)).passkeys).toHaveLength(1);
});

test('API: passkey sign-in options are only given to our own pages', async ({ browser }) => {
  const anonymous = await newVisitor(browser);
  const path = '/api/v1/auth/passkey/generate-authenticate-options';
  for (const site of ['cross-site', 'same-site', 'none']) {
    const res = await anonymous.request.get(path, { headers: { 'Sec-Fetch-Site': site } });
    expect(res.status(), site).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden_origin' });
  }
  const own = await anonymous.request.get(path, { headers: { 'Sec-Fetch-Site': 'same-origin' } });
  expect(own.status()).toBe(200);
  // Clients that do not send the header (older browsers, scripts) still work.
  expect((await anonymous.request.get(path)).status()).toBe(200);
});

test('two-step verification setup: a short or wrong code keeps it off', async ({
  browser,
  page: adminPage,
}) => {
  const { page, username } = await newMember(browser, adminPage, 'totpoff');
  await page.goto('/account/security');
  await page.getByRole('button', { name: 'Turn on' }).click();
  await twoFactorCard(page).getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();
  const secret = (await page.getByTestId('totp-secret').textContent()) ?? '';

  await page.getByLabel('Code', { exact: true }).fill(totpCode(secret).slice(0, 5));
  await page.getByRole('button', { name: 'Turn on' }).click();
  await expect(page.getByRole('alert')).toContainText('Some fields are not valid');
  await page.getByLabel('Code', { exact: true }).fill(wrongTotp(secret));
  await page.getByRole('button', { name: 'Turn on' }).click();
  await expect(page.getByRole('alert')).toContainText('Wrong code');
  expect((await security(page)).twoFactorEnabled).toBe(false);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.reload();
  await expect(page.getByText('Off', { exact: true })).toBeVisible();

  // The password alone still signs in.
  await signOut(page);
  await signIn(page, username, PASSWORD);
  await expectSignedIn(page);

  // An abandoned setup does not prevent a new one.
  await enableTwoFactor(page);
  expect((await security(page)).twoFactorEnabled).toBe(true);
});

test('turning two-step verification on signs the other devices out', async ({
  browser,
  page: adminPage,
}) => {
  const { page, username } = await newMember(browser, adminPage, 'totpdev');
  const otherDevice = await newVisitor(browser);
  await signIn(otherDevice, username, PASSWORD);
  await expectSignedIn(otherDevice);

  await enableTwoFactor(page);
  await expectSignedOut(otherDevice);
  // This device stays signed in.
  expect(await (await page.request.get('/api/v1/me')).json()).toMatchObject({
    user: { username },
  });
});

test('new backup codes replace the previous ones', async ({ browser, page: adminPage }) => {
  const { page, username } = await newMember(browser, adminPage, 'backup');
  const { backupCodes: oldCodes } = await enableTwoFactor(page);

  await page.getByRole('button', { name: 'New backup codes' }).click();
  await twoFactorCard(page).getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();
  const codes = page.getByTestId('backup-codes').getByRole('listitem');
  await expect(codes).toHaveCount(10);
  const newCodes = await codes.allTextContents();
  expect(newCodes.filter((code) => oldCodes.includes(code))).toEqual([]);
  await page.getByRole('button', { name: 'I saved them' }).click();
  await expect(page.getByText('On', { exact: true })).toBeVisible();

  await signOut(page);
  await signIn(page, username, PASSWORD);
  await page.getByRole('button', { name: 'Use a backup code instead' }).click();
  await page.getByLabel('Backup code').fill(oldCodes[0] ?? '');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert')).toContainText('already used');
  await page.getByLabel('Backup code').fill(newCodes[0] ?? '');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expectSignedIn(page);
});

test('five wrong codes lock two-step verification; a reset link gets the account back', async ({
  browser,
  page: adminPage,
}) => {
  const { page, username } = await newMember(browser, adminPage, 'locked');
  const { secret, backupCodes } = await enableTwoFactor(page);
  await signOut(page);
  await signIn(page, username, PASSWORD);

  for (let attempt = 1; attempt <= 5; attempt++) {
    await page.getByLabel('Code', { exact: true }).fill(wrongTotp(secret));
    await page.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByRole('alert')).toContainText('Wrong code');
  }
  // Even the right code is refused now, and the message tells how long to wait (1 hour).
  await page.getByLabel('Code', { exact: true }).fill(totpCode(secret));
  await page.getByRole('button', { name: 'Verify' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Too many wrong codes');
  await expectSignedOut(page);
  // The lock lasts 1 hour (accountLockout), and the code step is useless meanwhile.
  await expect(alert).toContainText('an hour');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // A new sign-in or a backup code does not lift the lock.
  await signIn(page, username, PASSWORD);
  await page.getByRole('button', { name: 'Use a backup code instead' }).click();
  await page.getByLabel('Backup code').fill(backupCodes[0] ?? '');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert')).toContainText('Too many wrong codes');
  await expectSignedOut(page);

  // The way back: a password reset link from an administrator turns 2FA off.
  const link = await createResetLink(adminPage, await userId(adminPage, username));
  await page.goto(link);
  const newPassword = 'locked out no more please';
  await page.getByLabel('New password').fill(newPassword);
  await page.getByLabel('Confirm the password').fill(newPassword);
  await page.getByRole('button', { name: 'Save the password' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await signIn(page, username, newPassword);
  await expectSignedIn(page);
});

test('a passkey needs an authenticator that verifies the user', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'nouv');
  const authenticator = await addVirtualAuthenticator(page, { userVerified: false });

  // The server asks for user verification: the browser refuses a user who is not verified.
  await page.goto('/account/security');
  await submitNewPasskey(page);
  // The ceremony is over when the form is reset (the password field is emptied).
  await expect(passkeysCard(page).getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByText('Passkey added.')).toBeHidden();
  expect((await security(page)).passkeys).toEqual([]);
  expect(await authenticator.credentialCount()).toBe(0);
});

test('the server refuses a passkey created without user verification', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'nouvsrv');
  // A security key that can only check presence (no PIN, no fingerprint).
  const authenticator = await addVirtualAuthenticator(page, {
    hasUserVerification: false,
    userVerified: false,
  });
  await page.goto('/account/security');

  // A client skipping the user verification request is refused by the server.
  await discourageUserVerification(page, 'generate-register-options');
  const verification = page.waitForResponse('**/api/v1/auth/passkey/verify-registration');
  await submitNewPasskey(page);
  const refused = await verification;
  expect(refused.status()).toBe(401);
  expect(await refused.json()).toMatchObject({ code: 'USER_VERIFICATION_REQUIRED' });
  await expect(page.getByRole('alert')).toContainText('Your device must confirm it is you');
  await expect(page.getByTestId('passkey-row')).toHaveCount(0);
  expect((await security(page)).passkeys).toEqual([]);
  expect(await authenticator.credentialCount()).toBe(1);
});

test('a passkey sign-in without user verification is refused', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'nouvsign');
  const authenticator = await addVirtualAuthenticator(page);
  await addPasskey(page, 'Laptop');
  await signOut(page);

  await authenticator.setUserVerified(false);
  await discourageUserVerification(page, 'generate-authenticate-options');
  await page.goto('/login');
  const verification = page.waitForResponse('**/api/v1/auth/passkey/verify-authentication');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  const refused = await verification;
  expect(refused.status()).toBe(401);
  expect(await refused.json()).toMatchObject({ code: 'USER_VERIFICATION_REQUIRED' });
  await expect(page.getByRole('alert')).toContainText('Your device must confirm it is you');
  await expectSignedOut(page);
});

test('a passkey suggested in the username field signs in', async ({ browser, page: adminPage }) => {
  const { page, username } = await newMember(browser, adminPage, 'pkfill');
  // The virtual authenticator picks the suggested passkey by itself, like a user would.
  await addVirtualAuthenticator(page, { autofill: true });
  await addPasskey(page, 'Laptop');
  await signOut(page);

  await page.goto('/login');
  await expectSignedIn(page);
  expect(await (await page.request.get('/api/v1/me')).json()).toMatchObject({
    user: { username },
  });
});

test('a disabled account cannot sign in with its passkey', async ({ browser, page: adminPage }) => {
  const { page, username } = await newMember(browser, adminPage, 'pkoff');
  await addVirtualAuthenticator(page);
  await addPasskey(page, 'Laptop');
  await signOut(page);

  const id = await userId(adminPage, username);
  const disable = await adminPage.request.post(`/api/v1/admin/users/${id}/disable`, {
    headers: ORIGIN_HEADER,
  });
  expect(disable.ok()).toBe(true);

  await page.goto('/login');
  const verification = page.waitForResponse('**/api/v1/auth/passkey/verify-authentication');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  expect((await verification).status()).toBe(401);
  await expect(page.getByRole('alert')).toContainText('This passkey was not accepted');
  await expectSignedOut(page);

  // The passkey was kept: it works again once the account is enabled.
  const enable = await adminPage.request.post(`/api/v1/admin/users/${id}/enable`, {
    headers: ORIGIN_HEADER,
  });
  expect(enable.ok()).toBe(true);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expectSignedIn(page);
});

test("API: someone else's passkey cannot be renamed or deleted", async ({
  browser,
  page: adminPage,
}) => {
  const owner = await newMember(browser, adminPage, 'pkowner');
  await addVirtualAuthenticator(owner.page);
  const passkeyId = await addPasskey(owner.page, 'Mine');
  const other = await newMember(browser, adminPage, 'pkother');
  const post = (path: string, data: unknown) =>
    other.page.request.post(`/api/v1/auth${path}`, { data, headers: ORIGIN_HEADER });

  // With the other member's own (right) password.
  const remove = await post('/passkey/delete-passkey', { id: passkeyId, password: PASSWORD });
  expect(remove.status()).toBe(404);
  const rename = await post('/passkey/update-passkey', { id: passkeyId, name: 'Stolen' });
  expect(rename.ok()).toBe(false);

  expect((await security(owner.page)).passkeys).toEqual([
    expect.objectContaining({ id: passkeyId, name: 'Mine' }),
  ]);
});

test('the security page in French', async ({ browser, page: adminPage }) => {
  const { page } = await newMember(browser, adminPage, 'securefr');
  const res = await page.request.post('/api/v1/auth/update-user', {
    data: { locale: 'fr' },
    headers: ORIGIN_HEADER,
  });
  expect(res.ok()).toBe(true);

  await page.goto('/account/security');
  await expect(page.getByRole('heading', { name: 'Sécurité', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vérification en deux étapes' })).toBeVisible();
  await expect(page.getByText('Désactivée', { exact: true })).toBeVisible();
  await expect(page.getByText('Aucune passkey pour l’instant.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mot de passe', level: 2 })).toBeVisible();

  await page.getByRole('button', { name: 'Activer' }).click();
  await card(page, 'Vérification en deux étapes')
    .getByLabel('Mot de passe', { exact: true })
    .fill('pas mon mot de passe');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('alert')).toContainText('Mot de passe incorrect');
});

test('the security page never scrolls sideways, even with a long passkey name', async ({
  browser,
  page: adminPage,
}) => {
  const { page } = await newMember(browser, adminPage, 'pkwide');
  await addVirtualAuthenticator(page);
  await addPasskey(page, 'x'.repeat(64));
  await expect(page.getByTestId('passkey-row')).toHaveCount(1);
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow(), 'passkey list').toBeLessThanOrEqual(0);

  // Two-step verification setup: QR code and the secret for manual entry.
  await page.getByRole('button', { name: 'Turn on' }).click();
  await twoFactorCard(page).getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('img', { name: 'QR code for the authenticator app' })).toBeVisible();
  expect(await overflow(), '2FA setup').toBeLessThanOrEqual(0);
});
