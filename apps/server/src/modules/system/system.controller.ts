import { instanceSettingsSchema } from '@cookit/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../http/app-env';
import { parseJson } from '../../http/validate';
import { requireAdmin } from '../auth/auth.middleware';
import type { SystemService } from './system.service';

export function createSystemController(service: SystemService) {
  return (
    new Hono<AppEnv>()
      .get('/healthz', async (c) =>
        (await service.isHealthy()) ? c.json({ status: 'ok' }) : c.json({ status: 'error' }, 503),
      )
      .get('/api/v1/meta', async (c) => c.json(await service.meta()))
      // The instance's settings (admin).
      .get('/api/v1/admin/settings', requireAdmin, async (c) => c.json(await service.settings()))
      .put('/api/v1/admin/settings', requireAdmin, async (c) => {
        const input = await parseJson(c, instanceSettingsSchema);
        if (!input.ok) return input.response;
        return c.json(await service.saveSettings(input.data));
      })
  );
}
