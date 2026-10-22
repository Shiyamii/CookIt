import { describe, expect, test } from 'bun:test';
import type { NewAvatar, ProfileRepository } from './profile.repository';
import { createProfileService } from './profile.service';

/** A lossless WebP header of `side` × `side`, padded to `size` bytes. */
function webp(side: number, size = 30): Uint8Array {
  const file = new Uint8Array(20 + size);
  const view = new DataView(file.buffer);
  file.set(new TextEncoder().encode('RIFFxxxxWEBPVP8L'), 0);
  view.setUint32(4, file.length - 8, true);
  view.setUint32(16, size, true);
  file[20] = 0x2f;
  view.setUint32(21, (side - 1) | ((side - 1) << 14), true);
  return file;
}

function setup() {
  const avatars = new Map<string, NewAvatar & { userId: string }>();
  const images = new Map<string, string | null>();
  const repository: ProfileRepository = {
    async replaceAvatar(userId, avatar) {
      for (const [id, row] of avatars) if (row.userId === userId) avatars.delete(id);
      avatars.set(avatar.id, { ...avatar, userId });
      images.set(userId, `/images/avatars/${avatar.id}`);
    },
    async removeAvatar(userId) {
      for (const [id, row] of avatars) if (row.userId === userId) avatars.delete(id);
      images.set(userId, null);
    },
    async findAvatar(id) {
      return avatars.get(id);
    },
  };
  let n = 0;
  const service = createProfileService({ repository, newId: () => `id-${++n}` });
  return { service, avatars, images };
}

describe('profile picture', () => {
  test('a new picture replaces the old one, under a new URL', async () => {
    const s = setup();
    expect(await s.service.setAvatar('u1', webp(256))).toEqual({ image: '/images/avatars/id-1' });
    expect(await s.service.setAvatar('u1', webp(128))).toEqual({ image: '/images/avatars/id-2' });
    expect([...s.avatars.keys()]).toEqual(['id-2']);
    expect(s.images.get('u1')).toBe('/images/avatars/id-2');
    expect(await s.service.readAvatar('id-1')).toEqual({ error: 'not_found' });
    expect(await s.service.readAvatar('id-2')).toMatchObject({
      contentType: 'image/webp',
      public: true,
    });
  });

  test('pictures too big or not WebP/JPEG are refused', async () => {
    const s = setup();
    for (const bytes of [
      webp(257),
      webp(100, 100_000),
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      new Uint8Array(),
    ]) {
      expect(await s.service.setAvatar('u1', bytes)).toEqual({ error: 'invalid_image' });
    }
    expect(s.avatars.size).toBe(0);
  });

  test('removing it leaves no picture', async () => {
    const s = setup();
    await s.service.setAvatar('u1', webp(64));
    await s.service.setAvatar('u2', webp(64));
    expect(await s.service.removeAvatar('u1')).toEqual({ ok: true });
    expect(s.images.get('u1')).toBeNull();
    expect([...s.avatars.values()].map((row) => row.userId)).toEqual(['u2']);
  });
});
