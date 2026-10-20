import { describe, expect, test } from 'bun:test';
import { createSystemService } from './system.service';

describe('system service', () => {
  test('is healthy when the database answers', async () => {
    const service = createSystemService({ repository: { ping: async () => {} }, version: '1.2.3' });
    expect(await service.isHealthy()).toBe(true);
  });

  test('is unhealthy when the database fails', async () => {
    const repository = {
      ping: async () => {
        throw new Error('connection refused');
      },
    };
    const service = createSystemService({ repository, version: '1.2.3' });
    expect(await service.isHealthy()).toBe(false);
  });

  test('meta exposes the running version', () => {
    const service = createSystemService({ repository: { ping: async () => {} }, version: '1.2.3' });
    expect(service.meta()).toMatchObject({ name: 'CookIt', version: '1.2.3' });
  });
});
