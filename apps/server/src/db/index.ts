import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '../env';
import * as schema from './schema';

export const client = postgres(env.DATABASE_URL, { max: 10 });
export const db = drizzle(client, { schema });
export type Database = typeof db;

export async function runMigrations() {
  // Dedicated single connection, closed afterwards, so migration notices stay out of the app pool.
  const migrationClient = postgres(env.DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(migrationClient), { migrationsFolder: env.MIGRATIONS_DIR });
  } finally {
    await migrationClient.end();
  }
}
