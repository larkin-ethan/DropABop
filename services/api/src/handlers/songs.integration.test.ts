import { afterAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { runHandler } from '../http/handler';
import { resolveSongFn, searchSongsFn } from './songs';

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
