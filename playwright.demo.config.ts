import { defineConfig, devices } from '@playwright/test';

// The demo build (GitHub Pages), served by Vite's preview under its sub-path: no server, no
// database. Build it first: bun run test:demo does both.
const BASE = '/CookIt/';
const PORT = 4174;

export default defineConfig({
  testDir: './e2e/demo',
  testMatch: '**/*.demo.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-demo' }]]
    : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `bun run --filter @cookit/web preview:demo`,
    url: `http://localhost:${PORT}${BASE}`,
    env: { DEMO_BASE: BASE },
    reuseExistingServer: !process.env.CI,
  },
});
