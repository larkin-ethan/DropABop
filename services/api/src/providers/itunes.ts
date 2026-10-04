// iTunes Search API catalog (ADR-0007, docs/MUSIC_PROVIDERS.md). Free and keyless, about 20 calls/minute.
// Response fields checked against a live response on 2026-10-01: trackId, trackName, artistName, collectionName,
// trackTimeMillis, releaseDate, trackViewUrl (a music.apple.com link), artworkUrl100.

import type { MusicProviderId, Song } from '@dropabop/shared';
import { songSchema } from '@dropabop/shared';
import { DomainError } from '../data/errors';
import { logger } from '../http/logger';
import type { SongLookup } from './song-lookup';

const BASE_URL = 'https://itunes.apple.com';
const TIMEOUT_MS = 5000;
const SEARCH_LIMIT = 10;
/** Searches repeat a lot ("midnight city" typed by two people); a short cache keeps us well under ~20 calls/min. */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

interface ItunesTrack {
  wrapperType?: string;
  kind?: string;
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  trackTimeMillis?: number;
  releaseDate?: string;
  trackViewUrl?: string;
  artworkUrl100?: string;
}

/**
 * 300×300 artwork instead of the documented 100×100: the URL's size segment can be changed (observed behaviour,
 * not documented, checked 2026-10-01). The website falls back to a placeholder if an image ever fails to load.
 */
export function largerArtwork(url: string | undefined): string | null {
  if (url === undefined) return null;
  return url.replace(/\/100x100bb\.(jpg|png)$/, '/300x300bb.$1');
}

/** Converts one iTunes result to our Song shape, or null if it isn't a usable song (spec §12). */
export function toSong(track: ItunesTrack): Song | null {
  if (track.kind !== 'song' || track.trackId === undefined) return null;
  const id = String(track.trackId);
  const candidate = {
    songId: `appleMusic:${id}`,
    title: track.trackName ?? '',
    artist: track.artistName ?? '',
    album: track.collectionName ?? null,
    albumArtUrl: largerArtwork(track.artworkUrl100),
    durationMs: typeof track.trackTimeMillis === 'number' ? Math.round(track.trackTimeMillis) : null,
    releaseDate: track.releaseDate?.slice(0, 10) ?? null,
    providers: [
      { provider: 'appleMusic' as const, providerSongId: id, externalUrl: track.trackViewUrl ?? '' },
    ],
  };
  const parsed = songSchema.safeParse(candidate); // https links only, required fields present
  return parsed.success ? parsed.data : null;
}

export interface ItunesOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  country?: string;
}

export function createItunesCatalog({
  fetchImpl = fetch,
  now = Date.now,
  country = 'us',
}: ItunesOptions = {}): SongLookup {
  const cache = new Map<string, { at: number; songs: Song[] }>();

  async function call(path: string, params: Record<string, string>): Promise<ItunesTrack[]> {
    const url = `${BASE_URL}${path}?${new URLSearchParams(params).toString()}`;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { accept: 'application/json', 'user-agent': 'SongOfTheDay/1.0 (private group app)' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      logger.warn('iTunes request failed', { path, error });
      throw new DomainError(
        'PROVIDER_UNAVAILABLE',
        'Song search isn’t responding right now. Please try again.',
      );
    }
    if (response.status === 403 || response.status === 429) {
      logger.warn('iTunes rate limit', { path, status: response.status });
      throw new DomainError(
        'PROVIDER_UNAVAILABLE',
        'Song search is busy right now. Please try again in a minute.',
      );
    }
    if (!response.ok) {
      logger.warn('iTunes error status', { path, status: response.status });
      throw new DomainError(
        'PROVIDER_UNAVAILABLE',
        'Song search isn’t responding right now. Please try again.',
      );
    }
    const body = (await response.json()) as { results?: ItunesTrack[] };
    return Array.isArray(body.results) ? body.results : [];
  }

  return {
    async searchSongs(query) {
      const key = query.trim().toLowerCase();
      const cached = cache.get(key);
      if (cached !== undefined && now() - cached.at < CACHE_TTL_MS) {
        return cached.songs;
      }
      const results = await call('/search', {
        term: query.trim(),
        media: 'music',
        entity: 'song',
        country,
        limit: String(SEARCH_LIMIT),
      });
      const songs = results.map(toSong).filter((s): s is Song => s !== null);
      if (cache.size >= CACHE_MAX_ENTRIES) {
        cache.delete(cache.keys().next().value as string); // drop the oldest entry
      }
      cache.set(key, { at: now(), songs });
      return songs;
    },

    async getSong(provider: MusicProviderId, providerSongId: string) {
      if (provider !== 'appleMusic' || !/^\d{1,20}$/.test(providerSongId)) {
        return null;
      }
      const results = await call('/lookup', { id: providerSongId, entity: 'song', country });
      const match = results.find((r) => String(r.trackId) === providerSongId);
      return match === undefined ? null : toSong(match);
    },
  };
}
