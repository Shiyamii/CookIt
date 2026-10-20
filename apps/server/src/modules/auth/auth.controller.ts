import { updateProfileInputSchema } from '@cookit/shared';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import type { AppEnv } from '../../http/app-env';
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
]);

/** Routes usable without a session (the others also refuse disabled accounts, see below). */
const ANONYMOUS = new Set(['POST /sign-in/email', 'POST /sign-in/username', 'POST /sign-out']);

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

/** Only `name` and `locale` may change on one's own profile (shared strict schema). */
const validateProfileUpdate: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!updateProfileInputSchema.safeParse(await jsonBody(c)).success) {
    return c.json({ error: 'invalid_input' }, 400);
  }
  await next();
};

export function createAuthController(deps: { auth: Auth; rateLimits: RateLimitService }) {
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
  app.post(
    '/api/v1/auth/change-password',
    rateLimit(deps.rateLimits, RATE_LIMITS.changePasswordPerIp),
  );
  app.post('/api/v1/auth/update-user', validateProfileUpdate);

  // The signed-in user (null when anonymous), as the SPA needs it.
  app.get('/api/v1/me', (c) => {
    const user = c.var.user;
    if (!user) return c.json({ user: null });
    const { id, name, email, username, displayUsername, role, locale } = user;
    return c.json({
      user: { id, name, email, username: displayUsername ?? username, role, locale },
    });
  });

  app.on(['GET', 'POST'], '/api/v1/auth/*', (c) => {
    const route = `${c.req.method} ${c.req.path.slice('/api/v1/auth'.length)}`;
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
