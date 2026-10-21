import {
  reorderInputSchema,
  tagCategoryInputSchema,
  tagDeleteInputSchema,
  tagInputSchema,
} from '@cookit/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../http/app-env';
import { parseJson } from '../../http/validate';
import { requireAdmin } from '../auth/auth.middleware';
import type { TagError, TagsService } from './tags.service';

const idSchema = z.uuid();

function respond<T extends object>(c: Context<AppEnv>, result: T | TagError, status = 200) {
  if ('error' in result) return c.json(result, result.error === 'not_found' ? 404 : 409);
  return c.json(result, status as 200);
}

export function createTagsController(deps: { tags: TagsService }) {
  const app = new Hono<AppEnv>();
  const validId = (c: Context<AppEnv>) => idSchema.safeParse(c.req.param('id')).success;
  const notFound = (c: Context<AppEnv>) => c.json({ error: 'not_found' }, 404);

  // The catalog: tag pickers, filters, recipe pages (public pages included).
  app.get('/api/v1/tags', async (c) => c.json(await deps.tags.catalog()));

  for (const path of ['/api/v1/admin/tags', '/api/v1/admin/tag-categories']) {
    app.use(path, requireAdmin);
    app.use(`${path}/*`, requireAdmin);
  }

  // With the number of recipes using each tag (to confirm a deletion).
  app.get('/api/v1/admin/tags', async (c) => c.json(await deps.tags.adminList()));

  app.post('/api/v1/admin/tag-categories', async (c) => {
    const input = await parseJson(c, tagCategoryInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.tags.createCategory(input.data), 201);
  });

  app.put('/api/v1/admin/tag-categories/order', async (c) => {
    const input = await parseJson(c, reorderInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.tags.reorderCategories(input.data.ids));
  });

  app.put('/api/v1/admin/tag-categories/:id', async (c) => {
    if (!validId(c)) return notFound(c);
    const input = await parseJson(c, tagCategoryInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.tags.updateCategory(c.req.param('id') ?? '', input.data));
  });

  app.put('/api/v1/admin/tag-categories/:id/tag-order', async (c) => {
    if (!validId(c)) return notFound(c);
    const input = await parseJson(c, reorderInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.tags.reorderTags(c.req.param('id') ?? '', input.data.ids));
  });

  app.delete('/api/v1/admin/tag-categories/:id', async (c) => {
    if (!validId(c)) return notFound(c);
    return respond(c, await deps.tags.deleteCategory(c.req.param('id') ?? ''));
  });

  app.post('/api/v1/admin/tags', async (c) => {
    const input = await parseJson(c, tagInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.tags.createTag(input.data), 201);
  });

  app.put('/api/v1/admin/tags/:id', async (c) => {
    if (!validId(c)) return notFound(c);
    const input = await parseJson(c, tagInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.tags.updateTag(c.req.param('id') ?? '', input.data));
  });

  // POST with a body: a deletion can need a confirmation or a merge target.
  app.post('/api/v1/admin/tags/:id/delete', async (c) => {
    if (!validId(c)) return notFound(c);
    const input = await parseJson(c, tagDeleteInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.tags.deleteTag(c.req.param('id') ?? '', input.data));
  });

  return app;
}
