import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, SUPPORTED_LOCALES } from '@cookit/shared';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { username } from 'better-auth/plugins/username';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../../db';
import { env, secureCookies } from '../../env';
import { hashPassword, verifyPassword } from '../../lib/password';
import { authTables, passwordResets, user } from './auth.schema';

/**
 * Better Auth: sessions, sign-in (email or username), sign-out, password change. Sign-up is
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
    plugins: [username()],
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
              const byEmail = context?.path?.endsWith('/sign-in/email') ?? false;
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
