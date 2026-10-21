import { getAuthenticatorName, passkey } from '@better-auth/passkey';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, SUPPORTED_LOCALES } from '@cookit/shared';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins/two-factor';
import { username } from 'better-auth/plugins/username';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../../db';
import { env, secureCookies } from '../../env';
import { hashPassword, verifyPassword } from '../../lib/password';
import { authTables, passwordResets, user } from './auth.schema';

/**
 * Passkeys only count when the authenticator checked who is holding it (PIN, fingerprint, face):
 * a passkey replaces the password, so possession alone is not enough.
 */
function requireUserVerification(verified: boolean | undefined) {
  if (!verified) {
    throw new APIError('UNAUTHORIZED', {
      code: 'USER_VERIFICATION_REQUIRED',
      message: 'The authenticator did not verify the user',
    });
  }
}

/**
 * Better Auth: sessions, sign-in (email or username, then a TOTP or backup code when 2FA is on;
 * or a passkey alone), sign-out, password change, 2FA and passkey management. Sign-up is
 * disabled: accounts are only created by accepting an invite (invites module). Rate limiting is
 * done by our own middleware (database-backed, shared with the other auth routes).
 */
export function createAuth(db: Database) {
  return betterAuth({
    appName: 'CookIt',
    baseURL: env.ORIGIN,
    basePath: '/api/v1/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.ORIGIN],
    database: drizzleAdapter(db, { provider: 'pg', schema: authTables }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      revokeSessionsOnPasswordReset: true,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    plugins: [
      username(),
      // TOTP (authenticator app) + 10 single-use backup codes, both stored encrypted with
      // BETTER_AUTH_SECRET. Enabling, disabling and new backup codes require the password; 5 tries
      // per sign-in challenge, and 2FA locked for an hour after 5 wrong codes: someone holding
      // the password gets about 120 guesses a day, whatever their IP.
      twoFactor({
        issuer: 'CookIt',
        accountLockout: { maxFailedAttempts: 5, durationSeconds: 60 * 60 },
      }),
      passkey({
        // Passkeys are bound to this domain: moving the site to another domain invalidates them.
        rpID: new URL(env.ORIGIN).hostname,
        rpName: 'CookIt',
        origin: env.ORIGIN,
        // Discoverable credentials: sign-in without typing a username (and browser autofill).
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        registration: {
          afterVerification: ({ verification }) => {
            requireUserVerification(verification.registrationInfo?.userVerified);
            // Default label when the user gave none ("Bitwarden", "Windows Hello"…).
            return { name: getAuthenticatorName(verification.registrationInfo?.aaguid) };
          },
        },
        authentication: {
          afterVerification: ({ verification }) => {
            requireUserVerification(verification.authenticationInfo.userVerified);
          },
        },
      }),
    ],
    user: {
      additionalFields: {
        role: { type: 'string', required: true, defaultValue: 'user', input: false },
        locale: {
          type: 'string',
          required: true,
          defaultValue: 'fr',
          validator: { input: z.enum(SUPPORTED_LOCALES) },
        },
        disabledAt: { type: 'date', required: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      // Sensitive changes ask for the password instead of a recent sign-in (passkeys included,
      // see auth.controller.ts).
      freshAge: 0,
    },
    verification: { storeIdentifier: 'hashed' },
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    advanced: {
      useSecureCookies: secureCookies,
      // `'uuid'` would leave the id to a database default; our ids are generated in code everywhere.
      database: { generateId: () => crypto.randomUUID() },
      // Better Auth only records the IP on the session (informational).
      ipAddress: env.TRUST_PROXY
        ? { ipAddressHeaders: ['x-forwarded-for'] }
        : { disableIpTracking: true },
    },
    databaseHooks: {
      account: {
        update: {
          // After a password change, reset links handed out earlier must not work anymore.
          after: async (updated) => {
            if (updated.providerId !== 'credential' || !updated.password) return;
            await db
              .update(passwordResets)
              .set({ usedAt: new Date() })
              .where(and(eq(passwordResets.userId, updated.userId), isNull(passwordResets.usedAt)));
          },
        },
      },
      session: {
        create: {
          // A disabled account cannot sign in (its existing sessions are deleted when disabled).
          // Same answer as a wrong password: a distinct error would confirm the password.
          before: async (newSession, context) => {
            const [owner] = await db
              .select({ disabledAt: user.disabledAt })
              .from(user)
              .where(eq(user.id, newSession.userId));
            if (!owner || owner.disabledAt) {
              const path = context?.path ?? '';
              // A passkey sign-in gets the generic passkey error.
              if (path.endsWith('/passkey/verify-authentication')) {
                throw new APIError('UNAUTHORIZED', {
                  code: 'AUTHENTICATION_FAILED',
                  message: 'Authentication failed',
                });
              }
              const byEmail = path.endsWith('/sign-in/email');
              throw new APIError('UNAUTHORIZED', {
                code: byEmail ? 'INVALID_EMAIL_OR_PASSWORD' : 'INVALID_USERNAME_OR_PASSWORD',
                message: byEmail ? 'Invalid email or password' : 'Invalid username or password',
              });
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type SessionUser = Auth['$Infer']['Session']['user'];
