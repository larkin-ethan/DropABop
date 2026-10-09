import { afterAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { runHandler } from '../http/handler';
import { resolveSongFn, searchSongsFn, suggestYouTubeFn } from './songs';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

describe('GET /songs/search', () => {
  it('returns songs for a signed-in user', async () => {
    const result = await runHandler(
      searchSongsFn,
      apiEvent({ userId: newId(), queryStringParameters: { q: 'midnight city' } }),
      deps,
    );
    expect(result.statusCode).toBe(200);
    expect((bodyOf(result) as { songs: unknown[] }).songs).toHaveLength(2);
  });

  it('requires sign-in and a sensible query', async () => {
    expect(
      (await runHandler(searchSongsFn, apiEvent({ queryStringParameters: { q: 'abc' } }), deps)).statusCode,
    ).toBe(401);
    const short = await runHandler(
      searchSongsFn,
      apiEvent({ userId: newId(), queryStringParameters: { q: 'a' } }),
      deps,
    );
    expect(short.statusCode).toBe(400);
    expect(bodyOf(short)).toMatchObject({ error: { message: 'Type at least 2 characters to search.' } });
  });
});

describe('POST /songs/resolve', () => {
  it('resolves an Apple Music song link', async () => {
    const result = await runHandler(
      resolveSongFn,
      apiEvent({
        userId: newId(),
        body: { url: 'https://music.apple.com/us/album/midnight-city/828259375?i=828259377' },
      }),
      deps,
    );
    expect(result.statusCode).toBe(200);
    expect(bodyOf(result)).toMatchObject({ song: { songId: 'appleMusic:828259377' } });
  });

  it('rejects links from other services, and songs Apple doesn’t have', async () => {
    const spotify = await runHandler(
      resolveSongFn,
      apiEvent({ userId: newId(), body: { url: 'https://open.spotify.com/track/1eyzqe2QqGZUmfcPZtrIyt' } }),
      deps,
    );
    expect(spotify.statusCode).toBe(400);
    const missing = await runHandler(
      resolveSongFn,
      apiEvent({ userId: newId(), body: { url: 'https://music.apple.com/us/song/unknown/999123' } }),
      deps,
    );
    expect(missing.statusCode).toBe(400);
  });
});

describe('GET /songs/youtube (ADR-0012)', () => {
  const ask = (userId: string | undefined, providerSongId: string) =>
    runHandler(suggestYouTubeFn, apiEvent({ userId, queryStringParameters: { providerSongId } }), deps);

  it('suggests YouTube’s videos for a real song, in YouTube’s order', async () => {
    const result = await ask(newId(), '100');
    expect(result.statusCode).toBe(200);
    expect(bodyOf(result)).toEqual({
      videos: [
        { videoId: 'aaaaaaaaaaa', title: 'Test Artist - Song (Official Video)', channelTitle: 'Test Artist' },
        { videoId: 'bbbbbbbbbbb', title: 'Song (Live)', channelTitle: 'Somebody' },
      ],
      unavailable: null,
    });
  });

  it('requires sign-in, a song id, and a song iTunes knows', async () => {
    expect((await ask(undefined, '100')).statusCode).toBe(401);
    expect((await ask(newId(), 'midnight city')).statusCode).toBe(400);
    expect((await ask(newId(), '999')).statusCode).toBe(404);
  });

  it('gives each person 15 searches a day, then an empty list instead of an error', async () => {
    const userId = newId();
    for (let i = 0; i < 15; i++) {
      expect((bodyOf(await ask(userId, '100')) as { unavailable: unknown }).unavailable).toBeNull();
    }
    expect(bodyOf(await ask(userId, '100'))).toEqual({ videos: [], unavailable: 'dailyLimit' });
    expect((bodyOf(await ask(newId(), '100')) as { unavailable: unknown }).unavailable).toBeNull(); // others unaffected
    deps.setNow('2026-10-08T17:00:00.000Z'); // the next day
    expect((bodyOf(await ask(userId, '100')) as { unavailable: unknown }).unavailable).toBeNull();
  });

  it('passes on "not configured" or "busy" from YouTube without failing', async () => {
    const off = {
      ...deps,
      youtube: {
        findVideos: () => Promise.resolve({ ok: false as const, reason: 'notConfigured' as const }),
      },
    };
    const result = await runHandler(
      suggestYouTubeFn,
      apiEvent({ userId: newId(), queryStringParameters: { providerSongId: '100' } }),
      off,
    );
    expect(bodyOf(result)).toEqual({ videos: [], unavailable: 'notConfigured' });
  });
});
