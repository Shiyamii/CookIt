import { reorderInputSchema, unitInputSchema } from '@cookit/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../http/app-env';
import { parseJson } from '../../http/validate';
import { requireAdmin } from '../auth/auth.middleware';
import type { UnitError, UnitsService } from './units.service';

const idSchema = z.uuid();

function respond<T extends object>(c: Context<AppEnv>, result: T | UnitError, status = 200) {
  if ('error' in result) return c.json(result, result.error === 'not_found' ? 404 : 409);
  return c.json(result, status as 200);
}

export function createUnitsController(deps: { units: UnitsService }) {
  const app = new Hono<AppEnv>();

  // The catalog: needed to read and scale recipes, public pages included.
  app.get('/api/v1/units', async (c) => c.json(await deps.units.list()));

  app.use('/api/v1/admin/units', requireAdmin);
  app.use('/api/v1/admin/units/*', requireAdmin);

  app.post('/api/v1/admin/units', async (c) => {
    const input = await parseJson(c, unitInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.units.create(input.data), 201);
  });

  app.put('/api/v1/admin/units/order', async (c) => {
    const input = await parseJson(c, reorderInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.units.reorder(input.data.ids));
  });

  app.put('/api/v1/admin/units/:id', async (c) => {
    const id = c.req.param('id');
    if (!idSchema.safeParse(id).success) return c.json({ error: 'not_found' }, 404);
    const input = await parseJson(c, unitInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.units.update(id, input.data));
  });

  app.delete('/api/v1/admin/units/:id', async (c) => {
    const id = c.req.param('id');
    if (!idSchema.safeParse(id).success) return c.json({ error: 'not_found' }, 404);
    return respond(c, await deps.units.delete(id));
  });

  return app;
}
