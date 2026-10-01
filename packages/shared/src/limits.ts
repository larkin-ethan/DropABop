// Numeric limits and fixed value lists used by both the frontend (form validation) and the API
// (the real enforcement). Each one cites the spec section or product decision it comes from.

/** Spec §8 / D14: parties hold up to 20 members unless the host changes it. */
export const DEFAULT_MAX_PARTY_SIZE = 20;
/** D14: hosts may set the size between these bounds. */
export const MIN_PARTY_SIZE = 2;
export const MAX_PARTY_SIZE = 50;

/** Spec §15 / D7: ratings are whole numbers from 1 to 10. */
export const MIN_RATING = 1;
export const MAX_RATING = 10;

export const DISPLAY_NAME_MAX_LENGTH = 40;
export const PARTY_NAME_MAX_LENGTH = 60;
export const SEARCH_QUERY_MAX_LENGTH = 100;
/** Provider track ids are short; the cap just stops oversized input. */
export const PROVIDER_SONG_ID_MAX_LENGTH = 200;

/** D1: members share one song per day on these weekdays only. */
export const SUBMISSION_WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'] as const;

/**
 * D2: a week is OPEN for submitting (weekdays) and rating (all week), then CLOSED.
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
