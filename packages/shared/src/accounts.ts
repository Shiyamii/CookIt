import { z } from 'zod';
import { labelString } from './labels';
import { SUPPORTED_LOCALES } from './locale';

// Same rules as Better Auth's `username` plugin (3-30 characters, letters, digits, `_` and `.`).
export const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const INVITE_MAX_DAYS = 90;
export const INVITE_DEFAULT_DAYS = 7;

/** A link token: 32 random bytes in base64url (43 characters). */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid token');

/** Body of the link check routes (the token never goes in a URL). */
export const tokenCheckSchema = z.object({ token: tokenSchema });

export const usernameSchema = z.string().trim().min(3).max(30).regex(USERNAME_PATTERN);
export const emailSchema = z.string().trim().pipe(z.email().max(254));

/** An optional text field: blank means absent. */
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    labelString(max).optional(),
  );
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

/** Account creation from an invite (or from the first-admin setup link). */
export const registerInputSchema = z.object({
  token: tokenSchema,
  username: usernameSchema,
  email: emailSchema,
  /** Display name; the username when empty. */
  name: optionalText(100),
  password: passwordSchema,
  locale: z.enum(SUPPORTED_LOCALES),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

/**
 * What a user may change on their own profile (Better Auth `update-user`). Strict: `username`,
 * `displayUsername`, `image`, `role`… are refused (renames would let users impersonate others).
 */
export const updateProfileInputSchema = z
  .object({
    name: labelString(100),
    locale: z.enum(SUPPORTED_LOCALES),
  })
  .partial()
  .strict();
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;

export const passwordResetInputSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
});
export type PasswordResetInput = z.infer<typeof passwordResetInputSchema>;

export const createInviteInputSchema = z.object({
  label: optionalText(100),
  expiresInDays: z.number().int().min(1).max(INVITE_MAX_DAYS).default(INVITE_DEFAULT_DAYS),
});
export type CreateInviteInput = z.infer<typeof createInviteInputSchema>;

export const INVITE_STATUSES = ['pending', 'used', 'expired', 'revoked'] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

/** Invite as listed on the admin page (the token itself is only shown once, at creation). */
export type InviteSummary = {
  id: string;
  label: string | null;
  role: 'admin' | 'user';
  status: InviteStatus;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedByUsername: string | null;
};

export type UserSummary = {
  id: string;
  username: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  locale: string;
  createdAt: string;
  disabledAt: string | null;
};

/** Errors returned by the account API as `{ error }`, translated by the UI. */
export const ACCOUNT_ERRORS = [
  'invalid_token',
  'username_taken',
  'email_taken',
  'cannot_change_self',
  'last_admin',
  'not_found',
] as const;
export type AccountError = (typeof ACCOUNT_ERRORS)[number];
