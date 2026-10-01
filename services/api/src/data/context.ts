// What every data function needs: a DynamoDB client and the table name. Created once per Lambda container.

import type {
  DynamoDBDocumentClient,
  QueryCommandInput,
  TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { createDocumentClient, getTableName } from './client';
import { isTransactionConflictOnly } from './errors';

export interface DataContext {
  db: DynamoDBDocumentClient;
  tableName: string;
}

export function createDataContext(env: NodeJS.ProcessEnv = process.env): DataContext {
  return { db: createDocumentClient(env), tableName: getTableName(env) };
}

/**
 * Sends a transaction, retrying (briefly, up to 3 attempts) only when DynamoDB cancels it because another
 * transaction was touching the same item at that instant ("TransactionConflict"). Retrying lets the request be
 * judged on its actual condition, so the user sees "This party is full" instead of a generic error.
 * Condition failures are never retried.
 */
export async function transactWrite(
  ctx: DataContext,
  input: TransactWriteCommandInput,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<void> {
  const maxAttempts = 3;
  for (let attempt = 1; ; attempt++) {
    try {
      await ctx.db.send(new TransactWriteCommand(input));
      return;
    } catch (error) {
      if (attempt >= maxAttempts || !isTransactionConflictOnly(error)) {
        throw error;
      }
      await sleep(20 * attempt + Math.floor(Math.random() * 30)); // small, jittered back-off
    }
  }
}

/** Item attributes that are storage details, not part of the domain objects. */
export function withoutKeys<T>(item: Record<string, unknown>): T {
  const { PK: _pk, SK: _sk, entity: _entity, ...rest } = item;
  return rest as T;
}

/** Runs a Query to the end, following pagination. For lists we know are small (one party's data). */
export async function queryAll(
  ctx: DataContext,
  input: Omit<QueryCommandInput, 'TableName'>,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await ctx.db.send(
      new QueryCommand({ ...input, TableName: ctx.tableName, ExclusiveStartKey }),
    );
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey !== undefined);
  return items;
}

/** All items in a partition whose sort key starts with `prefix`. */
export function queryByPrefix(
  ctx: DataContext,
  pk: string,
  prefix: string,
): Promise<Record<string, unknown>[]> {
  return queryAll(ctx, {
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: { ':pk': pk, ':prefix': prefix },
  });
}
