// Counts each person's YouTube searches per day (ADR-0012). YouTube allows the whole app 100 searches a day, so one
// person can't use them all up. One small item per person per UTC day; DynamoDB deletes it two days later (TTL).

import { YOUTUBE_SEARCHES_PER_PERSON_PER_DAY } from '@dropabop/shared';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { DataContext } from './context';
import { isConditionalCheckFailed } from './errors';
import { keys } from './keys';

/**
 * Uses one of today's searches. Returns false (and uses nothing) if the person already used all of them. The check
 * and the count happen in one conditional update, so two quick requests can't both slip past the limit.
 */
export async function useYouTubeSearch(ctx: DataContext, userId: string, now: Date): Promise<boolean> {
  const day = now.toISOString().slice(0, 10);
  const expiresAt = Math.floor(now.getTime() / 1000) + 2 * 24 * 60 * 60;
  try {
    await ctx.db.send(
      new UpdateCommand({
        TableName: ctx.tableName,
        Key: keys.youtubeSearches(userId, day),
        UpdateExpression: 'ADD searches :one SET entity = :entity, expiresAt = :expiresAt',
        ConditionExpression: 'attribute_not_exists(searches) OR searches < :limit',
        ExpressionAttributeValues: {
          ':one': 1,
          ':limit': YOUTUBE_SEARCHES_PER_PERSON_PER_DAY,
          ':entity': 'YouTubeSearches',
          ':expiresAt': expiresAt,
        },
      }),
    );
    return true;
  } catch (error) {
    if (isConditionalCheckFailed(error)) return false;
    throw error;
  }
}
