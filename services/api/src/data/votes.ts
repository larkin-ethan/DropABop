// Ratings (docs/DATABASE.md patterns 13–15).
//
// Scoping: handlers must check membership of `parseRoundId(roundId).partyId`, load the song with
// getRecommendation(roundId, …) and run canCastVote before putVote. `updatedAt` must come from a fresh server
// clock read at write time (not the `now` used for the check), so late writes are caught by countableVotes. The rating lock is enforced by canCastVote before writing and by
// countableVotes / buildStatsData when counting (docs/DATABASE.md → "The rating lock").

import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Vote } from '@sotd/shared';
import type { DataContext } from './context';
import { queryByPrefix, withoutKeys } from './context';
import { keys, parseRoundId, partitionKeys, prefixes } from './keys';

/** Creates or replaces this member's rating for this song (one per member per song). */
export async function putVote(ctx: DataContext, vote: Vote): Promise<void> {
  const parts = parseRoundId(vote.roundId);
  if (parts === null) {
    throw new Error('Invalid roundId');
  }
  await ctx.db.send(
    new PutCommand({
      TableName: ctx.tableName,
      Item: {
        ...keys.vote(parts.partyId, parts.weekStart, vote.userId, vote.recommendationId),
        entity: 'Vote',
        ...vote,
      },
    }),
  );
}

/** Every rating in a week (results). */
export async function listWeekVotes(ctx: DataContext, roundId: string): Promise<Vote[]> {
  const parts = parseRoundId(roundId);
  if (parts === null) {
    return [];
  }
  const items = await queryByPrefix(
    ctx,
    partitionKeys.party(parts.partyId),
    prefixes.weekVotes(parts.weekStart),
  );
  return items.map((item) => withoutKeys<Vote>(item));
}

/** This member's own ratings in a week. */
export async function listMyWeekVotes(ctx: DataContext, roundId: string, userId: string): Promise<Vote[]> {
  const parts = parseRoundId(roundId);
  if (parts === null) {
    return [];
  }
  const items = await queryByPrefix(
    ctx,
    partitionKeys.party(parts.partyId),
    prefixes.myWeekVotes(parts.weekStart, userId),
  );
  return items.map((item) => withoutKeys<Vote>(item));
}

/** Every rating ever given in the party (for stats; buildStatsData keeps only closed weeks and on-time votes). */
export async function listPartyVotes(ctx: DataContext, partyId: string): Promise<Vote[]> {
  const items = await queryByPrefix(ctx, partitionKeys.party(partyId), prefixes.allVotes());
  return items.map((item) => withoutKeys<Vote>(item));
}
