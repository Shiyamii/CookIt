import { defineConfig, devices } from '@playwright/test';

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
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
});
