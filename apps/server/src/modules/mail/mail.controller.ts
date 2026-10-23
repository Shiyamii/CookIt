import { isLocale } from '@cookit/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../http/app-env';
import { sendError } from '../../lib/mailer';
import { requireAdmin } from '../auth/auth.middleware';
import { RATE_LIMITS, rateLimit } from '../rate-limit/rate-limit.middleware';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import type { MailService } from './mail.service';

export function createMailController(deps: { mail: MailService; rateLimits: RateLimitService }) {
  const app = new Hono<AppEnv>();

  // A test email to the admin's own address: checks the SMTP settings. The SMTP server's answer
  // is shown to the admin (who manages it), never the address or the message.
  app.post(
    '/api/v1/admin/email/test',
    requireAdmin,
    rateLimit(deps.rateLimits, RATE_LIMITS.emailSendPerAccount, (c) => c.var.user?.id),
    async (c) => {
      const admin = c.var.user;
      if (!admin) return c.json({ error: 'unauthorized' }, 401);
      if (!deps.mail.enabled) return c.json({ error: 'email_not_configured' }, 400);
      try {
        await deps.mail.test({
          to: admin.email,
          locale: isLocale(admin.locale) ? admin.locale : 'en',
        });
        return c.json({ ok: true, to: admin.email });
      } catch (error) {
        return c.json({ error: 'email_failed', detail: sendError(error) }, 502);
      }
    },
  );

  return app;
}
