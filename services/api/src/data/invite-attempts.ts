// Counts wrong invite codes per person per hour, so nobody can guess their way into a private party
// (P9.3 security review: 4-character codes, ~920,000 possibilities). docs/DATABASE.md → "Invite failures".
// The count lives in one small item per person per hour; DynamoDB deletes it automatically a few hours later (TTL).

import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DataContext } from './context';
import { keys } from './keys';

/** More wrong codes than this in one hour, and invite lookups and joins pause until the next hour. */
export const MAX_INVITE_FAILURES_PER_HOUR = 10;

/** "2026-10-04T15": the current hour on the server clock (UTC). */
export function hourBucket(now: Date): string {
  return now.toISOString().slice(0, 13);
}

export async function countInviteFailures(ctx: DataContext, userId: string, now: Date): Promise<number> {
  const { Item } = await ctx.db.send(
    new GetCommand({ TableName: ctx.tableName, Key: keys.inviteFailures(userId, hourBucket(now)) }),
  );
  return typeof Item?.failures === 'number' ? Item.failures : 0;
}

export async function recordInviteFailure(ctx: DataContext, userId: string, now: Date): Promise<void> {
  // Kept for 2 hours after the hour starts; `expiresAt` (seconds) is the table's TTL attribute.
  const expiresAt = Math.floor(now.getTime() / 1000) + 2 * 60 * 60;
  await ctx.db.send(
    new UpdateCommand({
      TableName: ctx.tableName,
      Key: keys.inviteFailures(userId, hourBucket(now)),
      UpdateExpression: 'ADD failures :one SET entity = :entity, expiresAt = :expiresAt',
      ExpressionAttributeValues: { ':one': 1, ':entity': 'InviteFailures', ':expiresAt': expiresAt },
    }),
  );
}
