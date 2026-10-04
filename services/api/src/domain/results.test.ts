import { describe, expect, it } from 'vitest';
import type { Recommendation, Round, Vote, Weekday } from '@dropabop/shared';
import { calculateWeekResults, canViewResults, roundToOneDecimal, toOpenWeekSongView } from './results';

const round: Round = {
  roundId: 'p1.2026-10-05',
  partyId: 'p1',
  weekStart: '2026-10-05',
  timezone: 'America/Chicago',
  startsAt: '2026-10-05T05:00:00.000Z',
  endsAt: '2026-10-12T05:00:00.000Z',
  status: 'OPEN',
};

const DATES: Record<Weekday, string> = {
  MON: '2026-10-05',
  TUE: '2026-10-06',
  WED: '2026-10-07',
  THU: '2026-10-08',
  FRI: '2026-10-09',
};

function rec(id: string, userId: string, weekday: Weekday): Recommendation {
  return {
    recommendationId: id,
    roundId: round.roundId,
    partyId: 'p1',
    userId,
    submittedOn: DATES[weekday],
    weekday,
    song: {
      songId: `song-${id}`,
      title: `Title ${id}`,
      artist: 'Artist',
      album: null,
      albumArtUrl: null,
      durationMs: null,
      releaseDate: null,
      providers: [{ provider: 'spotify', providerSongId: id, externalUrl: `https://open.example.com/${id}` }],
    },
    createdAt: `${DATES[weekday]}T15:00:00.000Z`,
  };
}

function vote(recommendationId: string, userId: string, rating: number): Vote {
  return { roundId: round.roundId, recommendationId, userId, rating, updatedAt: '2026-10-10T00:00:00.000Z' };
}

describe('toOpenWeekSongView (D9, D10)', () => {
  const song = rec('r1', 'bob', 'MON');

  it('hides who shared the song by default, and never includes others’ ratings', () => {
    const view = toOpenWeekSongView(song, 'alice', undefined, { revealRecommenderDuringVoting: false });
    expect(view).not.toHaveProperty('recommendedBy');
    expect(view).not.toHaveProperty('averageRating');
    expect(view).not.toHaveProperty('ratings');
    expect(view).toMatchObject({ isMine: false, myRating: null });
  });

  it('shows the recommender when the party setting allows it', () => {
    const view = toOpenWeekSongView(song, 'alice', undefined, { revealRecommenderDuringVoting: true });
    expect(view.recommendedBy).toBe('bob');
  });

  it('always tells you which songs are yours', () => {
    const view = toOpenWeekSongView(song, 'bob', undefined, { revealRecommenderDuringVoting: false });
    expect(view).toMatchObject({ isMine: true, recommendedBy: 'bob' });
  });

  it('includes your own rating', () => {
    const view = toOpenWeekSongView(song, 'alice', vote('r1', 'alice', 7), {
      revealRecommenderDuringVoting: false,
    });
    expect(view.myRating).toBe(7);
  });
});

describe('canViewResults', () => {
  it('blocks results while the week is open', () => {
    expect(canViewResults(round, new Date('2026-10-11T12:00:00Z'), 5)).toMatchObject({
      ok: false,
      code: 'RESULTS_NOT_READY',
      message: 'Results unlock when the week ends on Sunday night.',
    });
  });

  it('allows results once the week has ended', () => {
    expect(canViewResults(round, new Date('2026-10-12T05:00:00.000Z'), 5)).toEqual({ ok: true });
  });

  it('explains there are no results when fewer than 2 songs were shared', () => {
    expect(canViewResults(round, new Date('2026-10-13T00:00:00Z'), 1)).toMatchObject({
      ok: false,
      message: 'Not enough songs were shared this week, so there are no results.',
    });
  });
});

describe('calculateWeekResults (spec §16, D11, D12)', () => {
  const recommendations = [
    rec('mon-a', 'alice', 'MON'),
    rec('mon-b', 'bob', 'MON'),
    rec('tue-a', 'alice', 'TUE'),
    rec('wed-c', 'carol', 'WED'),
    rec('wed-b', 'bob', 'WED'), // nobody rates this one
  ];
  const votes = [
    // mon-a (alice's): bob 9, carol 7 → 8.0
    vote('mon-a', 'bob', 9),
    vote('mon-a', 'carol', 7),
    // mon-b (bob's): alice 8, carol 8 → 8.0 (ties with mon-a)
    vote('mon-b', 'alice', 8),
    vote('mon-b', 'carol', 8),
    // tue-a (alice's): bob 10, carol 9 → 9.5
    vote('tue-a', 'bob', 10),
    vote('tue-a', 'carol', 9),
    // wed-c (carol's): alice 3 → 3.0
    vote('wed-c', 'alice', 3),
    // self-rating that should never exist; must be ignored
    vote('wed-c', 'carol', 10),
    // rating for a song that isn't in this week; must be ignored
    vote('other-week', 'alice', 10),
  ];

  const results = calculateWeekResults({
    round,
    recommendations,
    votes,
    viewerId: 'alice',
    settings: { showWhoRatedWhat: false },
  });
  const byId = Object.fromEntries(results.songs.map((s) => [s.recommendationId, s]));

  it('ranks the whole week best-first, with ties sharing a rank and unrated songs last', () => {
    expect(results.songs.map((s) => [s.recommendationId, s.rank])).toEqual([
      ['tue-a', 1],
      ['mon-a', 2],
      ['mon-b', 2],
      ['wed-c', 4],
      ['wed-b', 5],
    ]);
  });

  it('calculates averages, counts, and the anonymous distribution', () => {
    expect(byId['tue-a']).toMatchObject({ averageRating: 9.5, ratingCount: 2 });
    expect(byId['tue-a']?.distribution).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 1]);
    expect(byId['mon-a']?.distribution).toEqual([0, 0, 0, 0, 0, 0, 1, 0, 1, 0]);
  });

  it('shows “no ratings” as a null average with zero count', () => {
    expect(byId['wed-b']).toMatchObject({ averageRating: null, ratingCount: 0 });
  });

  it('ignores self-ratings and ratings for songs from other weeks', () => {
    expect(byId['wed-c']).toMatchObject({ averageRating: 3, ratingCount: 1 });
    expect(results.totalRatings).toBe(7);
  });

  it('reveals who shared each song now that the week is over (D10)', () => {
    expect(byId['mon-b']?.recommendedBy).toBe('bob');
  });

  it('includes the viewer’s own rating', () => {
    expect(byId['mon-b']?.myRating).toBe(8);
    expect(byId['tue-a']?.myRating).toBeNull(); // her own song
  });

  it('leaves out who-rated-what entirely when the setting is off (D11)', () => {
    for (const song of results.songs) {
      expect(song).not.toHaveProperty('ratings');
    }
  });

  it('includes who-rated-what when the setting is on', () => {
    const open = calculateWeekResults({
      round,
      recommendations,
      votes,
      viewerId: 'alice',
      settings: { showWhoRatedWhat: true },
    });
    expect(open.songs.find((s) => s.recommendationId === 'mon-a')?.ratings).toEqual([
      { userId: 'bob', rating: 9 },
      { userId: 'carol', rating: 7 },
    ]);
  });

  it('gives every weekday a slot, with each day’s Song of the Day (ties → several winners)', () => {
    expect(results.days).toEqual([
      { weekday: 'MON', songIds: ['mon-a', 'mon-b'], winnerIds: ['mon-a', 'mon-b'] },
      { weekday: 'TUE', songIds: ['tue-a'], winnerIds: ['tue-a'] },
      { weekday: 'WED', songIds: ['wed-c', 'wed-b'], winnerIds: ['wed-c'] },
      { weekday: 'THU', songIds: [], winnerIds: [] },
      { weekday: 'FRI', songIds: [], winnerIds: [] },
    ]);
  });

  it('a day whose songs are all unrated has no winner', () => {
    const onlyUnrated = calculateWeekResults({
      round,
      recommendations: [rec('x', 'alice', 'THU'), rec('y', 'bob', 'THU')],
      votes: [],
      viewerId: 'alice',
      settings: { showWhoRatedWhat: false },
    });
    expect(onlyUnrated.days[3]).toEqual({ weekday: 'THU', songIds: ['x', 'y'], winnerIds: [] });
    expect(onlyUnrated.songs.map((s) => s.rank)).toEqual([1, 1]);
  });

  it('ranks by the average people see: 8.33 and 8.25 both show 8.3 and tie', () => {
    const tie = calculateWeekResults({
      round,
      recommendations: [rec('a', 'alice', 'MON'), rec('b', 'bob', 'MON')],
      votes: [
        vote('a', 'bob', 9),
        vote('a', 'carol', 8),
        vote('a', 'dan', 8), // 8.333…
        vote('b', 'alice', 9),
        vote('b', 'carol', 8),
        vote('b', 'dan', 8),
        vote('b', 'erin', 8), // 8.25
      ],
      viewerId: 'alice',
      settings: { showWhoRatedWhat: false },
    });
    expect(tie.songs.map((s) => [s.averageRating, s.rank])).toEqual([
      [8.3, 1],
      [8.3, 1],
    ]);
  });

  it('ignores ratings saved at or after the week ended, even if the request started just before', () => {
    const late = calculateWeekResults({
      round,
      recommendations: [rec('a', 'alice', 'MON')],
      votes: [
        { ...vote('a', 'bob', 8), updatedAt: '2026-10-12T04:59:59.999Z' },
        { ...vote('a', 'carol', 1), updatedAt: '2026-10-12T05:00:00.000Z' },
      ],
      viewerId: 'alice',
      settings: { showWhoRatedWhat: false },
    });
    expect(late.songs[0]).toMatchObject({ averageRating: 8, ratingCount: 1 });
  });

  it('handles a week with no ratings at all', () => {
    const empty = calculateWeekResults({
      round,
      recommendations: [rec('a', 'alice', 'MON'), rec('b', 'bob', 'TUE')],
      votes: [],
      viewerId: 'alice',
      settings: { showWhoRatedWhat: false },
    });
    expect(empty.totalRatings).toBe(0);
    expect(empty.songs.every((s) => s.averageRating === null && s.rank === 1)).toBe(true);
  });
});

describe('roundToOneDecimal', () => {
  it.each([
    [8.25, 8.3],
    [8.333333, 8.3],
    [8.35, 8.4],
    [7, 7],
    [9.95, 10],
  ])('%s → %s', (input, expected) => {
    expect(roundToOneDecimal(input)).toBe(expected);
  });
});
