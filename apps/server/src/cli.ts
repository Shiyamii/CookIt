// Rescue commands, run from the container's terminal (plan §5.1):
//   node dist/cli.js admin:reset-link <username>   one-time password reset link for a user
//   node dist/cli.js setup-link                    new first-admin setup link (only if no admin)
//   node dist/cli.js rate-limits:clear              lift every rate limit (someone locked out)
//   node dist/cli.js push:vapid-keys                new VAPID keys for Web Push (plan §5.4)
import { createContainer } from './container';
import { client, db } from './db';
import { generateVapidKeys } from './lib/web-push';

const [command, argument] = process.argv.slice(2);
const container = createContainer(db);

async function run(): Promise<number> {
  switch (command) {
    case 'admin:reset-link': {
      if (!argument) {
        console.error('Usage: node dist/cli.js admin:reset-link <username>');
        return 1;
      }
      const url = await container.users.createResetLinkForUsername(argument);
      if (!url) {
        console.error(`No user named "${argument}".`);
        return 1;
      }
      console.log(`One-time password reset link for ${argument} (valid 3 days):\n${url}`);
      return 0;
    }
    case 'setup-link': {
      const url = await container.invites.createSetupLinkIfNoAdmin();
      if (!url) {
        console.error('An admin account already exists: no setup link.');
        return 1;
      }
      console.log(url);
      return 0;
    }
    case 'rate-limits:clear': {
      await container.rateLimits.clearAll();
      console.log('Rate limits cleared.');
      return 0;
    }
    case 'push:vapid-keys': {
      const keys = generateVapidKeys();
      console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}`);
      return 0;
    }
    default:
      console.error(
        'Commands: admin:reset-link <username>, setup-link, rate-limits:clear, push:vapid-keys',
      );
      return 1;
  }
}

const code = await run().catch((error: unknown) => {
  console.error(error);
  return 1;
});
await client.end();
process.exit(code);
