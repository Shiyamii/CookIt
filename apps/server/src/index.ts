import { serve } from '@hono/node-server';
import { app } from './app';
import { client } from './db';
import { env } from './env';

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`CookIt server listening on port ${info.port}`);
});

function shutdown() {
  server.close(async () => {
    await client.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
