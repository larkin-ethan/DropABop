// Saved songs (D34): `USER#<userId> / SAVED#<trackId>` items plus a `SAVEDCOUNT` counter (docs/DATABASE.md).
// The song item and the counter change in one transaction, so a double tap can't save a song twice and two saves at
// the same moment can't pass the 500 limit.

import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SAVED_SONGS_LIMIT } from '@dropabop/shared';
import type { StoredSavedSong } from '../domain/saved';
import type { DataContext } from './context';
import { queryByPrefix, transactWrite, withoutKeys } from './context';
import { failedTransactionItems } from './errors';
import { keys, parseRoundId, partitionKeys, prefixes } from './keys';

export type SaveOutcome = 'saved' | 'alreadySaved' | 'limitReached';

export async function saveSong(
  ctx: DataContext,
  userId: string,
  song: StoredSavedSong,
): Promise<SaveOutcome> {
  try {
    await transactWrite(ctx, {
      TransactItems: [
        {
          Put: {
            TableName: ctx.tableName,
            Item: { ...keys.savedSong(userId, song.trackId), entity: 'SavedSong', ...song },
            ConditionExpression: 'attribute_not_exists(PK)', // one entry per song (D34)
          },
        },
        {
          Update: {
            TableName: ctx.tableName,
            Key: keys.savedCount(userId),
            UpdateExpression: 'SET entity = :entity ADD #count :one',
            ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
            ExpressionAttributeNames: { '#count': 'count' },
            ExpressionAttributeValues: { ':entity': 'SavedCount', ':one': 1, ':limit': SAVED_SONGS_LIMIT },
          },
        },
      ],
    });
    return 'saved';
  } catch (error) {
    const failed = failedTransactionItems(error);
    if (failed?.includes(0)) return 'alreadySaved'; // checked first: saving it again isn't "full"
    if (failed?.includes(1)) return 'limitReached';
    throw error;
  }
}

/** Removes a saved song. Removing one that isn't saved does nothing (so a double tap is harmless). */
export async function unsaveSong(ctx: DataContext, userId: string, trackId: string): Promise<void> {
  try {
    await transactWrite(ctx, {
      TransactItems: [
        {
          Delete: {
            TableName: ctx.tableName,
            Key: keys.savedSong(userId, trackId),
            ConditionExpression: 'attribute_exists(PK)',
          },
        },
        {
          Update: {
            TableName: ctx.tableName,
            Key: keys.savedCount(userId),
            UpdateExpression: 'ADD #count :minusOne',
            ConditionExpression: '#count > :zero',
            ExpressionAttributeNames: { '#count': 'count' },
            ExpressionAttributeValues: { ':minusOne': -1, ':zero': 0 },
          },
        },
      ],
    });
  } catch (error) {
    const failed = failedTransactionItems(error);
    if (failed?.includes(0)) return; // wasn't saved
    if (failed?.includes(1)) {
      // The counter is already 0 or missing (only if data were edited by hand). Never let that stop a removal.
      await ctx.db.send(
        new DeleteCommand({ TableName: ctx.tableName, Key: keys.savedSong(userId, trackId) }),
      );
      return;
    }
    throw error;
  }
}

/**
 * Every saved song of one person. At most 500 small items (D34), read with one key query; sorting by save time
 * happens in code because the sort key is the track id (so a song can only be saved once).
 */
export async function listSavedSongs(ctx: DataContext, userId: string): Promise<StoredSavedSong[]> {
  const items = await queryByPrefix(ctx, partitionKeys.user(userId), prefixes.savedSongs());
  return items.map((item) => withoutKeys<StoredSavedSong>(item));
}

/**
 * recommendationId → live YouTube video id, read from the parties' own expiring `YTVIDEO#` items (ADR-0012). The
 * saved copy never holds a video id; callers pass only recent songs from parties the viewer is in, so this is a
 * handful of single-item reads.
 */
export async function getLiveVideos(
  ctx: DataContext,
  songs: Pick<StoredSavedSong, 'roundId' | 'recommendationId'>[],
  now: Date,
): Promise<Map<string, string>> {
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const items = await Promise.all(
    songs.map(async (s) => {
      const week = parseRoundId(s.roundId);
      if (week === null) return undefined;
      const { Item } = await ctx.db.send(
        new GetCommand({
          TableName: ctx.tableName,
          Key: keys.youtubeVideo(week.partyId, week.weekStart, s.recommendationId),
        }),
      );
      return Item;
    }),
  );
  const videos = new Map<string, string>();
  for (const item of items) {
    if (item !== undefined && typeof item.expiresAt === 'number' && item.expiresAt > nowSeconds) {
      videos.set(String(item.recommendationId), String(item.videoId));
    }
  }
  return videos;
}
