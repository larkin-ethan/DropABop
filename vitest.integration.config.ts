// Integration tests: talk to DynamoDB Local (docker-compose.yml). Run with `npm run test:integration`
// after `npm run db:up`. Files are named *.integration.test.ts.
import { defineConfig } from 'vitest/config';

// Local-only settings. Set here (not in a .env file) so they're visible and can't point anywhere real:
// the client and the setup both refuse any endpoint that isn't localhost.
process.env.DYNAMODB_ENDPOINT ??= 'http://localhost:8000';
process.env.TABLE_NAME ??= 'dropabop-integration-test';
process.env.AWS_REGION ??= 'us-east-1';

export default defineConfig({
  test: {
    include: ['{packages,services,apps}/*/src/**/*.integration.test.{ts,tsx}'],
    globalSetup: ['services/api/test/integration-setup.ts'],
    // Tests share one local table, so run files one at a time to keep them independent.
    fileParallelism: false,
    passWithNoTests: true,
  },
});
