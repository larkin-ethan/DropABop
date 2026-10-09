// GET /parties/{partyId}/search?q=&type=&cursor= (docs/API.md → Search; P13.12, D33).
// Members only. Reads the party's songs with one capped key query, plus its weeks and members (both small).
// Read-only: week status comes from the server clock (ADR-0003), so nothing is written.

import type { PartySearchResponse } from '@dropabop/shared';
import { partySearchQuerySchema } from '@dropabop/shared';
import { listMembers } from '../data/parties';
import { listRecentPartyRecommendations } from '../data/recommendations';
import { listAllRounds } from '../data/rounds';
import { SEARCH_MAX_SONGS, searchParty } from '../domain/search';
import { getEffectiveWeekStatus } from '../domain/week';
import { createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseQuery, pathId } from '../http/request';
import { loadPartyForMember } from './parties';

export const searchPartyFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  await loadPartyForMember(data, partyId, userId); // membership first: non-members learn nothing
  const { q, type, cursor } = parseQuery(event, partySearchQuerySchema);
  const current = now();

  const [{ recommendations, truncated }, rounds, members] = await Promise.all([
    listRecentPartyRecommendations(data, partyId, SEARCH_MAX_SONGS),
    listAllRounds(data, partyId),
    listMembers(data, partyId),
  ]);
  // Song counts per week decide "not enough songs" (ADR-0003). With a truncated read the oldest weeks may look
  // smaller, but those weeks are long over, so only the open/closed split matters and that's time-based.
  const songsPerRound = new Map<string, number>();
  for (const rec of recommendations) {
    songsPerRound.set(rec.roundId, (songsPerRound.get(rec.roundId) ?? 0) + 1);
  }

  return ok(
    searchParty({
      q,
      type,
      offset: cursor === undefined ? 0 : Number(cursor),
      viewerId: userId,
      recommendations,
      rounds: rounds.map((round) => ({
        round,
        status: getEffectiveWeekStatus(round, current, songsPerRound.get(round.roundId) ?? 0),
      })),
      members: members.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        avatarColor: m.avatarColor,
        avatarImage: m.avatarImage ?? null,
      })),
      truncated,
    }) satisfies PartySearchResponse,
  );
};

export const searchPartyHandler = createHandler(searchPartyFn);
