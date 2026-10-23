import {
  createInviteInputSchema,
  isLocale,
  registerInputSchema,
  tokenCheckSchema,
} from '@cookit/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../http/app-env';
import { parseJson } from '../../http/validate';
import type { Auth } from '../auth/auth';
import { requireAdmin } from '../auth/auth.middleware';
import { rateLimit, RATE_LIMITS } from '../rate-limit/rate-limit.middleware';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import type { InvitesService } from './invites.service';

export function createInvitesController(deps: {
  invites: InvitesService;
  auth: Auth;
  rateLimits: RateLimitService;
}) {
  const app = new Hono<AppEnv>();

  // Sign-up page: is this invite (or setup) link still usable?
  // POST with the token in the body: it must not appear in URLs (access logs).
  app.post(
    '/api/v1/invites/check',
    rateLimit(deps.rateLimits, RATE_LIMITS.tokenCheckPerIp),
    async (c) => {
      const input = await parseJson(c, tokenCheckSchema);
      const invite = input.ok ? await deps.invites.check(input.data.token) : undefined;
      return invite ? c.json(invite) : c.json({ error: 'invalid_token' }, 404);
    },
  );

  // Account creation: consumes the invite, then signs the new user in (session cookie).
  app.post('/api/v1/register', rateLimit(deps.rateLimits, RATE_LIMITS.registerPerIp), async (c) => {
    const input = await parseJson(c, registerInputSchema);
    if (!input.ok) return input.response;
    const result = await deps.invites.accept(input.data);
    if (!result.ok) {
      return c.json({ error: result.error }, result.error === 'invalid_token' ? 400 : 409);
    }
    return deps.auth.api.signInUsername({
      body: { username: result.username ?? input.data.username, password: input.data.password },
      headers: c.req.raw.headers,
      asResponse: true,
    });
  });

  app.use('/api/v1/admin/invites', requireAdmin);
  app.use('/api/v1/admin/invites/*', requireAdmin);

  app.get('/api/v1/admin/invites', async (c) => c.json(await deps.invites.list()));

  app.post(
    '/api/v1/admin/invites',
    // Each invite may send an email: limited like any sending.
    rateLimit(deps.rateLimits, RATE_LIMITS.emailSendPerAccount, (c) => c.var.user?.id),
    async (c) => {
      const input = await parseJson(c, createInviteInputSchema);
      if (!input.ok) return input.response;
      const admin = c.var.user;
      if (!admin) return c.json({ error: 'unauthorized' }, 401);
      const result = await deps.invites.create(
        { id: admin.id, name: admin.name, locale: isLocale(admin.locale) ? admin.locale : 'en' },
        input.data,
      );
      if ('error' in result) return c.json(result, result.error === 'email_taken' ? 409 : 400);
      return c.json(result, 201);
    },
  );

  app.post('/api/v1/admin/invites/:id/revoke', async (c) => {
    const revoked = await deps.invites.revoke(c.req.param('id'));
    return revoked ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
  });

  return app;
}
