import {
  authorNoteInputSchema,
  recipeNoteInputSchema,
  recipeCopyInputSchema,
  recipeCreateInputSchema,
  recipeImageOrderInputSchema,
  recipeIdeaQuerySchema,
  recipeImageUploadSchema,
  recipeLangQuerySchema,
  recipeMarkdownCreateInputSchema,
  recipeMarkdownInputSchema,
  recipeSaveInputSchema,
  recipeSaveLinkInputSchema,
  recipeSearchSchema,
  recipeTranslationInputSchema,
  recipeVisibilityInputSchema,
  sharedRecipeInputSchema,
  SUPPORTED_LOCALES,
} from '@cookit/shared';
import { strToU8, zipSync } from 'fflate';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../http/app-env';
import { parseForm, parseJson } from '../../http/validate';
import { sendImage } from '../../http/images';
import { requireUser } from '../auth/auth.middleware';
import { rateLimit, RATE_LIMITS } from '../rate-limit/rate-limit.middleware';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import type { RecipesService } from './recipes.service';

const idSchema = z.uuid();
const langSchema = z.enum(SUPPORTED_LOCALES);

type ServiceError =
  | { error: 'not_found' }
  | { error: 'conflict' }
  | { error: 'invalid_tags' }
  | { error: 'base_language' }
  | { error: 'invalid_image' }
  | { error: 'too_many_images' }
  | { error: 'storage_full' }
  | { error: 'invalid_order' }
  | { error: 'own_recipe' }
  | { error: 'invalid_recipe'; diagnostics: unknown[] };

const BAD_REQUEST = new Set([
  'invalid_tags',
  'base_language',
  'invalid_image',
  'invalid_order',
  'own_recipe',
]);

/** Service errors to HTTP; anything else is the success body. */
function respond<T extends object>(c: Context<AppEnv>, result: T | ServiceError, status = 200) {
  if ('error' in result) {
    if (result.error === 'not_found') return c.json({ error: 'not_found' }, 404);
    if (result.error === 'conflict') return c.json({ error: 'conflict' }, 409);
    if (result.error === 'too_many_images' || result.error === 'storage_full') {
      return c.json({ error: result.error }, 409);
    }
    if (BAD_REQUEST.has(result.error)) return c.json({ error: result.error }, 400);
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

  // Photos, read like static files (`/images/…`, not the API: they may be cached). Who may see
  // one is decided by the service from its recipe.
  for (const size of ['full', 'thumb'] as const) {
    const path = size === 'full' ? '/images/recipes/:imageId' : '/images/recipes/:imageId/thumb';
    app.get(path, async (c) => {
      const imageId = idSchema.safeParse(c.req.param('imageId'));
      if (!imageId.success) return c.notFound();
      const image = await deps.recipes.readImage(imageId.data, c.var.user?.id ?? null, size);
      if ('error' in image) return c.notFound();
      return sendImage(c, image, `${imageId.data}-${size}`);
    });
  }

  // Public gallery: no account needed.
  app.get('/api/v1/gallery', async (c) => {
    const query = search(c);
    if (!query.success) return c.json({ error: 'invalid_input' }, 400);
    return c.json(await deps.recipes.gallery(query.data, c.var.user?.id ?? null));
  });

  // Unlisted recipe from its share link (token in the body, never in a URL).
  app.post('/api/v1/shared', rateLimit(deps.rateLimits, RATE_LIMITS.tokenCheckPerIp), async (c) => {
    const input = await parseJson(c, sharedRecipeInputSchema);
    if (!input.ok) return input.response;
    return respond(
      c,
      await deps.recipes.getShared(input.data.token, c.var.user?.id ?? null, input.data.lang),
    );
  });

  // "Export all my recipes": a zip of `.md` files (built in memory: a library is small).
  app.get('/api/v1/recipes/export', requireUser, async (c) => {
    const files = await deps.recipes.exportAll(userId(c));
    const zip = zipSync(
      Object.fromEntries(files.map((file) => [file.name, strToU8(file.markdown)])),
      { level: 6 },
    );
    return c.body(zip, 200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="cookit-recipes.zip"',
    });
  });

  // The idea of the day (home page).
  app.get('/api/v1/recipes/idea', requireUser, async (c) => {
    const query = recipeIdeaQuerySchema.safeParse(c.req.query());
    if (!query.success) return c.json({ error: 'invalid_input' }, 400);
    return c.json(await deps.recipes.idea(userId(c), query.data));
  });

  // A recipe from its id: its owner, anyone for a public recipe, a reader who added an unlisted
  // one with its link. `?lang=` picks a translation.
  app.get('/api/v1/recipes/:id', recipeId, async (c) => {
    const query = recipeLangQuerySchema.safeParse(c.req.query());
    if (!query.success) return c.json({ error: 'invalid_input' }, 400);
    return respond(c, await deps.recipes.get(paramId(c), c.var.user?.id ?? null, query.data.lang));
  });

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

  // The reader's private note (unlisted recipe of someone else: with its share token).
  app.put(
    '/api/v1/recipes/:id/note',
    recipeId,
    rateLimit(deps.rateLimits, RATE_LIMITS.settingsSavePerAccount, (c) => c.var.user?.id),
    async (c) => {
      const input = await parseJson(c, recipeNoteInputSchema);
      if (!input.ok) return input.response;
      return respond(
        c,
        await deps.recipes.saveNote(paramId(c), userId(c), input.data.text, input.data.token),
      );
    },
  );

  // The author's public note (owner only).
  app.put(
    '/api/v1/recipes/:id/author-note',
    recipeId,
    rateLimit(deps.rateLimits, RATE_LIMITS.settingsSavePerAccount, (c) => c.var.user?.id),
    async (c) => {
      const input = await parseJson(c, authorNoteInputSchema);
      if (!input.ok) return input.response;
      return respond(c, await deps.recipes.setAuthorNote(paramId(c), userId(c), input.data.text));
    },
  );

  app.delete('/api/v1/recipes/:id', recipeId, async (c) =>
    respond(c, await deps.recipes.delete(paramId(c), userId(c))),
  );

  // Translations (other than the base language): add or replace, delete.
  const paramLang = (c: Context<AppEnv>) => langSchema.safeParse(c.req.param('lang'));

  app.put('/api/v1/recipes/:id/translations/:lang', recipeId, async (c) => {
    const lang = paramLang(c);
    if (!lang.success) return c.json({ error: 'not_found' }, 404);
    const input = await parseJson(c, recipeTranslationInputSchema);
    if (!input.ok) return input.response;
    return respond(
      c,
      await deps.recipes.saveTranslation(paramId(c), userId(c), lang.data, input.data.markdown),
    );
  });

  app.delete('/api/v1/recipes/:id/translations/:lang', recipeId, async (c) => {
    const lang = paramLang(c);
    if (!lang.success) return c.json({ error: 'not_found' }, 404);
    return respond(c, await deps.recipes.deleteTranslation(paramId(c), userId(c), lang.data));
  });

  // Photos of a recipe (owner only): add one, change their order, delete one.
  app.post(
    '/api/v1/recipes/:id/images',
    recipeId,
    rateLimit(deps.rateLimits, RATE_LIMITS.imageUploadPerAccount, (c) => c.var.user?.id),
    async (c) => {
      const input = await parseForm(c, recipeImageUploadSchema);
      if (!input.ok) return input.response;
      const upload = {
        image: new Uint8Array(await input.data.image.arrayBuffer()),
        thumb: new Uint8Array(await input.data.thumb.arrayBuffer()),
      };
      return respond(c, await deps.recipes.addImage(paramId(c), userId(c), upload), 201);
    },
  );

  app.put('/api/v1/recipes/:id/images', recipeId, async (c) => {
    const input = await parseJson(c, recipeImageOrderInputSchema);
    if (!input.ok) return input.response;
    return respond(c, await deps.recipes.orderImages(paramId(c), userId(c), input.data.ids));
  });

  app.delete('/api/v1/recipes/:id/images/:imageId', recipeId, async (c) => {
    const imageId = idSchema.safeParse(c.req.param('imageId'));
    if (!imageId.success) return c.json({ error: 'not_found' }, 404);
    return respond(c, await deps.recipes.deleteImage(paramId(c), userId(c), imageId.data));
  });

  // "Add to my recipes": a link, not a copy (unlisted recipe of someone else: with its token).
  app.put(
    '/api/v1/recipes/:id/saved',
    recipeId,
    rateLimit(deps.rateLimits, RATE_LIMITS.settingsSavePerAccount, (c) => c.var.user?.id),
    async (c) => {
      const input = await parseJson(c, recipeSaveLinkInputSchema);
      if (!input.ok) return input.response;
      return respond(c, await deps.recipes.saveLink(paramId(c), userId(c), input.data.token));
    },
  );

  app.delete('/api/v1/recipes/:id/saved', recipeId, async (c) =>
    c.json(await deps.recipes.removeLink(paramId(c), userId(c))),
  );

  // "Make a copy in my recipes".
  // Each copy stores the recipe's photos again: limited per account.
  app.post(
    '/api/v1/recipes/:id/copy',
    recipeId,
    rateLimit(deps.rateLimits, RATE_LIMITS.recipeCopyPerAccount, (c) => c.var.user?.id),
    async (c) => {
      const input = await parseJson(c, recipeCopyInputSchema);
      if (!input.ok) return input.response;
      return respond(c, await deps.recipes.copy(paramId(c), userId(c), input.data.token), 201);
    },
  );

  return app;
}
