import type { Context, MiddlewareHandler } from 'hono';
import { env } from '../../env';
import { clientIp } from '../../http/client-ip';
import type { RateLimitRule, RateLimitService } from './rate-limit.service';

/** Rules of the sensitive routes (plan §5.1: login, sign-up, password reset). */
export const RATE_LIMITS = {
  signInPerIp: { name: 'sign-in:ip', limit: 20, windowSeconds: 15 * 60 },
  signInPerAccount: { name: 'sign-in:account', limit: 10, windowSeconds: 15 * 60 },
  registerPerIp: { name: 'register:ip', limit: 10, windowSeconds: 60 * 60 },
  passwordResetPerIp: { name: 'password-reset:ip', limit: 10, windowSeconds: 60 * 60 },
  tokenCheckPerIp: { name: 'token-check:ip', limit: 60, windowSeconds: 10 * 60 },
  changePasswordPerIp: { name: 'change-password:ip', limit: 10, windowSeconds: 15 * 60 },
} satisfies Record<string, RateLimitRule>;

/**
 * Rejects the request with 429 when `subject(c)` exceeded the rule. The default subject is the
 * client IP; a subject of `undefined` skips the check (nothing to count).
 */
export function rateLimit(
  service: RateLimitService,
  rule: RateLimitRule,
  subject: (c: Context) => string | undefined | Promise<string | undefined> = clientIp,
): MiddlewareHandler {
  return async (c, next) => {
    const key = await subject(c);
    if (key !== undefined) {
      const decision = await service.check(
        { ...rule, limit: rule.limit * env.RATE_LIMIT_FACTOR },
        key,
      );
      if (!decision.allowed) {
        c.header('Retry-After', String(decision.retryAfterSeconds));
        return c.json({ error: 'rate_limited', retryAfter: decision.retryAfterSeconds }, 429);
      }
    }
    await next();
  };
}
