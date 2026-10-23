import { cookSessionInputSchema } from '@cookit/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../http/app-env';
import { parseJson } from '../../http/validate';
import { requireUser } from '../auth/auth.middleware';
import { RATE_LIMITS, rateLimit } from '../rate-limit/rate-limit.middleware';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import type { CookingService } from './cooking.service';

export function createCookingController(deps: {
  cooking: CookingService;
  rateLimits: RateLimitService;
}) {
  const app = new Hono<AppEnv>();
  const userId = (c: Context<AppEnv>) => c.var.user?.id ?? '';

  app.use('/api/v1/cook/*', requireUser);

  // The active session (or null), with the server time for clock correction.
  app.get('/api/v1/cook/session', async (c) => c.json(await deps.cooking.get(userId(c))));

  // Every event saves the whole state (created on the first save).
  app.put(
    '/api/v1/cook/session',
    rateLimit(deps.rateLimits, RATE_LIMITS.cookSavePerAccount, (c) => c.var.user?.id),
    async (c) => {
      const input = await parseJson(c, cookSessionInputSchema);
      if (!input.ok) return input.response;
      const result = await deps.cooking.save(userId(c), input.data.state);
      if ('error' in result) return c.json(result, 400);
      return c.json(result);
    },
  );

  app.delete('/api/v1/cook/session', async (c) => c.json(await deps.cooking.end(userId(c))));

  // "Stop" on a timer's notification (sent by the service worker).
  app.post(
    '/api/v1/cook/timers/:id/stop',
    rateLimit(deps.rateLimits, RATE_LIMITS.cookSavePerAccount, (c) => c.var.user?.id),
    async (c) => {
      const id = z.uuid().safeParse(c.req.param('id'));
      if (!id.success) return c.json({ error: 'invalid_input' }, 400);
      return c.json(await deps.cooking.stopTimer(userId(c), id.data));
    },
  );

  return app;
}
