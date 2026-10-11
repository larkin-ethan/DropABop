// Finds a YouTube video for the song being shared (ADR-0012): one `search.list` call per chosen song.
// Official YouTube Data API v3 only (https://developers.google.com/youtube/v3/docs/search/list, checked 2026-10-09).
// Rules we keep: results are returned unchanged and in YouTube's order; the API key stays on the server and is never
// logged; YouTube allows 100 searches a day for the whole app, so results are cached and callers are limited.

import type { YouTubeVideoSuggestion } from '@dropabop/shared';
import { logger } from '../http/logger';

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const TIMEOUT_MS = 5_000;
/** The same song picked again within an hour (two people, or a second try) doesn't cost another search. */
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const MAX_RESULTS = 3;

export type YouTubeSearchResult =
  | { ok: true; videos: YouTubeVideoSuggestion[] }
  | { ok: false; reason: 'notConfigured' | 'busy' | 'dailyLimit' };

export interface YouTubeSearch {
  /**
   * `cacheKey` identifies the song (its iTunes id), `query` is what to search for ("artist title").
   * `mayUseSearch` is asked only right before a real YouTube call (not for cached answers or without a key), so only
   * real searches count against the person's daily allowance.
   */
  findVideos: (
    cacheKey: string,
    query: string,
    mayUseSearch: () => Promise<boolean>,
  ) => Promise<YouTubeSearchResult>;
}

export interface YouTubeSearchOptions {
  /** The API key, or null if none is set up yet. */
  getApiKey: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface SearchListResponse {
  items?: { id?: { videoId?: unknown }; snippet?: { title?: unknown; channelTitle?: unknown } }[];
}

/**
 * YouTube sends titles HTML-escaped ("Don&#39;t Stop"). Turning the escapes back into the characters they stand for
 * shows the title as YouTube wrote it; the text itself isn't changed. React then displays it as plain text.
 */
export function decodeYouTubeText(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'); // last, so "&amp;lt;" becomes "&lt;" and not "<"
}

export function createYouTubeSearch({
  getApiKey,
  fetchImpl = fetch,
  now = Date.now,
}: YouTubeSearchOptions): YouTubeSearch {
  const cache = new Map<string, { at: number; videos: YouTubeVideoSuggestion[] }>();

  return {
    async findVideos(cacheKey, query, mayUseSearch) {
      const cached = cache.get(cacheKey);
      if (cached !== undefined && now() - cached.at < CACHE_TTL_MS) {
        return { ok: true, videos: cached.videos };
      }

      const apiKey = await getApiKey();
      if (apiKey === null) return { ok: false, reason: 'notConfigured' };
      if (!(await mayUseSearch())) return { ok: false, reason: 'dailyLimit' };

      const params = new URLSearchParams({
        part: 'snippet',
        type: 'video',
        videoEmbeddable: 'true', // only videos that may play in our player
        videoCategoryId: '10', // Music
        maxResults: String(MAX_RESULTS),
        safeSearch: 'moderate',
        q: query,
        fields: 'items(id/videoId,snippet/title,snippet/channelTitle)',
      });
      let response: Response;
      try {
        response = await fetchImpl(`${SEARCH_URL}?${params.toString()}`, {
          // The key goes in a header, so it never appears in a URL. Google documents `x-goog-api-key` for API keys
          // (docs.cloud.google.com/docs/authentication/api-keys-use, checked 2026-10-09); YouTube's own pages show
          // `?key=`, so P13.4b's live check confirms YouTube accepts the header.
          headers: { accept: 'application/json', 'x-goog-api-key': apiKey },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        logger.warn('YouTube search failed', { error });
        return { ok: false, reason: 'busy' };
      }
      if (!response.ok) {
        // 403 quotaExceeded is the usual one: the app's 100 searches for today are used up.
        logger.warn('YouTube search error status', { status: response.status });
        return { ok: false, reason: 'busy' };
      }

      let body: SearchListResponse;
      try {
        body = (await response.json()) as SearchListResponse;
      } catch (error) {
        logger.warn('YouTube search returned something that isn’t JSON', { error });
        return { ok: false, reason: 'busy' };
      }
      const videos: YouTubeVideoSuggestion[] = [];
      for (const item of body.items ?? []) {
        const videoId = item.id?.videoId;
        const title = item.snippet?.title;
        const channelTitle = item.snippet?.channelTitle;
        // Only well-formed results, in YouTube's order. A malformed one is skipped, never rewritten.
        if (typeof videoId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(videoId) && typeof title === 'string') {
          videos.push({
            videoId,
            title: decodeYouTubeText(title),
            channelTitle: typeof channelTitle === 'string' ? decodeYouTubeText(channelTitle) : '',
          });
        }
      }
      if (cache.size >= CACHE_MAX_ENTRIES) {
        cache.delete(cache.keys().next().value as string); // drop the oldest entry
      }
      cache.set(cacheKey, { at: now(), videos });
      return { ok: true, videos };
    },
  };
}
