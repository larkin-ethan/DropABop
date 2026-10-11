// GET /songs/search and POST /songs/resolve (docs/API.md → Song search). iTunes catalog, server-side (ADR-0007).

import type { ResolveSongResponse, SongSearchResponse, YouTubeSuggestionsResponse } from '@dropabop/shared';
import {
  parseAppleMusicSongUrl,
  resolveSongRequestSchema,
  songSearchQuerySchema,
  youtubeSuggestionQuerySchema,
} from '@dropabop/shared';
import { useYouTubeSearch } from '../data/youtube-searches';
import { fail } from '../http/errors';
import { createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseBody, parseQuery } from '../http/request';

/** Search songs to share. Signed-in users only (keeps the shared iTunes rate limit for our members). */
export const searchSongsFn: HandlerFn = async (event, { music }) => {
  getAuthenticatedUser(event);
  const { q } = parseQuery(event, songSearchQuerySchema);
  return ok({ songs: await music.searchSongs(q) } satisfies SongSearchResponse);
};

/** Paste an Apple Music song link instead of searching (D21). */
export const resolveSongFn: HandlerFn = async (event, { music }) => {
  getAuthenticatedUser(event);
  const { url } = parseBody(event, resolveSongRequestSchema);
  const trackId = parseAppleMusicSongUrl(url) as string; // the schema already checked it parses
  const song = await music.getSong('appleMusic', trackId);
  if (song === null) {
    fail('VALIDATION_FAILED', 'We couldn’t find that song on Apple Music. Try searching instead.');
  }
  return ok({ song } satisfies ResolveSongResponse);
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
