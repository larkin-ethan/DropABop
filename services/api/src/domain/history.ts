// The history calendar's numbers (P13.8, D31; docs/STATISTICS.md → History). Pure functions: the handler loads the
// party's weeks, songs and ratings, and this works out one month. Ratings count only for weeks whose ratings have
// locked (D9); open weeks show how many songs were shared and nothing more.

import type {
  HistoryDay,
  HistoryDayStats,
  HistorySong,
  HistoryWeek,
  HistoryWeekSummary,
  HistoryYourWeek,
  Recommendation,
  Round,
  RoundStatus,
  Vote,
  Weekday,
} from '@dropabop/shared';
import { MAX_RATING, MIN_RATING, WEEKDAYS, shareDaysOf } from '@dropabop/shared';
import { calculateWeekResults, countableVotes, roundToOneDecimal } from './results';
import { mean, populationStdDev } from './stats';

/** Minimum ratings for "lowest rated" (same as the stats table's song minimum). */
const LOWEST_RATED_MIN_RATINGS = 3;
/** Minimum ratings for spread-based picks (most divisive, most agreeable), as in docs/STATISTICS.md. */
const SPREAD_MIN_RATINGS = 4;
/** A day needs this many songs with enough ratings to be "most agreeable". */
const AGREEABLE_MIN_SONGS = 2;
/** A favourite artist of the day needs this many songs that day (D31). */
const FAVORITE_ARTIST_MIN_SONGS = 2;
const TOP_ARTISTS = 3;

export interface HistoryInput {
  /** "YYYY-MM". */
  month: string;
  viewerId: string;
  /** Every week of the party, each with its status worked out from the server clock. */
  rounds: { round: Round; status: RoundStatus }[];
  recommendations: Recommendation[];
  votes: Vote[];
}

// ---------------------------------------------------------------------------------------------------------------
// Dates (plain YYYY-MM-DD strings; days follow each week's own timezone, decided when songs were shared)
// ---------------------------------------------------------------------------------------------------------------

/** "2026-10-05" + 3 → "2026-10-08". */
export function addDays(isoDate: string, days: number): string {
  const [year = 1970, month = 1, day = 1] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** First and last date of a month ("2026-10" → 2026-10-01 … 2026-10-31). */
export function monthRange(month: string): { first: string; last: string } {
  const [year = 1970, monthNumber = 1] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10); // day 0 = last of previous
  return { first, last };
}

/** The date of a weekday inside a week that starts on Monday `weekStart`. */
export function dateOfWeekday(weekStart: string, weekday: Weekday): string {
  return addDays(weekStart, WEEKDAYS.indexOf(weekday));
}

function weekOverlapsMonth(weekStart: string, range: { first: string; last: string }): boolean {
  return weekStart <= range.last && addDays(weekStart, 6) >= range.first;
}

// ---------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------

/**
 * Everything tied for the best value (ties are joint winners, PRODUCT_DECISIONS). Values are compared to 2
 * decimals, so tiny floating-point differences don't break a real tie.
 */
function allTiedFor<T>(items: { item: T; value: number }[], best: 'lowest' | 'highest'): T[] {
  if (items.length === 0) return [];
  const keys = items.map(({ value }) => Math.round(value * 100));
  const target = best === 'lowest' ? Math.min(...keys) : Math.max(...keys);
  return items.filter((_, index) => keys[index] === target).map(({ item }) => item);
}

function rounded(value: number | null): number | null {
  return value === null ? null : roundToOneDecimal(value);
}

function emptyDistribution(): number[] {
  return new Array<number>(MAX_RATING - MIN_RATING + 1).fill(0);
}

function addToDistribution(distribution: number[], ratings: number[]): void {
  for (const rating of ratings) {
    const index = rating - MIN_RATING;
    distribution[index] = (distribution[index] ?? 0) + 1;
  }
}

/** Competition ranks (1, 1, 3) on values already rounded for display, highest first. */
function competitionRank(values: number[], value: number): number {
  return values.filter((v) => v > value).length + 1;
}

/** Artists grouped case-insensitively, keeping the first spelling seen, with how many songs each has. */
function artistCounts(songs: { artist: string }[]): { artist: string; songs: number }[] {
  const byKey = new Map<string, { artist: string; songs: number }>();
  for (const song of songs) {
    const key = song.artist.trim().toLowerCase();
    const entry = byKey.get(key) ?? { artist: song.artist.trim(), songs: 0 };
    entry.songs += 1;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => b.songs - a.songs || a.artist.localeCompare(b.artist));
}

// ---------------------------------------------------------------------------------------------------------------
// One closed week, worked out once
// ---------------------------------------------------------------------------------------------------------------

interface ClosedWeekData {
  songs: HistorySong[];
  /** Valid ratings per song (no self-ratings, none after the lock). */
  ratingsBySong: Map<string, number[]>;
  /** Exact (unrounded) averages per song, for averages of averages. */
  exactAverage: Map<string, number | null>;
  recommendations: Recommendation[];
  myVotes: Vote[];
}

function closedWeekData(round: Round, recommendations: Recommendation[], votes: Vote[], viewerId: string) {
  const results = calculateWeekResults({
    round,
    recommendations,
    votes,
    viewerId,
    settings: { showWhoRatedWhat: false }, // the history never shows who rated what
  });
  const recommenderById = new Map(recommendations.map((r) => [r.recommendationId, r.userId]));
  const valid = countableVotes(votes, round).filter((v) => {
    const recommender = recommenderById.get(v.recommendationId);
    return recommender !== undefined && recommender !== v.userId; // never a self-rating (D6)
  });
  const ratingsBySong = new Map<string, number[]>();
  for (const vote of valid) {
    ratingsBySong.set(vote.recommendationId, [
      ...(ratingsBySong.get(vote.recommendationId) ?? []),
      vote.rating,
    ]);
  }
  const songs: HistorySong[] = results.songs.map((s) => ({
    recommendationId: s.recommendationId,
    title: s.song.title,
    artist: s.song.artist,
    albumArtUrl: s.song.albumArtUrl,
    average: s.averageRating,
    ratingCount: s.ratingCount,
    rank: s.rank,
    myRating: s.myRating,
    recommendedBy: s.recommendedBy,
    isMine: s.recommendedBy === viewerId,
  }));
  const exactAverage = new Map(
    recommendations.map((r) => [r.recommendationId, mean(ratingsBySong.get(r.recommendationId) ?? [])]),
  );
  const data: ClosedWeekData = {
    songs,
    ratingsBySong,
    exactAverage,
    recommendations,
    myVotes: valid.filter((v) => v.userId === viewerId),
  };
  return data;
}

function dayStats(week: ClosedWeekData, date: string): HistoryDayStats {
  const recsThatDay = week.recommendations.filter((r) => r.submittedOn === date);
  const ids = new Set(recsThatDay.map((r) => r.recommendationId));
  const songs = week.songs.filter((s) => ids.has(s.recommendationId)); // already best first
  const ratings = recsThatDay.flatMap((r) => week.ratingsBySong.get(r.recommendationId) ?? []);
  const distribution = emptyDistribution();
  addToDistribution(distribution, ratings);

  const myRatings = week.myVotes.filter((v) => ids.has(v.recommendationId)).map((v) => v.rating);
  const myAverages = songs
    .filter((s) => s.isMine)
    .map((s) => week.exactAverage.get(s.recommendationId) ?? null)
    .filter((a): a is number => a !== null);

  const topAverage = songs[0]?.average ?? null;
  const lowestCandidates = songs.filter(
    (s) => s.average !== null && s.ratingCount >= LOWEST_RATED_MIN_RATINGS,
  );
  const lowest = allTiedFor(
    lowestCandidates.map((s) => ({ item: s, value: s.average ?? 0 })),
    'lowest',
  );

  return {
    songs,
    ratingCount: ratings.length,
    groupAverage: rounded(mean(ratings)),
    myAverageGiven: rounded(mean(myRatings)),
    myAverageReceived: rounded(mean(myAverages)),
    bopOfTheDay:
      topAverage === null ? [] : songs.filter((s) => s.average === topAverage).map((s) => s.recommendationId),
    // Not when the lowest is also the top (one song, or everything tied).
    lowestRated: lowest.some((s) => s.average === topAverage) ? [] : lowest.map((s) => s.recommendationId),
    myRatingCount: myRatings.length,
    distribution,
    favoriteArtists: artistCounts(songs)
      .filter((a) => a.songs >= FAVORITE_ARTIST_MIN_SONGS)
      .map((a) => a.artist),
  };
}

function weekSummary(week: ClosedWeekData, dates: string[]): HistoryWeekSummary {
  const allRatings = [...week.ratingsBySong.values()].flat();
  const distribution = emptyDistribution();
  addToDistribution(distribution, allRatings);

  const counts = artistCounts(week.songs);
  const cutoff = counts[TOP_ARTISTS - 1]?.songs ?? 0;
  const topArtists = counts.filter((a, index) => index < TOP_ARTISTS || a.songs === cutoff);

  // Spread of each song with enough ratings.
  const spread = new Map<string, number>();
  for (const [id, ratings] of week.ratingsBySong) {
    const value = ratings.length >= SPREAD_MIN_RATINGS ? populationStdDev(ratings) : null;
    if (value !== null) spread.set(id, value);
  }

  const daySpreads: { item: string; value: number }[] = [];
  for (const date of dates) {
    const spreads = week.recommendations
      .filter((r) => r.submittedOn === date)
      .map((r) => spread.get(r.recommendationId))
      .filter((s): s is number => s !== undefined);
    const average = spreads.length >= AGREEABLE_MIN_SONGS ? mean(spreads) : null;
    if (average !== null) daySpreads.push({ item: date, value: average });
  }
  const songSpreads = week.songs.flatMap((song) => {
    const value = spread.get(song.recommendationId);
    return value === undefined ? [] : [{ item: song.recommendationId, value }];
  });

  return {
    songCount: week.songs.length,
    ratingCount: allRatings.length,
    averageRating: rounded(mean(allRatings)),
    bestSongs: week.songs.filter((s) => s.rank === 1 && s.average !== null).map((s) => s.recommendationId),
    topArtists,
    mostAgreeableDays: allTiedFor(daySpreads, 'lowest'),
    mostDivisive: allTiedFor(songSpreads, 'highest'),
    distribution,
  };
}

function yourWeek(week: ClosedWeekData, viewerId: string): HistoryYourWeek {
  // Each sharer's average received: the mean of their rated songs' exact averages.
  const bySharer = new Map<string, number[]>();
  for (const rec of week.recommendations) {
    const average = week.exactAverage.get(rec.recommendationId) ?? null;
    if (average !== null) bySharer.set(rec.userId, [...(bySharer.get(rec.userId) ?? []), average]);
  }
  const shown = new Map([...bySharer].map(([userId, averages]) => [userId, rounded(mean(averages)) ?? 0]));
  const mine = shown.get(viewerId);
  const myBest = week.songs.find((s) => s.isMine && s.average !== null) ?? null; // best first

  return {
    songsRated: week.myVotes.length,
    averageGiven: rounded(mean(week.myVotes.map((v) => v.rating))),
    averageReceived: mine ?? null,
    topSong: myBest?.recommendationId ?? null,
    rank:
      mine === undefined ? null : { position: competitionRank([...shown.values()], mine), of: shown.size },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The month
// ---------------------------------------------------------------------------------------------------------------

/**
 * Days where one of the viewer's songs got their best-ever song average (closed weeks only), for the calendar's ★.
 * Compares the averages as shown (1 decimal), so ties all count.
 */
export function personalBestDates(closedWeeks: { round: Round; data: ClosedWeekData }[]): Set<string> {
  const mySongs = closedWeeks.flatMap(({ data }) => data.songs.filter((s) => s.isMine && s.average !== null));
  const best = Math.max(...mySongs.map((s) => s.average ?? -Infinity));
  const dates = new Set<string>();
  if (!Number.isFinite(best)) return dates;
  for (const { data } of closedWeeks) {
    for (const song of data.songs) {
      if (song.isMine && song.average === best) {
        const rec = data.recommendations.find((r) => r.recommendationId === song.recommendationId);
        if (rec !== undefined) dates.add(rec.submittedOn);
      }
    }
  }
  return dates;
}

export function buildHistoryMonth(input: HistoryInput): HistoryWeek[] {
  const range = monthRange(input.month);
  const recsByRound = new Map<string, Recommendation[]>();
  for (const rec of input.recommendations) {
    recsByRound.set(rec.roundId, [...(recsByRound.get(rec.roundId) ?? []), rec]);
  }
  const votesByRound = new Map<string, Vote[]>();
  for (const vote of input.votes) {
    votesByRound.set(vote.roundId, [...(votesByRound.get(vote.roundId) ?? []), vote]);
  }

  // Every closed week (not just this month's), because the ★ compares against your best ever.
  const closedWeeks = input.rounds
    .filter((r) => r.status === 'CLOSED')
    .map(({ round }) => ({
      round,
      data: closedWeekData(
        round,
        recsByRound.get(round.roundId) ?? [],
        votesByRound.get(round.roundId) ?? [],
        input.viewerId,
      ),
    }));
  const closedById = new Map(closedWeeks.map((w) => [w.round.roundId, w.data]));
  const bestDates = personalBestDates(closedWeeks);

  return input.rounds
    .filter(({ round }) => weekOverlapsMonth(round.weekStart, range))
    .sort((a, b) => a.round.weekStart.localeCompare(b.round.weekStart))
    .map(({ round, status }) => {
      const recs = recsByRound.get(round.roundId) ?? [];
      const closed = status === 'CLOSED' ? (closedById.get(round.roundId) ?? null) : null;
      const dates = shareDaysOf(round).map((weekday) => dateOfWeekday(round.weekStart, weekday));
      const days: HistoryDay[] = shareDaysOf(round).map((weekday, index) => {
        const date = dates[index] ?? dateOfWeekday(round.weekStart, weekday);
        const thatDay = recs.filter((r) => r.submittedOn === date);
        return {
          date,
          weekday,
          songCount: thatDay.length,
          iShared: thatDay.some((r) => r.userId === input.viewerId),
          personalBest: closed !== null && bestDates.has(date),
          stats: closed === null ? null : dayStats(closed, date),
        };
      });
      return {
        roundId: round.roundId,
        weekStart: round.weekStart,
        endsAt: round.endsAt,
        status,
        days,
        summary: closed === null ? null : weekSummary(closed, dates),
        yourWeek: closed === null ? null : yourWeek(closed, input.viewerId),
      };
    });
}
