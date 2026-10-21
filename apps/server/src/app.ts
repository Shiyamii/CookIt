import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Container } from './container';
import { env } from './env';
import type { AppEnv } from './http/app-env';
import { onError } from './http/errors';
import { apiBodyLimit, noStore, sameOrigin, securityHeaders } from './http/security';
import { createAccountSecurityController } from './modules/account-security/account-security.controller';
import { createAuthController } from './modules/auth/auth.controller';
import { sessionMiddleware } from './modules/auth/auth.middleware';
import { createInvitesController } from './modules/invites/invites.controller';
import { createPasswordResetController } from './modules/password-reset/password-reset.controller';
import { createSystemController } from './modules/system/system.controller';
import { createUsersController } from './modules/users/users.controller';

export function createApp(container: Container) {
  const app = new Hono<AppEnv>();
  app.onError(onError);

  app.use('*', securityHeaders());
  app.use('/api/*', apiBodyLimit(), sameOrigin(), noStore(), sessionMiddleware(container.auth));

  app.route('/', createSystemController(container.system));
  app.route('/', createAuthController(container));
  app.route('/', createAccountSecurityController(container));
  app.route('/', createInvitesController(container));
  app.route('/', createPasswordResetController(container));
  app.route('/', createUsersController(container));

  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

  // SPA: static files, then index.html for client-side routes.
  app.use('*', serveStatic({ root: env.STATIC_DIR }));
  app.get('*', serveStatic({ path: `${env.STATIC_DIR}/index.html` }));

  return app;
}
