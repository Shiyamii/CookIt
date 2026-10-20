import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../../http/app-env';
import type { Auth } from './auth';

/**
 * Reads the session cookie and sets `c.var.user` (null when anonymous or disabled). Session
 * refresh cookies from Better Auth are forwarded to the response.
 */
export function sessionMiddleware(auth: Auth): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const { headers, response } = await auth.api.getSession({
      headers: c.req.raw.headers,
      returnHeaders: true,
    });
    const user = response?.user;
    c.set('user', user && !user.disabledAt ? user : null);
    await next();
    // Better Auth's own routes set their cookies themselves (sign-out, new session after a
    // password change): an extra refresh cookie for the old session must not override them.
    if (c.req.path.startsWith('/api/v1/auth/')) return;
    for (const cookie of headers.getSetCookie()) c.header('Set-Cookie', cookie, { append: true });
  };
}

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) return c.json({ error: 'unauthorized' }, 401);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.var.user) return c.json({ error: 'unauthorized' }, 401);
  if (c.var.user.role !== 'admin') return c.json({ error: 'forbidden' }, 403);
  await next();
};
