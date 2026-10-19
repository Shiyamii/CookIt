import { serveStatic } from '@hono/node-server/serve-static';
import { APP_NAME, SUPPORTED_LOCALES } from '@cookit/shared';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db } from './db';
import { env } from './env';

export const app = new Hono();

app.get('/healthz', async (c) => {
  try {
    await db.execute(sql`select 1`);
    return c.json({ status: 'ok' });
  } catch {
    return c.json({ status: 'error' }, 503);
  }
});

app.get('/api/v1/meta', (c) => c.json({ name: APP_NAME, locales: SUPPORTED_LOCALES }));
app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

// SPA: static files, then index.html for client-side routes.
app.use('*', serveStatic({ root: env.STATIC_DIR }));
app.get('*', serveStatic({ path: `${env.STATIC_DIR}/index.html` }));
