import { pushSubscriptionInputSchema, pushUnsubscribeInputSchema } from '@cookit/shared';
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../../http/app-env';
import { parseJson } from '../../http/validate';
import { requireUser } from '../auth/auth.middleware';
import { RATE_LIMITS, rateLimit } from '../rate-limit/rate-limit.middleware';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import type { PushService } from './push.service';

export function createPushController(deps: { push: PushService; rateLimits: RateLimitService }) {
  const app = new Hono<AppEnv>();
  const userId = (c: Context<AppEnv>) => c.var.user?.id ?? '';

  app.use('/api/v1/push/*', requireUser);

  // The VAPID public key the browser subscribes with (null: push is off on this server).
  app.get('/api/v1/push/key', (c) => c.json({ publicKey: deps.push.publicKey() }));

  app.get('/api/v1/push/subscriptions', async (c) =>
    c.json({ devices: await deps.push.devices(userId(c)) }),
  );

  app.post(
    '/api/v1/push/subscriptions',
    rateLimit(deps.rateLimits, RATE_LIMITS.pushSubscribePerAccount, (c) => c.var.user?.id),
    async (c) => {
      const input = await parseJson(c, pushSubscriptionInputSchema);
      if (!input.ok) return input.response;
      const result = await deps.push.subscribe(
        userId(c),
        input.data,
        c.req.header('user-agent') ?? '',
      );
      if ('error' in result) return c.json(result, 400);
      return c.json(result);
    },
  );

  app.delete('/api/v1/push/subscriptions', async (c) => {
    const input = await parseJson(c, pushUnsubscribeInputSchema);
    if (!input.ok) return input.response;
    await deps.push.unsubscribe(userId(c), input.data.endpoint);
    return c.json({ ok: true });
  });

  // Each test makes the server call the push services: limited per account.
  app.post(
    '/api/v1/push/test',
    rateLimit(deps.rateLimits, RATE_LIMITS.pushTestPerAccount, (c) => c.var.user?.id),
    async (c) => c.json(await deps.push.sendTest(userId(c), c.var.user?.locale ?? 'en')),
  );

  return app;
}
