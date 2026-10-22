import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { Container } from './container';
import { env } from './env';
import type { AppEnv } from './http/app-env';
import { onError } from './http/errors';
import { apiBodyLimit, noStore, sameOrigin, securityHeaders, staticCaching } from './http/security';
import { createAccountSecurityController } from './modules/account-security/account-security.controller';
import { createAuthController } from './modules/auth/auth.controller';
import { createCookingController } from './modules/cooking/cooking.controller';
import { createProfileController } from './modules/profile/profile.controller';
import { createPushController } from './modules/push/push.controller';
import { sessionMiddleware } from './modules/auth/auth.middleware';
import { createInvitesController } from './modules/invites/invites.controller';
import { createPasswordResetController } from './modules/password-reset/password-reset.controller';
import { createRecipesController } from './modules/recipes/recipes.controller';
import { createShoppingController } from './modules/shopping/shopping.controller';
import { createTagsController } from './modules/tags/tags.controller';
import { createUnitsController } from './modules/units/units.controller';
import { createImportController } from './modules/import/import.controller';
import { createSystemController } from './modules/system/system.controller';
import { createUsersController } from './modules/users/users.controller';

export function createApp(container: Container) {
  const app = new Hono<AppEnv>();
  app.onError(onError);

  app.use('*', securityHeaders());
  app.use('/api/*', apiBodyLimit(), sameOrigin(), noStore(), sessionMiddleware(container.auth));
  // Pictures are served outside the API (cacheable), but who may see a recipe photo depends on
  // the session.
  app.use('/images/*', sessionMiddleware(container.auth));

  app.route('/', createSystemController(container.system));
  app.route('/', createAuthController(container));
  app.route('/', createAccountSecurityController(container));
  app.route('/', createInvitesController(container));
  app.route('/', createPasswordResetController(container));
  app.route('/', createUsersController(container));
  app.route('/', createRecipesController(container));
  app.route('/', createImportController(container));
  app.route('/', createCookingController(container));
  app.route('/', createShoppingController(container));
  app.route('/', createPushController(container));
  app.route('/', createProfileController(container));
  app.route('/', createTagsController(container));
  app.route('/', createUnitsController(container));

  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));
  // An unknown picture is a 404, never the SPA's page.
  app.all('/images/*', (c) => c.notFound());

  // SPA: static files, then index.html for client-side routes.
  app.use('*', staticCaching());
  app.use('*', serveStatic({ root: env.STATIC_DIR }));
  app.get('*', serveStatic({ path: `${env.STATIC_DIR}/index.html` }));

  return app;
}
