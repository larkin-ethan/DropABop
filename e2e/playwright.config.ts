// End-to-end tests (roadmap Phase 10): a real browser drives the website.
// - `npm run e2e` (from the repo root): the critical journey against the website in sample mode (in-memory API, no AWS), at phone and
//   desktop widths. Locally it uses your installed Google Chrome; CI installs Playwright's Chromium.
// The sample world stands in for the API here (the roadmap suggested MSW; the existing preview API does the same job
// without another dependency). The real API is exercised by `node scripts/smoke-dev.mjs` (P10.3).

import { defineConfig, devices } from '@playwright/test';

const PORT = 5175;

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Your own Chrome locally (no download needed); Playwright's Chromium on CI.
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone-375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
    { name: 'desktop-1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npm run dev -w @dropabop/web -- --mode sample --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
