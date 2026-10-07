// Friendly, user-facing messages for every rule the API enforces (spec §30).
// Kept in one place so the same situation always reads the same way, whether it was caught by a
// rule check up front or by a conditional database write that lost a race.

import type { ErrorCode } from '@dropabop/shared';

export const MESSAGES = {
  NOT_A_MEMBER: 'You’re not a member of this party.',
  NOT_HOST: 'Only the party host can do that.',
  PARTY_PAUSED: 'This party is paused, so there’s no week running right now.',
  BETWEEN_WEEKS: 'This week’s ratings are locked. The next week starts on Monday.',
  WEEKEND: 'Today isn’t a sharing day. You can still rate this week’s songs.',
  ALREADY_SUBMITTED_TODAY: 'You’ve already shared your song for today.',
  NOT_CURRENT_WEEK_SUBMIT: 'You can only share songs for this week.',
  WEEK_CLOSED_SUBMIT: 'This week has ended, so songs can’t be added.',
  WEEK_CLOSED_RATE: 'This week has ended, so ratings are locked.',
  OWN_SONG: 'You can’t rate your own song.',
  WEEK_CLOSED_COMMENT: 'This week has ended, so comments are closed.',
  TOO_MANY_COMMENTS: 'You’ve reached this week’s comment limit.',
  COMMENT_NOT_FOUND: 'That comment isn’t there any more.',
  NOT_YOUR_COMMENT: 'You can only delete your own comments.',
  SONG_NOT_IN_WEEK: 'That song isn’t part of this week.',
  INVALID_RATING: 'Ratings are whole numbers from 1 to 10.',
  PARTY_FULL: 'This party is full.',
  ALREADY_MEMBER: 'You’re already in this party.',
  TOO_MANY_PARTIES:
    'You’re already in the maximum number of parties (5). Leave one to join or create another.',
  INVALID_INVITE: 'That invite code isn’t valid. Ask the host for the latest link.',
  TOO_MANY_INVITE_TRIES: 'Too many wrong invite codes. Please wait an hour, or ask the host for the link.',
  RESULTS_NOT_READY: 'Results unlock when this week’s ratings lock.',
  NO_RESULTS: 'Not enough songs were shared this week, so there are no results.',
  MEMBER_NOT_FOUND: 'That person isn’t in this party.',
  INVITE_JUST_CHANGED: 'The invite code was just changed. Refresh to see the new one.',
  HOST_CANNOT_LEAVE: 'The host can’t leave or be removed from their own party.',
  maxBelowMembers: (count: number) =>
    `This party already has ${count} members, so the limit can’t be lower than ${count}.`,
} as const;

/** Outcome of a rule check: allowed, or the reason it isn't (code for the app, message for people). */
export type RuleResult<T = object> = ({ ok: true } & T) | { ok: false; code: ErrorCode; message: string };

export function deny(code: ErrorCode, message: string): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code, message };
}
