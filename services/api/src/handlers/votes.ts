// PUT /rounds/{roundId}/votes/{recommendationId} and GET /rounds/{roundId}/votes/me (docs/API.md → Ratings).

import type { Vote } from '@dropabop/shared';
import { castVoteRequestSchema } from '@dropabop/shared';
import { getRecommendation } from '../data/recommendations';
import { listMyWeekVotes, putVote } from '../data/votes';
import { canCastVote } from '../domain/rules';
import { assertAllowed, fail } from '../http/errors';
import { createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseBody, pathId } from '../http/request';
import { loadRoundForMember } from './weeks';

/** Rate a song 1–10, or change your rating, any time until the week ends (spec §15, D6–D8). */
export const castVoteFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const { round, membership } = await loadRoundForMember(event, data, userId);
  const recommendationId = pathId(event, 'recommendationId');
  const { rating } = parseBody(event, castVoteRequestSchema);

  const recommendation = await getRecommendation(data, round.roundId, recommendationId);
  if (recommendation === null) {
    fail('NOT_FOUND', 'We couldn’t find that song in this week.');
  }
  assertAllowed(canCastVote({ membership, round, recommendation, voterId: userId, rating, now: now() }));

  const vote: Vote = {
    roundId: round.roundId,
    recommendationId,
    userId,
    rating,
    // A fresh clock read at write time (not the one used for the check above), so a request that straddles the
    // end of the week is caught by countableVotes (docs/DATABASE.md → The rating lock).
    updatedAt: now().toISOString(),
  };
  await putVote(data, vote);
  return ok({ vote: { recommendationId, rating, updatedAt: vote.updatedAt } });
};

/** Your own ratings for this week. Never anyone else's (D9). */
export const listMyVotesFn: HandlerFn = async (event, { data }) => {
  const { userId } = getAuthenticatedUser(event);
  const { round } = await loadRoundForMember(event, data, userId);
  const votes = await listMyWeekVotes(data, round.roundId, userId);
  return ok({
    votes: votes.map((v) => ({
      recommendationId: v.recommendationId,
      rating: v.rating,
      updatedAt: v.updatedAt,
    })),
  });
};

export const castVoteHandler = createHandler(castVoteFn);
export const listMyVotesHandler = createHandler(listMyVotesFn);
