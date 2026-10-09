// When you last looked at your achievements (P13.9) and your notifications (P13.10) in a party. Kept on your own
// "my party" link item (USER#<you> / PARTY#<party>): per party, and other members never see it.

import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DataContext } from './context';
import { isConditionalCheckFailed } from './errors';
import { keys } from './keys';

export type SeenField = 'achievementsSeenAt' | 'notificationsSeenAt';

export async function getSeenAt(
  ctx: DataContext,
  userId: string,
  partyId: string,
  field: SeenField,
): Promise<string | null> {
  const { Item } = await ctx.db.send(
    new GetCommand({ TableName: ctx.tableName, Key: keys.userParty(userId, partyId) }),
  );
  const value: unknown = Item?.[field];
  return typeof value === 'string' ? value : null;
}

/** Records "seen now" (server time). Does nothing if the link is gone (you left the party meanwhile). */
export async function markSeen(
  ctx: DataContext,
  userId: string,
  partyId: string,
  field: SeenField,
  now: Date,
): Promise<void> {
  try {
    await ctx.db.send(
      new UpdateCommand({
        TableName: ctx.tableName,
        Key: keys.userParty(userId, partyId),
        UpdateExpression: 'SET #field = :now',
        ExpressionAttributeNames: { '#field': field },
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: { ':now': now.toISOString() },
      }),
    );
  } catch (error) {
    if (!isConditionalCheckFailed(error)) throw error;
  }
}

export const getAchievementsSeenAt = (ctx: DataContext, userId: string, partyId: string) =>
  getSeenAt(ctx, userId, partyId, 'achievementsSeenAt');
export const markAchievementsSeen = (ctx: DataContext, userId: string, partyId: string, now: Date) =>
  markSeen(ctx, userId, partyId, 'achievementsSeenAt', now);
