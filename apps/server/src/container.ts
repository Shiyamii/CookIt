import { DEFAULT_UNITS } from '@cookit/shared';
import type { Database } from './db';
import { env } from './env';
import { hashPassword, verifyPassword } from './lib/password';
import { generateToken } from './lib/tokens';
import { createAccountSecurityRepository } from './modules/account-security/account-security.repository';
import { createAccountSecurityService } from './modules/account-security/account-security.service';
import { createAuth } from './modules/auth/auth';
import { createInvitesRepository } from './modules/invites/invites.repository';
import { createInvitesService } from './modules/invites/invites.service';
import { createPasswordResetRepository } from './modules/password-reset/password-reset.repository';
import { createPasswordResetService } from './modules/password-reset/password-reset.service';
import { createRecipesRepository } from './modules/recipes/recipes.repository';
import { createRecipesService } from './modules/recipes/recipes.service';
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
  const passwordReset = createPasswordResetService({
    repository: createPasswordResetRepository(db),
    origin: env.ORIGIN,
    hashPassword,
  });
  return {
    auth: createAuth(db),
    accountSecurity: createAccountSecurityService({
      repository: createAccountSecurityRepository(db),
      verifyPassword,
    }),
    system: createSystemService({
      repository: createSystemRepository(db),
      version: env.APP_VERSION,
    }),
    rateLimits: createRateLimitService({ repository: createRateLimitRepository(db) }),
    invites: createInvitesService({
      repository: createInvitesRepository(db),
      origin: env.ORIGIN,
      adminEmail: env.ADMIN_EMAIL,
      hashPassword,
    }),
    passwordReset,
    recipes: createRecipesService({
      repository: createRecipesRepository(db),
      origin: env.ORIGIN,
      // The `units` table replaces the built-in catalog in phase 4b.
      units: () => DEFAULT_UNITS,
      generateToken,
    }),
    users: createUsersService({ repository: createUsersRepository(db), passwordReset }),
  };
}

export type Container = ReturnType<typeof createContainer>;
