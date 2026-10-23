import type { Context, MiddlewareHandler } from 'hono';
import { env } from '../../env';
import { clientIp } from '../../http/client-ip';
import type { RateLimitRule, RateLimitService } from './rate-limit.service';

/** Rules of the sensitive routes (plan §5.1: login, sign-up, password reset, 2FA, passkeys). */
export const RATE_LIMITS = {
  signInPerIp: { name: 'sign-in:ip', limit: 20, windowSeconds: 15 * 60 },
  signInPerAccount: { name: 'sign-in:account', limit: 10, windowSeconds: 15 * 60 },
  registerPerIp: { name: 'register:ip', limit: 10, windowSeconds: 60 * 60 },
  passwordResetPerIp: { name: 'password-reset:ip', limit: 10, windowSeconds: 60 * 60 },
  tokenCheckPerIp: { name: 'token-check:ip', limit: 60, windowSeconds: 10 * 60 },
  passwordCheckPerIp: { name: 'password-check:ip', limit: 10, windowSeconds: 15 * 60 },
  twoFactorPerIp: { name: 'two-factor:ip', limit: 20, windowSeconds: 15 * 60 },
  passkeySignInPerIp: { name: 'passkey-sign-in:ip', limit: 60, windowSeconds: 10 * 60 },
  // Each import makes the server fetch a page: kept low.
  importUrlPerIp: { name: 'import-url:ip', limit: 20, windowSeconds: 10 * 60 },
  // Each test notification makes the server call the push services.
  pushTestPerAccount: { name: 'push-test:account', limit: 10, windowSeconds: 10 * 60 },
  pushSubscribePerAccount: { name: 'push-subscribe:account', limit: 30, windowSeconds: 10 * 60 },
  // Photos and profile pictures: each upload stores up to ~800 kB.
  imageUploadPerAccount: { name: 'image-upload:account', limit: 60, windowSeconds: 10 * 60 },
  // "Add to my library" copies the photos too.
  recipeCopyPerAccount: { name: 'recipe-copy:account', limit: 30, windowSeconds: 10 * 60 },
  // Every cooking event is a save (about one a second at most while cooking).
  cookSavePerAccount: { name: 'cook-save:account', limit: 600, windowSeconds: 10 * 60 },
  // Emails sent by an admin (invites, test email): the SMTP server and its reputation.
  emailSendPerAccount: { name: 'email-send:account', limit: 30, windowSeconds: 60 * 60 },
  // "Forgot your password?": per IP, and per account asked for (whoever asks).
  passwordForgotPerIp: { name: 'password-forgot:ip', limit: 10, windowSeconds: 60 * 60 },
  passwordForgotPerAccount: { name: 'password-forgot:account', limit: 3, windowSeconds: 60 * 60 },
  passwordForgotPerAccountDay: {
    name: 'password-forgot:account-day',
    limit: 6,
    windowSeconds: 24 * 60 * 60,
  },
  // Settings saved from a form.
  settingsSavePerAccount: { name: 'settings-save:account', limit: 60, windowSeconds: 10 * 60 },
  // Every item checked in the shop is a save.
  shoppingSavePerAccount: { name: 'shopping-save:account', limit: 600, windowSeconds: 10 * 60 },
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
