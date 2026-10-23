import { z } from 'zod';

/** Empty (as in the compose files) means unset. */
const optionalText = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const base64urlBytes = (bytes: number, name: string) =>
  z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, `${name} must be base64url`)
    .refine((value) => Buffer.from(value, 'base64url').length === bytes, {
      message: `${name} must be ${bytes} bytes (base64url)`,
    });

const booleanFlag = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  STATIC_DIR: z.string().default('./public'),
  MIGRATIONS_DIR: z.string().default('./drizzle'),
  // Set at image build time by the release workflow.
  APP_VERSION: z.string().default('dev'),
  // Public URL of the app (scheme + host, no path): cookies, CSRF checks and links in the logs.
  ORIGIN: z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin),
  // Signs session cookies. Generate with `openssl rand -base64 32`.
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  // Pre-filled on the first-admin setup page. Empty (as in the compose files) means unset.
  ADMIN_EMAIL: z.preprocess((value) => (value === '' ? undefined : value), z.email().optional()),
  // Behind a reverse proxy (Coolify, Traefik…): read the client IP from X-Forwarded-For.
  TRUST_PROXY: booleanFlag,
  // Multiplies every rate limit. 1 in production; raised for end-to-end tests, which all come
  // from the same IP and would otherwise lock each other out.
  RATE_LIMIT_FACTOR: z.coerce.number().int().min(1).max(1000).default(1),
  // Web Push (VAPID). Generate with `node dist/cli.js push:vapid-keys` (or
  // `npx web-push generate-vapid-keys`). Unset: notifications are off.
  VAPID_PUBLIC_KEY: optionalText(base64urlBytes(65, 'VAPID_PUBLIC_KEY')),
  VAPID_PRIVATE_KEY: optionalText(base64urlBytes(32, 'VAPID_PRIVATE_KEY')),
  // Contact given to the push services: `mailto:` or `https:` URL. Default: ADMIN_EMAIL, else
  // ORIGIN when it is https.
  VAPID_SUBJECT: optionalText(z.string().regex(/^(mailto:|https:\/\/)\S+$/)),
  // Email (optional): invitations, "forgot your password?" and a test email. Unset SMTP_HOST:
  // email is off and links are copied by hand, as before.
  SMTP_HOST: optionalText(z.string().max(253)),
  // `starttls` (port 587, TLS required), `tls` (port 465) or `none` (a relay on a local network,
  // or tests: no encryption at all).
  SMTP_SECURITY: z.enum(['starttls', 'tls', 'none']).default('starttls'),
  SMTP_PORT: optionalText(z.coerce.number().int().min(1).max(65535)),
  SMTP_USER: optionalText(z.string().max(320)),
  SMTP_PASSWORD: optionalText(z.string().max(1000)),
  // Sender: `cookit@example.com` or `CookIt <cookit@example.com>`.
  SMTP_FROM: optionalText(
    z
      .string()
      .max(320)
      .regex(/^(?:[^<>\r\n]*<[^<>@\s]+@[^<>\s]+>|[^<>@\s]+@[^<>\s]+)$/, 'Invalid SMTP_FROM'),
  ),
  // End-to-end tests only: push endpoints on this origin are accepted (a local sink). Never set
  // it in production.
  PUSH_TEST_ENDPOINT_ORIGIN: optionalText(
    z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin),
  ),
});

// The secret written in the development examples: refused for a real (HTTPS) deployment.
const DEVELOPMENT_SECRET = 'dev-secret-change-me-dev-secret-change-me';
// Same for the development VAPID key pair (docker-compose.dev.yml, CI).
const DEVELOPMENT_VAPID_KEY =
  'BDAjrN6hd_Hc2OHdE4nTIkhbrxCeqaWwfmbDbbbaT8CNS2jjPYZqqSZMkYles-Qon2UFknP0Gj47chgAx4ThjDI';

export const env = envSchema
  .refine(
    (value) =>
      !(value.ORIGIN.startsWith('https://') && value.BETTER_AUTH_SECRET === DEVELOPMENT_SECRET),
    {
      message:
        'BETTER_AUTH_SECRET is the development example: generate one (openssl rand -base64 32)',
      path: ['BETTER_AUTH_SECRET'],
    },
  )
  .refine(
    (value) =>
      !(value.ORIGIN.startsWith('https://') && value.VAPID_PUBLIC_KEY === DEVELOPMENT_VAPID_KEY),
    {
      message: 'VAPID keys are the development example: generate new ones',
      path: ['VAPID_PUBLIC_KEY'],
    },
  )
  .refine((value) => !(value.ORIGIN.startsWith('https://') && value.PUSH_TEST_ENDPOINT_ORIGIN), {
    message: 'PUSH_TEST_ENDPOINT_ORIGIN is for end-to-end tests only',
    path: ['PUSH_TEST_ENDPOINT_ORIGIN'],
  })
  .refine((value) => !value.VAPID_PUBLIC_KEY === !value.VAPID_PRIVATE_KEY, {
    message: 'Set both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, or neither',
    path: ['VAPID_PRIVATE_KEY'],
  })
  .refine(
    (value) =>
      !value.VAPID_PUBLIC_KEY ||
      value.VAPID_SUBJECT ||
      value.ADMIN_EMAIL ||
      value.ORIGIN.startsWith('https://'),
    {
      message: 'Set VAPID_SUBJECT (mailto: or https: URL) or ADMIN_EMAIL',
      path: ['VAPID_SUBJECT'],
    },
  )
  .refine((value) => !value.SMTP_HOST || value.SMTP_FROM, {
    message: 'Set SMTP_FROM (the sender address) with SMTP_HOST',
    path: ['SMTP_FROM'],
  })
  .refine((value) => !value.SMTP_USER === !value.SMTP_PASSWORD, {
    message: 'Set both SMTP_USER and SMTP_PASSWORD, or neither',
    path: ['SMTP_PASSWORD'],
  })
  .refine(
    (value) =>
      !(
        value.ORIGIN.startsWith('https://') &&
        value.SMTP_SECURITY === 'none' &&
        value.SMTP_PASSWORD
      ),
    {
      message: 'SMTP_SECURITY=none would send SMTP_PASSWORD unencrypted: use starttls or tls',
      path: ['SMTP_SECURITY'],
    },
  )
  .parse(process.env);
export const secureCookies = env.ORIGIN.startsWith('https://');

/** VAPID keys, when push is configured. */
export const vapid =
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
    ? {
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
        subject: env.VAPID_SUBJECT ?? (env.ADMIN_EMAIL ? `mailto:${env.ADMIN_EMAIL}` : env.ORIGIN),
      }
    : undefined;

/** The SMTP server, when email is configured. */
export const smtp =
  env.SMTP_HOST && env.SMTP_FROM
    ? {
        host: env.SMTP_HOST,
        port:
          env.SMTP_PORT ??
          (env.SMTP_SECURITY === 'tls' ? 465 : env.SMTP_SECURITY === 'starttls' ? 587 : 25),
        security: env.SMTP_SECURITY,
        auth:
          env.SMTP_USER && env.SMTP_PASSWORD
            ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
            : undefined,
        from: env.SMTP_FROM,
      }
    : undefined;
