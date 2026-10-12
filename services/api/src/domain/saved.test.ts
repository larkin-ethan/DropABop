import type { MemberName, Recommendation } from '@dropabop/shared';
import { SAVED_SONGS_PAGE_SIZE } from '@dropabop/shared';
import { describe, expect, it } from 'vitest';
import { aRecommendation, aRound } from '../../test/fixtures';
import {
  needsVideoLookup,
  pageOfSaved,
  savedSnapshot,
  toSavedSongView,
  toStoredSavedSong,
  trackIdOf,
  type SavedViewContext,
  type StoredSavedSong,
} from './saved';

const round = aRound('p1', '2026-10-05', { endsAt: '2026-10-12T05:00:00.000Z' });

function sharedSong(overrides: Partial<Recommendation> = {}): Recommendation {
  const base = aRecommendation(round, 'sharer', '2026-10-07');
  return {
    ...base,
    song: {
      ...base.song,
      providers: [
        {
          provider: 'appleMusic',
          providerSongId: '828259377',
          externalUrl: 'https://music.apple.com/us/song/x/828259377',
        },
        { provider: 'spotify', providerSongId: 'abc', externalUrl: 'https://open.spotify.com/track/abc' },
        {
          provider: 'youtube',
          providerSongId: 'dX3k_QDnzHE',
          externalUrl: 'https://www.youtube.com/watch?v=dX3k_QDnzHE',
        },
        {
          provider: 'youtubeMusic',
          providerSongId: 'dX3k_QDnzHE',
          externalUrl: 'https://music.youtube.com/watch?v=dX3k_QDnzHE',
        },
      ],
    },
    ...overrides,
  };
}

const stored = (overrides: Partial<StoredSavedSong> = {}): StoredSavedSong => ({
  ...(toStoredSavedSong({
    recommendation: sharedSong(),
    partyName: 'Old name',
    weekEndsAt: round.endsAt,
    now: new Date('2026-10-07T18:00:00.000Z'),
  }) as StoredSavedSong),
  ...overrides,
});

const sarah: MemberName = { userId: 'sharer', displayName: 'Sarah', avatarColor: '#fff', avatarImage: null };
const ctx = (overrides: Partial<SavedViewContext> = {}): SavedViewContext => ({
  viewerId: 'me',
  now: new Date('2026-10-08T12:00:00.000Z'), // the week is still open
  memberOf: new Map([['p1', 'Road Trip Crew']]),
  membersByParty: new Map([['p1', new Map([['sharer', sarah]])]]),
  videos: new Map(),
  ...overrides,
});

describe('the saved copy (D34)', () => {
  it('is identified by the Apple Music track id', () => {
    expect(trackIdOf(sharedSong().song)).toBe('828259377');
    expect(trackIdOf({ ...sharedSong().song, providers: [] })).toBeNull();
  });

  it('never keeps YouTube or YouTube Music links (ADR-0011/0012), but keeps Apple Music and Spotify', () => {
    const providers = savedSnapshot(sharedSong().song).providers.map((p) => p.provider);
    expect(providers).toEqual(['appleMusic', 'spotify']);
    const saved = toStoredSavedSong({
      recommendation: sharedSong(),
      partyName: 'Road Trip Crew',
      weekEndsAt: round.endsAt,
      now: new Date('2026-10-07T18:00:00.000Z'),
    });
    expect(JSON.stringify(saved)).not.toContain('dX3k_QDnzHE');
    expect(saved).toMatchObject({
      trackId: '828259377',
      partyId: 'p1',
      sharedBy: 'sharer',
      submittedOn: '2026-10-07',
    });
  });
});

describe('what the owner sees', () => {
  it('while the week is open: no sharer (D10), but the party and date', () => {
    const view = toSavedSongView(stored(), ctx());
    expect(view.from).toMatchObject({ partyName: 'Road Trip Crew', isMember: true, isMine: false });
    expect(view.from).not.toHaveProperty('sharedBy');
    expect(JSON.stringify(view)).not.toContain('"sharer"');
  });

  it('after the week ended, while still a member: who shared it', () => {
    const view = toSavedSongView(stored(), ctx({ now: new Date('2026-10-12T05:00:00.000Z') }));
    expect(view.from.sharedBy).toEqual(sarah);
  });

  it('after leaving the party: the song stays, with its old party name, no sharer and no video', () => {
    const view = toSavedSongView(
      stored(),
      ctx({
        now: new Date('2026-10-20T00:00:00.000Z'),
        memberOf: new Map(),
        videos: new Map([[stored().recommendationId, 'dX3k_QDnzHE']]),
      }),
    );
    expect(view.from).toMatchObject({ partyName: 'Old name', isMember: false });
    expect(view.from).not.toHaveProperty('sharedBy');
    expect(view.song.providers.map((p) => p.provider)).toEqual(['appleMusic', 'spotify']);
  });

  it('adds a live video only from the party’s own item, while still a member', () => {
    const s = stored();
    const view = toSavedSongView(s, ctx({ videos: new Map([[s.recommendationId, 'dX3k_QDnzHE']]) }));
    expect(view.song.providers.at(-1)).toEqual({
      provider: 'youtube',
      providerSongId: 'dX3k_QDnzHE',
      externalUrl: 'https://www.youtube.com/watch?v=dX3k_QDnzHE',
    });
  });

  it('after the week ended, if the sharer has left the party: no sharer', () => {
    const view = toSavedSongView(
      stored(),
      ctx({ now: new Date('2026-10-12T05:00:00.000Z'), membersByParty: new Map([['p1', new Map()]]) }),
    );
    expect(view.from.isMember).toBe(true);
    expect(view.from).not.toHaveProperty('sharedBy');
  });

  it('marks your own picks', () => {
    expect(toSavedSongView(stored({ sharedBy: 'me' }), ctx()).from.isMine).toBe(true);
  });
});

describe('order, pages and video lookups', () => {
  it('newest saved first, pages of 100 with a cursor', () => {
    const all = Array.from({ length: 150 }, (_, i) =>
      stored({ trackId: String(1000 + i), savedAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString() }),
    );
    const first = pageOfSaved(all, 0);
    expect(first.page).toHaveLength(SAVED_SONGS_PAGE_SIZE);
    expect(first.page[0]?.trackId).toBe('1149');
    expect(first.nextCursor).toBe('100');
    const second = pageOfSaved(all, 100);
    expect(second.page).toHaveLength(50);
    expect(second.nextCursor).toBeNull();
  });

  it('looks up videos only for recent songs in parties you’re in', () => {
    const member = new Map([['p1', 'Road Trip Crew']]);
    expect(needsVideoLookup(stored(), member, new Date('2026-10-20T00:00:00.000Z'))).toBe(true);
    expect(needsVideoLookup(stored(), member, new Date('2026-11-20T00:00:00.000Z'))).toBe(false);
    expect(needsVideoLookup(stored(), new Map(), new Date('2026-10-20T00:00:00.000Z'))).toBe(false);
  });
});
