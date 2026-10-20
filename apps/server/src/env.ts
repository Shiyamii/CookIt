import { z } from 'zod';

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
});

// The secret written in the development examples: refused for a real (HTTPS) deployment.
const DEVELOPMENT_SECRET = 'dev-secret-change-me-dev-secret-change-me';

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
  .parse(process.env);
export const secureCookies = env.ORIGIN.startsWith('https://');
