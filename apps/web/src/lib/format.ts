// Small display helpers shared by the screens: day names, dates and times in the viewer's own timezone, and a
// stable placeholder colour for songs without artwork.

import type { Weekday } from '@dropabop/shared';

export const DAY_NAMES: Record<Weekday, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
  SAT: 'Saturday',
  SUN: 'Sunday',
};

/** "Monday to Friday" for a run of 3+ days in a row, otherwise "Monday, Wednesday and Friday". */
export function formatDayList(days: Weekday[]): string {
  const names = days.map((day) => DAY_NAMES[day]);
  const allDays = Object.keys(DAY_NAMES) as Weekday[];
  const positions = days.map((day) => allDays.indexOf(day));
  const consecutive = positions.every((p, i) => i === 0 || p === (positions[i - 1] ?? 0) + 1);
  if (names.length >= 3 && consecutive) return `${names[0]} to ${names[names.length - 1]}`;
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * When ratings lock, in the viewer's own timezone. The API gives the exclusive end (the minute after the host's lock
 * time, e.g. next Monday 00:00); people expect the lock time itself ("Sunday 11:59 pm"), so show one minute earlier.
 */
export function formatLockTime(endsAt: string, timeZone?: string): string {
  const lastMinute = new Date(new Date(endsAt).getTime() - 60_000);
  const day = lastMinute.toLocaleDateString('en-US', { weekday: 'long', timeZone });
  const time = lastMinute
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
    .toLowerCase();
  return `${day} ${time}`;
}

/** "2 days, 5 hours left" / "3 hours, 10 minutes left" / "Less than a minute left". */
export function formatTimeLeft(endsAt: string, now: Date = new Date()): string {
  const minutes = Math.floor((new Date(endsAt).getTime() - now.getTime()) / 60_000);
  if (minutes < 1) return 'Less than a minute left';
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (days > 0) return `${plural(days, 'day')}, ${plural(hours, 'hour')} left`;
  if (hours > 0) return `${plural(hours, 'hour')}, ${plural(mins, 'minute')} left`;
  return `${plural(mins, 'minute')} left`;
}

/** "Oct 5" for a YYYY-MM-DD calendar date (no timezone shift: it's already the party's date). */
export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Week of Oct 5" for a week starting on that Monday. */
export function formatWeekLabel(weekStart: string): string {
  return `Week of ${formatShortDate(weekStart)}`;
}

/** Same id → same colour, so a song's placeholder artwork doesn't change between renders. */
export function hueFor(id: string): number {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return hash;
}

/** One decimal place for averages ("8.5"); whole numbers stay whole ("8"). */
export function formatAverage(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
