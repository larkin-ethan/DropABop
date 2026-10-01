// The table's key schema, defined once (docs/DATABASE.md). Used to create the DynamoDB Local table for
// integration tests, and checked against infra/template.yaml by a test (P4.2) so local and AWS can't drift.

import type { CreateTableCommandInput } from '@aws-sdk/client-dynamodb';

export const TABLE_KEY_SCHEMA = {
  AttributeDefinitions: [
    { AttributeName: 'PK', AttributeType: 'S' },
    { AttributeName: 'SK', AttributeType: 'S' },
  ],
  KeySchema: [
    { AttributeName: 'PK', KeyType: 'HASH' },
    { AttributeName: 'SK', KeyType: 'RANGE' },
  ],
} as const satisfies Pick<CreateTableCommandInput, 'AttributeDefinitions' | 'KeySchema'>;

export function createTableInput(tableName: string): CreateTableCommandInput {
  return {
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST', // ADR-0005
    AttributeDefinitions: [...TABLE_KEY_SCHEMA.AttributeDefinitions],
    KeySchema: [...TABLE_KEY_SCHEMA.KeySchema],
  };
}
