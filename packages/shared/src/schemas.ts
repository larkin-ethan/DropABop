// Validation schemas for every API request body (spec §31: validate all input server-side).
// The API enforces these; the frontend reuses them so forms show the same rules before submitting.
//
// Every request schema is a *strict* object: unknown keys are rejected. That's deliberate. A request
// that tries to sneak in `userId`, `role`, or `hostUserId` fails validation instead of being silently
// ignored (spec §24: identity comes only from the verified token).

import { z } from 'zod';
import { parseAppleMusicSongUrl, parseSpotifyTrackUrl, parseYouTubeUrl } from './links';
import {
  AVATAR_IMAGE_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  INVITE_CODE_PATTERN,
  MAX_PARTY_SIZE,
  MAX_RATING,
  MIN_PARTY_SIZE,
  MIN_RATING,
  MUSIC_PROVIDERS,
  PARTY_NAME_MAX_LENGTH,
  PROVIDER_SONG_ID_MAX_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
  TIME_OF_DAY_PATTERN,
  WEEKDAYS,
} from './limits';

// Don't let zod generate code at runtime. The website's Content Security Policy forbids it (P9.2), and zod would
// otherwise probe for it on every page load and log a CSP violation. The difference in speed is negligible here.
z.config({ jitless: true });

// ---------- Building blocks ----------

/**
 * Invisible characters that could make one name look like another in lists: control characters, unassigned or
 * private-use code points, and text-direction overrides (e.g. U+202E reverses what follows). Emoji joiners stay
 * allowed, so names like "DJ 👩‍🎤" still work. (Pre-launch security review, 2026-10-04.)
 */
const DECEPTIVE_CHARACTERS = /[\p{Cc}\p{Co}\p{Cn}\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Please enter a display name.' })
  .max(DISPLAY_NAME_MAX_LENGTH, {
    error: `Display names can be up to ${DISPLAY_NAME_MAX_LENGTH} characters.`,
  })
  .refine((name) => !DECEPTIVE_CHARACTERS.test(name), {
    error: 'Display names can’t contain hidden or text-direction characters.',
  });

export const partyNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Please enter a party name.' })
  .max(PARTY_NAME_MAX_LENGTH, { error: `Party names can be up to ${PARTY_NAME_MAX_LENGTH} characters.` })
  .refine((name) => !DECEPTIVE_CHARACTERS.test(name), {
    error: 'Party names can’t contain hidden or text-direction characters.',
  });

export const ratingSchema = z
  .int({ error: 'Ratings are whole numbers from 1 to 10.' })
  .min(MIN_RATING, { error: 'Ratings are whole numbers from 1 to 10.' })
  .max(MAX_RATING, { error: 'Ratings are whole numbers from 1 to 10.' });

/** Accepts what people actually type ("song-7k4p ", "SONG-7K4P") and normalizes before checking. */
export const inviteCodeSchema = z.string().trim().toUpperCase().regex(INVITE_CODE_PATTERN, {
  error: 'That invite code doesn’t look right. It should look like SONG-7K4P.',
});

export const maxMembersSchema = z
  .int({ error: `Party size must be a whole number from ${MIN_PARTY_SIZE} to ${MAX_PARTY_SIZE}.` })
  .min(MIN_PARTY_SIZE, {
    error: `Party size must be a whole number from ${MIN_PARTY_SIZE} to ${MAX_PARTY_SIZE}.`,
  })
  .max(MAX_PARTY_SIZE, {
    error: `Party size must be a whole number from ${MIN_PARTY_SIZE} to ${MAX_PARTY_SIZE}.`,
  });

/** True when the runtime recognizes the name as a timezone (e.g. "America/Chicago"). */
function isValidTimeZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
}

export const timezoneSchema = z
  .string()
  .trim()
  .min(1, { error: 'Please choose a timezone.' })
  .refine(isValidTimeZone, { error: 'Please choose a valid timezone.' });

export const avatarColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, { error: 'Avatar colors must be a hex color like #3B82F6.' });

/** A small JPEG or WebP picture as a data URL; never SVG or other formats that could carry script. */
export const avatarImageSchema = z
  .string()
  .max(AVATAR_IMAGE_MAX_LENGTH, { error: 'That picture is too large. Please choose another.' })
  .regex(/^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/, {
    error: 'Please choose a JPEG or WebP picture.',
  });

export const musicProviderSchema = z.enum(MUSIC_PROVIDERS, { error: 'That music service isn’t supported.' });

/** Only https links are stored and shown, so we never render an insecure or javascript: link. */
export const httpsUrlSchema = z.url({ protocol: /^https$/, error: 'Links must start with https://.' });

// ---------- Song data (validated when a provider's response is normalized, P6.3) ----------

export const songProviderSchema = z.strictObject({
  provider: musicProviderSchema,
  providerSongId: z.string().min(1).max(PROVIDER_SONG_ID_MAX_LENGTH),
  externalUrl: httpsUrlSchema,
});

export const songSchema = z.strictObject({
  songId: z.string().min(1),
  title: z.string().trim().min(1).max(300),
  artist: z.string().trim().min(1).max(300),
  album: z.string().trim().max(300).nullable(),
  albumArtUrl: httpsUrlSchema.nullable(),
  durationMs: z.int().min(0).nullable(),
  releaseDate: z.string().nullable(),
  providers: z.array(songProviderSchema).min(1, { error: 'A song needs at least one music service link.' }),
});

// ---------- Request bodies ----------

/** PATCH /users/me. At least one field must be present. */
export const updateProfileRequestSchema = z
  .strictObject({
    displayName: displayNameSchema,
    avatarColor: avatarColorSchema,
    avatarImage: avatarImageSchema.nullable(),
    preferredProvider: musicProviderSchema.nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { error: 'Nothing to update.' });

/** POST /parties */
export const createPartyRequestSchema = z.strictObject({
  name: partyNameSchema,
  timezone: timezoneSchema,
  maxMembers: maxMembersSchema.optional(),
});

const weekdaySchema = z.enum(WEEKDAYS, { error: 'Please pick a day of the week.' });

/** D1: at least one sharing day, each day once. Whether ratings lock after the last one is checked with the rest of the schedule (checkSchedule). */
export const shareDaysSchema = z
  .array(weekdaySchema)
  .min(1, { error: 'Pick at least one sharing day.' })
  .max(WEEKDAYS.length)
  .refine((days) => new Set(days).size === days.length, {
    error: 'Each sharing day can only be picked once.',
  });

export const timeOfDaySchema = z
  .string()
  .regex(TIME_OF_DAY_PATTERN, { error: 'Please enter a time like 23:59.' });

/** PATCH /parties/{partyId}/settings (host only). At least one field must be present. */
export const updatePartySettingsRequestSchema = z
  .strictObject({
    name: partyNameSchema,
    maxMembers: maxMembersSchema,
    timezone: timezoneSchema,
    paused: z.boolean(),
    revealRecommenderDuringVoting: z.boolean(),
    showWhoRatedWhat: z.boolean(),
    shareDays: shareDaysSchema,
    ratingCloseDay: weekdaySchema,
    ratingCloseTime: timeOfDaySchema,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { error: 'Nothing to update.' });

/** POST /parties/{partyId}/join */
export const joinPartyRequestSchema = z.strictObject({
  inviteCode: inviteCodeSchema,
});

/** An optional Spotify track link pasted by the person sharing (ADR-0007). */
export const spotifyLinkSchema = z.string().refine((url) => parseSpotifyTrackUrl(url) !== null, {
  error: 'That doesn’t look like a Spotify song link.',
});

/** An optional YouTube / YouTube Music link pasted by the person sharing (ADR-0007). */
export const youtubeLinkSchema = z
  .string()
  .refine((url) => parseYouTubeUrl(url) !== null, { error: 'That doesn’t look like a YouTube link.' });

/**
 * POST /rounds/{roundId}/recommendations
 *
 * The client sends only *which* song (its iTunes / Apple Music track id, ADR-0007). The server looks the song up
 * itself, so titles, artwork, and links can't be forged by the client. Optional Spotify/YouTube links are just URLs
 * the server validates and stores. The date is never sent: the server decides "today" (ADR-0003).
 */
export const submitRecommendationRequestSchema = z.strictObject({
  provider: z.literal('appleMusic', { error: 'Please choose a song from search.' }),
  providerSongId: z
    .string()
    .trim()
    .regex(/^\d{1,20}$/, { error: 'Please choose a song.' })
    .max(PROVIDER_SONG_ID_MAX_LENGTH, { error: 'Please choose a song.' }),
  links: z
    .strictObject({
      spotify: spotifyLinkSchema.optional(),
      youtube: youtubeLinkSchema.optional(),
    })
    .optional(),
});

/** PUT /rounds/{roundId}/votes/{recommendationId} */
export const castVoteRequestSchema = z.strictObject({
  rating: ratingSchema,
});

/** GET /songs/search?q=… (query string, validated the same way) */
export const songSearchQuerySchema = z.strictObject({
  q: z
    .string()
    .trim()
    .min(2, { error: 'Type at least 2 characters to search.' })
    .max(SEARCH_QUERY_MAX_LENGTH, { error: `Searches can be up to ${SEARCH_QUERY_MAX_LENGTH} characters.` }),
});

/** GET /parties/{partyId}/rounds?limit=&cursor= (week history). Query strings arrive as text. */
export const roundHistoryQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'That page link isn’t valid.' })
    .optional(),
});

/** GET /users/me/stats?partyId=… */
export const personalStatsQuerySchema = z.strictObject({
  partyId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/, { error: 'Please choose a party.' }),
});

/** POST /songs/resolve — paste an Apple Music song link instead of searching (D21). */
export const resolveSongRequestSchema = z.strictObject({
  url: z.string().refine((url) => parseAppleMusicSongUrl(url) !== null, {
    error: 'Paste an Apple Music song link (music.apple.com/…), or search instead.',
  }),
});

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type CreatePartyRequest = z.infer<typeof createPartyRequestSchema>;
export type UpdatePartySettingsRequest = z.infer<typeof updatePartySettingsRequestSchema>;
export type JoinPartyRequest = z.infer<typeof joinPartyRequestSchema>;
export type SubmitRecommendationRequest = z.infer<typeof submitRecommendationRequestSchema>;
export type CastVoteRequest = z.infer<typeof castVoteRequestSchema>;
export type SongSearchQuery = z.infer<typeof songSearchQuerySchema>;
export type ResolveSongRequest = z.infer<typeof resolveSongRequestSchema>;
export type RoundHistoryQuery = z.infer<typeof roundHistoryQuerySchema>;
