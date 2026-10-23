import type { Database } from './db';
import { env, smtp, vapid } from './env';
import { createMailer } from './lib/mailer';
import { hashPassword, verifyPassword } from './lib/password';
import { generateToken } from './lib/tokens';
import { createAccountSecurityRepository } from './modules/account-security/account-security.repository';
import { createAccountSecurityService } from './modules/account-security/account-security.service';
import { createAuth } from './modules/auth/auth';
import { createCookingRepository } from './modules/cooking/cooking.repository';
import { createCookingService } from './modules/cooking/cooking.service';
import { createShoppingRepository } from './modules/shopping/shopping.repository';
import { createShoppingService } from './modules/shopping/shopping.service';
import { createInvitesRepository } from './modules/invites/invites.repository';
import { createInvitesService } from './modules/invites/invites.service';
import { createMailService } from './modules/mail/mail.service';
import { createPasswordResetRepository } from './modules/password-reset/password-reset.repository';
import { createPasswordResetService } from './modules/password-reset/password-reset.service';
import { createRecipesRepository } from './modules/recipes/recipes.repository';
import { createRecipesService } from './modules/recipes/recipes.service';
import { createTagsRepository } from './modules/tags/tags.repository';
import { createTagsService } from './modules/tags/tags.service';
import { createUnitsRepository } from './modules/units/units.repository';
import { createUnitsService } from './modules/units/units.service';
import { createImportService } from './modules/import/import.service';
import { safeFetchHtml } from './lib/safe-fetch';
import { createPushSender, isPushEndpoint } from './lib/web-push';
import { createProfileRepository } from './modules/profile/profile.repository';
import { createProfileService } from './modules/profile/profile.service';
import { createPushRepository } from './modules/push/push.repository';
import { createPushService } from './modules/push/push.service';
import { createRateLimitRepository } from './modules/rate-limit/rate-limit.repository';
import { createRateLimitService } from './modules/rate-limit/rate-limit.service';
import { createSystemRepository } from './modules/system/system.repository';
import { createSystemService } from './modules/system/system.service';
import { createUsersRepository } from './modules/users/users.repository';
import { createUsersService } from './modules/users/users.service';

/**
 * Composition root: repositories -> services, wired by hand (no DI container). Used by the HTTP
 * app and by the rescue CLI.
 */
export function createContainer(db: Database) {
  const log = (message: string) => console.warn(message);
  // Optional: without SMTP settings, links are copied by hand.
  const mail = createMailService({
    mailer: smtp ? createMailer(smtp) : undefined,
    origin: env.ORIGIN,
  });
  const passwordReset = createPasswordResetService({
    repository: createPasswordResetRepository(db),
    origin: env.ORIGIN,
    hashPassword,
    mail,
    log,
  });
  const units = createUnitsService({ repository: createUnitsRepository(db) });
  const tags = createTagsService({ repository: createTagsRepository(db) });
  return {
    auth: createAuth(db),
    mail,
    log,
    units,
    tags,
    accountSecurity: createAccountSecurityService({
      repository: createAccountSecurityRepository(db),
      verifyPassword,
    }),
    system: createSystemService({
      repository: createSystemRepository(db),
      version: env.APP_VERSION,
      email: mail.enabled,
    }),
    rateLimits: createRateLimitService({ repository: createRateLimitRepository(db) }),
    invites: createInvitesService({
      repository: createInvitesRepository(db),
      origin: env.ORIGIN,
      adminEmail: env.ADMIN_EMAIL,
      hashPassword,
      mail,
      log,
    }),
    passwordReset,
    cooking: createCookingService({ repository: createCookingRepository(db) }),
    shopping: createShoppingService({ repository: createShoppingRepository(db) }),
    push: createPushService({
      repository: createPushRepository(db),
      sender: vapid ? createPushSender(vapid) : undefined,
      publicKey: vapid?.publicKey,
      isPushEndpoint: (endpoint) => isPushEndpoint(endpoint, env.PUSH_TEST_ENDPOINT_ORIGIN),
    }),
    profile: createProfileService({ repository: createProfileRepository(db) }),
    importer: createImportService({ fetchHtml: (url) => safeFetchHtml(url) }),
    recipes: createRecipesService({
      repository: createRecipesRepository(db),
      origin: env.ORIGIN,
      units: () => units.catalog(),
      tags,
      generateToken,
    }),
    users: createUsersService({ repository: createUsersRepository(db), passwordReset }),
  };
}

export type Container = ReturnType<typeof createContainer>;
