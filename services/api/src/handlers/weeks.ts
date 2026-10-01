// GET /parties/{partyId}/rounds/current and GET /parties/{partyId}/rounds (docs/API.md → Weeks).

import type { Party, Round } from '@sotd/shared';
import { roundHistoryQuerySchema } from '@sotd/shared';
import type { DataContext } from '../data/context';
import { listMySubmissionDates, listWeekRecommendations, listWeekSubmissions } from '../data/recommendations';
import { createRoundIfMissing, getLatestRound, listRounds, recordRoundStatus } from '../data/rounds';
import { listMyWeekVotes } from '../data/votes';
import {
  getEffectiveWeekStatus,
  getPendingStatusChange,
  getSubmissionDay,
  getWeekWindow,
  planCurrentWeek,
} from '../domain/week';
import { createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseQuery, pathId } from '../http/request';
import { loadPartyForMember } from './parties';

export type CurrentWeek =
  | { round: Round; reason: null }
  | { round: null; reason: 'paused' | 'between-weeks'; lastRound: Round | null };

/**
 * The party's current week, doing the lazy work from ADR-0003: records the previous week's close if nobody has yet,
 * and creates this week's round on the first request of the week. Every handler that needs "this week" uses this.
 */
export async function resolveCurrentWeek(data: DataContext, party: Party, now: Date): Promise<CurrentWeek> {
  const latest = await getLatestRound(data, party.partyId);

  if (latest !== null && latest.status === 'OPEN') {
    const songCount = (await listWeekRecommendations(data, latest.roundId)).length;
    const change = getPendingStatusChange(latest, now, songCount);
    if (change !== null) {
      await recordRoundStatus(data, latest, change);
      latest.status = change;
    }
  }

  const plan = planCurrentWeek(party, latest, now);
  if (plan.action === 'use') {
    return { round: plan.round, reason: null };
  }
  if (plan.action === 'create') {
    return { round: await createRoundIfMissing(data, plan.round), reason: null };
  }
  return { round: null, reason: plan.reason, lastRound: plan.lastRound };
}

/** Everything the home screen needs about this week, for the person asking. */
export const getCurrentWeekFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  const { party } = await loadPartyForMember(data, partyId, userId);
  const current = now();
  const week = await resolveCurrentWeek(data, party, current);

  if (week.round === null) {
    const nextWeekStartsAt =
      week.reason === 'between-weeks' ? getWeekWindow(party.settings.timezone, current).endsAt : null;
    return ok({
      round: null,
      reason: week.reason,
      nextWeekStartsAt,
      lastRoundId: week.lastRound?.roundId ?? null,
    });
  }

  const round = week.round;
  const [songs, submissions, myDates, myVotes] = await Promise.all([
    listWeekRecommendations(data, round.roundId),
    listWeekSubmissions(data, round.roundId),
    listMySubmissionDates(data, round.roundId, userId),
    listMyWeekVotes(data, round.roundId, userId),
  ]);
  const today = getSubmissionDay(round.timezone, current);
  const ratableSongIds = new Set(songs.filter((s) => s.userId !== userId).map((s) => s.recommendationId));

  return ok({
    round,
    status: getEffectiveWeekStatus(round, current, songs.length),
    reason: null,
    /** null on Saturday and Sunday. */
    today,
    sharedToday: today !== null && myDates.includes(today.date),
    mySubmissionDates: myDates,
    /** Who has shared a song today (not which song; D10). */
    sharedTodayUserIds:
      today === null ? [] : submissions.filter((s) => s.date === today.date).map((s) => s.userId),
    progress: {
      songCount: songs.length,
      ratableCount: ratableSongIds.size,
      ratedCount: myVotes.filter((v) => ratableSongIds.has(v.recommendationId)).length,
    },
  });
};

/** Past and current weeks, newest first, paged. */
export const listWeeksFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  const query = parseQuery(event, roundHistoryQuerySchema);
  const { party } = await loadPartyForMember(data, partyId, userId);

  await resolveCurrentWeek(data, party, now()); // makes sure stored statuses are up to date
  const page = await listRounds(data, partyId, { limit: query.limit ?? 20, cursor: query.cursor ?? null });
  return ok(page);
};

export const getCurrentWeekHandler = createHandler(getCurrentWeekFn);
export const listWeeksHandler = createHandler(listWeeksFn);
