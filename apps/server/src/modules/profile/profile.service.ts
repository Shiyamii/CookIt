import { avatarUrl } from '@cookit/shared';
import { checkImage } from '../../lib/images';
import type { ProfileRepository } from './profile.repository';

/**
 * The user's own profile picture (phase 9c). The display name is changed through Better Auth
 * (`update-user`, `name` only). Pictures are shown wherever the name is: anyone may see them.
 */
export function createProfileService(deps: {
  repository: ProfileRepository;
  newId?: () => string;
}) {
  const newId = deps.newId ?? (() => crypto.randomUUID());

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

    async readAvatar(
      id: string,
    ): Promise<{ contentType: string; data: Buffer; public: true } | { error: 'not_found' }> {
      const avatar = await deps.repository.findAvatar(id);
      return avatar ? { ...avatar, public: true } : { error: 'not_found' };
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
