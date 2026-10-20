import { Hono } from 'hono';
import type { SystemService } from './system.service';

export function createSystemController(service: SystemService) {
  return new Hono()
    .get('/healthz', async (c) =>
      (await service.isHealthy()) ? c.json({ status: 'ok' }) : c.json({ status: 'error' }, 503),
    )
    .get('/api/v1/meta', (c) => c.json(service.meta()));
}
