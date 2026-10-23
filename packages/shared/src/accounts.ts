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

// Two-factor authentication and passkeys (phase 3b). Bodies of the Better Auth routes we expose
// are checked with these strict schemas before reaching Better Auth.

/** Re-entering one's password before a sensitive change (enable/disable 2FA, new backup codes). */
export const passwordConfirmInputSchema = z
  .object({ password: z.string().min(1).max(PASSWORD_MAX_LENGTH) })
  .strict();

/** A code from an authenticator app (6 digits, spaces removed by the UI). */
export const totpCodeInputSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

/** A single-use backup code (`xxxxx-xxxxx`, as Better Auth generates them). */
export const backupCodeInputSchema = z.object({ code: z.string().trim().min(1).max(32) }).strict();

export const passkeyNameSchema = labelString(64);

/**
 * The browser's WebAuthn answer (`PublicKeyCredential.toJSON()`), checked cryptographically by
 * Better Auth (@simplewebauthn): here only its shape and sizes, so that a malformed `id` or
 * `transports` never reaches the database or the library.
 */
const base64url = (max: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]*$/)
    .max(max);
const webAuthnResponseSchema = z.object({
  id: base64url(1024).min(1),
  rawId: base64url(1024).min(1),
  type: z.literal('public-key'),
  authenticatorAttachment: z.string().max(32).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()).optional(),
  response: z.object({
    clientDataJSON: base64url(8192),
    attestationObject: base64url(65536).optional(),
    authenticatorData: base64url(8192).optional(),
    signature: base64url(2048).optional(),
    userHandle: base64url(1024).optional(),
    publicKey: base64url(8192).optional(),
    publicKeyAlgorithm: z.number().int().optional(),
    transports: z.array(z.string().max(32)).max(10).optional(),
  }),
});

export const passkeyRegistrationInputSchema = z
  .object({ response: webAuthnResponseSchema, name: passkeyNameSchema.optional() })
  .strict();

export const passkeyAuthenticationInputSchema = z
  .object({ response: webAuthnResponseSchema })
  .strict();

export const passkeyRenameInputSchema = z
  .object({ id: z.string().min(1).max(64), name: passkeyNameSchema })
  .strict();

/** Deleting a passkey asks for the password, like adding one (a stolen session is not enough). */
export const passkeyDeleteInputSchema = z
  .object({ id: z.string().min(1).max(64), password: z.string().min(1).max(PASSWORD_MAX_LENGTH) })
  .strict();

/** A passkey as listed on the security page (no key material). */
export type PasskeySummary = {
  id: string;
  name: string | null;
  createdAt: string | null;
  /** Synced across devices (password manager, iCloud…) rather than bound to one device. */
  backedUp: boolean;
};

/** What the security settings page shows about the signed-in account. */
export type AccountSecurity = {
  twoFactorEnabled: boolean;
  passkeys: PasskeySummary[];
};

export const createInviteInputSchema = z.object({
  label: optionalText(100),
  expiresInDays: z.number().int().min(1).max(INVITE_MAX_DAYS).default(INVITE_DEFAULT_DAYS),
  /** Sends the link to this address (email configured only); pre-filled at sign-up. */
  email: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    emailSchema.optional(),
  ),
  /** Language of the email (and of the sign-up page it opens). */
  locale: z.enum(SUPPORTED_LOCALES).optional(),
});
export type CreateInviteInput = z.infer<typeof createInviteInputSchema>;

/** What creating an invite gives: the link (shown once), and whether it was emailed. */
export type CreatedInvite = { url: string; emailed: boolean };

/** "Forgot your password?": the account's email or username (email configured only). */
export const forgotPasswordInputSchema = z.object({
  identifier: z.string().trim().min(1).max(254),
  /** The interface language, for an account that has none. */
  locale: z.enum(SUPPORTED_LOCALES).optional(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordInputSchema>;

/** Errors of the email features (`{ error }`), translated by the UI. */
export const EMAIL_ERRORS = ['email_not_configured', 'email_failed', 'email_taken'] as const;

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
  /** Where the link was emailed, if it was. */
  email: string | null;
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
  'last_sign_in_method',
] as const;
export type AccountError = (typeof ACCOUNT_ERRORS)[number];
