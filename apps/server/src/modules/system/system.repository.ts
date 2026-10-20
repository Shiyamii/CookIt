import { sql } from 'drizzle-orm';
import type { Database } from '../../db';

export type SystemRepository = {
  /** Throws when the database cannot be reached. */
  ping(): Promise<void>;
};

export function createSystemRepository(db: Database): SystemRepository {
  return {
    async ping() {
      await db.execute(sql`select 1`);
    },
  };
}
