import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { db } from './db';
import { env } from './env';
import { createSystemController } from './modules/system/system.controller';
import { createSystemRepository } from './modules/system/system.repository';
import { createSystemService } from './modules/system/system.service';

// Composition root: repositories -> services -> controllers, wired by hand (no DI container).
const systemService = createSystemService({
  repository: createSystemRepository(db),
  version: env.APP_VERSION,
});

export const app = new Hono();

app.route('/', createSystemController(systemService));
app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

// SPA: static files, then index.html for client-side routes.
app.use('*', serveStatic({ root: env.STATIC_DIR }));
app.get('*', serveStatic({ path: `${env.STATIC_DIR}/index.html` }));
