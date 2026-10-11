import { describe, expect, it, vi } from 'vitest';
import { createYouTubeSearch, decodeYouTubeText } from './youtube-search';

vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

/** Shape from the search.list reference (snippet + id), trimmed to the fields we ask for. */
const RESULTS = {
  items: [
    {
      id: { videoId: 'dQw4w9WgXcQ' },
      snippet: { title: 'M83 &#39;Midnight City&#39; Official video', channelTitle: 'M83VEVO' },
    },
    { id: { videoId: 'not-an-id' }, snippet: { title: 'Broken', channelTitle: 'x' } },
    {
      id: { videoId: 'abcdefghijk' },
      snippet: { title: 'Midnight City (Live) &amp; more', channelTitle: 'Fan &quot;Cam&quot;' },
    },
  ],
};

const allow = () => Promise.resolve(true);

describe('createYouTubeSearch (ADR-0012)', () => {
  it('searches embeddable music videos with the documented parameters, key in a header (never the URL)', async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) => respond(RESULTS));
    const search = createYouTubeSearch({
      getApiKey: () => Promise.resolve('secret-key'),
      fetchImpl: fetchImpl as unknown as typeof fetch, // the code always passes a string URL
    });
    const result = await search.findVideos('828259377', 'M83 Midnight City', allow);

    const url = new URL(fetchImpl.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/youtube/v3/search');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      part: 'snippet',
      type: 'video',
      videoEmbeddable: 'true',
      videoCategoryId: '10',
      maxResults: '3',
      safeSearch: 'moderate',
      q: 'M83 Midnight City',
    });
    expect(url.toString()).not.toContain('secret-key');
    expect((fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'secret-key',
    );

    // YouTube's order and words, escapes turned back into characters; malformed results skipped, not rewritten.
    expect(result).toEqual({
      ok: true,
      videos: [
        { videoId: 'dQw4w9WgXcQ', title: "M83 'Midnight City' Official video", channelTitle: 'M83VEVO' },
        { videoId: 'abcdefghijk', title: 'Midnight City (Live) & more', channelTitle: 'Fan "Cam"' },
      ],
    });
  });

  it('caches each song for an hour, so picking it again costs no search', async () => {
    let clock = 0;
    const fetchImpl = vi.fn(() => respond(RESULTS));
    const search = createYouTubeSearch({
      getApiKey: () => Promise.resolve('k'),
      fetchImpl,
      now: () => clock,
    });
    await search.findVideos('1', 'a', allow);
    await search.findVideos('1', 'a', allow);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock = 61 * 60 * 1000;
    await search.findVideos('1', 'a', allow);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('asks for an allowance only for real searches, and stops when there is none left', async () => {
    const fetchImpl = vi.fn(() => respond(RESULTS));
    const mayUseSearch = vi.fn(() => Promise.resolve(true));
    const search = createYouTubeSearch({ getApiKey: () => Promise.resolve('k'), fetchImpl });
    await search.findVideos('1', 'a', mayUseSearch);
    await search.findVideos('1', 'a', mayUseSearch); // cached: free
    expect(mayUseSearch).toHaveBeenCalledTimes(1);
    expect(await search.findVideos('2', 'b', () => Promise.resolve(false))).toEqual({
      ok: false,
      reason: 'dailyLimit',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const noKey = createYouTubeSearch({ getApiKey: () => Promise.resolve(null), fetchImpl });
    const neverAsked = vi.fn(() => Promise.resolve(true));
    await noKey.findVideos('3', 'c', neverAsked);
    expect(neverAsked).not.toHaveBeenCalled();
  });

  it('is "busy" when YouTube answers with something that isn’t JSON', async () => {
    const odd = createYouTubeSearch({
      getApiKey: () => Promise.resolve('k'),
      fetchImpl: () => Promise.resolve(new Response('<html>oops</html>', { status: 200 })),
    });
    expect(await odd.findVideos('1', 'a', allow)).toEqual({ ok: false, reason: 'busy' });
  });

  it('is quietly off without a key, and "busy" when YouTube says no or doesn’t answer', async () => {
    const noKey = createYouTubeSearch({ getApiKey: () => Promise.resolve(null), fetchImpl: vi.fn() });
    expect(await noKey.findVideos('1', 'a', allow)).toEqual({ ok: false, reason: 'notConfigured' });

    const quota = createYouTubeSearch({
      getApiKey: () => Promise.resolve('k'),
      fetchImpl: () => respond({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403),
    });
    expect(await quota.findVideos('1', 'a', allow)).toEqual({ ok: false, reason: 'busy' });

    const down = createYouTubeSearch({
      getApiKey: () => Promise.resolve('k'),
      fetchImpl: () => Promise.reject(new Error('network')),
    });
    expect(await down.findVideos('1', 'a', allow)).toEqual({ ok: false, reason: 'busy' });
  });
});

describe('decodeYouTubeText', () => {
  it.each([
    ['Don&#39;t Stop', "Don't Stop"],
    ['A &amp; B', 'A & B'],
    ['&amp;lt;tag&amp;gt;', '&lt;tag&gt;'],
    ['&quot;hi&quot;', '"hi"'],
    ['Beyonc&#xE9;', 'Beyoncé'],
  ])('%s → %s', (input, output) => {
    expect(decodeYouTubeText(input)).toBe(output);
  });
});
