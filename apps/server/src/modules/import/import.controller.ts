import { importUrlInputSchema } from '@cookit/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../http/app-env';
import { parseJson } from '../../http/validate';
import { requireUser } from '../auth/auth.middleware';
import { rateLimit, RATE_LIMITS } from '../rate-limit/rate-limit.middleware';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import type { ImportService } from './import.service';

export function createImportController(deps: {
  importer: ImportService;
  rateLimits: RateLimitService;
}) {
  const app = new Hono<AppEnv>();

  // Signed-in users only, and limited: each call makes the server fetch a page on the web.
  app.post(
    '/api/v1/import/url',
    requireUser,
    rateLimit(deps.rateLimits, RATE_LIMITS.importUrlPerIp),
    rateLimit(deps.rateLimits, RATE_LIMITS.importUrlPerAccount, (c) => c.var.user?.id),
    async (c) => {
      const input = await parseJson(c, importUrlInputSchema);
      if (!input.ok) return input.response;
      const result = await deps.importer.fromUrl(input.data.url, input.data.lang);
      return 'error' in result ? c.json(result, 422) : c.json(result);
    },
  );

  return app;
}
