import { cookSessionInputSchema } from '@cookit/shared';
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../../http/app-env';
import { parseJson } from '../../http/validate';
import { requireUser } from '../auth/auth.middleware';
import type { CookingService } from './cooking.service';

export function createCookingController(deps: { cooking: CookingService }) {
  const app = new Hono<AppEnv>();
  const userId = (c: Context<AppEnv>) => c.var.user?.id ?? '';

  app.use('/api/v1/cook/*', requireUser);

  // The active session (or null), with the server time for clock correction.
  app.get('/api/v1/cook/session', async (c) => c.json(await deps.cooking.get(userId(c))));

  // Every event saves the whole state (created on the first save).
  app.put('/api/v1/cook/session', async (c) => {
    const input = await parseJson(c, cookSessionInputSchema);
    if (!input.ok) return input.response;
    const result = await deps.cooking.save(userId(c), input.data.state);
    if ('error' in result) return c.json(result, 400);
    return c.json(result);
  });

  app.delete('/api/v1/cook/session', async (c) => c.json(await deps.cooking.end(userId(c))));

  return app;
}
