import { memberListedInputSchema, type AccountError } from '@cookit/shared';
import { Hono, type Context } from 'hono';
import type { AppEnv } from '../../http/app-env';
import { parseJson } from '../../http/validate';
import { requireAdmin } from '../auth/auth.middleware';
import type { UsersService } from './users.service';

function errorResponse(c: Context, error: AccountError) {
  return c.json({ error }, error === 'not_found' ? 404 : 409);
}

/** Admin "Utilisateurs" page API. Every route requires an admin session. */
export function createUsersController(deps: { users: UsersService }) {
  const app = new Hono<AppEnv>();
  app.use('/api/v1/admin/users', requireAdmin);
  app.use('/api/v1/admin/users/*', requireAdmin);

  const actorId = (c: Context<AppEnv>) => c.var.user?.id ?? '';

  app.get('/api/v1/admin/users', async (c) => c.json(await deps.users.list()));

  app.post('/api/v1/admin/users/:id/disable', async (c) => {
    const result = await deps.users.disable(actorId(c), c.req.param('id'));
    return result.ok ? c.json({ ok: true }) : errorResponse(c, result.error);
  });

  app.post('/api/v1/admin/users/:id/enable', async (c) => {
    const result = await deps.users.enable(c.req.param('id'));
    return result.ok ? c.json({ ok: true }) : errorResponse(c, result.error);
  });

  // Appear in the members list or not (the user can change it too).
  app.put('/api/v1/admin/users/:id/listed', async (c) => {
    const input = await parseJson(c, memberListedInputSchema);
    if (!input.ok) return input.response;
    const result = await deps.users.setListed(c.req.param('id'), input.data.listed);
    return result.ok ? c.json({ listed: input.data.listed }) : errorResponse(c, result.error);
  });

  app.delete('/api/v1/admin/users/:id', async (c) => {
    const result = await deps.users.delete(actorId(c), c.req.param('id'));
    return result.ok ? c.json({ ok: true }) : errorResponse(c, result.error);
  });

  app.post('/api/v1/admin/users/:id/reset-link', async (c) => {
    const result = await deps.users.createResetLink(actorId(c), c.req.param('id'));
    return result.ok ? c.json({ url: result.url }, 201) : errorResponse(c, result.error);
  });

  return app;
}
