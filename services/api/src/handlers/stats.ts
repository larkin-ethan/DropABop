// GET /users/me/stats, GET /parties/{partyId}/stats, GET /parties/{partyId}/leaderboard (docs/API.md → Stats).
// Computed on request from closed weeks only (ADR-0006, docs/STATISTICS.md).

import type { GroupStatsResponse, LeaderboardResponse, PersonalStatsResponse } from '@dropabop/shared';
import type { Party, Recommendation } from '@dropabop/shared';
import { personalStatsQuerySchema } from '@dropabop/shared';
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
}

async function loadStats(ctx: DataContext, party: Party, now: Date): Promise<LoadedStats> {
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
  const closedRounds = rounds.filter(
    (r) => getEffectiveWeekStatus(r, now, songsPerRound.get(r.roundId) ?? 0) === 'CLOSED',
  );
  const data = stats.buildStatsData(recommendations, votes, closedRounds);
  return {
    data,
    songIndex: new Map(data.songs.map((s) => [s.recommendation.recommendationId, s.recommendation])),
    weeksPlayed: closedRounds.length,
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
    members: await memberNames(data, partyId),
  } satisfies GroupStatsResponse);
};

/** Leaderboards (spec §18). Each entry carries its sample size ("Based on N …"). */
export const leaderboardFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  const { party } = await loadPartyForMember(data, partyId, userId);
  const loaded = await loadStats(data, party, now());
  const d = loaded.data;

  return ok({
    weeksPlayed: loaded.weeksPlayed,
    highestAverageSongRating: stats
      .songRatingLeaderboard(d)
      .map((e) => ({ ...e, song: songSummary(loaded.songIndex.get(e.id)) })),
    highestAverageRecommendationScore: stats.recommendationScoreLeaderboard(d),
    mostConsistent: stats.consistencyLeaderboard(d),
    mostSurprising: stats.surpriseLeaderboard(d),
    mostPopular: stats.popularityLeaderboard(d),
    members: await memberNames(data, partyId),
  } satisfies LeaderboardResponse);
};

export const personalStatsHandler = createHandler(personalStatsFn);
export const groupStatsHandler = createHandler(groupStatsFn);
export const leaderboardHandler = createHandler(leaderboardFn);
