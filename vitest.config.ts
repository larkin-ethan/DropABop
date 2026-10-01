// Unit tests: fast, no network, no database. Run with `npm test`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{packages,services,apps}/*/src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/*.integration.test.{ts,tsx}'],
  },
});
