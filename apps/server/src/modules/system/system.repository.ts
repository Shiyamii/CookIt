import type { InstanceSettings } from '@cookit/shared';
import { eq, sql } from 'drizzle-orm';
import type { Database } from '../../db';
import { instanceSettings } from './system.schema';

export type SystemRepository = {
  /** Throws when the database cannot be reached. */
  ping(): Promise<void>;
  /** The saved settings, undefined until an admin saved them. */
  findSettings(): Promise<InstanceSettings | undefined>;
  saveSettings(settings: InstanceSettings, now: Date): Promise<void>;
};

export function createSystemRepository(db: Database): SystemRepository {
  return {
    async ping() {
      await db.execute(sql`select 1`);
    },

    async findSettings() {
      const [row] = await db
        .select({ publicGallery: instanceSettings.publicGallery })
        .from(instanceSettings)
        .where(eq(instanceSettings.id, 1));
      return row;
    },

    async saveSettings(settings, now) {
      await db
        .insert(instanceSettings)
        .values({ id: 1, ...settings, updatedAt: now })
        .onConflictDoUpdate({ target: instanceSettings.id, set: { ...settings, updatedAt: now } });
    },
  };
}
