// GET /songs/search and POST /songs/resolve (docs/API.md → Song search). iTunes catalog, server-side (ADR-0007).

import type {
  AlreadyShared,
  ResolveSongResponse,
  Song,
  SongSearchResponse,
  YouTubeSuggestionsResponse,
} from '@dropabop/shared';
import {
  parseAppleMusicSongUrl,
  resolveSongRequestSchema,
  songSearchQuerySchema,
  youtubeSuggestionQuerySchema,
} from '@dropabop/shared';
import type { DataContext } from '../data/context';
import { ensureSharedSongsIndexed, lookUpAlreadyShared } from '../data/shared-songs';
import { useYouTubeSearch } from '../data/youtube-searches';
import { fail } from '../http/errors';
import { createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseBody, parseQuery } from '../http/request';
import { loadPartyForMember } from './parties';

/**
 * D35: which of these songs the party already has: dates only, never who shared. Callers check membership first
 * (before calling iTunes), so a non-member learns nothing about the party.
 */
async function alreadySharedIn(
  data: DataContext,
  partyId: string,
  songs: Song[],
): Promise<Record<string, AlreadyShared>> {
  if (songs.length === 0) return {};
  await ensureSharedSongsIndexed(data, partyId);
  return lookUpAlreadyShared(data, partyId, songs);
}

/** Search songs to share. Signed-in users only (keeps the shared iTunes rate limit for our members). */
export const searchSongsFn: HandlerFn = async (event, { data, music }) => {
  const { userId } = getAuthenticatedUser(event);
  const { q, partyId } = parseQuery(event, songSearchQuerySchema);
  if (partyId !== undefined) await loadPartyForMember(data, partyId, userId); // before calling iTunes
  const songs = await music.searchSongs(q);
  if (partyId === undefined) return ok({ songs } satisfies SongSearchResponse);
  const alreadyShared = await alreadySharedIn(data, partyId, songs);
  return ok({ songs, alreadyShared } satisfies SongSearchResponse);
};

/** Paste an Apple Music song link instead of searching (D21). */
export const resolveSongFn: HandlerFn = async (event, { data, music }) => {
  const { userId } = getAuthenticatedUser(event);
  const { url, partyId } = parseBody(event, resolveSongRequestSchema);
  if (partyId !== undefined) await loadPartyForMember(data, partyId, userId);
  const trackId = parseAppleMusicSongUrl(url) as string; // the schema already checked it parses
  const song = await music.getSong('appleMusic', trackId);
  if (song === null) {
    fail('VALIDATION_FAILED', 'We couldn’t find that song on Apple Music. Try searching instead.');
  }
  if (partyId === undefined) return ok({ song } satisfies ResolveSongResponse);
  const found = await alreadySharedIn(data, partyId, [song]);
  return ok({ song, alreadyShared: found[song.songId] ?? null } satisfies ResolveSongResponse);
};

/**
 * Suggest YouTube videos for the song being shared (ADR-0012). The server looks the song up in iTunes itself, so only
 * real songs are searched (never free text), and each person has a daily allowance. Never an error the sharer has
 * to deal with: without a key, over the limit, or if YouTube is busy, the list is just empty with the reason.
 */
export const suggestYouTubeFn: HandlerFn = async (event, { data, now, music, youtube }) => {
  const { userId } = getAuthenticatedUser(event);
  const { providerSongId } = parseQuery(event, youtubeSuggestionQuerySchema);
  const song = await music.getSong('appleMusic', providerSongId);
  if (song === null) {
    fail('NOT_FOUND', 'We couldn’t find that song. Try searching again.');
  }
  // Only a real YouTube call uses one of the person's daily searches (cached answers are free).
  const result = await youtube.findVideos(providerSongId, `${song.artist} ${song.title}`, () =>
    useYouTubeSearch(data, userId, now()),
  );
  return ok(
    (result.ok
      ? { videos: result.videos, unavailable: null }
      : { videos: [], unavailable: result.reason }) satisfies YouTubeSuggestionsResponse,
  );
};

export const searchSongsHandler = createHandler(searchSongsFn);
export const suggestYouTubeHandler = createHandler(suggestYouTubeFn);
export const resolveSongHandler = createHandler(resolveSongFn);
