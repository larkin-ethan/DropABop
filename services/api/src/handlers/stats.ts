// GET /users/me/stats, GET /parties/{partyId}/stats, GET /parties/{partyId}/leaderboard (docs/API.md → Stats).
// Computed on request from closed weeks only (ADR-0006, docs/STATISTICS.md).

import type { GroupStatsResponse, LeaderboardResponse, PersonalStatsResponse } from '@dropabop/shared';
import type { LeaderboardPeriod, Party, Recommendation, Round } from '@dropabop/shared';
import { leaderboardQuerySchema, personalStatsQuerySchema } from '@dropabop/shared';
import type { DataContext } from '../data/context';
import { listMembers } from '../data/parties';
import { listPartyRecommendations } from '../data/recommendations';
import { listAllRounds } from '../data/rounds';
import { listPartyVotes } from '../data/votes';
import * as stats from '../domain/stats';
import type { Stat, Superlative } from '../domain/stats';
import { getEffectiveWeekStatus } from '../domain/week';
import { createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseQuery, pathId } from '../http/request';
import { loadPartyForMember } from './parties';
import { resolveCurrentWeek } from './weeks';

interface LoadedStats {
  data: stats.StatsData;
  /** Summaries of every song in the closed weeks, so the app can show titles and artwork next to a stat. */
  songIndex: Map<string, Recommendation>;
  weeksPlayed: number;
  /** The closed weeks used (after the period filter). */
  closedRounds: Round[];
}

async function loadStats(
  ctx: DataContext,
  party: Party,
  now: Date,
  period: LeaderboardPeriod = 'all',
): Promise<LoadedStats> {
  await resolveCurrentWeek(ctx, party, now); // records any week that has just closed
  const [rounds, recommendations, votes] = await Promise.all([
    listAllRounds(ctx, party.partyId),
    listPartyRecommendations(ctx, party.partyId),
    listPartyVotes(ctx, party.partyId),
  ]);
  // Effective status from time + song count (ADR-0003), not just the stored field.
  const songsPerRound = new Map<string, number>();
  for (const rec of recommendations) {
    songsPerRound.set(rec.roundId, (songsPerRound.get(rec.roundId) ?? 0) + 1);
  }
  const allClosed = rounds.filter(
    (r) => getEffectiveWeekStatus(r, now, songsPerRound.get(r.roundId) ?? 0) === 'CLOSED',
  );
  const closedRounds = stats.roundsInPeriod(allClosed, period, now, party.settings.timezone);
  const data = stats.buildStatsData(recommendations, votes, closedRounds);
  return {
    data,
    songIndex: new Map(data.songs.map((s) => [s.recommendation.recommendationId, s.recommendation])),
    weeksPlayed: closedRounds.length,
    closedRounds,
  };
}

function songSummary(rec: Recommendation | undefined) {
  if (rec === undefined) return null;
  return {
    title: rec.song.title,
    artist: rec.song.artist,
    albumArtUrl: rec.song.albumArtUrl,
    recommendedBy: rec.userId,
    submittedOn: rec.submittedOn,
  };
}

/** Adds a song summary to each winner of a song-based superlative. */
function withSongs(result: Superlative, songIndex: Map<string, Recommendation>) {
  if (result.status !== 'ok') return result;
  return { ...result, value: result.value.map((w) => ({ ...w, song: songSummary(songIndex.get(w.id)) })) };
}

async function memberNames(ctx: DataContext, partyId: string) {
  return (await listMembers(ctx, partyId)).map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    avatarColor: m.avatarColor,
    avatarImage: m.avatarImage ?? null,
  }));
}

/** Your stats within one party (spec §17 personal). */
export const personalStatsFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const { partyId } = parseQuery(event, personalStatsQuerySchema);
  const { party } = await loadPartyForMember(data, partyId, userId);
  const loaded = await loadStats(data, party, now());
  const d = loaded.data;

  const twin: Stat<stats.MusicalTwin[]> = stats.musicalTwin(d, userId);
  const lastWeek = [...loaded.closedRounds].sort((a, b) => b.endsAt.localeCompare(a.endsAt))[0];
  const lastRank = lastWeek === undefined ? null : stats.weekRank(d, lastWeek.roundId, userId);
  return ok({
    weeksPlayed: loaded.weeksPlayed,
    averageRatingGiven: stats.averageRatingGiven(d, userId),
    averageScoreReceived: stats.averageScoreReceived(d, userId),
    songsRecommended: stats.songsRecommended(d, userId),
    highestRatedRecommendation: withSongs(stats.highestRatedRecommendation(d, userId), loaded.songIndex),
    lowestRatedRecommendation: withSongs(stats.lowestRatedRecommendation(d, userId), loaded.songIndex),
    generosity: stats.generosity(d, userId),
    ratingDistribution: stats.ratingDistributionGiven(d, userId),
    favoriteArtists: stats.favoriteArtists(d, userId),
    musicalTwin: twin,
    ratingsGiven: stats.ratingsGivenBy(d, userId).length,
    favoriteGenres: stats.favoriteGenres(d, userId),
    recentSongs: stats.recentSongs(d, userId),
    lastWeekRank:
      lastWeek === undefined || lastRank === null
        ? null
        : { roundId: lastWeek.roundId, weekStart: lastWeek.weekStart, ...lastRank },
    members: await memberNames(data, partyId),
  } satisfies PersonalStatsResponse);
};

/** Group stats for a party (spec §17 group). */
export const groupStatsFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  const { party } = await loadPartyForMember(data, partyId, userId);
  const loaded = await loadStats(data, party, now());
  const d = loaded.data;
  const songs = loaded.songIndex;
  const members = await memberNames(data, partyId);

  return ok({
    weeksPlayed: loaded.weeksPlayed,
    songsShared: d.songs.length,
    ratingsGiven: d.votes.length,
    highestRatedSong: withSongs(stats.highestRatedSong(d), songs),
    crowdFavorite: withSongs(stats.crowdFavorite(d), songs),
    mostDivisive: withSongs(stats.mostDivisive(d), songs),
    mostControversial: withSongs(stats.mostControversial(d), songs),
    everyoneAgreed: withSongs(stats.everyoneAgreed(d), songs),
    darkHorse: withSongs(stats.darkHorse(d), songs),
    mostGenerousVoter: stats.mostGenerousVoter(d),
    toughestCritic: stats.toughestCritic(d),
    groupAverage: stats.groupAverage(d),
    ratingDistribution: stats.groupRatingDistribution(d),
    topArtists: stats.topArtists(d),
    mostConsistent: stats.mostConsistent(d),
    weeklyActivity: stats.weeklyActivity(d, loaded.closedRounds),
    monthlyActivity: stats.monthlyActivity(d, loaded.closedRounds, party.settings.timezone),
    memberCount: members.length,
    members,
  } satisfies GroupStatsResponse);
};

/** Leaderboards (spec §18, §20; D30), for one period. Each entry carries its sample size ("Based on N …"). */
export const leaderboardFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  const { period } = parseQuery(event, leaderboardQuerySchema);
  const { party } = await loadPartyForMember(data, partyId, userId);
  const loaded = await loadStats(data, party, now(), period);
  const d = loaded.data;
  const withSong = (entries: stats.LeaderboardEntry[]) =>
    entries.map((e) => ({ ...e, song: songSummary(loaded.songIndex.get(e.id)) }));

  return ok({
    period,
    weeksPlayed: loaded.weeksPlayed,
    highestAverageSongRating: withSong(stats.songRatingLeaderboard(d)),
    crowdFavorites: withSong(stats.crowdFavoriteLeaderboard(d)),
    highestAverageReceived: stats.averageReceivedBoard(d),
    highestAverageGiven: stats.averageGivenBoard(d),
    mostBops: stats.mostBopsBoard(d),
    mostRatings: stats.mostRatingsBoard(d),
    mostGenerous: stats.mostGenerousBoard(d),
    toughestCritic: stats.toughestCriticBoard(d),
    mostConsistent: stats.consistencyBoard(d),
    mostSurprising: stats.surpriseBoard(d),
    mostPopular: stats.popularityBoard(d),
    members: await memberNames(data, partyId),
  } satisfies LeaderboardResponse);
};

export const personalStatsHandler = createHandler(personalStatsFn);
export const groupStatsHandler = createHandler(groupStatsFn);
export const leaderboardHandler = createHandler(leaderboardFn);
