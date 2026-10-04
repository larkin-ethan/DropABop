// Small display helpers shared by the screens: day names, dates and times in the viewer's own timezone, and a
// stable placeholder colour for songs without artwork.

import type { Weekday } from '@dropabop/shared';

export const WEEKDAYS: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

export const DAY_NAMES: Record<Weekday, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
};

/**
 * When ratings lock, in the viewer's own timezone. The API gives the exclusive end (next Monday 00:00 in the party's
 * timezone); people expect "Sunday 11:59 pm", so show one minute earlier.
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
