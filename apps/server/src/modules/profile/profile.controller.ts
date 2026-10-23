import { alarmSettingsSchema, avatarUploadSchema } from '@cookit/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../../http/app-env';
import { sendImage } from '../../http/images';
import { parseForm, parseJson } from '../../http/validate';
import { requireUser } from '../auth/auth.middleware';
import { rateLimit, RATE_LIMITS } from '../rate-limit/rate-limit.middleware';
import type { RateLimitService } from '../rate-limit/rate-limit.service';
import type { ProfileService } from './profile.service';

const idSchema = z.uuid();

/** The signed-in user's profile picture, and pictures as static-like files. */
export function createProfileController(deps: {
  profile: ProfileService;
  rateLimits: RateLimitService;
}) {
  const app = new Hono<AppEnv>();
  const userId = (c: { var: AppEnv['Variables'] }) => c.var.user?.id ?? '';

  app.put(
    '/api/v1/me/avatar',
    requireUser,
    rateLimit(deps.rateLimits, RATE_LIMITS.imageUploadPerAccount, (c) => c.var.user?.id),
    async (c) => {
      const input = await parseForm(c, avatarUploadSchema);
      if (!input.ok) return input.response;
      const bytes = new Uint8Array(await input.data.image.arrayBuffer());
      const result = await deps.profile.setAvatar(userId(c), bytes);
      return 'error' in result ? c.json(result, 400) : c.json(result);
    },
  );

  // The alarm of finished timers, for the account.
  app.get('/api/v1/me/alarm', requireUser, async (c) =>
    c.json(await deps.profile.alarm(userId(c))),
  );
  app.put(
    '/api/v1/me/alarm',
    requireUser,
    rateLimit(deps.rateLimits, RATE_LIMITS.settingsSavePerAccount, (c) => c.var.user?.id),
    async (c) => {
      const input = await parseJson(c, alarmSettingsSchema);
      if (!input.ok) return input.response;
      return c.json(await deps.profile.saveAlarm(userId(c), input.data));
    },
  );

  app.delete('/api/v1/me/avatar', requireUser, async (c) =>
    c.json(await deps.profile.removeAvatar(userId(c))),
  );

  app.get('/images/avatars/:id', async (c) => {
    const id = c.req.param('id');
    if (!idSchema.safeParse(id).success) return c.notFound();
    const avatar = await deps.profile.readAvatar(id);
    return 'error' in avatar ? c.notFound() : sendImage(c, avatar, id);
  });

  return app;
}
