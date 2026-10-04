// GET /songs/search and POST /songs/resolve (docs/API.md → Song search). iTunes catalog, server-side (ADR-0007).

import type { ResolveSongResponse, SongSearchResponse } from '@dropabop/shared';
import { parseAppleMusicSongUrl, resolveSongRequestSchema, songSearchQuerySchema } from '@dropabop/shared';
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

export const searchSongsHandler = createHandler(searchSongsFn);
export const resolveSongHandler = createHandler(resolveSongFn);
