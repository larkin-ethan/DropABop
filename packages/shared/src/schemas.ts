// Validation schemas for every API request body (spec §31: validate all input server-side).
// The API enforces these; the frontend reuses them so forms show the same rules before submitting.
//
// Every request schema is a *strict* object: unknown keys are rejected. That's deliberate. A request
// that tries to sneak in `userId`, `role`, or `hostUserId` fails validation instead of being silently
// ignored (spec §24: identity comes only from the verified token).

import { z } from 'zod';
import {
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
} from './limits';

// ---------- Building blocks ----------

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Please enter a display name.' })
  .max(DISPLAY_NAME_MAX_LENGTH, {
    error: `Display names can be up to ${DISPLAY_NAME_MAX_LENGTH} characters.`,
  });

export const partyNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'Please enter a party name.' })
  .max(PARTY_NAME_MAX_LENGTH, { error: `Party names can be up to ${PARTY_NAME_MAX_LENGTH} characters.` });

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

/** PATCH /parties/{partyId}/settings (host only). At least one field must be present. */
export const updatePartySettingsRequestSchema = z
  .strictObject({
    name: partyNameSchema,
    maxMembers: maxMembersSchema,
    timezone: timezoneSchema,
    paused: z.boolean(),
    revealRecommenderDuringVoting: z.boolean(),
    showWhoRatedWhat: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, { error: 'Nothing to update.' });

/** POST /parties/{partyId}/join */
export const joinPartyRequestSchema = z.strictObject({
  inviteCode: inviteCodeSchema,
});

/**
 * POST /rounds/{roundId}/recommendations
 *
 * The client sends only *which* song (service + that service's id). The server looks the song up with
 * the provider itself, so titles, artwork, and links can't be forged by the client. The date is never
 * sent: the server decides "today" in the party's timezone (ADR-0003).
 */
export const submitRecommendationRequestSchema = z.strictObject({
  provider: musicProviderSchema,
  providerSongId: z
    .string()
    .trim()
    .min(1, { error: 'Please choose a song.' })
    .max(PROVIDER_SONG_ID_MAX_LENGTH, { error: 'Please choose a song.' }),
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
    .min(1, { error: 'Type a song or artist to search.' })
    .max(SEARCH_QUERY_MAX_LENGTH, { error: `Searches can be up to ${SEARCH_QUERY_MAX_LENGTH} characters.` }),
  provider: musicProviderSchema.optional(),
});

/** POST /songs/resolve — paste-a-link fallback (D21). */
export const resolveSongRequestSchema = z.strictObject({
  url: httpsUrlSchema,
});

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type CreatePartyRequest = z.infer<typeof createPartyRequestSchema>;
export type UpdatePartySettingsRequest = z.infer<typeof updatePartySettingsRequestSchema>;
export type JoinPartyRequest = z.infer<typeof joinPartyRequestSchema>;
export type SubmitRecommendationRequest = z.infer<typeof submitRecommendationRequestSchema>;
export type CastVoteRequest = z.infer<typeof castVoteRequestSchema>;
export type SongSearchQuery = z.infer<typeof songSearchQuerySchema>;
export type ResolveSongRequest = z.infer<typeof resolveSongRequestSchema>;
