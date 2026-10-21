import {
  recipeCopyInputSchema,
  recipeCreateInputSchema,
  recipeMarkdownCreateInputSchema,
  recipeMarkdownInputSchema,
  recipeSaveInputSchema,
  recipeSearchSchema,
  recipeVisibilityInputSchema,
  sharedRecipeInputSchema,
} from '@cookit/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../http/app-env';
import { parseJson } from '../../http/validate';
import { requireUser } from '../auth/auth.middleware';
import { rateLimit, RATE_LIMITS } from '../rate-limit/rate-limit.middleware';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import type { RecipesService } from './recipes.service';

const idSchema = z.uuid();

type ServiceError =
  | { error: 'not_found' }
  | { error: 'conflict' }
  | { error: 'invalid_recipe'; diagnostics: unknown[] };

/** Service errors to HTTP; anything else is the success body. */
function respond<T extends object>(c: Context<AppEnv>, result: T | ServiceError, status = 200) {
  if ('error' in result) {
    if (result.error === 'not_found') return c.json({ error: 'not_found' }, 404);
    if (result.error === 'conflict') return c.json({ error: 'conflict' }, 409);
    return c.json(result, 422);
  }
  return c.json(result, status as 200);
}

export function createRecipesController(deps: {
  recipes: RecipesService;
  rateLimits: RateLimitService;
}) {
  const app = new Hono<AppEnv>();
  const userId = (c: Context<AppEnv>) => c.var.user?.id ?? '';
  const search = (c: Context<AppEnv>) => recipeSearchSchema.safeParse(c.req.query());

  // A path segment that is not a UUID cannot be a recipe (`markdown` is a route of its own).
  const paramId = (c: Context<AppEnv>) => c.req.param('id') ?? '';
  const recipeId = async (c: Context<AppEnv>, next: () => Promise<void>) => {
    if (!idSchema.safeParse(c.req.param('id')).success) return c.json({ error: 'not_found' }, 404);
    await next();
  };

  // Public gallery: no account needed.
  app.get('/api/v1/gallery', async (c) => {
    const query = search(c);
    if (!query.success) return c.json({ error: 'invalid_input' }, 400);
    return c.json(await deps.recipes.gallery(query.data));
  });

  // Unlisted recipe from its share link (token in the body, never in a URL).
  app.post('/api/v1/shared', rateLimit(deps.rateLimits, RATE_LIMITS.tokenCheckPerIp), async (c) => {
    const input = await parseJson(c, sharedRecipeInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.recipes.getShared(input.data.token, c.var.user?.id ?? null));
  });

  // A recipe from its id: its owner, or anyone for a public recipe.
  app.get('/api/v1/recipes/:id', recipeId, async (c) =>
    respond(c, await deps.recipes.get(paramId(c), c.var.user?.id ?? null)),
  );

  app.use('/api/v1/recipes', requireUser);
  app.use('/api/v1/recipes/*', requireUser);

  app.get('/api/v1/recipes', async (c) => {
    const query = search(c);
    if (!query.success) return c.json({ error: 'invalid_input' }, 400);
    return c.json(await deps.recipes.listMine(userId(c), query.data));
  });

  app.post('/api/v1/recipes', async (c) => {
    const input = await parseJson(c, recipeCreateInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.recipes.create(userId(c), input.data), 201);
  });

  app.post('/api/v1/recipes/markdown', async (c) => {
    const input = await parseJson(c, recipeMarkdownCreateInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.recipes.createFromMarkdown(userId(c), input.data), 201);
  });

  app.put('/api/v1/recipes/:id', recipeId, async (c) => {
    const input = await parseJson(c, recipeSaveInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.recipes.update(paramId(c), userId(c), input.data));
  });

  app.put('/api/v1/recipes/:id/markdown', recipeId, async (c) => {
    const input = await parseJson(c, recipeMarkdownInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.recipes.updateFromMarkdown(paramId(c), userId(c), input.data));
  });

  app.put('/api/v1/recipes/:id/visibility', recipeId, async (c) => {
    const input = await parseJson(c, recipeVisibilityInputSchema);
    if (!input.ok) return input.response;
    return respond(
      c,
      await deps.recipes.setVisibility(paramId(c), userId(c), input.data.visibility),
    );
  });

  app.delete('/api/v1/recipes/:id', recipeId, async (c) =>
    respond(c, await deps.recipes.delete(paramId(c), userId(c))),
  );

  // "Add to my library".
  app.post('/api/v1/recipes/:id/copy', recipeId, async (c) => {
    const input = await parseJson(c, recipeCopyInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.recipes.copy(paramId(c), userId(c), input.data.token), 201);
  });

  return app;
}
