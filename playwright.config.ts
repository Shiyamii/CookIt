import { defineConfig, devices } from '@playwright/test';

/** Tests that change the whole instance: each in its own project, after the others. */
const ALONE = ['**/restart.e2e.ts', '**/members-only.e2e.ts'];

// End-to-end tests run against the built image (Node runtime), never against the Vite dev server.
// Start it first: docker compose -f docker-compose.dev.yml up -d --build
export default defineConfig({
  testDir: './e2e',
  // `.e2e.ts` suffix so that `bun test` never picks these files up.
  testMatch: '**/*.e2e.ts',
  // Gets the test admin in (first-admin link or password reset through the rescue CLI).
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // GitHub's runners have 4 vCPUs (Playwright's default would be 2 workers): most of the suite
  // waits on the app, timers and the push sink rather than on the CPU.
  workers: process.env.CI ? 4 : undefined,
  // In CI, also a JUnit file for Codecov Test Analytics (flaky and slow tests).
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['junit', { outputFile: 'reports/junit-e2e.xml' }]]
    : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [
    // Tests tagged @server check the server only (push, reminders: no page): on desktop only.
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testIgnore: ALONE,
      grepInvert: /@server/,
    },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: ALONE },
    // Closes the gallery to visitors, which the other tests rely on: once they are done.
    {
      name: 'members-only',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/members-only.e2e.ts',
      dependencies: ['mobile', 'desktop'],
    },
    // Stops and starts the app container: alone, once every other test is done.
    {
      name: 'restart',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/restart.e2e.ts',
      dependencies: ['members-only'],
    },
  ],
});
