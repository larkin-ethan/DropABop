// One DynamoDB client per Lambda container, configured from environment variables (spec §37: no hard-coded
// table names or regions).
//
// - TABLE_NAME:        set by the SAM template per stage (sotd-dev / sotd-prod).
// - AWS_REGION:        set automatically by Lambda.
// - DYNAMODB_ENDPOINT: ONLY for local development/tests (DynamoDB Local). Must point at localhost.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Throws unless `endpoint` is a localhost URL. A custom endpoint exists only to reach DynamoDB Local, so anything
 * else is a misconfiguration and we stop rather than risk talking to an unexpected database (spec §36).
 */
export function assertLocalEndpoint(endpoint: string): void {
  let host: string;
  try {
    host = new URL(endpoint).hostname;
  } catch {
    throw new Error(`DYNAMODB_ENDPOINT is not a valid URL: ${endpoint}`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`DYNAMODB_ENDPOINT must be localhost (DynamoDB Local only), got: ${host}`);
  }
}

export function createDocumentClient(env: NodeJS.ProcessEnv = process.env): DynamoDBDocumentClient {
  const endpoint = env.DYNAMODB_ENDPOINT;
  let client: DynamoDBClient;
  if (endpoint !== undefined && endpoint !== '') {
    assertLocalEndpoint(endpoint);
    // DynamoDB Local accepts any credentials; these placeholders are not secrets.
    client = new DynamoDBClient({
      endpoint,
      region: env.AWS_REGION ?? 'us-east-1',
      credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    });
  } else {
    // In Lambda: region and credentials come from the execution environment and its IAM role.
    client = new DynamoDBClient({});
  }
  return DynamoDBDocumentClient.from(client, {
    // Drop undefined fields instead of failing; we never rely on storing undefined.
    marshallOptions: { removeUndefinedValues: true },
  });
}

export function getTableName(env: NodeJS.ProcessEnv = process.env): string {
  const name = env.TABLE_NAME;
  if (name === undefined || name === '') {
    throw new Error('TABLE_NAME is not set');
  }
  return name;
}
