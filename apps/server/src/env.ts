import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  STATIC_DIR: z.string().default('./public'),
  MIGRATIONS_DIR: z.string().default('./drizzle'),
  // Set at image build time by the release workflow.
  APP_VERSION: z.string().default('dev'),
});

export const env = envSchema.parse(process.env);
