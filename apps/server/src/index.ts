import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createContainer } from './container';
import { client, db, runMigrations } from './db';
import { runSeeds } from './db/seed';
import { env, vapid } from './env';
import { startPushScheduler } from './modules/push/push.scheduler';

// Apply pending migrations before accepting traffic; a failure stops the process.
await runMigrations();
console.log('Database migrations applied');
await runSeeds(db);

const container = createContainer(db);

// First start: no admin yet, so the only way in is a one-time setup link, written in the logs
// (plan §5.1). Every restart replaces it until an admin exists.
const setupUrl = await container.invites.createSetupLinkIfNoAdmin();
if (setupUrl) {
  console.log(
    `No admin account yet. Create it within 24 hours with this one-time link:\n  ${setupUrl}`,
  );
}

const purgeExpired = () =>
  Promise.all([container.rateLimits.purgeExpired(), container.accountSecurity.purgeExpired()]);
const purge = setInterval(() => void purgeExpired().catch(() => {}), 3600_000);
purge.unref();

if (!vapid) console.warn('VAPID keys not set: push notifications are off');
const scheduler = startPushScheduler(container.push);

const server = serve({ fetch: createApp(container).fetch, port: env.PORT }, (info) => {
  console.log(`CookIt server listening on port ${info.port}`);
});

function shutdown() {
  server.close(async () => {
    await scheduler.stop();
    await client.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
