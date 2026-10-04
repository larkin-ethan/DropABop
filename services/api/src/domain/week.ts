// Week and day rules (decisions D1–D5, ADR-0003, ADR-0004).
//
// Every party runs on weeks: Monday 00:00 to the following Monday 00:00 in the party's timezone.
// Members share one song per day Monday–Friday; anyone can rate the week's songs until the week ends.
//
// Everything here is derived from (timezone, current time). Nothing is scheduled. Handlers must use
// these functions instead of doing their own date maths or trusting a date sent by the client.
//
// Luxon is used because timezone + daylight-saving arithmetic is easy to get subtly wrong by hand,
// and its weeks start on Monday (ISO weeks), which is exactly our week.

import { DateTime } from 'luxon';
import type { IsoDate, IsoDateTime, Round, RoundStatus, Weekday } from '@dropabop/shared';
import { SUBMISSION_WEEKDAYS } from '@dropabop/shared';

/** A round needs at least this many songs to have results (D2). */
export const MIN_SONGS_FOR_RESULTS = 2;

export interface WeekWindow {
  /** The Monday that starts the week, in the party's timezone (YYYY-MM-DD). */
  weekStart: IsoDate;
  /** Monday 00:00 in the party's timezone, as a UTC ISO timestamp. */
  startsAt: IsoDateTime;
  /**
   * The following Monday 00:00 in the party's timezone (exclusive). The week is open while
   * now < endsAt, so ratings sent at Sunday 23:59:59.999 count and ones at Monday 00:00 don't.
   * The UI shows this to people as "Sunday 11:59 pm".
   */
  endsAt: IsoDateTime;
}

export interface SubmissionDay {
  weekday: Weekday;
  /** Today's date in the party's timezone (YYYY-MM-DD). */
  date: IsoDate;
  /** 1 for Monday … 5 for Friday ("Day 3 of 5"). */
  dayNumber: number;
}

/** Current time as seen in the party's timezone. Throws if the timezone is invalid (validated at input). */
function inZone(timezone: string, now: Date): DateTime {
  const local = DateTime.fromJSDate(now, { zone: timezone });
  if (!local.isValid) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }
  return local;
}

function toIsoDateTime(dateTime: DateTime): IsoDateTime {
  // toUTC() so stored timestamps always compare correctly as plain strings and Dates.
  const iso = dateTime.toUTC().toISO();
  if (iso === null) {
    throw new Error('Could not format date');
  }
  return iso;
}

function toIsoDate(dateTime: DateTime): IsoDate {
  const isoDate = dateTime.toISODate();
  if (isoDate === null) {
    throw new Error('Could not format date');
  }
  return isoDate;
}

/** The week that `now` falls in, for a party in `timezone`. */
export function getWeekWindow(timezone: string, now: Date): WeekWindow {
  const monday = inZone(timezone, now).startOf('week'); // Monday 00:00 local
  const nextMonday = monday.plus({ weeks: 1 }); // calendar-aware: DST weeks are 167 or 169 hours
  return {
    weekStart: toIsoDate(monday),
    startsAt: toIsoDateTime(monday),
    endsAt: toIsoDateTime(nextMonday),
  };
}

/**
 * Public id of a party's week. Deterministic, so the first request of the week can create the round
 * with a conditional put and concurrent requests agree on which round they mean (ADR-0003).
 * Uses "." because it's safe in URL paths (unlike "#").
 */
export function getRoundId(partyId: string, weekStart: IsoDate): string {
  return `${partyId}.${weekStart}`;
}

/**
 * Which submission day it is right now, or null on Saturday and Sunday (D1).
 * One song per member per returned `date`.
 *
 * Pass the current round's `timezone` (not the party's latest setting) so days don't shift mid-week.
 */
export function getSubmissionDay(timezone: string, now: Date): SubmissionDay | null {
  const local = inZone(timezone, now);
  // Luxon weekday: 1 = Monday … 7 = Sunday.
  const weekday = SUBMISSION_WEEKDAYS[local.weekday - 1];
  if (weekday === undefined) {
    return null; // weekend
  }
  return { weekday, date: toIsoDate(local), dayNumber: local.weekday };
}

/** True while ratings and (weekday) submissions are accepted for this round. */
export function isWeekOpen(round: Pick<Round, 'endsAt'>, now: Date): boolean {
  return now.getTime() < new Date(round.endsAt).getTime();
}

/**
 * The round's real status right now (ADR-0003). Always use this, never `round.status` directly:
 * the stored status may lag behind until some request records the close.
 *
 * `songCount` is the number of songs shared this week. It only matters once the week has ended:
 * fewer than 2 songs means "Not enough songs this week" (no results, excluded from stats).
 */
export function getEffectiveWeekStatus(
  round: Pick<Round, 'status' | 'endsAt'>,
  now: Date,
  songCount: number,
): RoundStatus {
  if (round.status !== 'OPEN') {
    return round.status; // already closed and recorded; final
  }
  if (isWeekOpen(round, now)) {
    return 'OPEN';
  }
  return songCount >= MIN_SONGS_FOR_RESULTS ? 'CLOSED' : 'NOT_ENOUGH_SONGS';
}

/**
 * If the stored status is out of date, the status that should be written (with a conditional
 * update on `status = OPEN`); otherwise null.
 */
export function getPendingStatusChange(
  round: Pick<Round, 'status' | 'endsAt'>,
  now: Date,
  songCount: number,
): RoundStatus | null {
  const effective = getEffectiveWeekStatus(round, now, songCount);
  return effective === round.status ? null : effective;
}

export type WeekPlan =
  /** This round is the current week (it's still open). */
  | { action: 'use'; round: Round }
  /** No open round: create this one with a conditional put (exactly one concurrent request wins). */
  | { action: 'create'; round: Round }
  /**
   * No current week. `paused`: the host paused the party. `between-weeks`: the last week has ended
   * but the next one hasn't started yet (only happens briefly after a timezone change).
   */
  | { action: 'none'; reason: 'paused' | 'between-weeks'; lastRound: Round | null };

/**
 * Decides which round is "this week" for a party (D2–D4, ADR-0003). Handlers call this on every request
 * that needs the current week, passing the party's most recent round (or null if it has none yet).
 *
 * Rules:
 * - A round that is still open is the current week, even if the party was paused or its timezone changed
 *   since it started (changes apply from the next week).
 * - A new week starts only after the previous one has ended, and only for a later Monday, so weeks never
 *   overlap and never reuse a week id, even across timezone changes.
 * - Paused parties start no new weeks.
 */
export function planCurrentWeek(
  party: { partyId: string; settings: { timezone: string; paused: boolean } },
  latestRound: Round | null,
  now: Date,
): WeekPlan {
  if (latestRound !== null && isWeekOpen(latestRound, now)) {
    return { action: 'use', round: latestRound };
  }
  if (party.settings.paused) {
    return { action: 'none', reason: 'paused', lastRound: latestRound };
  }

  const window = getWeekWindow(party.settings.timezone, now);

  if (latestRound !== null && window.weekStart <= latestRound.weekStart) {
    // Moving the timezone west can make "this week" in the new zone the same Monday as the week that
    // just ended. Wait for the next Monday rather than reopening it.
    return { action: 'none', reason: 'between-weeks', lastRound: latestRound };
  }

  // Moving the timezone east can make the new week's Monday 00:00 fall before the previous week ended.
  // Start the new week when the previous one ended instead, so the two never overlap.
  const startsAt =
    latestRound !== null && new Date(window.startsAt) < new Date(latestRound.endsAt)
      ? latestRound.endsAt
      : window.startsAt;

  return {
    action: 'create',
    round: {
      roundId: getRoundId(party.partyId, window.weekStart),
      partyId: party.partyId,
      weekStart: window.weekStart,
      timezone: party.settings.timezone,
      startsAt,
      endsAt: window.endsAt,
      status: 'OPEN',
    },
  };
}
