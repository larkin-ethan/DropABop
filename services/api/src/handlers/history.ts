// GET /parties/{partyId}/history?month=YYYY-MM (docs/API.md → History; P13.8, D31).
// Members only. Uses the same data as stats (ADR-0006): every week, song and rating of the party, computed on request.

import type { HistoryResponse } from '@dropabop/shared';
import { historyQuerySchema } from '@dropabop/shared';
import { listMembers } from '../data/parties';
import { listPartyRecommendations } from '../data/recommendations';
import { listAllRounds } from '../data/rounds';
import { listPartyVotes } from '../data/votes';
import { buildHistoryMonth } from '../domain/history';
import { getEffectiveWeekStatus } from '../domain/week';
import { createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseQuery, pathId } from '../http/request';
import { loadPartyForMember } from './parties';
import { resolveCurrentWeek } from './weeks';

export const getHistoryFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  const { month } = parseQuery(event, historyQuerySchema);
  const { party } = await loadPartyForMember(data, partyId, userId);
  const current = now();
  await resolveCurrentWeek(data, party, current); // records any week that has just closed (ADR-0003)

  const [rounds, recommendations, votes, members] = await Promise.all([
    listAllRounds(data, partyId),
    listPartyRecommendations(data, partyId),
    listPartyVotes(data, partyId),
    listMembers(data, partyId),
  ]);
  // Which weeks are over is decided by the server clock and song count, never the client (ADR-0003).
  const songsPerRound = new Map<string, number>();
  for (const rec of recommendations) {
    songsPerRound.set(rec.roundId, (songsPerRound.get(rec.roundId) ?? 0) + 1);
  }
  const weeks = buildHistoryMonth({
    month,
    viewerId: userId,
    rounds: rounds.map((round) => ({
      round,
      status: getEffectiveWeekStatus(round, current, songsPerRound.get(round.roundId) ?? 0),
    })),
    recommendations,
    votes,
  });

  return ok({
    month,
    weeks,
    members: members.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      avatarColor: m.avatarColor,
      avatarImage: m.avatarImage ?? null,
    })),
  } satisfies HistoryResponse);
};

export const getHistoryHandler = createHandler(getHistoryFn);
