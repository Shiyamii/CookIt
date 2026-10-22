import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';

// `security.ts` reads the validated environment when it is loaded: give it a minimal one, then
// put the process environment back.
const FAKE_ENV = {
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  ORIGIN: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
};
const saved: Record<string, string | undefined> = {};
let staticCaching: typeof import('./security').staticCaching;

beforeAll(async () => {
  for (const [key, value] of Object.entries(FAKE_ENV)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
  ({ staticCaching } = await import('./security'));
});

afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function appWithFiles() {
  const app = new Hono();
  app.use('*', (c, next) => staticCaching()(c, next));
  app.get('/api/v1/units', (c) => c.json([]));
  app.get('/assets/index-abc123.js', (c) => c.text('console.log(1)'));
  app.get('/assets/missing.js', (c) => c.text('gone', 404));
  app.get('/sw.js', (c) => c.text('sw'));
  app.get('/manifest.webmanifest', (c) => c.text('{}'));
  app.get('/', (c) => c.html('<p>index</p>'));
  app.get('/recipes/:id', (c) => c.html('<p>spa</p>'));
  app.get('/redirect', (c) => c.redirect('/'));
  return app;
}

describe('static caching', () => {
  test('hashed files under /assets/ are cached for a year and immutable', async () => {
    const res = await appWithFiles().request('/assets/index-abc123.js');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  test.each(['/', '/sw.js', '/manifest.webmanifest', '/recipes/42'])(
    '%s is checked again each time (no-cache)',
    async (path) => {
      const res = await appWithFiles().request(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-cache');
    },
  );

  test('API answers are left to their own headers', async () => {
    const res = await appWithFiles().request('/api/v1/units');
    expect(res.headers.get('Cache-Control')).toBeNull();
  });

  test('a missing asset is never marked immutable', async () => {
    const res = await appWithFiles().request('/assets/missing.js');
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBeNull();
  });

  test('an unknown path (404) and a redirect get no caching header', async () => {
    const app = appWithFiles();
    const notFound = await app.request('/nothing-here');
    expect(notFound.status).toBe(404);
    expect(notFound.headers.get('Cache-Control')).toBeNull();
    const redirect = await app.request('/redirect');
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('Cache-Control')).toBeNull();
  });

  test('a path that only looks like /assets/ is not immutable', async () => {
    const app = new Hono();
    app.use('*', (c, next) => staticCaching()(c, next));
    app.get('/assets-old/a.js', (c) => c.text('a'));
    const res = await app.request('/assets-old/a.js');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
  });
});
