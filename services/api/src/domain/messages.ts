// Friendly, user-facing messages for every rule the API enforces (spec §30).
// Kept in one place so the same situation always reads the same way, whether it was caught by a
// rule check up front or by a conditional database write that lost a race.

import type { ErrorCode } from '@sotd/shared';

export const MESSAGES = {
  NOT_A_MEMBER: 'You’re not a member of this party.',
  NOT_HOST: 'Only the party host can do that.',
  PARTY_PAUSED: 'This party is paused, so there’s no week running right now.',
  BETWEEN_WEEKS: 'The next week hasn’t started yet. Check back on Monday.',
  WEEKEND: 'Song sharing opens again on Monday. You can still rate this week’s songs.',
  ALREADY_SUBMITTED_TODAY: 'You’ve already shared your song for today.',
  NOT_CURRENT_WEEK_SUBMIT: 'You can only share songs for this week.',
  WEEK_CLOSED_SUBMIT: 'This week has ended, so songs can’t be added.',
  WEEK_CLOSED_RATE: 'This week has ended, so ratings are locked.',
  OWN_SONG: 'You can’t rate your own song.',
  SONG_NOT_IN_WEEK: 'That song isn’t part of this week.',
  INVALID_RATING: 'Ratings are whole numbers from 1 to 10.',
  PARTY_FULL: 'This party is full.',
  ALREADY_MEMBER: 'You’re already in this party.',
  INVALID_INVITE: 'That invite code isn’t valid. Ask the host for the latest link.',
  RESULTS_NOT_READY: 'Results unlock when the week ends on Sunday night.',
  NO_RESULTS: 'Not enough songs were shared this week, so there are no results.',
} as const;

/** Outcome of a rule check: allowed, or the reason it isn't (code for the app, message for people). */
export type RuleResult<T = object> = ({ ok: true } & T) | { ok: false; code: ErrorCode; message: string };

export function deny(code: ErrorCode, message: string): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code, message };
}
