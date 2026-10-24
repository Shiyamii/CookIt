import { updateProfileInputSchema } from '@cookit/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../../../server/src/http/app-env';
import type { SessionUser } from '../../../server/src/modules/auth/auth';
import type { Auth } from '../../../server/src/modules/auth/auth';
import { createCookingController } from '../../../server/src/modules/cooking/cooking.controller';
import { createInvitesController } from '../../../server/src/modules/invites/invites.controller';
import { createInvitesService } from '../../../server/src/modules/invites/invites.service';
import type { PasswordResetService } from '../../../server/src/modules/password-reset/password-reset.service';
import { createUsersController } from '../../../server/src/modules/users/users.controller';
import { createUsersService } from '../../../server/src/modules/users/users.service';
import { createCookingService } from '../../../server/src/modules/cooking/cooking.service';
import { createMembersController } from '../../../server/src/modules/members/members.controller';
import { createMembersService } from '../../../server/src/modules/members/members.service';
import { createProfileController } from '../../../server/src/modules/profile/profile.controller';
import { createProfileService } from '../../../server/src/modules/profile/profile.service';
import { createPushController } from '../../../server/src/modules/push/push.controller';
import { createPushService } from '../../../server/src/modules/push/push.service';
import { createShoppingController } from '../../../server/src/modules/shopping/shopping.controller';
import { createShoppingService } from '../../../server/src/modules/shopping/shopping.service';
import { createRateLimitService } from '../../../server/src/modules/rate-limit/rate-limit.service';
import { createRecipesController } from '../../../server/src/modules/recipes/recipes.controller';
import { createRecipesService } from '../../../server/src/modules/recipes/recipes.service';
import { createSystemController } from '../../../server/src/modules/system/system.controller';
import { createSystemService } from '../../../server/src/modules/system/system.service';
import { createTagsController } from '../../../server/src/modules/tags/tags.controller';
import { createTagsService } from '../../../server/src/modules/tags/tags.service';
import { createUnitsController } from '../../../server/src/modules/units/units.controller';
import { createUnitsService } from '../../../server/src/modules/units/units.service';
import {
  createMemoryRateLimitRepository,
  createMemorySystemRepository,
  createMemoryTagsRepository,
  createMemoryUnitsRepository,
} from './repositories/catalog';
import { createMemoryInvitesRepository, createMemoryUsersRepository } from './repositories/admin';
import {
  createMemoryCookingRepository,
  createMemoryMembersRepository,
  createMemoryProfileRepository,
  createMemoryPushRepository,
  createMemoryShoppingRepository,
} from './repositories/member';
import { createMemoryRecipesRepository } from './repositories/recipes';
import { seedRecipes, seedState } from './seed';
import { demoRole, DEMO_USER_IDS } from './session';
import { clearState, loadState, saveState, type DemoState } from './state';
import { DemoUnavailableError } from './unavailable';

const unavailable = () => {
  throw new DemoUnavailableError();
};

/** 32 random bytes in base64url, like the server's link tokens. */
function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * The CookIt API inside the page (demo build only): the server's own controllers and services,
 * on in-memory repositories saved in the browser. What needs a real server (accounts, email,
 * URL import, photos) is not mounted: those routes answer 404. Push answers "not configured".
 */
function createDemoApi(holder: { state: DemoState }) {
  const state = () => holder.state;
  const system = createSystemService({
    repository: createMemorySystemRepository(state),
    version: 'demo',
  });
  const units = createUnitsService({ repository: createMemoryUnitsRepository(state) });
  const tags = createTagsService({ repository: createMemoryTagsRepository(state) });
  const rateLimits = createRateLimitService({ repository: createMemoryRateLimitRepository() });
  const recipes = createRecipesService({
    repository: createMemoryRecipesRepository(state),
    origin: location.origin + (import.meta.env.BASE_URL ?? '/').replace(/\/$/, ''),
    units: () => units.catalog(),
    tags,
    generateToken,
    publicGallery: () => system.publicGallery(),
  });
  const cooking = createCookingService({ repository: createMemoryCookingRepository(state) });
  const shopping = createShoppingService({ repository: createMemoryShoppingRepository(state) });
  const profile = createProfileService({ repository: createMemoryProfileRepository(state) });
  const members = createMembersService({
    repository: createMemoryMembersRepository(state),
    recipes,
  });
  const origin = location.origin + (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
  // Accounts are managed (disabled, listed, deleted); passwords and sign-in need the real server.
  const users = createUsersService({
    repository: createMemoryUsersRepository(state),
    passwordReset: { createLink: unavailable } as unknown as PasswordResetService,
  });
  const invites = createInvitesService({
    repository: createMemoryInvitesRepository(state),
    origin,
    hashPassword: unavailable,
  });
  const auth = { api: { signInUsername: unavailable } } as unknown as Auth;
  // No push service in the demo: no key, subscriptions refused ("not configured").
  const push = createPushService({
    repository: createMemoryPushRepository(),
    isPushEndpoint: () => false,
  });

  const app = new Hono<AppEnv>();
  app.onError((error, c) => {
    if (error instanceof DemoUnavailableError) {
      return c.json({ error: 'not_available_in_demo' }, 501);
    }
    throw error;
  });
  // The signed-in visitor: the demo member or the demo admin (demo banner).
  app.use('/api/*', async (c, next) => {
    const found = holder.state.users.find((u) => u.id === DEMO_USER_IDS[demoRole()]);
    c.set('user', found && !found.disabledAt ? (found as unknown as SessionUser) : null);
    await next();
  });
  app.get('/api/v1/me', (c) => {
    const u = holder.state.users.find((candidate) => candidate.id === c.var.user?.id);
    return c.json({
      user: u && {
        id: u.id,
        name: u.name,
        email: u.email,
        username: u.displayUsername,
        role: u.role,
        locale: u.locale,
        image: u.image,
      },
    });
  });
  // Better Auth's profile change (display name, language): the visitor's demo account.
  app.post('/api/v1/auth/update-user', async (c) => {
    const input = updateProfileInputSchema.safeParse(await c.req.json().catch(() => undefined));
    const u = holder.state.users.find((candidate) => candidate.id === c.var.user?.id);
    if (!u) return c.json({ error: 'unauthorized' }, 401);
    if (!input.success) return c.json({ error: 'invalid_input' }, 400);
    Object.assign(u, input.data, { updatedAt: new Date() });
    return c.json({ status: true });
  });
  // Pictures need a server to store and serve them.
  app.put('/api/v1/me/avatar', unavailable);
  app.post('/api/v1/recipes/:id/images', unavailable);
  app.route('/', createSystemController(system));
  app.route('/', createRecipesController({ recipes, rateLimits }));
  app.route('/', createTagsController({ tags }));
  app.route('/', createUnitsController({ units }));
  app.route('/', createCookingController({ cooking, rateLimits }));
  app.route('/', createShoppingController({ shopping, rateLimits }));
  app.route('/', createProfileController({ profile, rateLimits }));
  app.route('/', createMembersController({ members, rateLimits }));
  app.route('/', createPushController({ push, rateLimits }));
  app.route('/', createUsersController({ users }));
  app.route('/', createInvitesController({ invites, auth, rateLimits }));
  app.all('/api/*', (c) => c.json({ error: 'not_available_in_demo' }, 404));
  return { app, recipes, tags };
}

let ready: Promise<{ app: Hono<AppEnv>; holder: { state: DemoState } }> | undefined;

/** Loads the saved demo, or seeds a new one. */
function start() {
  ready ??= (async () => {
    const saved = await loadState();
    const holder = { state: saved ?? seedState() };
    const api = createDemoApi(holder);
    if (!saved) {
      await seedRecipes(api.recipes, api.tags);
      await saveState(holder.state);
    }
    return { app: api.app, holder };
  })();
  return ready;
}

/** `fetch` for `/api/v1/…` in the demo build: answered by the API in the page. */
export async function demoFetch(path: string, init: RequestInit): Promise<Response> {
  const { app, holder } = await start();
  const response = await app.fetch(new Request(new URL(path, location.origin), init));
  if (init.method && init.method !== 'GET') await saveState(holder.state);
  return response;
}

/** Starts the demo again from its first state. */
export async function resetDemo(): Promise<void> {
  await clearState();
  ready = undefined;
}
