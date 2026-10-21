import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/** The admin account of the test suite (created by the global setup, password reset each run). */
export const ADMIN = {
  username: 'e2e_admin',
  email: 'e2e_admin@example.com',
  password: 'e2e admin password 123',
};
export const ADMIN_STATE = 'e2e/.auth/admin.json';
export const PASSWORD = 'a good long password';

/** State-changing API calls must carry our Origin (CSRF check). */
export const ORIGIN_HEADER = { Origin: BASE_URL };

/**
 * Runs the rescue CLI inside the app container (`docker compose … up` names it cookit-app-1; CI
 * sets E2E_CONTAINER).
 */
export function cli(...args: string[]): { ok: boolean; output: string } {
  const container = process.env.E2E_CONTAINER ?? 'cookit-app-1';
  try {
    const output = execFileSync('docker', ['exec', container, 'node', 'dist/cli.js', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output };
  } catch (error) {
    const { stdout = '', stderr = '' } = error as { stdout?: string; stderr?: string };
    return { ok: false, output: `${stdout}${stderr}` };
  }
}

/** The token of a link (`…#token=…`). */
export function tokenOf(url: string): string {
  const token = /#token=([A-Za-z0-9_-]+)/.exec(url)?.[1];
  if (!token) throw new Error(`No token in ${url}`);
  return token;
}

/** A username unique to this run (3-30 characters, letters, digits, `_`). */
export function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Creates an invitation as the signed-in admin of `page` and returns its link. */
export async function createInvite(page: Page, label?: string): Promise<string> {
  const res = await page.request.post('/api/v1/admin/invites', {
    data: label ? { label } : {},
    headers: ORIGIN_HEADER,
  });
  if (!res.ok()) throw new Error(`Invite creation failed: ${res.status()}`);
  return ((await res.json()) as { url: string }).url;
}

/** Creates an account from an invitation link through the API (signs that context in). */
export async function registerWithApi(
  request: APIRequestContext,
  inviteUrl: string,
  username: string,
): Promise<void> {
  const res = await request.post('/api/v1/register', {
    data: {
      token: tokenOf(inviteUrl),
      username,
      email: `${username}@example.com`,
      password: PASSWORD,
      locale: 'en',
    },
    headers: ORIGIN_HEADER,
  });
  if (!res.ok()) throw new Error(`Sign-up failed: ${res.status()} ${await res.text()}`);
}

/**
 * A browser context without any session. The explicit empty state matters: inside a
 * `test.use({ storageState: ADMIN_STATE })` block, Playwright applies that option to
 * `browser.newContext()` too, which would sign the "visitor" in as the test admin.
 */
export function newAnonymousContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ locale: 'en-US', storageState: { cookies: [], origins: [] } });
}

/** A fresh browser session (no cookies) for an invited person. */
export async function newVisitor(browser: Browser): Promise<Page> {
  return (await newAnonymousContext(browser)).newPage();
}

/** Fills and sends the sign-up form of an invitation link. */
export async function signUp(page: Page, inviteUrl: string, username: string) {
  await page.goto(inviteUrl);
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(`${username}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm the password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create my account' }).click();
}

/** Signs in through the sign-in page (English interface). */
export async function signIn(page: Page, identifier: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Username or email').fill(identifier);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

/**
 * A new regular user, signed in in a fresh browser context, invited by the admin of `adminPage`.
 */
export async function newMember(
  browser: Browser,
  adminPage: Page,
  prefix = 'member',
): Promise<{ page: Page; username: string; email: string }> {
  const page = await newVisitor(browser);
  const username = uniqueName(prefix);
  await registerWithApi(page.request, await createInvite(adminPage), username);
  return { page, username, email: `${username}@example.com` };
}

/** The id of a user, read from the admin user list (`adminPage` is signed in as an admin). */
export async function userId(adminPage: Page, username: string): Promise<string> {
  const res = await adminPage.request.get('/api/v1/admin/users');
  const users = (await res.json()) as { id: string; username: string }[];
  const found = users.find((user) => user.username.toLowerCase() === username.toLowerCase());
  if (!found) throw new Error(`No user ${username}`);
  return found.id;
}

/** A password reset link for a user, created by the admin of `adminPage`. */
export async function createResetLink(adminPage: Page, id: string): Promise<string> {
  const res = await adminPage.request.post(`/api/v1/admin/users/${id}/reset-link`, {
    headers: ORIGIN_HEADER,
  });
  if (res.status() !== 201) throw new Error(`Reset link creation failed: ${res.status()}`);
  return ((await res.json()) as { url: string }).url;
}

/** The current code of a TOTP secret (base32, as shown for manual entry), like an authenticator app. */
export function totpCode(secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/[\s=]/g, '').toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  }
  const key = Buffer.from(bits.match(/.{8}/g)?.map((byte) => parseInt(byte, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = (hmac[hmac.length - 1] ?? 0) & 0xf;
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, '0');
}

/**
 * A virtual WebAuthn authenticator (Chromium only) for `page`: a platform authenticator with
 * discoverable credentials that verifies the user (like a fingerprint) unless told otherwise.
 *
 * The virtual authenticator answers passkey autofill requests by itself (no user pick), so the
 * sign-in page would sign in on load and race with clicks: autofill is reported unavailable unless
 * `autofill: true` (set before the next navigation).
 */
export async function addVirtualAuthenticator(
  page: Page,
  options: { userVerified?: boolean; hasUserVerification?: boolean; autofill?: boolean } = {},
): Promise<{
  credentialCount: () => Promise<number>;
  /** Whether the next ceremonies verify the user (PIN, fingerprint) or only check presence. */
  setUserVerified: (verified: boolean) => Promise<void>;
}> {
  if (!options.autofill) {
    await page.addInitScript(() => {
      PublicKeyCredential.isConditionalMediationAvailable = () => Promise.resolve(false);
    });
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: options.hasUserVerification ?? true,
      isUserVerified: options.userVerified ?? true,
      automaticPresenceSimulation: true,
    },
  });
  return {
    credentialCount: async () =>
      (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials.length,
    setUserVerified: async (isUserVerified) => {
      await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified });
    },
  };
}
