// Unit tests: fast, no network, no database. Run with `npm test`.
// Two projects: shared code and the API run in Node; frontend components run in a simulated browser (jsdom).
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['{packages,services}/*/src/**/*.test.ts'],
          exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/src/**/*.test.{ts,tsx}'],
          setupFiles: ['apps/web/src/test/setup.ts'],
          // Screen tests type and click through whole flows in a simulated browser. When the machine is busy (the
          // full suite runs everything in parallel) a long one can pass 5 s, the default, without anything being
          // wrong; 15 s still catches a test that really hangs.
          testTimeout: 15_000,
        },
      },
    ],
  },
});
