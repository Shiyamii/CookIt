import { describe, expect, test } from 'bun:test';
import type { InstanceSettings } from '@cookit/shared';
import type { SystemRepository } from './system.repository';
import { createSystemService } from './system.service';

function repository(stored?: InstanceSettings) {
  const state = { stored, reads: 0 };
  const repo: SystemRepository = {
    ping: async () => {},
    findSettings: async () => {
      state.reads++;
      return state.stored;
    },
    saveSettings: async (settings) => {
      state.stored = settings;
    },
  };
  return { repo, state };
}

describe('system service', () => {
  test('is healthy when the database answers', async () => {
    const service = createSystemService({ repository: repository().repo, version: '1.2.3' });
    expect(await service.isHealthy()).toBe(true);
  });

  test('is unhealthy when the database fails', async () => {
    const repo: SystemRepository = {
      ...repository().repo,
      ping: async () => {
        throw new Error('connection refused');
      },
    };
    const service = createSystemService({ repository: repo, version: '1.2.3' });
    expect(await service.isHealthy()).toBe(false);
  });

  test('meta exposes the running version and whether the gallery is public', async () => {
    const service = createSystemService({ repository: repository().repo, version: '1.2.3' });
    expect(await service.meta()).toMatchObject({
      name: 'CookIt',
      version: '1.2.3',
      publicGallery: false,
    });
  });
});

describe('instance settings', () => {
  test('recipes are for members only until an admin opens the gallery', async () => {
    const { repo, state } = repository();
    const service = createSystemService({ repository: repo, version: '1' });
    expect(await service.publicGallery()).toBe(false);
    expect(await service.saveSettings({ publicGallery: true })).toEqual({ publicGallery: true });
    expect(state.stored).toEqual({ publicGallery: true });
    expect(await service.publicGallery()).toBe(true);
    expect(await service.meta()).toMatchObject({ publicGallery: true });
  });

  test('the saved settings are read once, then kept', async () => {
    const { repo, state } = repository({ publicGallery: true });
    const service = createSystemService({ repository: repo, version: '1' });
    expect(await service.publicGallery()).toBe(true);
    expect(await service.publicGallery()).toBe(true);
    expect(state.reads).toBe(1);
  });

  test('a failed read is tried again', async () => {
    const { repo, state } = repository({ publicGallery: true });
    let fail = true;
    const flaky: SystemRepository = {
      ...repo,
      findSettings: async () => {
        if (fail) {
          fail = false;
          throw new Error('down');
        }
        return repo.findSettings();
      },
    };
    const service = createSystemService({ repository: flaky, version: '1' });
    await expect(service.publicGallery()).rejects.toThrow('down');
    expect(await service.publicGallery()).toBe(true);
    expect(state.reads).toBe(1);
  });

  test('saving does not need a read first and replaces what was cached', async () => {
    const { repo, state } = repository({ publicGallery: true });
    const service = createSystemService({ repository: repo, version: '1' });
    await service.saveSettings({ publicGallery: false });
    expect(await service.publicGallery()).toBe(false);
    expect(state.reads).toBe(0);
    await service.saveSettings({ publicGallery: true });
    expect(await service.settings()).toEqual({ publicGallery: true });
  });

  test('the save time comes from the injected clock', async () => {
    const times: Date[] = [];
    const { repo } = repository();
    const service = createSystemService({
      repository: { ...repo, saveSettings: async (_s, at) => void times.push(at) },
      version: '1',
      now: () => new Date('2026-05-05T10:00:00.000Z'),
    });
    await service.saveSettings({ publicGallery: true });
    expect(times).toEqual([new Date('2026-05-05T10:00:00.000Z')]);
  });

  test('a failed save keeps the previous settings', async () => {
    const { repo } = repository({ publicGallery: true });
    const service = createSystemService({
      repository: {
        ...repo,
        saveSettings: async () => {
          throw new Error('down');
        },
      },
      version: '1',
    });
    expect(await service.publicGallery()).toBe(true);
    await expect(service.saveSettings({ publicGallery: false })).rejects.toThrow('down');
    expect(await service.publicGallery()).toBe(true);
  });

  test('meta says whether email is set up', async () => {
    const service = createSystemService({
      repository: repository().repo,
      version: '1',
      email: true,
    });
    expect(await service.meta()).toMatchObject({ email: true });
  });
});
