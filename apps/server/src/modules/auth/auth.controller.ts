import {
  backupCodeInputSchema,
  passkeyAuthenticationInputSchema,
  passkeyDeleteInputSchema,
  passkeyRegistrationInputSchema,
  passkeyRenameInputSchema,
  passwordConfirmInputSchema,
  totpCodeInputSchema,
  updateProfileInputSchema,
} from '@cookit/shared';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import type { ZodType } from 'zod';
import type { AppEnv } from '../../http/app-env';
import type { AccountSecurityService } from '../account-security/account-security.service';
import { rateLimit, RATE_LIMITS } from '../rate-limit/rate-limit.middleware';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import type { Auth } from './auth';

/**
 * Better Auth routes we use, relative to /api/v1/auth. Everything else Better Auth ships (sign-up,
 * email flows, account deletion…) answers 404: account creation goes through invites.
 */
const ALLOWED = new Set([
  'POST /sign-in/email',
  'POST /sign-in/username',
  'POST /sign-out',
  'GET /get-session',
  'POST /change-password',
  'POST /update-user',
  'GET /list-sessions',
  'POST /revoke-session',
  'POST /revoke-other-sessions',
  // 2FA: setup (password required), then the second step of a password sign-in.
  'POST /two-factor/enable',
  'POST /two-factor/disable',
  'POST /two-factor/generate-backup-codes',
  'POST /two-factor/verify-totp',
  'POST /two-factor/verify-backup-code',
  // Passkeys: management (the list comes from GET /api/v1/me/security), then sign-in.
  'POST /passkey/verify-registration',
  'POST /passkey/update-passkey',
  'POST /passkey/delete-passkey',
  'GET /passkey/generate-authenticate-options',
  'POST /passkey/verify-authentication',
]);

/** Routes usable without a session (the others also refuse disabled accounts, see below). */
const ANONYMOUS = new Set([
  'POST /sign-in/email',
  'POST /sign-in/username',
  'POST /sign-out',
  // The 2FA step of a sign-in only has Better Auth's short-lived `two_factor` cookie.
  'POST /two-factor/verify-totp',
  'POST /two-factor/verify-backup-code',
  'GET /passkey/generate-authenticate-options',
  'POST /passkey/verify-authentication',
]);

/**
 * Strict body schemas of the POST routes that take input: unknown fields are refused before
 * Better Auth sees them (e.g. `trustDevice`, `issuer`, `method`, or `username` on update-user).
 */
const BODY_SCHEMAS: Record<string, ZodType> = {
  'POST /update-user': updateProfileInputSchema,
  'POST /two-factor/enable': passwordConfirmInputSchema,
  'POST /two-factor/disable': passwordConfirmInputSchema,
  'POST /two-factor/generate-backup-codes': passwordConfirmInputSchema,
  'POST /passkey/generate-register-options': passwordConfirmInputSchema,
  'POST /two-factor/verify-totp': totpCodeInputSchema,
  'POST /two-factor/verify-backup-code': backupCodeInputSchema,
  'POST /passkey/verify-registration': passkeyRegistrationInputSchema,
  'POST /passkey/update-passkey': passkeyRenameInputSchema,
  'POST /passkey/delete-passkey': passkeyDeleteInputSchema,
  'POST /passkey/verify-authentication': passkeyAuthenticationInputSchema,
};

/** `METHOD /path` relative to the Better Auth base path. */
function routeOf(c: Context): string {
  return `${c.req.method} ${c.req.path.slice('/api/v1/auth'.length)}`;
}

async function jsonBody(c: Context): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await c.req.raw.clone().json();
    return typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The account a sign-in attempt targets, to limit attempts per account and not only per IP. The
 * field depends on the route: an extra `email` field must not open a new counter for a username
 * sign-in.
 */
async function signInAccount(c: Context): Promise<string | undefined> {
  const field = c.req.path.endsWith('/sign-in/email') ? 'email' : 'username';
  const value = (await jsonBody(c))?.[field];
  // Fail closed: an unreadable body still counts, under one shared key.
  return typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase().slice(0, 200)
    : '(unreadable)';
}

const validateBody: MiddlewareHandler<AppEnv> = async (c, next) => {
  const schema = BODY_SCHEMAS[routeOf(c)];
  if (schema && !schema.safeParse(await jsonBody(c)).success) {
    return c.json({ error: 'invalid_input' }, 400);
  }
  await next();
};

export function createAuthController(deps: {
  auth: Auth;
  rateLimits: RateLimitService;
  accountSecurity: AccountSecurityService;
}) {
  const app = new Hono<AppEnv>();

  // JSON only: Better Auth also accepts form bodies, which our limiters (reading JSON to find
  // the targeted account) would not see. The SPA only sends JSON.
  app.post('/api/v1/auth/*', async (c, next) => {
    const type = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (type !== 'application/json') return c.json({ error: 'unsupported_media_type' }, 415);
    await next();
  });

  app.post(
    '/api/v1/auth/sign-in/*',
    rateLimit(deps.rateLimits, RATE_LIMITS.signInPerIp),
    rateLimit(deps.rateLimits, RATE_LIMITS.signInPerAccount, signInAccount),
  );
  // Routes that check the password: a stolen session must not allow guessing it.
  for (const path of [
    'change-password',
    'two-factor/enable',
    'two-factor/disable',
    'two-factor/generate-backup-codes',
    'passkey/generate-register-options',
    'passkey/delete-passkey',
  ]) {
    app.post(`/api/v1/auth/${path}`, rateLimit(deps.rateLimits, RATE_LIMITS.passwordCheckPerIp));
  }
  // Better Auth also allows 5 codes per sign-in challenge and locks 2FA for an hour after
  // 5 failures (auth.ts); this limits one IP across accounts.
  app.post(
    '/api/v1/auth/two-factor/verify-*',
    rateLimit(deps.rateLimits, RATE_LIMITS.twoFactorPerIp),
  );
  app.on(
    ['GET', 'POST'],
    [
      '/api/v1/auth/passkey/generate-authenticate-options',
      '/api/v1/auth/passkey/verify-authentication',
    ],
    rateLimit(deps.rateLimits, RATE_LIMITS.passkeySignInPerIp),
  );
  app.post('/api/v1/auth/*', validateBody);

  // This GET writes a challenge (row + cookie): only from our own pages, not from an <img> on
  // another site (browsers always send Sec-Fetch-Site; `sameOrigin` only covers POST).
  app.get('/api/v1/auth/passkey/generate-authenticate-options', async (c, next) => {
    const site = c.req.header('sec-fetch-site');
    if (site !== undefined && site !== 'same-origin') {
      return c.json({ error: 'forbidden_origin' }, 403);
    }
    await next();
  });

  /** Checks `password` of the signed-in user (answers like Better Auth on a wrong password). */
  const passwordConfirmed = async (c: Context<AppEnv>): Promise<Response | undefined> => {
    const password = (await jsonBody(c))?.password;
    const userId = c.var.user?.id;
    if (!userId) return c.json({ error: 'unauthorized' }, 401);
    if (
      typeof password !== 'string' ||
      !(await deps.accountSecurity.confirmPassword(userId, password))
    ) {
      return c.json({ code: 'INVALID_PASSWORD' }, 400);
    }
    return undefined;
  };

  // Adding a passkey asks for the password: a passkey skips the 2FA step and survives "sign out
  // everywhere", so a stolen session alone must not be able to plant one. Better Auth's route is
  // a GET without body: ours is a POST that checks the password, then calls it. The challenge it
  // returns is the only one `verify-registration` accepts.
  app.post('/api/v1/auth/passkey/generate-register-options', async (c) => {
    const refused = await passwordConfirmed(c);
    if (refused) return refused;
    // The authenticator shows the account email; no client-chosen name or attachment.
    const url = new URL(c.req.url);
    url.search = '';
    const headers = new Headers(c.req.raw.headers);
    headers.delete('content-type');
    headers.delete('content-length');
    return deps.auth.handler(new Request(url.toString(), { method: 'GET', headers }));
  });

  // Deleting one too (an intruder could remove the owner's passkeys), and an account always
  // keeps a way to sign in (plan §5.1 bis).
  app.post('/api/v1/auth/passkey/delete-passkey', async (c, next) => {
    const refused = await passwordConfirmed(c);
    if (refused) return refused;
    const id = (await jsonBody(c))?.id;
    if (typeof id !== 'string') return c.json({ error: 'invalid_input' }, 400);
    const removal = await deps.accountSecurity.canRemovePasskey(c.var.user?.id ?? '', id);
    if (removal === 'not_found') return c.json({ error: 'not_found' }, 404);
    if (removal === 'last_sign_in_method') return c.json({ error: 'last_sign_in_method' }, 409);
    await next();
  });

  // The signed-in user (null when anonymous), as the SPA needs it.
  app.get('/api/v1/me', (c) => {
    const user = c.var.user;
    if (!user) return c.json({ user: null });
    const { id, name, email, username, displayUsername, role, locale, image } = user;
    return c.json({
      user: {
        id,
        name,
        email,
        username: displayUsername ?? username,
        role,
        locale,
        image: image ?? null,
      },
    });
  });

  app.on(['GET', 'POST'], '/api/v1/auth/*', (c) => {
    const route = routeOf(c);
    if (!ALLOWED.has(route)) return c.json({ error: 'not_found' }, 404);
    // `c.var.user` is null for a disabled account even if a session row survived a race with
    // the disable: Better Auth itself does not know about `disabledAt`.
    if (!ANONYMOUS.has(route) && !c.var.user) {
      return route === 'GET /get-session' ? c.json(null) : c.json({ error: 'unauthorized' }, 401);
    }
    return deps.auth.handler(c.req.raw);
  });

  return app;
}
