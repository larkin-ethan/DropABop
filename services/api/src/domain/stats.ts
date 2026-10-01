// Personal and group statistics (spec §17, §18). Definitions and minimum samples come from the table in
// docs/PRODUCT_DECISIONS.md and are explained for users in docs/STATISTICS.md.
//
// Rules that apply to every stat:
// - CLOSED weeks only. Open weeks' ratings are hidden (D9), so including them could leak them. Weeks that
//   closed as NOT_ENOUGH_SONGS are excluded too. buildStatsData enforces this: it keeps only songs and ratings
//   from the weeks it's given, and only ratings saved before each week ended (docs/DATABASE.md, rating lock).
// - If the minimum sample isn't met, the result says "not enough data" with how much there is and how much
//   is needed. We never show a number we can't back up (spec §17).
// - Ratings on your own song (never accepted by the API) and ratings for unknown songs are ignored.

import type { Recommendation, Round, Vote } from '@sotd/shared';
import { MAX_RATING, MIN_RATING } from '@sotd/shared';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type Stat<T> =
  | { status: 'ok'; value: T; sampleSize: number }
  | { status: 'not-enough-data'; sampleSize: number; required: number };

/** One winner of a "most …" stat. `id` is a recommendationId or a userId depending on the stat. */
export interface Winner {
  id: string;
  value: number;
  /** How much data this winner's value is based on (ratings, songs, …). */
  sampleSize: number;
}

/**
 * "Most …" stats return every tied winner. `sampleSize` = how many candidates met the minimum;
 * `required` (when not enough data) = the per-candidate minimum.
 */
export type Superlative = Stat<Winner[]>;

/** Minimum samples from the PRODUCT_DECISIONS stats table. */
export const MINIMUMS = {
  averageRatingGiven: 5,
  averageScoreReceived: 3,
  generosity: 10,
  songRatings: 3,
  spreadRatings: 4,
  darkHorsePriorSongs: 3,
  surpriseMargin: 1.0,
  twinSharedSongs: 5,
  consistencySongs: 3,
  popularRecommendations: 3,
  popularRating: 8,
  favoriteArtistSongs: 2,
  crowdFavoriteShare: 0.75,
  controversialLow: 3,
  controversialHigh: 8,
} as const;

// ---------------------------------------------------------------------------
// Preparing the data once
// ---------------------------------------------------------------------------

interface SongData {
  recommendation: Recommendation;
  /** Valid ratings for this song (no self-ratings). */
  ratings: number[];
  /** Exact average, or null if unrated. */
  average: number | null;
  /** Users who rated anything in this song's week, excluding the recommender. */
  activeRatersInWeek: number;
}

export interface StatsData {
  songs: SongData[];
  /** Valid votes only. */
  votes: Vote[];
  /** Average of every valid rating in the party (for generosity). Null if no ratings. */
  partyAverageGiven: number | null;
}

/**
 * Call once per request. `closedRounds` must be the party's weeks with status CLOSED (not OPEN, not
 * NOT_ENOUGH_SONGS); anything from other weeks is dropped here, as are ratings saved after a week ended.
 */
export function buildStatsData(
  allRecommendations: Recommendation[],
  allVotes: Vote[],
  closedRounds: Pick<Round, 'roundId' | 'endsAt'>[],
): StatsData {
  const endsAtByRound = new Map(closedRounds.map((r) => [r.roundId, new Date(r.endsAt).getTime()]));
  const recommendations = allRecommendations.filter((r) => endsAtByRound.has(r.roundId));
  const recById = new Map(recommendations.map((r) => [r.recommendationId, r]));
  const validVotes = allVotes.filter((v) => {
    const rec = recById.get(v.recommendationId);
    const endsAt = endsAtByRound.get(v.roundId);
    return (
      rec !== undefined &&
      rec.userId !== v.userId && // never count self-ratings
      endsAt !== undefined &&
      new Date(v.updatedAt).getTime() < endsAt // rating lock
    );
  });

  const ratingsBySong = new Map<string, number[]>();
  const ratersByRound = new Map<string, Set<string>>();
  for (const vote of validVotes) {
    ratingsBySong.set(vote.recommendationId, [
      ...(ratingsBySong.get(vote.recommendationId) ?? []),
      vote.rating,
    ]);
    const raters = ratersByRound.get(vote.roundId) ?? new Set<string>();
    raters.add(vote.userId);
    ratersByRound.set(vote.roundId, raters);
  }

  const songs = recommendations.map((recommendation) => {
    const ratings = ratingsBySong.get(recommendation.recommendationId) ?? [];
    const raters = ratersByRound.get(recommendation.roundId) ?? new Set<string>();
    return {
      recommendation,
      ratings,
      average: mean(ratings),
      activeRatersInWeek: raters.size - (raters.has(recommendation.userId) ? 1 : 0),
    };
  });

  return { songs, votes: validVotes, partyAverageGiven: mean(validVotes.map((v) => v.rating)) };
}

// ---------------------------------------------------------------------------
// Small maths helpers
// ---------------------------------------------------------------------------

export function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Population standard deviation (PRODUCT_DECISIONS: "Standard deviation = population standard deviation"). */
export function populationStdDev(values: number[]): number | null {
  const avg = mean(values);
  if (avg === null) {
    return null;
  }
  return Math.sqrt(values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length);
}

function notEnough<T>(sampleSize: number, required: number): Stat<T> {
  return { status: 'not-enough-data', sampleSize, required };
}

/** Picks every candidate tied for the best value. Values are compared after rounding to 6 decimals. */
function pickWinners(candidates: Winner[], direction: 'highest' | 'lowest', required: number): Superlative {
  if (candidates.length === 0) {
    return notEnough(0, required);
  }
  const key = (v: number) => Math.round(v * 1e6);
  const best =
    direction === 'highest'
      ? Math.max(...candidates.map((c) => key(c.value)))
      : Math.min(...candidates.map((c) => key(c.value)));
  const winners = candidates.filter((c) => key(c.value) === best).sort((a, b) => a.id.localeCompare(b.id));
  return { status: 'ok', value: winners, sampleSize: candidates.length };
}

function songsBy(data: StatsData, userId: string): SongData[] {
  return data.songs.filter((s) => s.recommendation.userId === userId);
}

function ratedSongsBy(data: StatsData, userId: string): (SongData & { average: number })[] {
  return songsBy(data, userId).filter((s): s is SongData & { average: number } => s.average !== null);
}

function ratingsGivenBy(data: StatsData, userId: string): number[] {
  return data.votes.filter((v) => v.userId === userId).map((v) => v.rating);
}

function distinctUsers(data: StatsData): string[] {
  const users = new Set<string>();
  for (const song of data.songs) users.add(song.recommendation.userId);
  for (const vote of data.votes) users.add(vote.userId);
  return [...users].sort();
}

// ---------------------------------------------------------------------------
// Personal stats
// ---------------------------------------------------------------------------

/** Mean of all ratings the user gave. */
export function averageRatingGiven(data: StatsData, userId: string): Stat<number> {
  const ratings = ratingsGivenBy(data, userId);
  if (ratings.length < MINIMUMS.averageRatingGiven) {
    return notEnough(ratings.length, MINIMUMS.averageRatingGiven);
  }
  return { status: 'ok', value: mean(ratings) as number, sampleSize: ratings.length };
}

/** Average Recommendation Score (spec §18): mean of the averages of the user's rated songs. */
export function averageScoreReceived(data: StatsData, userId: string): Stat<number> {
  const songs = ratedSongsBy(data, userId);
  if (songs.length < MINIMUMS.averageScoreReceived) {
    return notEnough(songs.length, MINIMUMS.averageScoreReceived);
  }
  return { status: 'ok', value: mean(songs.map((s) => s.average)) as number, sampleSize: songs.length };
}

/** A plain count; no minimum needed. */
export function songsRecommended(data: StatsData, userId: string): number {
  return songsBy(data, userId).length;
}

/** The user's best and worst rated songs (ties → several). Needs at least one rated song. */
export function highestRatedRecommendation(data: StatsData, userId: string): Superlative {
  return pickWinners(songWinners(ratedSongsBy(data, userId)), 'highest', 1);
}

export function lowestRatedRecommendation(data: StatsData, userId: string): Superlative {
  return pickWinners(songWinners(ratedSongsBy(data, userId)), 'lowest', 1);
}

function songWinners(songs: (SongData & { average: number })[]): Winner[] {
  return songs.map((s) => ({
    id: s.recommendation.recommendationId,
    value: s.average,
    sampleSize: s.ratings.length,
  }));
}

/** User's average given minus the party's average given. Positive = generous. */
export function generosity(data: StatsData, userId: string): Stat<number> {
  const ratings = ratingsGivenBy(data, userId);
  if (ratings.length < MINIMUMS.generosity || data.partyAverageGiven === null) {
    return notEnough(ratings.length, MINIMUMS.generosity);
  }
  return {
    status: 'ok',
    value: (mean(ratings) as number) - data.partyAverageGiven,
    sampleSize: ratings.length,
  };
}

/** How many of each rating (1–10) the user has given. Index 0 = number of 1s. */
export function ratingDistributionGiven(data: StatsData, userId: string): Stat<number[]> {
  const ratings = ratingsGivenBy(data, userId);
  const distribution = new Array<number>(MAX_RATING - MIN_RATING + 1).fill(0);
  for (const rating of ratings) {
    distribution[rating - MIN_RATING] = (distribution[rating - MIN_RATING] ?? 0) + 1;
  }
  if (ratings.length === 0) {
    return notEnough(0, 1);
  }
  return { status: 'ok', value: distribution, sampleSize: ratings.length };
}

export interface FavoriteArtist {
  artist: string;
  averageRating: number;
  songCount: number;
}

/** Artists the user rated highest on average, best first (top 3). Each needs 2+ songs rated by the user. */
export function favoriteArtists(data: StatsData, userId: string): Stat<FavoriteArtist[]> {
  const songArtist = new Map(
    data.songs.map((s) => [s.recommendation.recommendationId, s.recommendation.song.artist]),
  );
  const ratingsByArtist = new Map<string, number[]>();
  for (const vote of data.votes) {
    if (vote.userId !== userId) continue;
    const artist = songArtist.get(vote.recommendationId);
    if (artist === undefined) continue;
    ratingsByArtist.set(artist, [...(ratingsByArtist.get(artist) ?? []), vote.rating]);
  }

  const qualifying = [...ratingsByArtist.entries()]
    .filter(([, ratings]) => ratings.length >= MINIMUMS.favoriteArtistSongs)
    .map(([artist, ratings]) => ({
      artist,
      averageRating: mean(ratings) as number,
      songCount: ratings.length,
    }))
    .sort(
      (a, b) =>
        b.averageRating - a.averageRating || b.songCount - a.songCount || a.artist.localeCompare(b.artist),
    );

  if (qualifying.length === 0) {
    return notEnough(0, MINIMUMS.favoriteArtistSongs);
  }
  return { status: 'ok', value: qualifying.slice(0, 3), sampleSize: qualifying.length };
}

export interface MusicalTwin {
  userId: string;
  /** Average gap between your rating and theirs on songs you both rated (0 = identical taste). */
  meanAbsoluteDifference: number;
  sharedSongs: number;
}

/** The member whose ratings are closest to yours, on at least 5 songs you both rated. */
export function musicalTwin(data: StatsData, userId: string): Stat<MusicalTwin[]> {
  const mine = new Map(
    data.votes.filter((v) => v.userId === userId).map((v) => [v.recommendationId, v.rating]),
  );
  const diffsByUser = new Map<string, number[]>();
  for (const vote of data.votes) {
    if (vote.userId === userId) continue;
    const myRating = mine.get(vote.recommendationId);
    if (myRating === undefined) continue;
    diffsByUser.set(vote.userId, [...(diffsByUser.get(vote.userId) ?? []), Math.abs(myRating - vote.rating)]);
  }

  const candidates: Winner[] = [...diffsByUser.entries()]
    .filter(([, diffs]) => diffs.length >= MINIMUMS.twinSharedSongs)
    .map(([otherId, diffs]) => ({ id: otherId, value: mean(diffs) as number, sampleSize: diffs.length }));

  const result = pickWinners(candidates, 'lowest', MINIMUMS.twinSharedSongs);
  if (result.status !== 'ok') {
    return result;
  }
  return {
    status: 'ok',
    sampleSize: result.sampleSize,
    value: result.value.map((w) => ({
      userId: w.id,
      meanAbsoluteDifference: w.value,
      sharedSongs: w.sampleSize,
    })),
  };
}

// ---------------------------------------------------------------------------
// Group stats: songs
// ---------------------------------------------------------------------------

function songsWithAtLeast(data: StatsData, minRatings: number): SongData[] {
  return data.songs.filter((s) => s.ratings.length >= minRatings);
}

/** Highest song average (3+ ratings). */
export function highestRatedSong(data: StatsData): Superlative {
  const candidates = songsWithAtLeast(data, MINIMUMS.songRatings).map((s) => ({
    id: s.recommendation.recommendationId,
    value: s.average as number,
    sampleSize: s.ratings.length,
  }));
  return pickWinners(candidates, 'highest', MINIMUMS.songRatings);
}

/** Highest average among songs rated by 75%+ of that week's active raters (3+ ratings). */
export function crowdFavorite(data: StatsData): Superlative {
  const candidates = songsWithAtLeast(data, MINIMUMS.songRatings)
    .filter(
      (s) =>
        s.activeRatersInWeek > 0 && s.ratings.length / s.activeRatersInWeek >= MINIMUMS.crowdFavoriteShare,
    )
    .map((s) => ({
      id: s.recommendation.recommendationId,
      value: s.average as number,
      sampleSize: s.ratings.length,
    }));
  return pickWinners(candidates, 'highest', MINIMUMS.songRatings);
}

/** Highest standard deviation of ratings (4+ ratings). */
export function mostDivisive(data: StatsData): Superlative {
  return pickWinners(spreadCandidates(data), 'highest', MINIMUMS.spreadRatings);
}

/** Lowest standard deviation of ratings (4+ ratings). */
export function everyoneAgreed(data: StatsData): Superlative {
  return pickWinners(spreadCandidates(data), 'lowest', MINIMUMS.spreadRatings);
}

function spreadCandidates(data: StatsData): Winner[] {
  return songsWithAtLeast(data, MINIMUMS.spreadRatings).map((s) => ({
    id: s.recommendation.recommendationId,
    value: populationStdDev(s.ratings) as number,
    sampleSize: s.ratings.length,
  }));
}

/**
 * Largest share of extreme ratings with both sides present: min(share ≤ 3, share ≥ 8) × 2.
 * 1.0 = perfectly split between love and hate. Songs with no lows or no highs don't qualify.
 */
export function mostControversial(data: StatsData): Superlative {
  const candidates = songsWithAtLeast(data, MINIMUMS.spreadRatings)
    .map((s) => {
      const lows = s.ratings.filter((r) => r <= MINIMUMS.controversialLow).length / s.ratings.length;
      const highs = s.ratings.filter((r) => r >= MINIMUMS.controversialHigh).length / s.ratings.length;
      return {
        id: s.recommendation.recommendationId,
        value: Math.min(lows, highs) * 2,
        sampleSize: s.ratings.length,
      };
    })
    .filter((c) => c.value > 0);
  return pickWinners(candidates, 'highest', MINIMUMS.spreadRatings);
}

/**
 * How much each song beat its recommender's average from *earlier* songs. Only songs with 3+ ratings whose
 * recommender already had 3+ earlier rated songs qualify.
 */
function surprises(data: StatsData): Winner[] {
  const result: Winner[] = [];
  for (const song of songsWithAtLeast(data, MINIMUMS.songRatings)) {
    const prior = ratedSongsBy(data, song.recommendation.userId).filter(
      (s) => s.recommendation.submittedOn < song.recommendation.submittedOn,
    );
    if (prior.length < MINIMUMS.darkHorsePriorSongs) continue;
    const priorAverage = mean(prior.map((s) => s.average)) as number;
    result.push({
      id: song.recommendation.recommendationId,
      value: (song.average as number) - priorAverage,
      sampleSize: song.ratings.length,
    });
  }
  return result;
}

/** The song that beat its recommender's usual score by the most (positive surprises only). */
export function darkHorse(data: StatsData): Superlative {
  return pickWinners(
    surprises(data).filter((s) => s.value > 0),
    'highest',
    MINIMUMS.darkHorsePriorSongs,
  );
}

// ---------------------------------------------------------------------------
// Group stats: people
// ---------------------------------------------------------------------------

function generosityCandidates(data: StatsData): Winner[] {
  return distinctUsers(data).flatMap((userId) => {
    const stat = generosity(data, userId);
    return stat.status === 'ok' ? [{ id: userId, value: stat.value, sampleSize: stat.sampleSize }] : [];
  });
}

export function mostGenerousVoter(data: StatsData): Superlative {
  return pickWinners(generosityCandidates(data), 'highest', MINIMUMS.generosity);
}

export function toughestCritic(data: StatsData): Superlative {
  return pickWinners(generosityCandidates(data), 'lowest', MINIMUMS.generosity);
}

/** Standard deviation of each user's song averages (3+ rated songs). Lower = more consistent. */
function consistencyCandidates(data: StatsData): Winner[] {
  return distinctUsers(data).flatMap((userId) => {
    const songs = ratedSongsBy(data, userId);
    if (songs.length < MINIMUMS.consistencySongs) return [];
    return [
      {
        id: userId,
        value: populationStdDev(songs.map((s) => s.average)) as number,
        sampleSize: songs.length,
      },
    ];
  });
}

export function mostConsistent(data: StatsData): Superlative {
  return pickWinners(consistencyCandidates(data), 'lowest', MINIMUMS.consistencySongs);
}

/** Per user: number of songs that beat their own earlier average by at least 1 point. */
function surpriseCountCandidates(data: StatsData): Winner[] {
  const counts = new Map<string, number>();
  const recommenderOf = new Map(
    data.songs.map((s) => [s.recommendation.recommendationId, s.recommendation.userId]),
  );
  for (const surprise of surprises(data)) {
    if (surprise.value < MINIMUMS.surpriseMargin) continue;
    const userId = recommenderOf.get(surprise.id) as string;
    counts.set(userId, (counts.get(userId) ?? 0) + 1);
  }
  return [...counts.entries()].map(([id, count]) => ({ id, value: count, sampleSize: count }));
}

export function mostSurprising(data: StatsData): Superlative {
  return pickWinners(surpriseCountCandidates(data), 'highest', 1);
}

/** Per user: ratings of 8+ received across their songs (3+ recommendations). */
function popularityCandidates(data: StatsData): Winner[] {
  return distinctUsers(data).flatMap((userId) => {
    const songs = songsBy(data, userId);
    if (songs.length < MINIMUMS.popularRecommendations) return [];
    const highRatings = songs.flatMap((s) => s.ratings).filter((r) => r >= MINIMUMS.popularRating).length;
    return [{ id: userId, value: highRatings, sampleSize: songs.length }];
  });
}

export function mostPopular(data: StatsData): Superlative {
  return pickWinners(popularityCandidates(data), 'highest', MINIMUMS.popularRecommendations);
}

// ---------------------------------------------------------------------------
// Leaderboards (spec §18)
// ---------------------------------------------------------------------------

export interface LeaderboardEntry {
  id: string;
  /** Ties share a rank (1, 1, 3). */
  rank: number;
  value: number;
  /** Shown as "Based on N …" next to every row. */
  sampleSize: number;
}

/** Ranks candidates; only those meeting the minimum are included. */
export function rankEntries(candidates: Winner[], direction: 'highest' | 'lowest'): LeaderboardEntry[] {
  const sorted = [...candidates].sort((a, b) =>
    direction === 'highest'
      ? b.value - a.value || a.id.localeCompare(b.id)
      : a.value - b.value || a.id.localeCompare(b.id),
  );
  const entries: LeaderboardEntry[] = [];
  sorted.forEach((c, index) => {
    const previous = entries[index - 1];
    const tied = previous !== undefined && Math.round(previous.value * 1e6) === Math.round(c.value * 1e6);
    entries.push({
      id: c.id,
      rank: tied ? previous.rank : index + 1,
      value: c.value,
      sampleSize: c.sampleSize,
    });
  });
  return entries;
}

/** Highest Average Recommendation Score: average rating received by songs the user recommended (3+ rated songs). */
export function recommendationScoreLeaderboard(data: StatsData): LeaderboardEntry[] {
  const candidates = distinctUsers(data).flatMap((userId) => {
    const stat = averageScoreReceived(data, userId);
    return stat.status === 'ok' ? [{ id: userId, value: stat.value, sampleSize: stat.sampleSize }] : [];
  });
  return rankEntries(candidates, 'highest');
}

/** Highest Average Song Rating: songs ranked by average (3+ ratings). */
export function songRatingLeaderboard(data: StatsData): LeaderboardEntry[] {
  const candidates = songsWithAtLeast(data, MINIMUMS.songRatings).map((s) => ({
    id: s.recommendation.recommendationId,
    value: s.average as number,
    sampleSize: s.ratings.length,
  }));
  return rankEntries(candidates, 'highest');
}

/** Most Consistent: lowest spread of a user's song averages (3+ rated songs). */
export function consistencyLeaderboard(data: StatsData): LeaderboardEntry[] {
  return rankEntries(consistencyCandidates(data), 'lowest');
}

/** Most Surprising: songs that beat the recommender's own earlier average by 1+ point. */
export function surpriseLeaderboard(data: StatsData): LeaderboardEntry[] {
  return rankEntries(surpriseCountCandidates(data), 'highest');
}

/** Most Popular: ratings of 8+ received (3+ recommendations). */
export function popularityLeaderboard(data: StatsData): LeaderboardEntry[] {
  return rankEntries(popularityCandidates(data), 'highest');
}
