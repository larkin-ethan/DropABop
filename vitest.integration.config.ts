// Integration tests: talk to DynamoDB Local (see docker-compose.yml, added in P3.2).
// Run with `npm run test:integration`. Files are named *.integration.test.ts.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{packages,services,apps}/*/src/**/*.integration.test.{ts,tsx}'],
    // Tests share one local table, so run files one at a time to keep them independent.
    fileParallelism: false,
    passWithNoTests: true,
  },
});
