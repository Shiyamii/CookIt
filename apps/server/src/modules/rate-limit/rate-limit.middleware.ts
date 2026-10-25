import type { Context, MiddlewareHandler } from 'hono';
import { env } from '../../env';
import { clientIp } from '../../http/client-ip';
import type { RateLimitRule, RateLimitService } from './rate-limit.service';

/** Rules of the sensitive routes (plan §5.1: login, sign-up, password reset, 2FA, passkeys). */
export const RATE_LIMITS = {
  signInPerIp: { name: 'sign-in:ip', limit: 20, windowSeconds: 15 * 60 },
  // Failed sign-ins only (see rateLimitFailures): per account from one client, and a higher
  // ceiling per account from anywhere. Successes do not count, so nobody can lock someone out
  // of their account from another address by failing on purpose (only past the ceiling).
  signInPerAccountIp: { name: 'sign-in:account-ip', limit: 10, windowSeconds: 15 * 60 },
  signInPerAccount: { name: 'sign-in:account', limit: 50, windowSeconds: 15 * 60 },
  registerPerIp: { name: 'register:ip', limit: 10, windowSeconds: 60 * 60 },
  passwordResetPerIp: { name: 'password-reset:ip', limit: 10, windowSeconds: 60 * 60 },
  tokenCheckPerIp: { name: 'token-check:ip', limit: 60, windowSeconds: 10 * 60 },
  passwordCheckPerIp: { name: 'password-check:ip', limit: 10, windowSeconds: 15 * 60 },
  // Wrong passwords only (rateLimitFailures): a stolen session guessing the password from many
  // addresses, without locking the owner out of their own password change from elsewhere.
  passwordCheckPerAccountIp: {
    name: 'password-check:account-ip',
    limit: 10,
    windowSeconds: 15 * 60,
  },
  passwordCheckPerAccount: { name: 'password-check:account', limit: 30, windowSeconds: 15 * 60 },
  twoFactorPerIp: { name: 'two-factor:ip', limit: 20, windowSeconds: 15 * 60 },
  passkeySignInPerIp: { name: 'passkey-sign-in:ip', limit: 60, windowSeconds: 10 * 60 },
  // Each import makes the server fetch a page: kept low.
  importUrlPerIp: { name: 'import-url:ip', limit: 20, windowSeconds: 10 * 60 },
  importUrlPerAccount: { name: 'import-url:account', limit: 20, windowSeconds: 10 * 60 },
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
  // Per account asked for, from one client: someone else asking for that account from elsewhere
  // does not use up its owner's links. And a ceiling per account (its mailbox).
  passwordForgotPerAccount: {
    name: 'password-forgot:account-ip',
    limit: 3,
    windowSeconds: 60 * 60,
  },
  passwordForgotPerAccountDay: {
    name: 'password-forgot:account-ip-day',
    limit: 6,
    windowSeconds: 24 * 60 * 60,
  },
  passwordForgotPerAccountCeiling: {
    name: 'password-forgot:account-day',
    limit: 20,
    windowSeconds: 24 * 60 * 60,
  },
  // Settings saved from a form.
  settingsSavePerAccount: { name: 'settings-save:account', limit: 60, windowSeconds: 10 * 60 },
  // Every item checked in the shop is a save.
  shoppingSavePerAccount: { name: 'shopping-save:account', limit: 600, windowSeconds: 10 * 60 },
  // Member pages by username: browsing is a few pages, trying usernames is many.
  memberPagePerAccount: { name: 'member-page:account', limit: 300, windowSeconds: 10 * 60 },
} satisfies Record<string, RateLimitRule>;

type Subject = (c: Context) => string | undefined | Promise<string | undefined>;

const scaled = (rule: RateLimitRule): RateLimitRule => ({
  ...rule,
  limit: rule.limit * env.RATE_LIMIT_FACTOR,
});

/**
 * Rejects the request with 429 when `subject(c)` exceeded the rule. The default subject is the
 * client IP; a subject of `undefined` skips the check (nothing to count).
 */
export function rateLimit(
  service: RateLimitService,
  rule: RateLimitRule,
  subject: Subject = clientIp,
): MiddlewareHandler {
  return async (c, next) => {
    const key = await subject(c);
    if (key !== undefined) {
      const decision = await service.check(scaled(rule), key);
      if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds);
    }
    await next();
  };
}

/**
 * Like `rateLimit`, but only failed requests (an answer of 400 or more) count: a success takes
 * its hit back. Counted before the request (atomic, so parallel attempts cannot slip through),
 * refunded after.
 */
export function rateLimitFailures(
  service: RateLimitService,
  rule: RateLimitRule,
  subject: Subject,
): MiddlewareHandler {
  return async (c, next) => {
    const key = await subject(c);
    if (key === undefined) return next();
    const decision = await service.check(scaled(rule), key);
    if (!decision.allowed) return tooMany(c, decision.retryAfterSeconds);
    await next();
    if (c.res.status < 400) await service.refund(rule, key);
  };
}

function tooMany(c: Context, retryAfterSeconds: number) {
  c.header('Retry-After', String(retryAfterSeconds));
  return c.json({ error: 'rate_limited', retryAfter: retryAfterSeconds }, 429);
}
