// Dependencies for handler integration tests: the real DynamoDB Local table, plus a controllable clock.

import { randomUUID } from 'node:crypto';
import type { MusicProviderId, Song } from '@dropabop/shared';
import type { Deps } from '../src/http/handler';
import { testContext } from './fixtures';

export interface TestDeps extends Deps {
  /** Moves the fake clock. */
  setNow: (iso: string) => void;
}

/** A fake music catalog: any numeric id resolves to a song, except ids starting with "999" (not found). */
export function fakeSong(provider: MusicProviderId, providerSongId: string): Song {
  return {
    songId: `${provider}:${providerSongId}`,
    title: `Song ${providerSongId}`,
    artist: 'Test Artist',
    album: 'Test Album',
    albumArtUrl: 'https://images.example.com/art.jpg',
    durationMs: 200000,
    releaseDate: '2020-01-01',
    genre: 'Pop',
    providers: [
      { provider, providerSongId, externalUrl: `https://music.apple.com/us/song/test/${providerSongId}` },
    ],
  };
}

export function testDeps(startIso = '2026-10-07T17:00:00.000Z'): TestDeps {
  let current = new Date(startIso);
  return {
    data: testContext(),
    now: () => new Date(current),
    newId: () => randomUUID(),
    music: {
      searchSongs: (query) =>
        Promise.resolve(
          [fakeSong('appleMusic', '100'), fakeSong('appleMusic', '200')].map((s) => ({
            ...s,
            title: `${query} (${s.title})`,
          })),
        ),
      getSong: (provider, id) =>
        Promise.resolve(provider !== 'appleMusic' || id.startsWith('999') ? null : fakeSong(provider, id)),
    },
    // A fake YouTube (no cache): songs whose id starts with "8" have no match; everything else gets two videos.
    youtube: {
      findVideos: async (cacheKey, _query, mayUseSearch) => {
        if (!(await mayUseSearch())) return { ok: false, reason: 'dailyLimit' };
        return {
          ok: true,
          videos: cacheKey.startsWith('8')
            ? []
            : [
                {
                  videoId: 'aaaaaaaaaaa',
                  title: 'Test Artist - Song (Official Video)',
                  channelTitle: 'Test Artist',
                },
                { videoId: 'bbbbbbbbbbb', title: 'Song (Live)', channelTitle: 'Somebody' },
              ],
        };
      },
    },
    setNow: (iso) => {
      current = new Date(iso);
    },
  };
}
