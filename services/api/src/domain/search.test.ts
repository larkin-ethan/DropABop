import type { Recommendation, Round, RoundStatus } from '@dropabop/shared';
import { describe, expect, it } from 'vitest';
import { aRecommendation, aRound } from '../../test/fixtures';
import {
  SEARCH_PAGE_SIZE,
  SEARCH_PREVIEW_SIZE,
  matchScore,
  normalize,
  searchParty,
  type SearchInput,
} from './search';

const closed = aRound('p1', '2026-09-28');
const open = aRound('p1', '2026-10-05');
const revealing = aRound('p1', '2026-10-12', { revealRecommenderDuringVoting: true });

function song(
  round: Round,
  by: string,
  title: string,
  artist: string,
  album: string | null = null,
): Recommendation {
  const base = aRecommendation(round, by, round.weekStart);
  return { ...base, song: { ...base.song, title, artist, album } };
}

function input(overrides: Partial<SearchInput>): SearchInput {
  const rounds: { round: Round; status: RoundStatus }[] = [
    { round: closed, status: 'CLOSED' },
    { round: open, status: 'OPEN' },
    { round: revealing, status: 'OPEN' },
  ];
  return {
    q: 'robyn',
    type: 'all',
    offset: 0,
    viewerId: 'me',
    recommendations: [],
    rounds,
    members: [
      { userId: 'me', displayName: 'Ethan', avatarColor: '#fff', avatarImage: null },
      { userId: 'sk', displayName: 'Sarah Kim', avatarColor: '#fff', avatarImage: null },
    ],
    truncated: false,
    ...overrides,
  };
}

describe('normalize and matchScore', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(normalize('  Björk   Beyoncé ')).toBe('bjork beyonce');
  });

  it('scores a word start above a match inside a word, and null for no match', () => {
    expect(matchScore('rob', ['Dancing On My Own (feat. Robyn)'])).toBe(0);
    expect(matchScore('obyn', ['Robyn'])).toBe(1);
    expect(matchScore('sade', ['Robyn', null])).toBeNull();
  });
});

describe('searchParty: songs (D9, D10)', () => {
  const recs = [
    song(closed, 'sk', 'Dancing On My Own', 'Robyn', 'Body Talk'),
    song(open, 'sk', 'Call Your Girlfriend', 'Robyn'),
    song(open, 'me', 'Hang With Me', 'Robyn'),
    song(revealing, 'sk', 'Konichiwa Bitches', 'Robyn'),
    song(closed, 'sk', 'Smooth Operator', 'Sade'),
  ];

  it('matches title, artist or album', () => {
    const byAlbum = searchParty(input({ q: 'body talk', recommendations: recs }));
    expect(byAlbum.songs.map((s) => s.title)).toEqual(['Dancing On My Own']);
    expect(searchParty(input({ q: 'operator', recommendations: recs })).songs).toHaveLength(1);
  });

  it('hides who shared a song while its week is open, unless it’s yours or the week reveals sharers', () => {
    const result = searchParty(input({ q: 'robyn', type: 'songs', recommendations: recs }));
    const byTitle = new Map(result.songs.map((s) => [s.title, s]));
    expect(byTitle.get('Dancing On My Own')).toMatchObject({ weekOpen: false, recommendedBy: 'sk' });
    expect(byTitle.get('Call Your Girlfriend')).toMatchObject({ weekOpen: true, isMine: false });
    expect(byTitle.get('Call Your Girlfriend')).not.toHaveProperty('recommendedBy');
    expect(byTitle.get('Hang With Me')).toMatchObject({ weekOpen: true, isMine: true, recommendedBy: 'me' });
    expect(byTitle.get('Konichiwa Bitches')).toMatchObject({ weekOpen: true, recommendedBy: 'sk' });
  });

  it('returns exactly the song fields listed in the API, so no rating or average can slip in (D9)', () => {
    const result = searchParty(input({ type: 'songs', recommendations: recs }));
    const base = [
      'album',
      'albumArtUrl',
      'artist',
      'isMine',
      'recommendationId',
      'roundId',
      'submittedOn',
      'title',
      'weekOpen',
    ];
    for (const hit of result.songs) {
      const expected = hit.recommendedBy === undefined ? base : [...base, 'recommendedBy'].sort();
      expect(Object.keys(hit).sort()).toEqual(expected);
    }
  });

  it('a query that is only accent marks matches nothing (not everything)', () => {
    const result = searchParty(input({ q: '\u0301\u0301', recommendations: recs }));
    expect(result.totals).toEqual({ songs: 0, artists: 0, members: 0, weeks: 0 });
  });

  it('treats a song whose week is unknown as open (the safe side)', () => {
    const stray = song(aRound('p1', '2026-01-05'), 'sk', 'Robyn Song', 'X');
    const [hit] = searchParty(input({ type: 'songs', recommendations: [stray] })).songs;
    expect(hit).toMatchObject({ weekOpen: true });
    expect(hit).not.toHaveProperty('recommendedBy');
  });
});

describe('searchParty: artists, members, weeks', () => {
  it('groups artists spelling-insensitively with song counts', () => {
    const recs = [
      song(closed, 'a', 'One', 'Björk'),
      song(open, 'b', 'Two', 'bjork '),
      song(closed, 'c', 'x', 'Sade'),
    ];
    const result = searchParty(input({ q: 'bjork', recommendations: recs }));
    expect(result.artists).toEqual([{ artist: 'Björk', songCount: 2 }]);
  });

  it('finds current members by name, word starts first', () => {
    expect(searchParty(input({ q: 'kim' })).members.map((m) => m.userId)).toEqual(['sk']);
    expect(searchParty(input({ q: 'nobody' })).members).toEqual([]);
  });

  it('finds weeks typed as a date, a month name or "week of"', () => {
    const recs = [song(closed, 'a', 'One', 'X'), song(closed, 'b', 'Two', 'Y')];
    for (const q of ['2026-09-28', 'september 28', 'sep 28', 'week of september']) {
      const result = searchParty(input({ q, recommendations: recs }));
      expect(result.weeks).toEqual([
        { roundId: closed.roundId, weekStart: '2026-09-28', status: 'CLOSED', songCount: 2 },
      ]);
    }
    expect(searchParty(input({ q: 'october' })).weeks.map((w) => w.weekStart)).toEqual([
      '2026-10-12',
      '2026-10-05',
    ]);
  });
});

describe('searchParty: preview, pages and the cap', () => {
  const many = Array.from({ length: 45 }, (_, i) => song(closed, 'sk', `Robyn track ${i}`, 'Robyn'));

  it('`all` shows the best few of each category with totals, and no cursor', () => {
    const result = searchParty(input({ recommendations: many }));
    expect(result.songs).toHaveLength(SEARCH_PREVIEW_SIZE);
    expect(result.totals).toEqual({ songs: 45, artists: 1, members: 0, weeks: 0 });
    expect(result.nextCursor).toBeNull();
  });

  it('one category pages through every match', () => {
    const first = searchParty(input({ type: 'songs', recommendations: many }));
    expect(first.songs).toHaveLength(SEARCH_PAGE_SIZE);
    expect(first.artists).toEqual([]);
    expect(first.nextCursor).toBe('20');
    const last = searchParty(input({ type: 'songs', offset: 40, recommendations: many }));
    expect(last.songs).toHaveLength(5);
    expect(last.nextCursor).toBeNull();
    const seen = new Set(
      [0, 20, 40].flatMap((offset) =>
        searchParty(input({ type: 'songs', offset, recommendations: many })).songs.map(
          (s) => s.recommendationId,
        ),
      ),
    );
    expect(seen.size).toBe(45);
  });

  it('passes on whether the read was capped', () => {
    expect(searchParty(input({ truncated: true })).truncated).toBe(true);
  });
});
