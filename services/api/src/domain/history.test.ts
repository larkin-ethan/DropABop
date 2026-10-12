import type { Recommendation, Round, RoundStatus, Vote, Weekday } from '@dropabop/shared';
import { describe, expect, it } from 'vitest';
import { addDays, buildHistoryMonth, dateOfWeekday, monthRange } from './history';

const ME = 'me';

function round(weekStart: string, overrides: Partial<Round> = {}): Round {
  return {
    roundId: `p1.${weekStart}`,
    partyId: 'p1',
    weekStart,
    timezone: 'UTC',
    startsAt: `${weekStart}T00:00:00.000Z`,
    endsAt: `${addDays(weekStart, 7)}T00:00:00.000Z`,
    status: 'OPEN',
    ...overrides,
  };
}

let counter = 0;
function rec(r: Round, userId: string, weekday: Weekday, artist = 'Artist', id?: string): Recommendation {
  counter += 1;
  const recommendationId = id ?? `rec-${counter}`;
  return {
    recommendationId,
    roundId: r.roundId,
    partyId: 'p1',
    userId,
    submittedOn: dateOfWeekday(r.weekStart, weekday),
    weekday,
    song: {
      songId: `song-${recommendationId}`,
      title: `Song ${recommendationId}`,
      artist,
      album: null,
      albumArtUrl: null,
      durationMs: null,
      releaseDate: null,
      providers: [{ provider: 'appleMusic', providerSongId: '1', externalUrl: 'https://music.apple.com/x' }],
    },
    createdAt: `${dateOfWeekday(r.weekStart, weekday)}T12:00:00.000Z`,
  };
}

function vote(r: Round, song: Recommendation, userId: string, rating: number, updatedAt?: string): Vote {
  return {
    roundId: r.roundId,
    recommendationId: song.recommendationId,
    userId,
    rating,
    updatedAt: updatedAt ?? `${r.weekStart}T18:00:00.000Z`,
  };
}

const closed = (r: Round) => ({ round: r, status: 'CLOSED' as RoundStatus });

describe('dates', () => {
  it('adds days across months and finds month ends', () => {
    expect(addDays('2026-09-28', 5)).toBe('2026-10-03');
    expect(monthRange('2026-02')).toEqual({ first: '2026-02-01', last: '2026-02-28' });
    expect(monthRange('2026-10')).toEqual({ first: '2026-10-01', last: '2026-10-31' });
    expect(dateOfWeekday('2026-10-05', 'FRI')).toBe('2026-10-09');
  });
});

describe('buildHistoryMonth (D31)', () => {
  it('returns the whole weeks that overlap the month, oldest first, with every sharing day', () => {
    const weeks = buildHistoryMonth({
      month: '2026-10',
      viewerId: ME,
      rounds: [
        closed(round('2026-10-12')),
        closed(round('2026-09-28')), // Mon Sep 28 – Sun Oct 4: overlaps October
        closed(round('2026-09-21')), // entirely September
        closed(round('2026-11-02')), // entirely November
      ],
      recommendations: [],
      votes: [],
    });
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-09-28', '2026-10-12']);
    expect(weeks[0]!.days.map((d) => d.date)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });

  it('open weeks: counts and your own sharing only, no ratings (D9)', () => {
    const r = round('2026-10-05');
    const mine = rec(r, ME, 'MON');
    const theirs = rec(r, 'u2', 'MON');
    const [week] = buildHistoryMonth({
      month: '2026-10',
      viewerId: ME,
      rounds: [{ round: r, status: 'OPEN' }],
      recommendations: [mine, theirs],
      votes: [vote(r, theirs, ME, 9)],
    });
    expect(week!.days[0]).toMatchObject({ songCount: 2, iShared: true, stats: null, personalBest: false });
    expect(week!.summary).toBeNull();
    expect(week!.yourWeek).toBeNull();
  });

  it('weeks that ended without results show no numbers', () => {
    const r = round('2026-10-05');
    const [week] = buildHistoryMonth({
      month: '2026-10',
      viewerId: ME,
      rounds: [{ round: r, status: 'NOT_ENOUGH_SONGS' }],
      recommendations: [rec(r, 'u2', 'MON')],
      votes: [],
    });
    expect(week!.days[0]!.songCount).toBe(1);
    expect(week!.days[0]!.stats).toBeNull();
    expect(week!.summary).toBeNull();
  });

  describe('a closed week', () => {
    const r = round('2026-10-05');
    // Monday: my song and two by "Same Band" (case differs), so it's a favourite artist of the day.
    const mine = rec(r, ME, 'MON', 'Me Band');
    const a = rec(r, 'u2', 'MON', 'Same Band');
    const b = rec(r, 'u3', 'MON', 'same band');
    // Tuesday: two songs with 4 identical ratings each (no spread) → most agreeable day.
    const c = rec(r, 'u2', 'TUE', 'Calm');
    const d = rec(r, 'u3', 'TUE', 'Calm Too');
    const votes = [
      vote(r, mine, 'u2', 9),
      vote(r, mine, 'u3', 7),
      vote(r, mine, ME, 10), // self-rating: never counts (D6)
      vote(r, a, ME, 2),
      vote(r, a, 'u3', 10),
      vote(r, a, 'u4', 1),
      vote(r, a, 'u5', 9), // spread wide → most divisive
      vote(r, b, ME, 4),
      vote(r, b, 'u4', 4),
      vote(r, b, 'u5', 4),
      vote(r, b, 'u2', 4, '2026-10-12T00:00:01.000Z'), // after the lock: ignored
      ...['u4', 'u5', ME, 'u6'].map((u) => vote(r, c, u, 6)),
      ...['u4', 'u5', ME, 'u6'].map((u) => vote(r, d, u, 5)),
    ];
    const [week] = buildHistoryMonth({
      month: '2026-10',
      viewerId: ME,
      rounds: [closed(r)],
      recommendations: [mine, a, b, c, d],
      votes,
    });
    const monday = week!.days[0]!.stats!;
    const tuesday = week!.days[1]!.stats!;

    it('works out each day from valid ratings only', () => {
      expect(monday.songs.map((s) => s.recommendationId)).toEqual([
        mine.recommendationId,
        a.recommendationId,
        b.recommendationId,
      ]);
      expect(monday.ratingCount).toBe(9); // 2 + 4 + 3 (self-rating and the late one dropped)
      expect(monday.groupAverage).toBe(5.6); // (9+7+2+10+1+9+4+4+4)/9 = 5.555…
      expect(monday.myAverageGiven).toBe(3); // my 2 and 4
      expect(monday.myAverageReceived).toBe(8);
      expect(monday.bopOfTheDay).toEqual([mine.recommendationId]);
      expect(monday.lowestRated).toEqual([b.recommendationId]);
      expect(monday.myRatingCount).toBe(2);
      expect(monday.distribution).toEqual([0, 1, 1, 0, 3, 0, 0, 1, 0, 2, 1]); // index = rating (D36)
      expect(monday.favoriteArtists).toEqual(['Same Band']);
      expect(tuesday.favoriteArtists).toEqual([]);
    });

    it('marks your song and ranks it in the week', () => {
      expect(monday.songs[0]).toMatchObject({ isMine: true, average: 8, rank: 1, myRating: null });
      expect(monday.songs[1]).toMatchObject({ isMine: false, myRating: 2, recommendedBy: 'u2' });
    });

    it('sums up the week', () => {
      expect(week!.summary).toMatchObject({
        songCount: 5,
        ratingCount: 17,
        bestSongs: [mine.recommendationId],
        mostAgreeableDays: ['2026-10-06'],
        mostDivisive: [a.recommendationId],
      });
      expect(week!.summary!.topArtists[0]).toEqual({ artist: 'Same Band', songs: 2 });
    });

    it('builds "Your week": ratings you gave, what you got, your best song and your place', () => {
      expect(week!.yourWeek).toEqual({
        songsRated: 4, // a, b, c, d (the self-rating doesn't count)
        averageGiven: 4.3, // (2+4+6+5)/4 = 4.25
        averageReceived: 8,
        topSong: mine.recommendationId,
        rank: { position: 1, of: 3 }, // me 8.0, u3 (b 4.0, d 5.0 → 4.5), u2 (a 5.5, c 6.0 → 5.8)
      });
    });
  });

  it('stars the days your songs got your best-ever average, across all closed weeks', () => {
    const older = round('2026-09-21');
    const october = round('2026-10-05');
    const best = rec(older, ME, 'MON');
    const alsoBest = rec(october, ME, 'WED');
    const worse = rec(october, ME, 'MON');
    const weeks = buildHistoryMonth({
      month: '2026-10',
      viewerId: ME,
      rounds: [closed(older), closed(october)],
      recommendations: [best, alsoBest, worse, rec(october, 'u2', 'TUE')],
      votes: [vote(older, best, 'u2', 9), vote(october, alsoBest, 'u2', 9), vote(october, worse, 'u2', 5)],
    });
    const days = weeks[0]!.days;
    expect(days.find((d) => d.weekday === 'WED')!.personalBest).toBe(true);
    expect(days.find((d) => d.weekday === 'MON')!.personalBest).toBe(false);
  });

  it('gives no rank to someone with no rated song that week', () => {
    const r = round('2026-10-05');
    const theirs = rec(r, 'u2', 'MON');
    const [week] = buildHistoryMonth({
      month: '2026-10',
      viewerId: ME,
      rounds: [closed(r)],
      recommendations: [theirs, rec(r, 'u3', 'TUE')],
      votes: [vote(r, theirs, ME, 8)],
    });
    expect(week!.yourWeek).toMatchObject({
      songsRated: 1,
      averageGiven: 8,
      averageReceived: null,
      rank: null,
    });
  });
});

describe('ties are joint winners (PRODUCT_DECISIONS)', () => {
  it('lists every song tied for lowest and for most divisive, and every day tied for most agreeable', () => {
    const r = round('2026-10-05');
    const top = rec(r, 'u1', 'MON');
    const low1 = rec(r, 'u2', 'MON');
    const low2 = rec(r, 'u3', 'MON');
    const tue1 = rec(r, 'u1', 'TUE');
    const tue2 = rec(r, 'u2', 'TUE');
    const raters = ['u4', 'u5', 'u6', 'u7'];
    const votes = [
      ...raters.map((u) => vote(r, top, u, 9)),
      ...raters.map((u, i) => vote(r, low1, u, i % 2 === 0 ? 2 : 4)), // avg 3, spread 1
      ...raters.map((u, i) => vote(r, low2, u, i % 2 === 0 ? 4 : 2)), // avg 3, spread 1
      ...raters.map((u, i) => vote(r, tue1, u, i % 2 === 0 ? 2 : 4)), // spread 1
      ...raters.map((u, i) => vote(r, tue2, u, i % 2 === 0 ? 4 : 2)), // spread 1
    ];
    const [week] = buildHistoryMonth({
      month: '2026-10',
      viewerId: ME,
      rounds: [closed(r)],
      recommendations: [top, low1, low2, tue1, tue2],
      votes,
    });
    expect(week!.days[0]!.stats!.lowestRated.sort()).toEqual(
      [low1.recommendationId, low2.recommendationId].sort(),
    );
    expect(week!.summary!.mostDivisive.sort()).toEqual(
      [low1, low2, tue1, tue2].map((s) => s.recommendationId).sort(),
    );
    // Monday: spreads 0, 1, 1 → mean 0.67; Tuesday: 1, 1 → mean 1. Monday is the most agreeable.
    expect(week!.summary!.mostAgreeableDays).toEqual(['2026-10-05']);
  });

  it('shows no "lowest rated" when every song is tied at the top', () => {
    const r = round('2026-10-05');
    const one = rec(r, 'u1', 'MON');
    const two = rec(r, 'u2', 'MON');
    const votes = ['u4', 'u5', 'u6'].flatMap((u) => [vote(r, one, u, 7), vote(r, two, u, 7)]);
    const [week] = buildHistoryMonth({
      month: '2026-10',
      viewerId: ME,
      rounds: [closed(r)],
      recommendations: [one, two],
      votes,
    });
    expect(week!.days[0]!.stats!.lowestRated).toEqual([]);
    expect(week!.days[0]!.stats!.bopOfTheDay).toHaveLength(2);
  });

  it('includes a week that starts on the last day of the month', () => {
    const r = round('2026-08-31');
    const weeks = buildHistoryMonth({
      month: '2026-09',
      viewerId: ME,
      rounds: [closed(r)],
      recommendations: [],
      votes: [],
    });
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-08-31']);
  });
});
