import { shoppingListInputSchema } from '@cookit/shared';
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../../http/app-env';
import { parseJson } from '../../http/validate';
import { requireUser } from '../auth/auth.middleware';
import { RATE_LIMITS, rateLimit } from '../rate-limit/rate-limit.middleware';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import type { ShoppingService } from './shopping.service';

export function createShoppingController(deps: {
  shopping: ShoppingService;
  rateLimits: RateLimitService;
}) {
  const app = new Hono<AppEnv>();
  const userId = (c: Context<AppEnv>) => c.var.user?.id ?? '';

  app.use('/api/v1/shopping/*', requireUser);

  // The user's list (null before the first save).
  app.get('/api/v1/shopping/list', async (c) => c.json(await deps.shopping.get(userId(c))));

  // Every change saves the whole list.
  app.put(
    '/api/v1/shopping/list',
    rateLimit(deps.rateLimits, RATE_LIMITS.shoppingSavePerAccount, (c) => c.var.user?.id),
    async (c) => {
      const input = await parseJson(c, shoppingListInputSchema);
      if (!input.ok) return input.response;
      return c.json(await deps.shopping.save(userId(c), input.data.state));
    },
  );

  return app;
}
