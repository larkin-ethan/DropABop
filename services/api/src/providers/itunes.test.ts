import { describe, expect, it, vi } from 'vitest';
import { DomainError } from '../data/errors';
import { createItunesCatalog, largerArtwork, toSong } from './itunes';

vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

/** Shape copied from a live iTunes response (2026-10-01). */
const MIDNIGHT_CITY = {
  wrapperType: 'track',
  kind: 'song',
  trackId: 828259377,
  trackName: 'Midnight City',
  artistName: 'M83',
  collectionName: "Hurry Up, We're Dreaming",
  trackTimeMillis: 241440,
  releaseDate: '2011-07-19T07:00:00Z',
  trackViewUrl: 'https://music.apple.com/us/album/midnight-city/828259375?i=828259377&uo=4',
  artworkUrl100:
    'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/cb/7b/a9/cb7ba903/724596951057.jpg/100x100bb.jpg',
};

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

describe('toSong', () => {
  it('maps an iTunes track to our provider-independent Song (spec §12)', () => {
    expect(toSong(MIDNIGHT_CITY)).toEqual({
      songId: 'appleMusic:828259377',
      title: 'Midnight City',
      artist: 'M83',
      album: "Hurry Up, We're Dreaming",
      albumArtUrl:
        'https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/cb/7b/a9/cb7ba903/724596951057.jpg/300x300bb.jpg',
      durationMs: 241440,
      releaseDate: '2011-07-19',
      providers: [
        {
          provider: 'appleMusic',
          providerSongId: '828259377',
          externalUrl: 'https://music.apple.com/us/album/midnight-city/828259375?i=828259377&uo=4',
        },
      ],
    });
  });

  it('skips results that aren’t songs, or lack required fields or https links', () => {
    expect(toSong({ ...MIDNIGHT_CITY, kind: 'music-video' })).toBeNull();
    expect(toSong({ ...MIDNIGHT_CITY, trackName: undefined })).toBeNull();
    expect(toSong({ ...MIDNIGHT_CITY, trackViewUrl: 'http://music.apple.com/x' })).toBeNull();
  });

  it('only rewrites the documented 100×100 artwork pattern', () => {
    expect(largerArtwork('https://x.mzstatic.com/a.jpg/100x100bb.jpg')).toBe(
      'https://x.mzstatic.com/a.jpg/300x300bb.jpg',
    );
    expect(largerArtwork('https://x.mzstatic.com/a.jpg/other.jpg')).toBe(
      'https://x.mzstatic.com/a.jpg/other.jpg',
    );
    expect(largerArtwork(undefined)).toBeNull();
  });
});

describe('createItunesCatalog', () => {
  it('searches songs with the documented parameters', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => respond({ resultCount: 1, results: [MIDNIGHT_CITY] }));
    const catalog = createItunesCatalog({ fetchImpl });
    const songs = await catalog.searchSongs('  Midnight City ');
    expect(songs.map((s) => s.title)).toEqual(['Midnight City']);
    const url = new URL(fetchImpl.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe('https://itunes.apple.com/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      term: 'Midnight City',
      media: 'music',
      entity: 'song',
      country: 'us',
      limit: '10',
    });
  });

  it('caches repeated searches for 10 minutes', async () => {
    let clock = 0;
    const fetchImpl = vi.fn<typeof fetch>(() => respond({ results: [MIDNIGHT_CITY] }));
    const catalog = createItunesCatalog({ fetchImpl, now: () => clock });
    await catalog.searchSongs('midnight city');
    await catalog.searchSongs('MIDNIGHT CITY');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock = 11 * 60 * 1000;
    await catalog.searchSongs('midnight city');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('looks up one song by id, and returns null for unknown ids or other providers', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => respond({ results: [MIDNIGHT_CITY] }));
    const catalog = createItunesCatalog({ fetchImpl });
    expect((await catalog.getSong('appleMusic', '828259377'))?.title).toBe('Midnight City');
    expect(await catalog.getSong('appleMusic', '999')).toBeNull();
    expect(await catalog.getSong('spotify', '828259377')).toBeNull();
    expect(await catalog.getSong('appleMusic', 'not-a-number')).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2); // invalid ids never reach the network
  });

  it('turns rate limits, errors, and network failures into friendly messages', async () => {
    const busy = createItunesCatalog({ fetchImpl: () => respond({}, 403) });
    await expect(busy.searchSongs('x y')).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      message: 'Song search is busy right now. Please try again in a minute.',
    });
    const broken = createItunesCatalog({ fetchImpl: () => respond({}, 500) });
    await expect(broken.searchSongs('x y')).rejects.toBeInstanceOf(DomainError);
    const offline = createItunesCatalog({ fetchImpl: () => Promise.reject(new TypeError('fetch failed')) });
    await expect(offline.getSong('appleMusic', '1')).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
});

// Opt-in check against the real iTunes API: LIVE_PROVIDER_TESTS=1 npx vitest run services/api/src/providers
describe.runIf(process.env.LIVE_PROVIDER_TESTS === '1')('iTunes Search API (live)', () => {
  it('finds a well-known song and its Apple Music link', async () => {
    const songs = await createItunesCatalog().searchSongs('midnight city m83');
    expect(songs.length).toBeGreaterThan(0);
    expect(songs[0]?.providers[0]?.externalUrl).toMatch(/^https:\/\/music\.apple\.com\//);
  });
});
