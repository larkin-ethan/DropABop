// The critical journey against the real dev stack (roadmap P10.3). Manual only: `npm run e2e:dev`.
// Runs the website locally in its normal mode (apps/web/.env.development.local → the dev stack), signs in through the
// real Cognito screens as the two throwaway test users (.test-users.json, git-ignored; created by
// `node scripts/smoke-dev.mjs` if missing), and talks to the real API.

import { defineConfig, devices } from '@playwright/test';

// The dev stack's API accepts browser calls only from http://localhost:5173 (CORS: DevOrigin), so use that port,
// reusing your own `npm run dev` if it's running.
const PORT = 5173;

export default defineConfig({
  testDir: '.',
  testMatch: 'dev-stack.spec.ts',
  workers: 1,
  reporter: 'list',
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'dev-stack', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: {
    command: `npm run dev -w @dropabop/web -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
