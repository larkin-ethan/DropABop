// Smoke test: proves integration tests can reach DynamoDB Local and the table exists with the right keys.
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { afterAll, describe, expect, it } from 'vitest';
import { createDocumentClient, getTableName } from './client';

const db = createDocumentClient();
const TableName = getTableName();

afterAll(() => db.destroy());

describe('DynamoDB Local', () => {
  it('writes and reads an item by PK/SK', async () => {
    await db.send(new PutCommand({ TableName, Item: { PK: 'SMOKE#1', SK: 'TEST', hello: 'world' } }));
    const { Item } = await db.send(new GetCommand({ TableName, Key: { PK: 'SMOKE#1', SK: 'TEST' } }));
    expect(Item).toEqual({ PK: 'SMOKE#1', SK: 'TEST', hello: 'world' });
  });
});
