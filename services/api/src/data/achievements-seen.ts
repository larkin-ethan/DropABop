// When you last looked at your achievements in a party (P13.9), for the "Achievement unlocked" banner. Kept on your
// own "my party" link item (USER#<you> / PARTY#<party>), so other members never see it.

import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DataContext } from './context';
import { isConditionalCheckFailed } from './errors';
import { keys } from './keys';

export async function getAchievementsSeenAt(
  ctx: DataContext,
  userId: string,
  partyId: string,
): Promise<string | null> {
  const { Item } = await ctx.db.send(
    new GetCommand({ TableName: ctx.tableName, Key: keys.userParty(userId, partyId) }),
  );
  return typeof Item?.achievementsSeenAt === 'string' ? Item.achievementsSeenAt : null;
}

/** Records "seen now" (server time). Does nothing if the link is gone (you left the party meanwhile). */
export async function markAchievementsSeen(
  ctx: DataContext,
  userId: string,
  partyId: string,
  now: Date,
): Promise<void> {
  try {
    await ctx.db.send(
      new UpdateCommand({
        TableName: ctx.tableName,
        Key: keys.userParty(userId, partyId),
        UpdateExpression: 'SET achievementsSeenAt = :now',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeValues: { ':now': now.toISOString() },
      }),
    );
  } catch (error) {
    if (!isConditionalCheckFailed(error)) throw error;
  }
}
