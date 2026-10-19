import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  STATIC_DIR: z.string().default('./public'),
});

export const env = envSchema.parse(process.env);
