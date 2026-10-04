// GET /rounds/{roundId}/results (docs/API.md → Results).

import type { ResultsResponse } from '@dropabop/shared';
import { weekPrivacyOf } from '@dropabop/shared';
import { listMembers } from '../data/parties';
import { listWeekRecommendations } from '../data/recommendations';
import { recordRoundStatus } from '../data/rounds';
import { listWeekVotes } from '../data/votes';
import { calculateWeekResults, canViewResults } from '../domain/results';
import { getPendingStatusChange } from '../domain/week';
import { assertAllowed } from '../http/errors';
import { createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser } from '../http/request';
import { loadRoundForMember } from './weeks';

/**
 * The week's results, once the week has ended (spec §16, D9–D12): every song ranked, each day's Bop of the Day,
 * rating distributions, and your own ratings. Who-rated-what only if the party allows it (D11).
 */
export const getResultsFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const { round, party } = await loadRoundForMember(event, data, userId);
  const current = now();

  const songs = await listWeekRecommendations(data, round.roundId);
  assertAllowed(canViewResults(round, current, songs.length));

  const change = getPendingStatusChange(round, current, songs.length);
  if (change !== null) {
    await recordRoundStatus(data, round, change); // lazy close (ADR-0003)
    round.status = change;
  }

  const [votes, members] = await Promise.all([
    listWeekVotes(data, round.roundId),
    listMembers(data, party.partyId),
  ]);
  const results = calculateWeekResults({
    round,
    recommendations: songs,
    votes, // late ratings are dropped inside (countableVotes)
    viewerId: userId,
    settings: weekPrivacyOf(round), // the week's own switch, never the party's current one (D11)
  });

  return ok({
    round,
    results,
    /** Names for current members. Anyone in the results who isn't listed has left the party. */
    members: members.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      avatarColor: m.avatarColor,
      avatarImage: m.avatarImage ?? null,
    })),
  } satisfies ResultsResponse);
};

export const getResultsHandler = createHandler(getResultsFn);
