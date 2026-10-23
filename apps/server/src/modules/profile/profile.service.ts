import {
  alarmSettingsSchema,
  avatarUrl,
  DEFAULT_ALARM_SETTINGS,
  type AlarmSettings,
} from '@cookit/shared';
import { checkImage } from '../../lib/images';
import type { ProfileRepository } from './profile.repository';

/**
 * The user's own profile picture (phase 9c). The display name is changed through Better Auth
 * (`update-user`, `name` only). Pictures are shown wherever the name is: anyone may see them.
 */
export function createProfileService(deps: {
  repository: ProfileRepository;
  newId?: () => string;
  now?: () => Date;
}) {
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => new Date());

  return {
    /** A WebP or JPEG of at most 256 px and 100 kB, already resized by the browser. */
    async setAvatar(
      userId: string,
      bytes: Uint8Array,
    ): Promise<{ image: string } | { error: 'invalid_image' }> {
      const type = checkImage(bytes, 'avatar');
      if (!type) return { error: 'invalid_image' };
      const id = newId();
      await deps.repository.replaceAvatar(userId, {
        id,
        contentType: type,
        data: Buffer.from(bytes),
      });
      return { image: avatarUrl(id) };
    },

    async removeAvatar(userId: string): Promise<{ ok: true }> {
      await deps.repository.removeAvatar(userId);
      return { ok: true };
    },

    /** The account's alarm settings (the defaults until saved, or if what is stored is unreadable). */
    async alarm(userId: string): Promise<AlarmSettings> {
      const stored = alarmSettingsSchema.safeParse(await deps.repository.findAlarm(userId));
      return stored.success ? stored.data : DEFAULT_ALARM_SETTINGS;
    },

    async saveAlarm(userId: string, settings: AlarmSettings): Promise<AlarmSettings> {
      await deps.repository.saveAlarm(userId, settings, now());
      return settings;
    },

    async readAvatar(
      id: string,
    ): Promise<{ contentType: string; data: Buffer; public: true } | { error: 'not_found' }> {
      const avatar = await deps.repository.findAvatar(id);
      return avatar ? { ...avatar, public: true } : { error: 'not_found' };
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
