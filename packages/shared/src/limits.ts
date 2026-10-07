// Numeric limits and fixed value lists used by both the frontend (form validation) and the API
// (the real enforcement). Each one cites the spec section or product decision it comes from.

/** Spec §8 / D14: parties hold up to 20 members unless the host changes it. */
export const DEFAULT_MAX_PARTY_SIZE = 20;
/** D14: hosts may set the size between these bounds. */
export const MIN_PARTY_SIZE = 2;
export const MAX_PARTY_SIZE = 50;

/** D15 / spec §32: a person can be in at most this many parties (stops one account creating unlimited parties). */
export const MAX_PARTIES_PER_USER = 5; // Ethan, 2026-10-01

/** D25: a comment is a short line of text, like a chat message. */
export const COMMENT_MAX_LENGTH = 280;
/** D25: stops one person flooding a week with comments (20 people × 50 is still a small query). */
export const MAX_COMMENTS_PER_PERSON_PER_WEEK = 50;

/** Spec §15 / D7: ratings are whole numbers from 1 to 10. */
export const MIN_RATING = 1;
export const MAX_RATING = 10;

export const DISPLAY_NAME_MAX_LENGTH = 40;
export const PARTY_NAME_MAX_LENGTH = 60;
export const SEARCH_QUERY_MAX_LENGTH = 100;
/** Provider track ids are short; the cap just stops oversized input. */
export const PROVIDER_SONG_ID_MAX_LENGTH = 200;

/** Every day of the week, in week order. Weeks start Monday 00:00 in the party's timezone (D2). */
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;

/** D1: members share one song per sharing day. The host picks the days; new parties start with Monday–Friday. */
export const DEFAULT_SHARE_DAYS: readonly (typeof WEEKDAYS)[number][] = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

/**
 * D2: ratings lock at the end of this minute, in the party's timezone (the host can change it). The default,
 * Sunday 23:59, means the week's ratings close exactly at midnight going into Monday.
 */
export const DEFAULT_RATING_CLOSE_DAY: (typeof WEEKDAYS)[number] = 'SUN';
export const DEFAULT_RATING_CLOSE_TIME = '23:59';
/** 24-hour "HH:MM". */
export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * D2: a week is OPEN for submitting (on sharing days) and rating (all week), then CLOSED.
 * NOT_ENOUGH_SONGS is a closed week that had fewer than 2 songs: no results, excluded from stats.
 */
export const ROUND_STATUSES = ['OPEN', 'CLOSED', 'NOT_ENOUGH_SONGS'] as const;

/**
 * Music services a song can link to, and that a user can pick as their preferred app (D22).
 * Which ones support search or in-app playback is decided in P6.1 (ADR-0007); this list only names
 * the services so links and preferences have a fixed vocabulary.
 */
export const MUSIC_PROVIDERS = ['spotify', 'appleMusic', 'youtube', 'youtubeMusic'] as const;

/** D13: the party creator is the host; everyone else is a member. */
export const MEMBER_ROLES = ['host', 'member'] as const;

/**
 * Invite codes look like SONG-7K4P (D16). The 4-character part avoids look-alike characters:
 * no 0/O, 1/I, or L, so codes read aloud or typed from a screenshot don't get mixed up.
 */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_PATTERN = /^SONG-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

/**
 * Profile pictures are stored as small data URLs (D18). The website shrinks photos to 128×128 first, which is usually
 * 4–8 KB; this cap keeps the whole request under the API's 10 KB body limit.
 */
export const AVATAR_IMAGE_MAX_LENGTH = 9_000;

/** Shown until the person picks a name during onboarding (P8.2). */
export const DEFAULT_DISPLAY_NAME = 'New member';

/** Avatar background colors from the design palette (docs/design), D18. Also the choices on the Profile screen. */
export const AVATAR_COLORS = [
  '#3B82F6',
  '#14B8A6',
  '#8B5CF6',
  '#06B6D4',
  '#6366F1',
  '#22C55E',
  '#EC4899',
  '#F59E0B',
] as const;
