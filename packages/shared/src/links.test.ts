import { describe, expect, it } from 'vitest';
import {
  canonicalLinks,
  parseAppleMusicSongUrl,
  parseSpotifyTrackUrl,
  parseYouTubeUrl,
  searchLinks,
} from './links';

describe('parseSpotifyTrackUrl', () => {
  it.each([
    ['https://open.spotify.com/track/1eyzqe2QqGZUmfcPZtrIyt', '1eyzqe2QqGZUmfcPZtrIyt'],
    ['https://open.spotify.com/track/1eyzqe2QqGZUmfcPZtrIyt?si=abc123', '1eyzqe2QqGZUmfcPZtrIyt'],
    ['https://open.spotify.com/intl-de/track/1eyzqe2QqGZUmfcPZtrIyt', '1eyzqe2QqGZUmfcPZtrIyt'],
    ['  https://open.spotify.com/track/1eyzqe2QqGZUmfcPZtrIyt  ', '1eyzqe2QqGZUmfcPZtrIyt'],
  ])('accepts %s', (url, id) => {
    expect(parseSpotifyTrackUrl(url)).toBe(id);
  });

  it.each([
    'http://open.spotify.com/track/1eyzqe2QqGZUmfcPZtrIyt', // not https
    'https://open.spotify.com/album/1eyzqe2QqGZUmfcPZtrIyt', // album, not track
    'https://open.spotify.com.evil.com/track/1eyzqe2QqGZUmfcPZtrIyt', // look-alike domain
    'https://open.spotify.com/track/short',
    'spotify:track:1eyzqe2QqGZUmfcPZtrIyt',
    'not a url',
  ])('rejects %s', (url) => {
    expect(parseSpotifyTrackUrl(url)).toBeNull();
  });
});

describe('parseYouTubeUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dX3k_QDnzHE', 'dX3k_QDnzHE'],
    ['https://youtube.com/watch?v=dX3k_QDnzHE&t=30', 'dX3k_QDnzHE'],
    ['https://m.youtube.com/watch?v=dX3k_QDnzHE', 'dX3k_QDnzHE'],
    ['https://music.youtube.com/watch?v=dX3k_QDnzHE&si=x', 'dX3k_QDnzHE'],
    ['https://youtu.be/dX3k_QDnzHE', 'dX3k_QDnzHE'],
  ])('accepts %s', (url, id) => {
    expect(parseYouTubeUrl(url)).toBe(id);
  });

  it.each([
    'https://www.youtube.com/channel/UC123',
    'https://www.youtube.com/watch?v=tooShort',
    'https://youtube.com.evil.com/watch?v=dX3k_QDnzHE',
    'http://youtu.be/dX3k_QDnzHE',
  ])('rejects %s', (url) => {
    expect(parseYouTubeUrl(url)).toBeNull();
  });
});

describe('parseAppleMusicSongUrl', () => {
  it.each([
    ['https://music.apple.com/us/album/midnight-city/828259375?i=828259377&uo=4', '828259377'],
    ['https://music.apple.com/gb/song/midnight-city/828259377', '828259377'],
  ])('accepts %s', (url, id) => {
    expect(parseAppleMusicSongUrl(url)).toBe(id);
  });

  it.each([
    'https://music.apple.com/us/album/midnight-city/828259375', // album without a track
    'https://music.apple.com/us/artist/m83/1234',
    'https://itunes.apple.com/us/album/x/1?i=2',
    'https://music.apple.com.evil.com/us/song/x/1',
  ])('rejects %s', (url) => {
    expect(parseAppleMusicSongUrl(url)).toBeNull();
  });
});

describe('canonical and search links', () => {
  it('builds clean links without tracking parameters', () => {
    expect(canonicalLinks.spotify('1eyzqe2QqGZUmfcPZtrIyt')).toBe(
      'https://open.spotify.com/track/1eyzqe2QqGZUmfcPZtrIyt',
    );
    expect(canonicalLinks.youtube('dX3k_QDnzHE')).toBe('https://www.youtube.com/watch?v=dX3k_QDnzHE');
  });

  it('encodes artist and title in search links', () => {
    expect(searchLinks.youtube('M83', 'Midnight City & More')).toBe(
      'https://www.youtube.com/results?search_query=M83%20Midnight%20City%20%26%20More',
    );
    expect(searchLinks.spotify('M83', 'Midnight City')).toBe(
      'https://open.spotify.com/search/M83%20Midnight%20City',
    );
  });
});
