// Vitest global setup for integration tests: (re)creates the test table in DynamoDB Local.
// Runs once before all integration test files.

import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  ListTablesCommand,
} from '@aws-sdk/client-dynamodb';
import { assertLocalEndpoint } from '../src/data/client';
import { createTableInput } from '../src/data/table-definition';

export async function setup(): Promise<void> {
  const endpoint = process.env.DYNAMODB_ENDPOINT ?? '';
  const tableName = process.env.TABLE_NAME ?? '';

  // This deletes and recreates a table. Refuse to do that anywhere except DynamoDB Local.
  assertLocalEndpoint(endpoint);

  const client = new DynamoDBClient({
    endpoint,
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
  });

  try {
    const { TableNames = [] } = await client.send(new ListTablesCommand({}));
    if (TableNames.includes(tableName)) {
      await client.send(new DeleteTableCommand({ TableName: tableName }));
    }
    await client.send(new CreateTableCommand(createTableInput(tableName)));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not reach DynamoDB Local at ${endpoint} (${reason}). Start it with: npm run db:up`,
      {
        cause: error,
      },
    );
  } finally {
    client.destroy();
  }
}
