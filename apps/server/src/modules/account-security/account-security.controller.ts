import { Hono } from 'hono';
import type { AppEnv } from '../../http/app-env';
import { requireUser } from '../auth/auth.middleware';
import type { AccountSecurityService } from './account-security.service';

export function createAccountSecurityController(deps: { accountSecurity: AccountSecurityService }) {
  const app = new Hono<AppEnv>();

  app.get('/api/v1/me/security', requireUser, async (c) => {
    return c.json(await deps.accountSecurity.get(c.var.user?.id ?? ''));
  });

  return app;
}
