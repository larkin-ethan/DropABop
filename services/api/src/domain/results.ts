// Weekly results and what each person may see (spec §16; decisions D9–D12).
//
// Privacy is handled here, not in the handlers: fields a viewer isn't allowed to see are left out of
// the returned objects entirely (not set to null), so they can't leak into an API response by accident.

import type { PartySettings, Recommendation, Round, Song, Vote, Weekday } from '@sotd/shared';
import { MAX_RATING, MIN_RATING, SUBMISSION_WEEKDAYS } from '@sotd/shared';
import { MESSAGES, deny, type RuleResult } from './messages';
import { getEffectiveWeekStatus } from './week';

// ---------------------------------------------------------------------------
// During the week (D9, D10)
// ---------------------------------------------------------------------------

/** A song as shown while the week is open. Never includes other people's ratings or averages (D9). */
export interface OpenWeekSongView {
  recommendationId: string;
  weekday: Weekday;
  submittedOn: string;
  song: Song;
  /** True if the viewer shared this song (so the UI can say "Your pick" and hide the rating control). */
  isMine: boolean;
  /** Only present when the party reveals recommenders during the week (D10), or for your own song. */
  recommendedBy?: string;
  /** The viewer's own rating, if they've given one. */
  myRating: number | null;
}

export function toOpenWeekSongView(
  recommendation: Recommendation,
  viewerId: string,
  myVote: Vote | undefined,
  settings: Pick<PartySettings, 'revealRecommenderDuringVoting'>,
): OpenWeekSongView {
  const isMine = recommendation.userId === viewerId;
  const view: OpenWeekSongView = {
    recommendationId: recommendation.recommendationId,
    weekday: recommendation.weekday,
    submittedOn: recommendation.submittedOn,
    song: recommendation.song,
    isMine,
    myRating: myVote?.rating ?? null,
  };
  if (isMine || settings.revealRecommenderDuringVoting) {
    view.recommendedBy = recommendation.userId;
  }
  return view;
}

// ---------------------------------------------------------------------------
// After the week (D11, D12)
// ---------------------------------------------------------------------------

/** Results unlock only once the week has ended, and only if it had enough songs. */
export function canViewResults(
  round: Pick<Round, 'status' | 'endsAt'>,
  now: Date,
  songCount: number,
): RuleResult {
  const status = getEffectiveWeekStatus(round, now, songCount);
  if (status === 'OPEN') {
    return deny('RESULTS_NOT_READY', MESSAGES.RESULTS_NOT_READY);
  }
  if (status === 'NOT_ENOUGH_SONGS') {
    return deny('RESULTS_NOT_READY', MESSAGES.NO_RESULTS);
  }
  return { ok: true };
}

export interface SongResult {
  recommendationId: string;
  /** 1 = best. Songs with equal displayed averages share a rank (1, 1, 3). Unrated songs share last place. */
  rank: number;
  weekday: Weekday;
  submittedOn: string;
  song: Song;
  /** Revealed with the results (D10). */
  recommendedBy: string;
  /** Average rounded to 1 decimal place (D12), or null if nobody rated it. */
  averageRating: number | null;
  ratingCount: number;
  /** Count of each rating: index 0 = number of 1s … index 9 = number of 10s. Anonymous. */
  distribution: number[];
  myRating: number | null;
  /** Who gave which rating. Only present when the party setting `showWhoRatedWhat` is on (D11). */
  ratings?: { userId: string; rating: number }[];
}

export interface DayResult {
  weekday: Weekday;
  /** recommendationIds for that day, best first. Empty if nobody shared a song that day. */
  songIds: string[];
  /** The day's "Song of the Day": highest average among rated songs. Several if tied; empty if none rated. */
  winnerIds: string[];
}

export interface WeekResults {
  roundId: string;
  /** Every song from the week, best first. */
  songs: SongResult[];
  /** Monday to Friday, always all five, in order. */
  days: DayResult[];
  totalRatings: number;
}

export interface CalculateWeekResultsInput {
  round: Pick<Round, 'roundId'>;
  recommendations: Recommendation[];
  votes: Vote[];
  viewerId: string;
  settings: Pick<PartySettings, 'showWhoRatedWhat'>;
}

/** Rounds to 1 decimal place the way people expect (8.25 → 8.3). */
export function roundToOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

/**
 * Builds the week's results for one viewer. Call only after canViewResults() allows it.
 * Ratings on your own song (which the API never accepts) are ignored defensively (D6).
 */
export function calculateWeekResults(input: CalculateWeekResultsInput): WeekResults {
  const { recommendations, votes, viewerId, settings } = input;

  // Group valid ratings by song.
  const votesBySong = new Map<string, Vote[]>();
  const recommenderBySong = new Map(recommendations.map((r) => [r.recommendationId, r.userId]));
  for (const vote of votes) {
    const recommender = recommenderBySong.get(vote.recommendationId);
    if (recommender === undefined || recommender === vote.userId) {
      continue; // unknown song, or a self-rating
    }
    const list = votesBySong.get(vote.recommendationId) ?? [];
    list.push(vote);
    votesBySong.set(vote.recommendationId, list);
  }

  const unranked = recommendations.map((recommendation) => {
    const songVotes = votesBySong.get(recommendation.recommendationId) ?? [];
    const distribution = new Array<number>(MAX_RATING - MIN_RATING + 1).fill(0);
    let sum = 0;
    for (const vote of songVotes) {
      sum += vote.rating;
      const index = vote.rating - MIN_RATING;
      distribution[index] = (distribution[index] ?? 0) + 1;
    }
    const result: Omit<SongResult, 'rank'> = {
      recommendationId: recommendation.recommendationId,
      weekday: recommendation.weekday,
      submittedOn: recommendation.submittedOn,
      song: recommendation.song,
      recommendedBy: recommendation.userId,
      averageRating: songVotes.length > 0 ? roundToOneDecimal(sum / songVotes.length) : null,
      ratingCount: songVotes.length,
      distribution,
      myRating: songVotes.find((v) => v.userId === viewerId)?.rating ?? null,
    };
    if (settings.showWhoRatedWhat) {
      result.ratings = songVotes.map((v) => ({ userId: v.userId, rating: v.rating }));
    }
    return result;
  });

  const songs = assignRanks(unranked);

  const days: DayResult[] = SUBMISSION_WEEKDAYS.map((weekday) => {
    const daySongs = songs.filter((s) => s.weekday === weekday); // already best-first
    const topAverage = daySongs[0]?.averageRating ?? null;
    return {
      weekday,
      songIds: daySongs.map((s) => s.recommendationId),
      winnerIds:
        topAverage === null
          ? []
          : daySongs.filter((s) => s.averageRating === topAverage).map((s) => s.recommendationId),
    };
  });

  return {
    roundId: input.round.roundId,
    songs,
    days,
    totalRatings: songs.reduce((total, s) => total + s.ratingCount, 0),
  };
}

/**
 * Sorts best-first and gives "competition" ranks: equal averages share a rank and the next rank skips
 * (1, 1, 3). Unrated songs go last and share the rank after the last rated song. Ties keep a stable,
 * predictable order: earlier day first, then earlier submission.
 */
function assignRanks(results: Omit<SongResult, 'rank'>[]): SongResult[] {
  const sorted = [...results].sort((a, b) => {
    const aAvg = a.averageRating ?? -1;
    const bAvg = b.averageRating ?? -1;
    if (aAvg !== bAvg) {
      return bAvg - aAvg;
    }
    return a.submittedOn.localeCompare(b.submittedOn) || a.recommendationId.localeCompare(b.recommendationId);
  });

  const ranked: SongResult[] = [];
  sorted.forEach((result, index) => {
    const previous = ranked[index - 1];
    const rank =
      previous !== undefined && previous.averageRating === result.averageRating ? previous.rank : index + 1;
    ranked.push({ ...result, rank });
  });
  return ranked;
}
