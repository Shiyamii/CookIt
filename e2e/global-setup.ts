import { request } from '@playwright/test';
import { ADMIN, ADMIN_STATE, BASE_URL, cli, ORIGIN_HEADER, tokenOf } from './support';

/**
 * Gets the test admin in, whatever the state of the database:
 * - no admin yet: a first-admin link from the CLI (`setup-link`), then sign-up;
 * - otherwise: a reset link for `e2e_admin` (`admin:reset-link`), then a new password.
 * The signed-in admin session is saved for the tests (`ADMIN_STATE`).
 */
export default async function globalSetup() {
  const api = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: ORIGIN_HEADER });

  // Counters left by previous runs (all from this machine's IP) must not fail this one.
  const cleared = cli('rate-limits:clear');
  if (!cleared.ok) throw new Error(`Cannot clear the rate limits: ${cleared.output}`);

  const setup = cli('setup-link');
  if (setup.ok) {
    const res = await api.post('/api/v1/register', {
      data: {
        token: tokenOf(setup.output.trim()),
        username: ADMIN.username,
        email: ADMIN.email,
        password: ADMIN.password,
        locale: 'en',
      },
    });
    if (!res.ok()) throw new Error(`Admin sign-up failed: ${res.status()} ${await res.text()}`);
  } else {
    const reset = cli('admin:reset-link', ADMIN.username);
    if (!reset.ok) {
      throw new Error(
        `This database has an admin but no "${ADMIN.username}": run the end-to-end tests on a ` +
          'fresh database (docker compose -f docker-compose.dev.yml down -v, then up -d --build).\n' +
          reset.output,
      );
    }
    const token = tokenOf(reset.output);
    const res = await api.post('/api/v1/password-reset', {
      data: { token, password: ADMIN.password },
    });
    if (!res.ok()) throw new Error(`Admin password reset failed: ${res.status()}`);
  }

  const signIn = await api.post('/api/v1/auth/sign-in/username', {
    data: { username: ADMIN.username, password: ADMIN.password },
  });
  if (!signIn.ok()) throw new Error(`Admin sign-in failed: ${signIn.status()}`);
  // The tests expect an English interface for the admin (a failed run may have left another one).
  const locale = await api.post('/api/v1/auth/update-user', { data: { locale: 'en' } });
  if (!locale.ok()) throw new Error(`Admin locale reset failed: ${locale.status()}`);
  await api.storageState({ path: ADMIN_STATE });
  await api.dispose();
}
