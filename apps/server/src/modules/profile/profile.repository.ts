import { avatarUrl, type AlarmSettings } from '@cookit/shared';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db';
import { user } from '../auth/auth.schema';
import { alarmSettings, avatars } from './profile.schema';

export type NewAvatar = { id: string; contentType: string; data: Buffer };

export type ProfileRepository = {
  /** Replaces the user's picture (the old one is deleted) and points `user.image` at it. */
  replaceAvatar(userId: string, avatar: NewAvatar): Promise<void>;
  removeAvatar(userId: string): Promise<void>;
  findAvatar(id: string): Promise<{ contentType: string; data: Buffer } | undefined>;
  findAlarm(userId: string): Promise<unknown>;
  saveAlarm(userId: string, settings: AlarmSettings, now: Date): Promise<void>;
};

export function createProfileRepository(db: Database): ProfileRepository {
  return {
    async replaceAvatar(userId, avatar) {
      await db.transaction(async (tx) => {
        await tx.delete(avatars).where(eq(avatars.userId, userId));
        await tx.insert(avatars).values({ ...avatar, userId });
        await tx
          .update(user)
          .set({ image: avatarUrl(avatar.id) })
          .where(eq(user.id, userId));
      });
    },

    async removeAvatar(userId) {
      await db.transaction(async (tx) => {
        await tx.delete(avatars).where(eq(avatars.userId, userId));
        await tx.update(user).set({ image: null }).where(eq(user.id, userId));
      });
    },

    async findAvatar(id) {
      const [row] = await db
        .select({ contentType: avatars.contentType, data: avatars.data })
        .from(avatars)
        .where(eq(avatars.id, id));
      return row;
    },

    async findAlarm(userId) {
      const [row] = await db
        .select({ settings: alarmSettings.settings })
        .from(alarmSettings)
        .where(eq(alarmSettings.userId, userId));
      return row?.settings;
    },

    async saveAlarm(userId, settings, now) {
      await db
        .insert(alarmSettings)
        .values({ userId, settings, updatedAt: now })
        .onConflictDoUpdate({ target: alarmSettings.userId, set: { settings, updatedAt: now } });
    },
  };
}
