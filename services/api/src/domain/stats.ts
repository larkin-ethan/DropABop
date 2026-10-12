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

import type {
  ActivityPoint,
  ArtistCount,
  FavoriteArtist,
  FavoriteGenre,
  LeaderboardPeriod,
  PersonBoard,
  ProvisionalEntry,
  RecentSong,
  LeaderboardEntry,
  MusicalTwin,
  Recommendation,
  Round,
  Stat,
  Superlative,
  Vote,
  Winner,
} from '@dropabop/shared';
import { MAX_RATING, MIN_RATING } from '@dropabop/shared';

// ---------------------------------------------------------------------------
// Result types: defined in @dropabop/shared (api-types.ts) so the website reads exactly what this builds.
// "Most …" stats return every tied winner; `sampleSize` = how many candidates met the minimum, and `required`
// (when not enough data) = the per-candidate minimum.
// ---------------------------------------------------------------------------

export type { FavoriteArtist, LeaderboardEntry, MusicalTwin, PersonBoard, Stat, Superlative, Winner };

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
  favoriteGenreSongs: 2,
  groupAverageRatings: 1,
  countBoard: 1,
} as const;

/** How many items the profile's recent songs and the group activity tables show. */
export const RECENT_SONGS = 5;
export const ACTIVITY_PERIODS = 12;

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

/** Artists grouped case-insensitively, keeping the first spelling seen, with how many songs each has. */
export function artistCounts(songs: { artist: string }[]): { artist: string; songs: number }[] {
  const byKey = new Map<string, { artist: string; songs: number }>();
  for (const song of songs) {
    const key = song.artist.trim().toLowerCase();
    const entry = byKey.get(key) ?? { artist: song.artist.trim(), songs: 0 };
    entry.songs += 1;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => b.songs - a.songs || a.artist.localeCompare(b.artist));
}

function notEnough<T>(sampleSize: number, required: number): Stat<T> {
  return { status: 'not-enough-data', sampleSize, required };
}

/**
 * Values are compared as the app shows them (1 decimal, or 2 for the controversial score), so two songs that both show
 * 8.3 tie instead of one quietly beating the other, the same rule as weekly results (D12, STATISTICS.md ground rules).
 * Returns an integer key so equal displayed values compare exactly.
 */
function shownValueKey(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * scale);
}

/** Picks every candidate tied for the best value, as shown to people (see shownValueKey). */
function pickWinners(
  candidates: Winner[],
  direction: 'highest' | 'lowest',
  required: number,
  decimals = 1,
): Superlative {
  if (candidates.length === 0) {
    return notEnough(0, required);
  }
  const key = (v: number) => shownValueKey(v, decimals);
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

export function ratingsGivenBy(data: StatsData, userId: string): number[] {
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

/** How many of each rating (0–10) the user has given. Index 0 = number of 0s. */
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

function crowdFavoriteCandidates(data: StatsData): Winner[] {
  return songsWithAtLeast(data, MINIMUMS.songRatings)
    .filter(
      (s) =>
        s.activeRatersInWeek > 0 && s.ratings.length / s.activeRatersInWeek >= MINIMUMS.crowdFavoriteShare,
    )
    .map((s) => ({
      id: s.recommendation.recommendationId,
      value: s.average as number,
      sampleSize: s.ratings.length,
    }));
}

/** Highest average among songs rated by 75%+ of that week's active raters (3+ ratings). */
export function crowdFavorite(data: StatsData): Superlative {
  return pickWinners(crowdFavoriteCandidates(data), 'highest', MINIMUMS.songRatings);
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
  return pickWinners(candidates, 'highest', MINIMUMS.spreadRatings, 2); // the score is shown to 2 decimals
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

/** Ranks candidates; only those meeting the minimum are included. Equal shown values share a rank (1, 1, 3). */
export function rankEntries(
  candidates: Winner[],
  direction: 'highest' | 'lowest',
  decimals = 1,
): LeaderboardEntry[] {
  const key = (v: number) => shownValueKey(v, decimals);
  const sorted = [...candidates].sort((a, b) =>
    direction === 'highest'
      ? key(b.value) - key(a.value) || a.id.localeCompare(b.id)
      : key(a.value) - key(b.value) || a.id.localeCompare(b.id),
  );
  const entries: LeaderboardEntry[] = [];
  sorted.forEach((c, index) => {
    const previous = entries[index - 1];
    const tied = previous !== undefined && key(previous.value) === key(c.value);
    entries.push({
      id: c.id,
      rank: tied ? previous.rank : index + 1,
      value: c.value,
      sampleSize: c.sampleSize,
    });
  });
  return entries;
}

// Every person board (D30) is built from one row per person, including people below the minimum: they are listed
// apart as "Provisional" with how much data they have, never with a value, and never ranked above anyone who
// qualifies (so one 10 can't beat 100 ratings averaging 9.5). People with no data at all aren't listed.

/** One person's value for a board, whatever their sample size. */
interface PersonRow {
  id: string;
  value: number;
  sampleSize: number;
}

export function personBoard(
  rows: PersonRow[],
  required: number,
  direction: 'highest' | 'lowest',
  decimals = 1,
): PersonBoard {
  const provisional: ProvisionalEntry[] = rows
    .filter((r) => r.sampleSize > 0 && r.sampleSize < required)
    .sort((a, b) => b.sampleSize - a.sampleSize || a.id.localeCompare(b.id))
    .map(({ id, sampleSize }) => ({ id, sampleSize }));
  return {
    ranked: rankEntries(
      rows.filter((r) => r.sampleSize >= required),
      direction,
      decimals,
    ),
    provisional,
    required,
  };
}

function rowsPerUser(data: StatsData, row: (userId: string) => PersonRow | null): PersonRow[] {
  return distinctUsers(data).flatMap((userId) => {
    const r = row(userId);
    return r === null ? [] : [r];
  });
}

/** Highest Average Received (= Average Recommendation Score): mean of a person's song averages (3 rated songs). */
export function averageReceivedBoard(data: StatsData): PersonBoard {
  const rows = rowsPerUser(data, (id) => {
    const averages = ratedSongsBy(data, id).map((s) => s.average);
    return { id, value: mean(averages) ?? 0, sampleSize: averages.length };
  });
  return personBoard(rows, MINIMUMS.averageScoreReceived, 'highest');
}

/** Highest Average Given: mean of the ratings a person gave (5 ratings). */
export function averageGivenBoard(data: StatsData): PersonBoard {
  const rows = rowsPerUser(data, (id) => {
    const ratings = ratingsGivenBy(data, id);
    return { id, value: mean(ratings) ?? 0, sampleSize: ratings.length };
  });
  return personBoard(rows, MINIMUMS.averageRatingGiven, 'highest');
}

/** Most Bops: songs shared. A plain count, so anyone with one song is ranked. */
export function mostBopsBoard(data: StatsData): PersonBoard {
  const rows = rowsPerUser(data, (id) => {
    const count = songsBy(data, id).length;
    return { id, value: count, sampleSize: count };
  });
  return personBoard(rows, MINIMUMS.countBoard, 'highest', 0);
}

/** Most Ratings: valid ratings given. A plain count. */
export function mostRatingsBoard(data: StatsData): PersonBoard {
  const rows = rowsPerUser(data, (id) => {
    const count = ratingsGivenBy(data, id).length;
    return { id, value: count, sampleSize: count };
  });
  return personBoard(rows, MINIMUMS.countBoard, 'highest', 0);
}

function generosityRows(data: StatsData): PersonRow[] {
  const partyAverage = data.partyAverageGiven;
  if (partyAverage === null) return [];
  return rowsPerUser(data, (id) => {
    const ratings = ratingsGivenBy(data, id);
    return { id, value: (mean(ratings) ?? partyAverage) - partyAverage, sampleSize: ratings.length };
  });
}

/** Most Generous: highest generosity (10 ratings). */
export function mostGenerousBoard(data: StatsData): PersonBoard {
  return personBoard(generosityRows(data), MINIMUMS.generosity, 'highest');
}

/** Toughest Critic: lowest generosity (10 ratings). */
export function toughestCriticBoard(data: StatsData): PersonBoard {
  return personBoard(generosityRows(data), MINIMUMS.generosity, 'lowest');
}

/** Most Consistent: lowest spread of a person's song averages (3 rated songs). */
export function consistencyBoard(data: StatsData): PersonBoard {
  const rows = rowsPerUser(data, (id) => {
    const averages = ratedSongsBy(data, id).map((s) => s.average);
    return { id, value: populationStdDev(averages) ?? 0, sampleSize: averages.length };
  });
  return personBoard(rows, MINIMUMS.consistencySongs, 'lowest');
}

/** Most Surprising: songs that beat the person's own earlier average by 1+ point (1 such song). */
export function surpriseBoard(data: StatsData): PersonBoard {
  return personBoard(surpriseCountCandidates(data), 1, 'highest', 0);
}

/** Most Popular: ratings of 8+ received (3 songs shared). Sample = songs shared. */
export function popularityBoard(data: StatsData): PersonBoard {
  const rows = rowsPerUser(data, (id) => {
    const songs = songsBy(data, id);
    const high = songs.flatMap((s) => s.ratings).filter((r) => r >= MINIMUMS.popularRating).length;
    return { id, value: high, sampleSize: songs.length };
  });
  return personBoard(rows, MINIMUMS.popularRecommendations, 'highest', 0);
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

/** Crowd Favorites: songs rated by 75%+ of their week's raters (3+ ratings), by average. */
export function crowdFavoriteLeaderboard(data: StatsData): LeaderboardEntry[] {
  return rankEntries(crowdFavoriteCandidates(data), 'highest');
}

// ---------------------------------------------------------------------------
// Periods (D30)
// ---------------------------------------------------------------------------

/** The calendar day of a moment in a timezone ("en-CA" formats dates as YYYY-MM-DD). */
export function dayIn(moment: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(moment);
}

/** "YYYY-MM" of a moment in a timezone. */
function monthIn(moment: Date, timeZone: string): string {
  return dayIn(moment, timeZone).slice(0, 7);
}

/**
 * The month a week's ratings locked in. `endsAt` is exclusive (Monday 00:00 for "Sunday 11:59 pm"), so the lock
 * belongs to the moment just before it: a week locking at the end of Sunday 31 May counts for May, not June.
 */
export function lockMonth(endsAt: string, timeZone: string): string {
  return monthIn(new Date(new Date(endsAt).getTime() - 1), timeZone);
}

/**
 * The closed weeks a leaderboard period covers (D30): `week` = the most recent closed week, `month` = closed weeks
 * whose ratings locked in the current calendar month (party timezone), `all` = every closed week.
 */
export function roundsInPeriod<R extends Pick<Round, 'endsAt'>>(
  closedRounds: R[],
  period: LeaderboardPeriod,
  now: Date,
  timeZone: string,
): R[] {
  if (period === 'all') return closedRounds;
  if (period === 'week') {
    const latest = [...closedRounds].sort((a, b) => b.endsAt.localeCompare(a.endsAt))[0];
    return latest === undefined ? [] : [latest];
  }
  const thisMonth = monthIn(now, timeZone);
  return closedRounds.filter((r) => lockMonth(r.endsAt, timeZone) === thisMonth);
}

// ---------------------------------------------------------------------------
// Profile (spec §18, P13.11)
// ---------------------------------------------------------------------------

/** Genres the user rated highest on average, top 3. Each needs 2+ songs of that genre rated by the user. */
export function favoriteGenres(data: StatsData, userId: string): Stat<FavoriteGenre[]> {
  const genreOf = new Map(
    data.songs.map((s) => [s.recommendation.recommendationId, s.recommendation.song.genre?.trim() ?? '']),
  );
  const byKey = new Map<string, { genre: string; ratings: number[] }>();
  for (const vote of data.votes) {
    if (vote.userId !== userId) continue;
    const genre = genreOf.get(vote.recommendationId) ?? '';
    if (genre === '') continue; // songs shared before P13.7 have no genre
    const key = genre.toLowerCase();
    const entry = byKey.get(key) ?? { genre, ratings: [] };
    entry.ratings.push(vote.rating);
    byKey.set(key, entry);
  }
  const qualifying = [...byKey.values()]
    .filter((g) => g.ratings.length >= MINIMUMS.favoriteGenreSongs)
    .map((g) => ({ genre: g.genre, averageRating: mean(g.ratings) as number, songCount: g.ratings.length }))
    .sort(
      (a, b) =>
        b.averageRating - a.averageRating || b.songCount - a.songCount || a.genre.localeCompare(b.genre),
    );
  if (qualifying.length === 0) return notEnough(0, MINIMUMS.favoriteGenreSongs);
  return { status: 'ok', value: qualifying.slice(0, 3), sampleSize: qualifying.length };
}

/** The user's latest songs from closed weeks, newest first. */
export function recentSongs(data: StatsData, userId: string): RecentSong[] {
  return songsBy(data, userId)
    .sort(
      (a, b) =>
        b.recommendation.submittedOn.localeCompare(a.recommendation.submittedOn) ||
        b.recommendation.createdAt.localeCompare(a.recommendation.createdAt),
    )
    .slice(0, RECENT_SONGS)
    .map((s) => ({
      recommendationId: s.recommendation.recommendationId,
      roundId: s.recommendation.roundId,
      submittedOn: s.recommendation.submittedOn,
      title: s.recommendation.song.title,
      artist: s.recommendation.song.artist,
      albumArtUrl: s.recommendation.song.albumArtUrl,
      average: s.average,
      ratingCount: s.ratings.length,
    }));
}

/**
 * The user's place among one week's sharers, by average received (mean of their rated songs' averages), compared
 * as shown (1 decimal) so equal values share a rank, the same as the history's "Your week" (D31). Null if none of
 * the user's songs that week were rated.
 */
export function weekRank(
  data: StatsData,
  roundId: string,
  userId: string,
): { position: number; of: number } | null {
  const bySharer = new Map<string, number[]>();
  for (const song of data.songs) {
    if (song.recommendation.roundId !== roundId || song.average === null) continue;
    const id = song.recommendation.userId;
    bySharer.set(id, [...(bySharer.get(id) ?? []), song.average]);
  }
  const shown = new Map(
    [...bySharer].map(([id, averages]) => [id, shownValueKey(mean(averages) as number, 1)]),
  );
  const mine = shown.get(userId);
  if (mine === undefined) return null;
  return { position: [...shown.values()].filter((v) => v > mine).length + 1, of: shown.size };
}

// ---------------------------------------------------------------------------
// Group extras (spec §19, P13.11)
// ---------------------------------------------------------------------------

/** Mean of every valid rating (1 rating). */
export function groupAverage(data: StatsData): Stat<number> {
  if (data.votes.length < MINIMUMS.groupAverageRatings) {
    return notEnough(data.votes.length, MINIMUMS.groupAverageRatings);
  }
  return { status: 'ok', value: data.partyAverageGiven as number, sampleSize: data.votes.length };
}

/** How many of each rating (0–10) the whole party gave. Index 0 = number of 0s. */
export function groupRatingDistribution(data: StatsData): Stat<number[]> {
  if (data.votes.length === 0) return notEnough(0, 1);
  const distribution = new Array<number>(MAX_RATING - MIN_RATING + 1).fill(0);
  for (const vote of data.votes) {
    distribution[vote.rating - MIN_RATING] = (distribution[vote.rating - MIN_RATING] ?? 0) + 1;
  }
  return { status: 'ok', value: distribution, sampleSize: data.votes.length };
}

/** Artists shared most (spelling-insensitive), top 3; everyone tied with 3rd place is shown too. */
export function topArtists(data: StatsData): Stat<ArtistCount[]> {
  const counts = artistCounts(data.songs.map((s) => s.recommendation.song));
  if (counts.length === 0) return notEnough(0, 1);
  const third = counts[Math.min(2, counts.length - 1)]?.songs ?? 0;
  return {
    status: 'ok',
    value: counts.filter((c) => c.songs >= third).map((c) => ({ artist: c.artist, songCount: c.songs })),
    sampleSize: data.songs.length,
  };
}

function activityPoint(period: string, weeks: number, songs: SongData[], votes: Vote[]): ActivityPoint {
  return {
    period,
    weeks,
    songs: songs.length,
    ratings: votes.length,
    average: mean(votes.map((v) => v.rating)),
  };
}

/** Songs, ratings and average per closed week, newest first (last 12). */
export function weeklyActivity(
  data: StatsData,
  closedRounds: Pick<Round, 'roundId' | 'weekStart'>[],
): ActivityPoint[] {
  return [...closedRounds]
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .slice(0, ACTIVITY_PERIODS)
    .map((r) =>
      activityPoint(
        r.weekStart,
        1,
        data.songs.filter((s) => s.recommendation.roundId === r.roundId),
        data.votes.filter((v) => v.roundId === r.roundId),
      ),
    );
}

/** The same per calendar month of the lock day (party timezone), newest first (last 12). */
export function monthlyActivity(
  data: StatsData,
  closedRounds: Pick<Round, 'roundId' | 'endsAt'>[],
  timeZone: string,
): ActivityPoint[] {
  const roundsByMonth = new Map<string, Set<string>>();
  for (const r of closedRounds) {
    const month = lockMonth(r.endsAt, timeZone);
    roundsByMonth.set(month, (roundsByMonth.get(month) ?? new Set()).add(r.roundId));
  }
  return [...roundsByMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, ACTIVITY_PERIODS)
    .map(([month, ids]) =>
      activityPoint(
        month,
        ids.size,
        data.songs.filter((s) => ids.has(s.recommendation.roundId)),
        data.votes.filter((v) => ids.has(v.roundId)),
      ),
    );
}
