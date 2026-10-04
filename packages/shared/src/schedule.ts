// The party's weekly schedule (decisions D1, D2): which days members share a song, and when ratings lock.
// The host chooses both; these helpers keep the API, the settings form, and sample mode agreeing on the rules.

import { DEFAULT_RATING_CLOSE_DAY, DEFAULT_RATING_CLOSE_TIME, DEFAULT_SHARE_DAYS, WEEKDAYS } from './limits';
import type { PartySettings, Round, Weekday } from './types';

/** Days in week order (Monday first), without duplicates. */
export function sortWeekdays(days: readonly Weekday[]): Weekday[] {
  return WEEKDAYS.filter((day) => days.includes(day));
}

/**
 * Parties created before the schedule was editable have no schedule stored; they keep the original rules
 * (Monday–Friday, ratings lock Sunday 11:59 pm). Everything that reads a party goes through this.
 */
export function withScheduleDefaults<T extends Partial<PartySettings>>(
  settings: T,
): T & Pick<PartySettings, 'shareDays' | 'ratingCloseDay' | 'ratingCloseTime'> {
  return {
    ...settings,
    shareDays: settings.shareDays ?? [...DEFAULT_SHARE_DAYS],
    ratingCloseDay: settings.ratingCloseDay ?? DEFAULT_RATING_CLOSE_DAY,
    ratingCloseTime: settings.ratingCloseTime ?? DEFAULT_RATING_CLOSE_TIME,
  };
}

/** The sharing days a week runs on (weeks from before the schedule was editable used Monday–Friday). */
export function shareDaysOf(round: Pick<Round, 'shareDays'>): Weekday[] {
  return sortWeekdays(round.shareDays ?? DEFAULT_SHARE_DAYS);
}

/**
 * The earliest ratings can lock is 11:59 pm on the last sharing day (Ethan, 2026-10-04), so everyone gets that
 * whole day to share and the songs shared on it can be rated. Returns a friendly problem, or null when it's fine.
 */
export function checkSchedule(
  schedule: Pick<PartySettings, 'shareDays' | 'ratingCloseDay' | 'ratingCloseTime'>,
): string | null {
  if (schedule.shareDays.length === 0) {
    return 'Pick at least one sharing day.';
  }
  const lastShareDay = Math.max(...schedule.shareDays.map((day) => WEEKDAYS.indexOf(day)));
  const closeDay = WEEKDAYS.indexOf(schedule.ratingCloseDay);
  if (closeDay < lastShareDay || (closeDay === lastShareDay && schedule.ratingCloseTime !== LAST_MINUTE)) {
    return 'Ratings can lock at 11:59 pm on the last sharing day at the earliest. Pick a later day or time.';
  }
  return null;
}

/** The last minute of a day: on the last sharing day, the only allowed lock time. */
const LAST_MINUTE = '23:59';
