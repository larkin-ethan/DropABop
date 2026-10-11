// Shared songs (docs/DATABASE.md patterns 10–12, 15).
//
// Scoping: these functions trust the partition named by `roundId`. Handlers must first check that the user is a
// member of `parseRoundId(roundId).partyId`. Returned recommendations include `userId` (who shared it); handlers
// must pass them through toOpenWeekSongView / calculateWeekResults, which hide it when required (D10).

import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { Recommendation } from '@dropabop/shared';
import { MESSAGES } from '../domain/messages';
import type { DataContext } from './context';
import { queryByPrefix, transactWrite, withoutKeys } from './context';
import { DomainError, failedTransactionItems } from './errors';
import {
  listWeekYouTubeVideos,
  withYouTubeVideo,
  youtubeVideoItem,
  type YouTubeVideoSource,
} from './youtube-videos';
import { keys, parseRoundId, partitionKeys, prefixes } from './keys';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function weekOf(recommendation: Pick<Recommendation, 'roundId'>): { partyId: string; weekStart: string } {
  const parts = parseRoundId(recommendation.roundId);
  if (parts === null) {
    throw new Error('Invalid roundId');
  }
  return parts;
}

/**
 * Saves a shared song. One per member per day (D1) is guaranteed by a marker item that can only be created once
 * for that member + date, written in the same transaction as the song.
 */
export async function putRecommendation(
  ctx: DataContext,
  recommendation: Recommendation,
  /** The song's YouTube video, saved in its own item that expires (ADR-0012). */
  youtube?: { videoId: string; source: YouTubeVideoSource },
  now: Date = new Date(),
): Promise<void> {
  const { partyId, weekStart } = weekOf(recommendation);
  if (recommendation.partyId !== partyId) {
    throw new Error('Recommendation partyId does not match its roundId');
  }
  // Must be random (crypto.randomUUID()), never derived from the user: songs are anonymous while the week is open (D10).
  if (!UUID.test(recommendation.recommendationId)) {
    throw new Error('recommendationId must be a random UUID');
  }
  try {
    await transactWrite(ctx, {
      TransactItems: [
        {
          Put: {
            TableName: ctx.tableName,
            Item: {
              ...keys.submittedMarker(partyId, weekStart, recommendation.userId, recommendation.submittedOn),
              entity: 'SubmittedMarker',
              recommendationId: recommendation.recommendationId,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        {
          Put: {
            TableName: ctx.tableName,
            Item: {
              ...keys.recommendation(partyId, weekStart, recommendation.recommendationId),
              entity: 'Recommendation',
              ...recommendation,
            },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        ...(youtube === undefined
          ? []
          : [{ Put: youtubeVideoItem(ctx, recommendation, weekStart, youtube, now) }]),
      ],
    });
  } catch (error) {
    if (failedTransactionItems(error)?.includes(0)) {
      throw new DomainError('ALREADY_SUBMITTED_TODAY', MESSAGES.ALREADY_SUBMITTED_TODAY);
    }
    throw error;
  }
}

export async function getRecommendation(
  ctx: DataContext,
  roundId: string,
  recommendationId: string,
): Promise<Recommendation | null> {
  const parts = parseRoundId(roundId);
  if (parts === null) {
    return null;
  }
  const { Item } = await ctx.db.send(
    new GetCommand({
      TableName: ctx.tableName,
      Key: keys.recommendation(parts.partyId, parts.weekStart, recommendationId),
    }),
  );
  return Item === undefined ? null : withoutKeys<Recommendation>(Item);
}

/** All songs shared in a week, oldest first, each with its YouTube video if it hasn't expired (ADR-0012). */
export async function listWeekRecommendations(
  ctx: DataContext,
  roundId: string,
  now: Date,
): Promise<Recommendation[]> {
  const parts = parseRoundId(roundId);
  if (parts === null) {
    return [];
  }
  const [items, videos] = await Promise.all([
    queryByPrefix(ctx, partitionKeys.party(parts.partyId), prefixes.weekRecommendations(parts.weekStart)),
    listWeekYouTubeVideos(ctx, parts.partyId, parts.weekStart, now),
  ]);
  return items
    .map((item) => withoutKeys<Recommendation>(item))
    .map((recommendation) => withYouTubeVideo(recommendation, videos.get(recommendation.recommendationId)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Dates (YYYY-MM-DD) this member has already shared a song on in this week. */
export async function listMySubmissionDates(
  ctx: DataContext,
  roundId: string,
  userId: string,
): Promise<string[]> {
  const parts = parseRoundId(roundId);
  if (parts === null) {
    return [];
  }
  const prefix = prefixes.mySubmissions(parts.weekStart, userId);
  const items = await queryByPrefix(ctx, partitionKeys.party(parts.partyId), prefix);
  return items.map((item) => String(item.SK).slice(prefix.length));
}

/** Every song ever shared in the party (for stats; buildStatsData keeps only closed weeks). */
export async function listPartyRecommendations(ctx: DataContext, partyId: string): Promise<Recommendation[]> {
  const items = await queryByPrefix(ctx, partitionKeys.party(partyId), prefixes.allRecommendations());
  return items.map((item) => withoutKeys<Recommendation>(item));
}

/**
 * The party's songs for search (D33): one key query on `REC#`, newest weeks first (the sort key starts with the
 * week), following DynamoDB's pages until `max` songs. `truncated` says there were more.
 */
export async function listRecentPartyRecommendations(
  ctx: DataContext,
  partyId: string,
  max: number,
): Promise<{ recommendations: Recommendation[]; truncated: boolean }> {
  const items: Record<string, unknown>[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await ctx.db.send(
      new QueryCommand({
        TableName: ctx.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':pk': partitionKeys.party(partyId),
          ':prefix': prefixes.allRecommendations(),
        },
        ScanIndexForward: false,
        Limit: max - items.length,
        ExclusiveStartKey,
      }),
    );
    items.push(...(page.Items ?? []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey !== undefined && items.length < max);
  return {
    recommendations: items.map((item) => withoutKeys<Recommendation>(item)),
    // DynamoDB can return a LastEvaluatedKey even when nothing is left, so this may rarely say "more" wrongly;
    // that only shows a harmless "searched your latest songs" note.
    truncated: ExclusiveStartKey !== undefined,
  };
}

/**
 * Who has shared on which day this week (from the one-per-day markers). Used for "who's shared today" on the home
 * screen. It reveals *that* someone shared, never *which* song is theirs (D10).
 */
export async function listWeekSubmissions(
  ctx: DataContext,
  roundId: string,
): Promise<{ userId: string; date: string }[]> {
  const parts = parseRoundId(roundId);
  if (parts === null) {
    return [];
  }
  const prefix = prefixes.weekSubmissions(parts.weekStart);
  const items = await queryByPrefix(ctx, partitionKeys.party(parts.partyId), prefix);
  return items.flatMap((item) => {
    const [userId, day] = String(item.SK).slice(prefix.length).split('#');
    return userId !== undefined && day !== undefined ? [{ userId, date: day }] : [];
  });
}
