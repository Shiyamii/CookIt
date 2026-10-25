import {
  forgotPasswordInputSchema,
  passwordResetInputSchema,
  tokenCheckSchema,
} from '@cookit/shared';
import { Hono } from 'hono';
import { env } from '../../env';
import type { AppEnv } from '../../http/app-env';
import { clientIp } from '../../http/client-ip';
import { parseJson } from '../../http/validate';
import { rateLimit, RATE_LIMITS } from '../rate-limit/rate-limit.middleware';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import type { PasswordResetService } from './password-reset.service';

export function createPasswordResetController(deps: {
  passwordReset: PasswordResetService;
  rateLimits: RateLimitService;
  mail: { enabled: boolean };
  log?: (message: string) => void;
}) {
  const app = new Hono<AppEnv>();

  // POST with the token in the body: it must not appear in URLs (access logs).
  app.post(
    '/api/v1/password-reset/check',
    rateLimit(deps.rateLimits, RATE_LIMITS.tokenCheckPerIp),
    async (c) => {
      const input = await parseJson(c, tokenCheckSchema);
      const kind = input.ok ? await deps.passwordReset.linkKind(input.data.token) : undefined;
      return kind ? c.json({ ok: true, kind }) : c.json({ error: 'invalid_token' }, 404);
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

  // "Forgot your password?" (email configured only). The same answer whether the account exists
  // or not, sent before the work is done: neither the answer nor its timing tells.
  app.post(
    '/api/v1/password-reset/request',
    rateLimit(deps.rateLimits, RATE_LIMITS.passwordForgotPerIp),
    async (c, next) => {
      if (!deps.mail.enabled) return c.json({ error: 'email_not_configured' }, 400);
      return next();
    },
    async (c) => {
      const input = await parseJson(c, forgotPasswordInputSchema);
      if (!input.ok) return input.response;
      // Over a limit for this account: nothing more is sent, and the answer stays the same.
      const client = clientIp(c);
      const allow = async (accountId: string) => {
        for (const [rule, subject] of [
          [RATE_LIMITS.passwordForgotPerAccount, `${accountId}|${client}`],
          [RATE_LIMITS.passwordForgotPerAccountDay, `${accountId}|${client}`],
          [RATE_LIMITS.passwordForgotPerAccountCeiling, accountId],
        ] as const) {
          const { allowed } = await deps.rateLimits.check(
            { ...rule, limit: rule.limit * env.RATE_LIMIT_FACTOR },
            subject,
          );
          if (!allowed) return false;
        }
        return true;
      };
      deps.passwordReset.requestByEmail(input.data, allow).catch((error: unknown) => {
        // Never the error itself: a query error carries its parameters (what was typed).
        const code = (error as { cause?: { code?: unknown } }).cause?.code;
        deps.log?.(`Password reset request failed${typeof code === 'string' ? ` (${code})` : ''}`);
      });
      return c.json({ ok: true });
    },
  );

  return app;
}
