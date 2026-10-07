// PUT /rounds/{roundId}/votes/{recommendationId} and GET /rounds/{roundId}/votes/me (docs/API.md → Ratings).

import type { MyVotesResponse, VoteResponse } from '@dropabop/shared';
import type { Vote } from '@dropabop/shared';
import { castVoteRequestSchema } from '@dropabop/shared';
import { getRecommendation } from '../data/recommendations';
import { listMyWeekVotes, putVote } from '../data/votes';
import { MESSAGES } from '../domain/messages';
import { canCastVote } from '../domain/rules';
import { isWeekOpen } from '../domain/week';
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

  // A fresh clock read at write time (not the one used for the check above). If the lock passed in between, refuse
  // instead of writing: a late write would replace the person's earlier on-time rating with one that results then
  // ignore, leaving them with no rating at all (pre-launch review, 2026-10-04).
  const writeTime = now();
  if (!isWeekOpen(round, writeTime)) {
    fail('WEEK_CLOSED', MESSAGES.WEEK_CLOSED_RATE);
  }
  const vote: Vote = {
    roundId: round.roundId,
    recommendationId,
    userId,
    rating,
    updatedAt: writeTime.toISOString(), // before the lock; countableVotes still guards results (DATABASE.md)
  };
  await putVote(data, vote);
  return ok({ vote: { recommendationId, rating, updatedAt: vote.updatedAt } } satisfies VoteResponse);
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
  } satisfies MyVotesResponse);
};

export const castVoteHandler = createHandler(castVoteFn);
export const listMyVotesHandler = createHandler(listMyVotesFn);
