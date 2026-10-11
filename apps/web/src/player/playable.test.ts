import type { Song } from '@dropabop/shared';
import { describe, expect, it } from 'vitest';
import { toPlayableSong, withinInAppPlayWindow } from './playable';

describe('withinInAppPlayWindow (ADR-0011: 30 days)', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  it.each([
    ['2026-11-10', true], // shared today
    ['2026-10-13', true], // 28½ days ago
    ['2026-10-12', false], // 29½ days ago: one day of margin for parties east of UTC
    ['2026-10-11', false], // 30½ days ago
    ['2026-01-01', false],
    ['not a date', false],
  ])('shared %s → %s', (submittedOn, expected) => {
    expect(withinInAppPlayWindow(submittedOn, now)).toBe(expected);
  });

  it('allows the preview before sharing', () => {
    expect(withinInAppPlayWindow(null, now)).toBe(true);
  });
});

describe('toPlayableSong', () => {
  const base: Song = {
    songId: 's1',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    albumArtUrl: 'https://is1-ssl.mzstatic.com/x.jpg',
    durationMs: 200000,
    releaseDate: null,
    providers: [
      { provider: 'appleMusic', providerSongId: '1', externalUrl: 'https://music.apple.com/us/song/x/1' },
    ],
  };
  const withVideo: Song = {
    ...base,
    providers: [
      ...base.providers,
      {
        provider: 'youtube',
        providerSongId: 'dX3k_QDnzHE',
        externalUrl: 'https://www.youtube.com/watch?v=dX3k_QDnzHE',
      },
    ],
  };
  const now = new Date('2026-10-09T12:00:00Z');

  it('turns a song with a linked video into a YouTube song for the player, with its links for the fallback', () => {
    const playable = toPlayableSong({
      key: 'r1',
      song: withVideo,
      submittedOn: '2026-10-08',
      preferred: null,
      now,
    });
    expect(playable).toMatchObject({
      key: 'r1',
      provider: 'youtube',
      providerSongId: 'dX3k_QDnzHE',
      title: 'Blinding Lights',
      artworkUrl: 'https://is1-ssl.mzstatic.com/x.jpg',
    });
    expect(playable?.links.map((l) => l.provider)).toContain('appleMusic');
  });

  it('is null without a linked video, or for songs shared more than 30 days ago', () => {
    expect(
      toPlayableSong({ key: 'r1', song: base, submittedOn: '2026-10-08', preferred: null, now }),
    ).toBeNull();
    expect(
      toPlayableSong({ key: 'r1', song: withVideo, submittedOn: '2026-08-01', preferred: null, now }),
    ).toBeNull();
  });
});
