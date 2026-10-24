import { memberListedInputSchema, memberUsernameSchema, recipeSearchSchema } from '@cookit/shared';
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../../http/app-env';
import { parseJson } from '../../http/validate';
import { requireUser } from '../auth/auth.middleware';
import { rateLimit, RATE_LIMITS } from '../rate-limit/rate-limit.middleware';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import type { MembersService } from './members.service';

/** The members list and pages (signed in), and the user's choice to appear in the list. */
export function createMembersController(deps: {
  members: MembersService;
  rateLimits: RateLimitService;
}) {
  const app = new Hono<AppEnv>();
  app.use('/api/v1/members', requireUser);
  app.use('/api/v1/members/*', requireUser);
  app.use('/api/v1/me/listed', requireUser);
  // Pages by username: limited per account (trying usernames one after the other).
  app.use(
    '/api/v1/members/:username/*',
    rateLimit(deps.rateLimits, RATE_LIMITS.memberPagePerAccount, (c) => c.var.user?.id),
  );
  app.use(
    '/api/v1/members/:username',
    rateLimit(deps.rateLimits, RATE_LIMITS.memberPagePerAccount, (c) => c.var.user?.id),
  );
  const userId = (c: Context<AppEnv>) => c.var.user?.id ?? '';
  // Not the shape of a username: no such member.
  const username = (c: Context<AppEnv>) => memberUsernameSchema.safeParse(c.req.param('username'));

  app.get('/api/v1/members', async (c) => c.json(await deps.members.list()));

  app.get('/api/v1/members/:username', async (c) => {
    const name = username(c);
    if (!name.success) return c.json({ error: 'not_found' }, 404);
    const profile = await deps.members.profile(name.data, userId(c));
    return 'error' in profile ? c.json(profile, 404) : c.json(profile);
  });

  app.get('/api/v1/members/:username/recipes', async (c) => {
    const name = username(c);
    if (!name.success) return c.json({ error: 'not_found' }, 404);
    const query = recipeSearchSchema.safeParse(c.req.query());
    if (!query.success) return c.json({ error: 'invalid_input' }, 400);
    const page = await deps.members.recipes(name.data, query.data, userId(c));
    return 'error' in page ? c.json(page, 404) : c.json(page);
  });

  app.get('/api/v1/me/listed', async (c) => c.json(await deps.members.listed(userId(c))));

  app.put(
    '/api/v1/me/listed',
    rateLimit(deps.rateLimits, RATE_LIMITS.settingsSavePerAccount, (c) => c.var.user?.id),
    async (c) => {
      const input = await parseJson(c, memberListedInputSchema);
      if (!input.ok) return input.response;
      return c.json(await deps.members.setListed(userId(c), input.data.listed));
    },
  );

  return app;
}
