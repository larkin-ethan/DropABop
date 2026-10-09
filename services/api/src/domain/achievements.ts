// Achievements (P13.9, D28; docs/STATISTICS.md → Achievements). Pure functions, worked out on request from closed weeks
// only (D9), never stored as awards: nothing to duplicate, nothing the browser can fake. Each achievement records the
// lock date of the first closed week that earned it, and stays unlocked after that.
//
// How it works: closed weeks are replayed in order. After each one, every achievement is checked against everything
// up to and including that week; the first week where it's met is its unlock date.

import type {
  Achievement,
  AchievementGroup,
  Recommendation,
  Round,
  RoundStatus,
  Vote,
} from '@dropabop/shared';
import { shareDaysOf } from '@dropabop/shared';
import { calculateWeekResults } from './results';
import { buildStatsData, crowdFavorite, mostDivisive, type StatsData } from './stats';

// ---------------------------------------------------------------------------------------------------------------
// Facts about one closed week, from the viewer's point of view
// ---------------------------------------------------------------------------------------------------------------

interface WeekFacts {
  endsAt: string;
  /** The day ratings locked, in the week's own timezone (D31), e.g. "2026-10-04" for a Sunday-night lock. */
  lockDay: string;
  /** Shared at least one song or rated at least one song that week (D28 "took part"). */
  tookPart: boolean;
  /** Had the week's #1 song (ties count). */
  topBop: boolean;
  crowdFavorite: boolean;
  /** A song averaged 10.0 with at least 3 ratings. */
  perfectScore: boolean;
  mostDivisive: boolean;
  /** Everyone who rated that week (except you) rated your song, average ≥ 8.0, at least 3 ratings. */
  groupFavorite: boolean;
  /** Shared on every sharing day of the week. */
  weeklyRegular: boolean;
  /** Rated every song you didn't share, and there were at least 5. */
  fullHouse: boolean;
}

const PERFECT_MIN_RATINGS = 3;
const GROUP_FAVORITE_MIN_RATINGS = 3;
const GROUP_FAVORITE_MIN_AVERAGE = 8;
const FULL_HOUSE_MIN_SONGS = 5;

/** The calendar day of a moment in a timezone ("en-CA" formats dates as YYYY-MM-DD). */
export function dayIn(moment: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(moment);
}

function weekFacts(
  round: Round,
  recs: Recommendation[],
  votes: Vote[],
  userId: string,
): { facts: WeekFacts; week: StatsData } {
  const week = buildStatsData(recs, votes, [round]); // valid ratings only (no self, none after the lock)
  const mySongs = week.songs.filter((s) => s.recommendation.userId === userId);
  const myIds = new Set(mySongs.map((s) => s.recommendation.recommendationId));
  const myVotes = week.votes.filter((v) => v.userId === userId);

  const results = calculateWeekResults({
    round,
    recommendations: recs,
    votes,
    viewerId: userId,
    settings: { showWhoRatedWhat: false },
  });
  const winners = (result: ReturnType<typeof crowdFavorite>) =>
    result.status === 'ok' && result.value.some((w) => myIds.has(w.id));

  const othersSongs = week.songs.filter((s) => s.recommendation.userId !== userId);
  const ratedByMe = new Set(myVotes.map((v) => v.recommendationId));
  const myDays = new Set(mySongs.map((s) => s.recommendation.submittedOn));

  const facts: WeekFacts = {
    endsAt: round.endsAt,
    // endsAt is the start of the minute after the lock (e.g. Monday 00:00), so the lock day is a minute earlier.
    lockDay: dayIn(new Date(new Date(round.endsAt).getTime() - 60_000), round.timezone),
    tookPart: mySongs.length > 0 || myVotes.length > 0,
    topBop: results.songs.some(
      (s) => s.rank === 1 && s.averageRating !== null && myIds.has(s.recommendationId),
    ),
    crowdFavorite: winners(crowdFavorite(week)),
    perfectScore: mySongs.some((s) => s.ratings.length >= PERFECT_MIN_RATINGS && s.average === 10),
    mostDivisive: winners(mostDivisive(week)),
    groupFavorite: mySongs.some(
      (s) =>
        s.ratings.length >= GROUP_FAVORITE_MIN_RATINGS &&
        s.ratings.length === s.activeRatersInWeek &&
        (s.average ?? 0) >= GROUP_FAVORITE_MIN_AVERAGE,
    ),
    weeklyRegular: myDays.size >= shareDaysOf(round).length,
    fullHouse:
      othersSongs.length >= FULL_HOUSE_MIN_SONGS &&
      othersSongs.every((s) => ratedByMe.has(s.recommendation.recommendationId)),
  };
  return { facts, week };
}

// ---------------------------------------------------------------------------------------------------------------
// The achievements (D28)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Running totals up to one point in time (every closed week so far). Kept as totals rather than rebuilt for each
 * week, so working out a year or two of history stays fast (spec review, P13.9).
 */
interface Progress {
  mySongs: number;
  /** Distinct artists / genres of your songs (lower-cased, trimmed). */
  artists: Set<string>;
  genres: Set<string>;
  myRatings: number;
  myRatingSum: number;
  gave10: boolean;
  gave1: boolean;
  /** Every valid rating in the party so far, for "compared with the group". */
  partyRatings: number;
  partyRatingSum: number;
  /** Per other person: total rating gap and how many songs you both rated. */
  gaps: Map<string, { sum: number; count: number }>;
  weeks: WeekFacts[];
}

function emptyProgress(): Progress {
  return {
    mySongs: 0,
    artists: new Set(),
    genres: new Set(),
    myRatings: 0,
    myRatingSum: 0,
    gave10: false,
    gave1: false,
    partyRatings: 0,
    partyRatingSum: 0,
    gaps: new Map(),
    weeks: [],
  };
}

/** Adds one closed week to the running totals. */
function addWeek(p: Progress, week: StatsData, facts: WeekFacts, userId: string): void {
  for (const song of week.songs) {
    if (song.recommendation.userId !== userId) continue;
    p.mySongs += 1;
    const artist = song.recommendation.song.artist.trim().toLowerCase();
    if (artist !== '') p.artists.add(artist);
    const genre = song.recommendation.song.genre?.trim().toLowerCase() ?? '';
    if (genre !== '') p.genres.add(genre);
  }
  const mine = new Map<string, number>();
  for (const vote of week.votes) {
    p.partyRatings += 1;
    p.partyRatingSum += vote.rating;
    if (vote.userId !== userId) continue;
    mine.set(vote.recommendationId, vote.rating);
    p.myRatings += 1;
    p.myRatingSum += vote.rating;
    if (vote.rating === 10) p.gave10 = true;
    if (vote.rating === 1) p.gave1 = true;
  }
  // Songs are rated within their own week, so each week's shared songs can be added on their own.
  for (const vote of week.votes) {
    const myRating = mine.get(vote.recommendationId);
    if (vote.userId === userId || myRating === undefined) continue;
    const gap = p.gaps.get(vote.userId) ?? { sum: 0, count: 0 };
    gap.sum += Math.abs(myRating - vote.rating);
    gap.count += 1;
    p.gaps.set(vote.userId, gap);
  }
  p.weeks.push(facts);
}

function myAverage(p: Progress): number {
  return p.myRatingSum / p.myRatings;
}

function partyAverage(p: Progress): number | null {
  return p.partyRatings === 0 ? null : p.partyRatingSum / p.partyRatings;
}

interface Check {
  met: boolean;
  current: number;
  target: number;
  label: string;
}

interface Definition {
  id: string;
  group: AchievementGroup;
  emoji: string;
  title: string;
  description: string;
  check: (p: Progress) => Check;
}

function count(current: number, target: number, unit: string): Check {
  return {
    met: current >= target,
    current: Math.min(current, target),
    target,
    label: `${Math.min(current, target)} of ${target} ${unit}`,
  };
}

function yesNo(met: boolean): Check {
  return { met, current: met ? 1 : 0, target: 1, label: met ? 'Done' : 'Not yet' };
}

/** The longest run of consecutive closed weeks matching `test` (pauses and weeks without results don't break it). */
function longestRun(weeks: WeekFacts[], test: (w: WeekFacts) => boolean): number {
  let best = 0;
  let run = 0;
  for (const week of weeks) {
    run = test(week) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * Your generosity (average given minus the party's), once you have enough ratings. Like every stat, it's compared as
 * shown (1 decimal place): +0.96 shows as +1.0 and counts.
 */
function generosityCheck(p: Progress, direction: 'generous' | 'tough'): Check {
  const needed = 10;
  const group = partyAverage(p);
  if (p.myRatings < needed || group === null) return count(p.myRatings, needed, 'ratings');
  const shown = Math.round((myAverage(p) - group) * 10) / 10;
  const met = direction === 'generous' ? shown >= 1 : shown <= -1;
  const toward = direction === 'generous' ? Math.max(0, shown) : Math.max(0, -shown);
  const signed = `${shown > 0 ? '+' : ''}${shown.toFixed(1)}`;
  return {
    met,
    current: Math.min(toward, 1),
    target: 1,
    label: `${signed} compared with the group (needs ${direction === 'generous' ? '+1.0' : '−1.0'})`,
  };
}

/** The closest rating gap (as shown) to anyone on at least `minShared` songs you both rated. */
function twinCheck(p: Progress, maxGap: number, minShared: number): Check {
  const all = [...p.gaps.values()];
  const qualifying = all.filter((g) => g.count >= minShared).map((g) => g.sum / g.count);
  if (qualifying.length === 0) {
    const mostShared = Math.max(0, ...all.map((g) => g.count));
    return count(mostShared, minShared, 'songs rated in common with someone');
  }
  const closest = Math.round(Math.min(...qualifying) * 10) / 10;
  return {
    met: closest <= maxGap,
    current: closest <= maxGap ? 1 : 0,
    target: 1,
    label: `Closest match: ${closest.toFixed(1)} points apart (needs ${maxGap.toFixed(1)} or less)`,
  };
}

export const ACHIEVEMENTS: Definition[] = [
  // Participation
  {
    id: 'first-drop',
    group: 'participation',
    emoji: '🎵',
    title: 'First Drop',
    description: 'Share your first song.',
    check: (p) => count(p.mySongs, 1, 'songs'),
  },
  {
    id: 'first-rating',
    group: 'participation',
    emoji: '⭐',
    title: 'First Rating',
    description: 'Rate your first song.',
    check: (p) => count(p.myRatings, 1, 'ratings'),
  },
  {
    id: 'weeks-10',
    group: 'participation',
    emoji: '📅',
    title: '10 Weeks',
    description: 'Take part in 10 weeks.',
    check: (p) => count(p.weeks.filter((w) => w.tookPart).length, 10, 'weeks'),
  },
  {
    id: 'weeks-50',
    group: 'participation',
    emoji: '🗓️',
    title: '50 Weeks',
    description: 'Take part in 50 weeks.',
    check: (p) => count(p.weeks.filter((w) => w.tookPart).length, 50, 'weeks'),
  },
  {
    id: 'weeks-100',
    group: 'participation',
    emoji: '💯',
    title: '100 Weeks',
    description: 'Take part in 100 weeks.',
    check: (p) => count(p.weeks.filter((w) => w.tookPart).length, 100, 'weeks'),
  },
  // Discovery
  {
    id: 'artists-10',
    group: 'discovery',
    emoji: '🧭',
    title: '10 Artists',
    description: 'Share songs by 10 different artists.',
    check: (p) => count(p.artists.size, 10, 'artists'),
  },
  {
    id: 'artists-25',
    group: 'discovery',
    emoji: '🗺️',
    title: '25 Artists',
    description: 'Share songs by 25 different artists.',
    check: (p) => count(p.artists.size, 25, 'artists'),
  },
  {
    id: 'genre-explorer',
    group: 'discovery',
    emoji: '🎨',
    title: 'Genre Explorer',
    description: 'Share songs from 5 different genres.',
    check: (p) => count(p.genres.size, 5, 'genres'),
  },
  {
    id: 'genres-10',
    group: 'discovery',
    emoji: '🌈',
    title: '10 Genres',
    description: 'Share songs from 10 different genres.',
    check: (p) => count(p.genres.size, 10, 'genres'),
  },
  // Rating
  {
    id: 'first-10',
    group: 'rating',
    emoji: '🔟',
    title: 'First 10',
    description: 'Give a song a 10.',
    check: (p) => yesNo(p.gave10),
  },
  {
    id: 'first-1',
    group: 'rating',
    emoji: '1️⃣',
    title: 'First 1',
    description: 'Give a song a 1.',
    check: (p) => yesNo(p.gave1),
  },
  {
    id: 'generous-voter',
    group: 'rating',
    emoji: '💝',
    title: 'Generous Voter',
    description: 'Rate at least 1 point above the group on average (10 ratings or more).',
    check: (p) => generosityCheck(p, 'generous'),
  },
  {
    id: 'tough-critic',
    group: 'rating',
    emoji: '🧐',
    title: 'Tough Critic',
    description: 'Rate at least 1 point below the group on average (10 ratings or more).',
    check: (p) => generosityCheck(p, 'tough'),
  },
  {
    id: 'balanced-judge',
    group: 'rating',
    emoji: '⚖️',
    title: 'Balanced Judge',
    description: 'Rate within 0.3 points of the group on average (20 ratings or more).',
    check: (p) => {
      const group = partyAverage(p);
      if (p.myRatings < 20 || group === null) return count(p.myRatings, 20, 'ratings');
      const gap = Math.round(Math.abs(myAverage(p) - group) * 10) / 10;
      return {
        met: gap <= 0.3,
        current: gap <= 0.3 ? 1 : 0,
        target: 1,
        label: `${gap.toFixed(1)} from the group (needs 0.3 or less)`,
      };
    },
  },
  // Song success
  {
    id: 'top-bop',
    group: 'songSuccess',
    emoji: '🏆',
    title: 'Top Bop',
    description: 'Have the #1 song of a week.',
    check: (p) => yesNo(p.weeks.some((w) => w.topBop)),
  },
  {
    id: 'crowd-favorite',
    group: 'songSuccess',
    emoji: '🙌',
    title: 'Crowd Favorite',
    description: 'Have a week’s crowd favorite: the best average among songs most people rated.',
    check: (p) => yesNo(p.weeks.some((w) => w.crowdFavorite)),
  },
  {
    id: 'perfect-score',
    group: 'songSuccess',
    emoji: '💎',
    title: 'Perfect Score',
    description: 'Have a song average 10.0 (3 ratings or more).',
    check: (p) => yesNo(p.weeks.some((w) => w.perfectScore)),
  },
  {
    id: 'back-to-back',
    group: 'songSuccess',
    emoji: '🔁',
    title: 'Back-to-Back',
    description: 'Have the #1 song two weeks in a row.',
    check: (p) =>
      count(
        longestRun(p.weeks, (w) => w.topBop),
        2,
        'weeks in a row',
      ),
  },
  // Social
  {
    id: 'musical-twin',
    group: 'social',
    emoji: '👯',
    title: 'Musical Twin',
    description: 'Rate within 1.0 point of someone on 5 songs you both rated.',
    check: (p) => twinCheck(p, 1, 5),
  },
  {
    id: 'most-compatible',
    group: 'social',
    emoji: '🤝',
    title: 'Most Compatible',
    description: 'Rate within 0.5 points of someone on 10 songs you both rated.',
    check: (p) => twinCheck(p, 0.5, 10),
  },
  {
    id: 'most-divisive',
    group: 'social',
    emoji: '⚡',
    title: 'Most Divisive',
    description: 'Have the song that split a week’s ratings the most (4 ratings or more).',
    check: (p) => yesNo(p.weeks.some((w) => w.mostDivisive)),
  },
  {
    id: 'group-favorite',
    group: 'social',
    emoji: '❤️',
    title: 'Group Favorite',
    description: 'Have a song everyone rated that week, averaging 8.0 or more.',
    check: (p) => yesNo(p.weeks.some((w) => w.groupFavorite)),
  },
  // Consistency (weeks, never daily streaks: D28)
  {
    id: 'weekly-regular',
    group: 'consistency',
    emoji: '📆',
    title: 'Weekly Regular',
    description: 'Share a song on every sharing day of a week.',
    check: (p) => yesNo(p.weeks.some((w) => w.weeklyRegular)),
  },
  {
    id: 'full-house',
    group: 'consistency',
    emoji: '🏠',
    title: 'Full House',
    description: 'Rate every song of a week (at least 5).',
    check: (p) => yesNo(p.weeks.some((w) => w.fullHouse)),
  },
  {
    id: 'monthly-regular',
    group: 'consistency',
    emoji: '🔥',
    title: 'Monthly Regular',
    description: 'Take part in 4 weeks in a row.',
    check: (p) =>
      count(
        longestRun(p.weeks, (w) => w.tookPart),
        4,
        'weeks in a row',
      ),
  },
  {
    id: 'season-regular',
    group: 'consistency',
    emoji: '🌟',
    title: 'Season Regular',
    description: 'Take part in 12 weeks in a row.',
    check: (p) =>
      count(
        longestRun(p.weeks, (w) => w.tookPart),
        12,
        'weeks in a row',
      ),
  },
];

// ---------------------------------------------------------------------------------------------------------------
// Working them out
// ---------------------------------------------------------------------------------------------------------------

export interface AchievementsInput {
  /** Whose achievements to work out (the handler decides, from the token or a checked party member). */
  memberId: string;
  /** Every week of the party, with its status from the server clock. Only CLOSED weeks count. */
  rounds: { round: Round; status: RoundStatus }[];
  recommendations: Recommendation[];
  votes: Vote[];
}

export function computeAchievements(input: AchievementsInput): Achievement[] {
  const closed = input.rounds
    .filter((r) => r.status === 'CLOSED')
    .map((r) => r.round)
    .sort((a, b) => a.endsAt.localeCompare(b.endsAt));

  // Each week's songs and ratings, grouped once.
  const recsByRound = new Map<string, Recommendation[]>();
  for (const rec of input.recommendations) {
    const list = recsByRound.get(rec.roundId) ?? [];
    list.push(rec);
    recsByRound.set(rec.roundId, list);
  }
  const votesByRound = new Map<string, Vote[]>();
  for (const vote of input.votes) {
    const list = votesByRound.get(vote.roundId) ?? [];
    list.push(vote);
    votesByRound.set(vote.roundId, list);
  }

  // Replay week by week, remembering when (and on which day) each achievement was first met.
  const unlocked = new Map<string, WeekFacts>();
  const progress = emptyProgress();
  for (const round of closed) {
    const { facts, week } = weekFacts(
      round,
      recsByRound.get(round.roundId) ?? [],
      votesByRound.get(round.roundId) ?? [],
      input.memberId,
    );
    addWeek(progress, week, facts, input.memberId);
    for (const def of ACHIEVEMENTS) {
      if (!unlocked.has(def.id) && def.check(progress).met) unlocked.set(def.id, facts);
    }
  }

  return ACHIEVEMENTS.map((def) => {
    const week = unlocked.get(def.id) ?? null;
    const now = def.check(progress);
    return {
      id: def.id,
      group: def.group,
      title: def.title,
      description: def.description,
      emoji: def.emoji,
      unlocked: week !== null,
      unlockedOn: week?.endsAt ?? null,
      unlockedDay: week?.lockDay ?? null,
      // Once unlocked it stays unlocked, even if (say) your generosity later drifts back.
      progress:
        week === null
          ? { current: now.current, target: now.target, label: now.label }
          : { current: now.target, target: now.target, label: 'Unlocked' },
    };
  });
}

/** Unlocked after `seenAt` (for the "Achievement unlocked" banner). Nothing the first time (no `seenAt` yet). */
export function newlyUnlocked(achievements: Achievement[], seenAt: string | null): string[] {
  if (seenAt === null) return [];
  return achievements.filter((a) => a.unlockedOn !== null && a.unlockedOn > seenAt).map((a) => a.id);
}

/**
 * Achievements whose unlock date would show how someone rated a particular week's songs (D11): "gave a 1" in a week
 * where only one song got a 1 names the rater. For another member these show as unlocked, without a date.
 */
export const RATING_REVEALING = new Set(['first-1', 'first-10', 'full-house']);

/** The view of another member's achievements: dates hidden where they'd reveal ratings. */
export function forOtherMember(achievements: Achievement[]): Achievement[] {
  return achievements.map((a) =>
    RATING_REVEALING.has(a.id) ? { ...a, unlockedOn: null, unlockedDay: null } : a,
  );
}
