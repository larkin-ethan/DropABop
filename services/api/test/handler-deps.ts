// Dependencies for handler integration tests: the real DynamoDB Local table, plus a controllable clock.

import { randomUUID } from 'node:crypto';
import type { MusicProviderId, Song } from '@sotd/shared';
import type { Deps } from '../src/http/handler';
import { testContext } from './fixtures';

export interface TestDeps extends Deps {
  /** Moves the fake clock. */
  setNow: (iso: string) => void;
}

/** A fake music service: any id resolves to a song, except ids starting with "missing". */
export function fakeSong(provider: MusicProviderId, providerSongId: string): Song {
  return {
    songId: `${provider}:${providerSongId}`,
    title: `Song ${providerSongId}`,
    artist: 'Test Artist',
    album: 'Test Album',
    albumArtUrl: 'https://images.example.com/art.jpg',
    durationMs: 200000,
    releaseDate: '2020-01-01',
    providers: [{ provider, providerSongId, externalUrl: `https://music.example.com/${providerSongId}` }],
  };
}

export function testDeps(startIso = '2026-10-07T17:00:00.000Z'): TestDeps {
  let current = new Date(startIso);
  return {
    data: testContext(),
    now: () => new Date(current),
    newId: () => randomUUID(),
    music: {
      getSong: (provider, id) => Promise.resolve(id.startsWith('missing') ? null : fakeSong(provider, id)),
    },
    setNow: (iso) => {
      current = new Date(iso);
    },
  };
}
