import { passwordResetInputSchema, tokenCheckSchema } from '@cookit/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../http/app-env';
import { parseJson } from '../../http/validate';
import { rateLimit, RATE_LIMITS } from '../rate-limit/rate-limit.middleware';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import type { PasswordResetService } from './password-reset.service';

export function createPasswordResetController(deps: {
  passwordReset: PasswordResetService;
  rateLimits: RateLimitService;
}) {
  const app = new Hono<AppEnv>();

  // POST with the token in the body: it must not appear in URLs (access logs).
  app.post(
    '/api/v1/password-reset/check',
    rateLimit(deps.rateLimits, RATE_LIMITS.tokenCheckPerIp),
    async (c) => {
      const input = await parseJson(c, tokenCheckSchema);
      const valid = input.ok && (await deps.passwordReset.isValid(input.data.token));
      return valid ? c.json({ ok: true }) : c.json({ error: 'invalid_token' }, 404);
    },
  );

  app.post(
    '/api/v1/password-reset',
    rateLimit(deps.rateLimits, RATE_LIMITS.passwordResetPerIp),
    async (c) => {
      const input = await parseJson(c, passwordResetInputSchema);
      if (!input.ok) return input.response;
      const done = await deps.passwordReset.reset(input.data);
      return done ? c.json({ ok: true }) : c.json({ error: 'invalid_token' }, 400);
    },
  );

  return app;
}
