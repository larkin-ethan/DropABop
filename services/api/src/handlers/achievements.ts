// GET /parties/{partyId}/achievements?memberId= and POST /parties/{partyId}/achievements/seen (docs/API.md →
// Achievements; P13.9, D28). Worked out on request from closed weeks (ADR-0006), like stats.

import type { AchievementsResponse } from '@dropabop/shared';
import { achievementsQuerySchema } from '@dropabop/shared';
import { getAchievementsSeenAt, markAchievementsSeen } from '../data/achievements-seen';
import { getMembership } from '../data/parties';
import { listPartyRecommendations } from '../data/recommendations';
import { listAllRounds } from '../data/rounds';
import { listPartyVotes } from '../data/votes';
import { computeAchievements, forOtherMember, newlyUnlocked } from '../domain/achievements';
import { getEffectiveWeekStatus } from '../domain/week';
import { fail } from '../http/errors';
import { createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseQuery, pathId } from '../http/request';
import { loadPartyForMember } from './parties';
import { resolveCurrentWeek } from './weeks';

/** Yours, or another member's (members can see each other's achievements, D28). */
export const getAchievementsFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  const { memberId } = parseQuery(event, achievementsQuerySchema);
  const { party } = await loadPartyForMember(data, partyId, userId);
  const whose = memberId ?? userId; // which member to show; who's asking always comes from the token
  if (whose !== userId && (await getMembership(data, partyId, whose)) === null) {
    fail('NOT_FOUND', 'That person isn’t in this party.');
  }

  const current = now();
  await resolveCurrentWeek(data, party, current); // records any week that has just closed (ADR-0003)
  const [rounds, recommendations, votes] = await Promise.all([
    listAllRounds(data, partyId),
    listPartyRecommendations(data, partyId),
    listPartyVotes(data, partyId),
  ]);
  const songsPerRound = new Map<string, number>();
  for (const rec of recommendations) {
    songsPerRound.set(rec.roundId, (songsPerRound.get(rec.roundId) ?? 0) + 1);
  }
  const achievements = computeAchievements({
    memberId: whose,
    rounds: rounds.map((round) => ({
      round,
      status: getEffectiveWeekStatus(round, current, songsPerRound.get(round.roundId) ?? 0),
    })),
    recommendations,
    votes,
  });

  const mine = whose === userId;
  const shown = mine ? achievements : forOtherMember(achievements);
  const seenAt = mine ? await getAchievementsSeenAt(data, userId, partyId) : null;
  return ok({
    memberId: whose,
    achievements: shown,
    unlockedCount: achievements.filter((a) => a.unlocked).length,
    newlyUnlocked: mine ? newlyUnlocked(achievements, seenAt) : [],
    seenAt,
  } satisfies AchievementsResponse);
};

/** "I've seen my achievements" (closes the banner). The time comes from the server clock. */
export const markAchievementsSeenFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  await loadPartyForMember(data, partyId, userId);
  const seenAt = now().toISOString();
  await markAchievementsSeen(data, userId, partyId, new Date(seenAt));
  return ok({ seenAt });
};

export const getAchievementsHandler = createHandler(getAchievementsFn);
export const markAchievementsSeenHandler = createHandler(markAchievementsSeenFn);
