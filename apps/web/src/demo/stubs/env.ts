// Stands in for apps/server/src/env.ts in the demo build (vite.config.ts, demo mode): the server
// reads its settings from the environment when the module loads, which a browser does not have.
// Only what the controllers and services used by the demo read.

export const env = {
  ORIGIN: typeof location === 'undefined' ? 'http://localhost' : location.origin,
  APP_VERSION: 'demo',
  TRUST_PROXY: false,
  RATE_LIMIT_FACTOR: 1,
  ADMIN_EMAIL: undefined,
  PUSH_TEST_ENDPOINT_ORIGIN: undefined,
};

export const smtp = undefined;
export const vapid = undefined;
