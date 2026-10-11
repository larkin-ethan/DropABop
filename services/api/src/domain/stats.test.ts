import { describe, expect, it } from 'vitest';
import type { Recommendation, Vote } from '@dropabop/shared';
import {
  averageRatingGiven,
  averageScoreReceived,
  buildStatsData,
  averageGivenBoard,
  averageReceivedBoard,
  consistencyBoard,
  crowdFavorite,
  crowdFavoriteLeaderboard,
  favoriteGenres,
  groupAverage,
  groupRatingDistribution,
  lockMonth,
  monthlyActivity,
  mostBopsBoard,
  mostGenerousBoard,
  mostRatingsBoard,
  personBoard,
  popularityBoard,
  recentSongs,
  roundsInPeriod,
  toughestCriticBoard,
  topArtists,
  weekRank,
  weeklyActivity,
  darkHorse,
  everyoneAgreed,
  favoriteArtists,
  generosity,
  highestRatedRecommendation,
  highestRatedSong,
  lowestRatedRecommendation,
  mean,
  mostConsistent,
  mostControversial,
  mostDivisive,
  mostGenerousVoter,
  mostPopular,
  mostSurprising,
  musicalTwin,
  populationStdDev,
  rankEntries,
  ratingDistributionGiven,
  songRatingLeaderboard,
  songsRecommended,
  surpriseBoard,
  toughestCritic,
} from './stats';

// ---------- Fixture helpers ----------

interface SongSpec {
  id: string;
  by: string;
  /** YYYY-MM-DD; also decides the order for "earlier songs". */
  date?: string;
  round?: string;
  artist?: string;
  genre?: string | null;
  /** rater → rating */
  ratings?: Record<string, number>;
}

/** Builds recommendations + votes from compact song specs. */
function dataset(specs: SongSpec[], extraVotes: Vote[] = []) {
  const recommendations: Recommendation[] = [];
  const votes: Vote[] = [...extraVotes];
  specs.forEach((spec, index) => {
    const date = spec.date ?? `2026-10-${String(5 + (index % 5)).padStart(2, '0')}`;
    const roundId = spec.round ?? 'week1';
    recommendations.push({
      recommendationId: spec.id,
      roundId,
      partyId: 'p1',
      userId: spec.by,
      submittedOn: date,
      weekday: 'MON',
      song: {
        songId: `song-${spec.id}`,
        title: spec.id,
        artist: spec.artist ?? 'Artist',
        ...(spec.genre !== undefined ? { genre: spec.genre } : {}),
        album: null,
        albumArtUrl: null,
        durationMs: null,
        releaseDate: null,
        providers: [
          {
            provider: 'spotify',
            providerSongId: spec.id,
            externalUrl: `https://open.example.com/${spec.id}`,
          },
        ],
      },
      createdAt: `${date}T12:00:00.000Z`,
    });
    for (const [rater, rating] of Object.entries(spec.ratings ?? {})) {
      votes.push({
        roundId,
        recommendationId: spec.id,
        userId: rater,
        rating,
        updatedAt: `${date}T13:00:00.000Z`,
      });
    }
  });
  // Every week in the fixtures counts as closed, ending well after the fixture ratings.
  const closedRounds = [...new Set(recommendations.map((r) => r.roundId))].map((roundId) => ({
    roundId,
    endsAt: '2100-01-01T00:00:00.000Z',
  }));
  return buildStatsData(recommendations, votes, closedRounds);
}

/** `count` songs by `by`, each rated `rating` by `rater`. */
function songsRatedBy(rater: string, rating: number, count: number, by = 'bob', prefix = rater): SongSpec[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    by,
    ratings: { [rater]: rating },
  }));
}

const winnerIds = (stat: { status: string; value?: unknown }) =>
  stat.status === 'ok' ? (stat.value as { id: string }[]).map((w) => w.id) : 'not-enough-data';

// ---------- Helpers ----------

describe('maths helpers', () => {
  it('mean and population standard deviation', () => {
    expect(mean([])).toBeNull();
    expect(mean([6, 8, 10])).toBe(8);
    expect(populationStdDev([1, 10, 1, 10])).toBe(4.5);
    expect(populationStdDev([5, 5, 5, 5])).toBe(0);
    expect(populationStdDev([])).toBeNull();
  });
});

describe('buildStatsData', () => {
  const rec = (id: string, by: string, roundId: string): Recommendation => ({
    recommendationId: id,
    roundId,
    partyId: 'p1',
    userId: by,
    submittedOn: '2026-10-05',
    weekday: 'MON',
    song: {
      songId: id,
      title: id,
      artist: 'A',
      album: null,
      albumArtUrl: null,
      durationMs: null,
      releaseDate: null,
      providers: [{ provider: 'spotify', providerSongId: id, externalUrl: `https://open.example.com/${id}` }],
    },
    createdAt: '2026-10-05T12:00:00.000Z',
  });
  const v = (
    recommendationId: string,
    roundId: string,
    userId: string,
    rating: number,
    updatedAt: string,
  ): Vote => ({
    roundId,
    recommendationId,
    userId,
    rating,
    updatedAt,
  });

  it('uses only the closed weeks it is given (open weeks’ ratings are hidden, D9)', () => {
    const data = buildStatsData(
      [rec('closed-song', 'bob', 'closed-week'), rec('open-song', 'bob', 'open-week')],
      [
        v('closed-song', 'closed-week', 'alice', 6, '2026-10-06T00:00:00.000Z'),
        v('open-song', 'open-week', 'alice', 10, '2026-10-13T00:00:00.000Z'),
      ],
      [{ roundId: 'closed-week', endsAt: '2026-10-12T05:00:00.000Z' }],
    );
    expect(data.songs.map((s) => s.recommendation.recommendationId)).toEqual(['closed-song']);
    expect(data.partyAverageGiven).toBe(6);
  });

  it('ignores ratings saved at or after the week ended (rating lock)', () => {
    const data = buildStatsData(
      [rec('s', 'bob', 'w')],
      [
        v('s', 'w', 'alice', 8, '2026-10-12T04:59:59.999Z'),
        v('s', 'w', 'carol', 1, '2026-10-12T05:00:00.000Z'),
      ],
      [{ roundId: 'w', endsAt: '2026-10-12T05:00:00.000Z' }],
    );
    expect(data.songs[0]?.ratings).toEqual([8]);
  });

  it('ignores self-ratings and ratings for unknown songs', () => {
    const data = dataset(
      [{ id: 's1', by: 'bob', ratings: { alice: 8, bob: 10 } }],
      [
        {
          roundId: 'week1',
          recommendationId: 'ghost',
          userId: 'alice',
          rating: 1,
          updatedAt: '2026-10-05T00:00:00Z',
        },
      ],
    );
    expect(data.votes).toHaveLength(1);
    expect(data.songs[0]?.average).toBe(8);
    expect(data.partyAverageGiven).toBe(8);
  });
});

// ---------- Personal ----------

describe('averageRatingGiven (min 5 ratings)', () => {
  it('averages the ratings a user gave', () => {
    const data = dataset([6, 7, 8, 9, 10].map((r, i) => ({ id: `s${i}`, by: 'bob', ratings: { alice: r } })));
    expect(averageRatingGiven(data, 'alice')).toEqual({ status: 'ok', value: 8, sampleSize: 5 });
  });

  it('says not enough data below 5 ratings', () => {
    const data = dataset(songsRatedBy('alice', 7, 4));
    expect(averageRatingGiven(data, 'alice')).toEqual({
      status: 'not-enough-data',
      sampleSize: 4,
      required: 5,
    });
  });
});

describe('averageScoreReceived / Average Recommendation Score (min 3 rated songs)', () => {
  const data = dataset([
    { id: 'b1', by: 'bob', ratings: { alice: 6 } },
    { id: 'b2', by: 'bob', ratings: { alice: 7, carol: 9 } },
    { id: 'b3', by: 'bob', ratings: { alice: 10 } },
    { id: 'b4', by: 'bob' }, // unrated: not counted
    { id: 'c1', by: 'carol', ratings: { alice: 5 } },
    { id: 'c2', by: 'carol', ratings: { alice: 5 } },
  ]);

  it('averages the averages of the user’s rated songs', () => {
    expect(averageScoreReceived(data, 'bob')).toEqual({ status: 'ok', value: 8, sampleSize: 3 });
  });

  it('says not enough data below 3 rated songs', () => {
    expect(averageScoreReceived(data, 'carol')).toEqual({
      status: 'not-enough-data',
      sampleSize: 2,
      required: 3,
    });
  });

  it('songsRecommended counts every song, rated or not', () => {
    expect(songsRecommended(data, 'bob')).toBe(4);
    expect(songsRecommended(data, 'nobody')).toBe(0);
  });

  it('highest and lowest rated recommendation', () => {
    expect(winnerIds(highestRatedRecommendation(data, 'bob'))).toEqual(['b3']);
    expect(winnerIds(lowestRatedRecommendation(data, 'bob'))).toEqual(['b1']);
    expect(highestRatedRecommendation(data, 'nobody')).toMatchObject({ status: 'not-enough-data' });
  });

  it('highest rated recommendation returns all ties', () => {
    const tied = dataset([
      { id: 'x', by: 'bob', ratings: { alice: 9 } },
      { id: 'y', by: 'bob', ratings: { carol: 9 } },
    ]);
    expect(winnerIds(highestRatedRecommendation(tied, 'bob'))).toEqual(['x', 'y']);
  });
});

describe('generosity, most generous voter, toughest critic (min 10 ratings)', () => {
  // Party average given = (10×9 + 10×5) / 20 = 7.
  const data = dataset([...songsRatedBy('alice', 9, 10), ...songsRatedBy('carol', 5, 10)]);

  it('is the user’s average given minus the party’s', () => {
    expect(generosity(data, 'alice')).toEqual({ status: 'ok', value: 2, sampleSize: 10 });
    expect(generosity(data, 'carol')).toEqual({ status: 'ok', value: -2, sampleSize: 10 });
  });

  it('picks the most generous voter and the toughest critic', () => {
    expect(winnerIds(mostGenerousVoter(data))).toEqual(['alice']);
    expect(winnerIds(toughestCritic(data))).toEqual(['carol']);
  });

  it('needs 10 ratings', () => {
    const few = dataset([...songsRatedBy('alice', 9, 9), ...songsRatedBy('carol', 5, 9)]);
    expect(generosity(few, 'alice')).toEqual({ status: 'not-enough-data', sampleSize: 9, required: 10 });
    expect(mostGenerousVoter(few)).toMatchObject({ status: 'not-enough-data', required: 10 });
  });

  it('returns every tied winner', () => {
    const tied = dataset([
      ...songsRatedBy('alice', 9, 10),
      ...songsRatedBy('dan', 9, 10),
      ...songsRatedBy('carol', 3, 10),
    ]);
    expect(winnerIds(mostGenerousVoter(tied))).toEqual(['alice', 'dan']);
  });
});

describe('ratingDistributionGiven', () => {
  it('counts each rating 1–10', () => {
    const data = dataset([...songsRatedBy('alice', 9, 2), ...songsRatedBy('alice', 1, 1, 'bob', 'x')]);
    expect(ratingDistributionGiven(data, 'alice')).toEqual({
      status: 'ok',
      value: [1, 0, 0, 0, 0, 0, 0, 0, 2, 0],
      sampleSize: 3,
    });
    expect(ratingDistributionGiven(data, 'nobody')).toMatchObject({ status: 'not-enough-data' });
  });
});

describe('favoriteArtists (artist needs 2+ songs rated by the user)', () => {
  it('ranks qualifying artists by the user’s average, top 3', () => {
    const data = dataset([
      { id: 'x1', by: 'bob', artist: 'X', ratings: { alice: 9 } },
      { id: 'x2', by: 'bob', artist: 'X', ratings: { alice: 9 } },
      { id: 'y1', by: 'bob', artist: 'Y', ratings: { alice: 7 } },
      { id: 'y2', by: 'bob', artist: 'Y', ratings: { alice: 8 } },
      { id: 'z1', by: 'bob', artist: 'Z', ratings: { alice: 10 } }, // only one song: excluded
    ]);
    expect(favoriteArtists(data, 'alice')).toEqual({
      status: 'ok',
      value: [
        { artist: 'X', averageRating: 9, songCount: 2 },
        { artist: 'Y', averageRating: 7.5, songCount: 2 },
      ],
      sampleSize: 2,
    });
  });

  it('says not enough data when no artist has 2 songs', () => {
    const data = dataset([{ id: 'z1', by: 'bob', artist: 'Z', ratings: { alice: 10 } }]);
    expect(favoriteArtists(data, 'alice')).toEqual({ status: 'not-enough-data', sampleSize: 0, required: 2 });
  });
});

describe('musicalTwin (min 5 shared songs)', () => {
  const shared = (others: Record<string, number>, count: number, offset = 0) =>
    Array.from({ length: count }, (_, i) => ({
      id: `t${i + offset}`,
      by: 'zed',
      ratings: { alice: 7, ...others },
    }));

  it('finds the member with the smallest average rating gap', () => {
    const data = dataset(shared({ bob: 7, carol: 9 }, 5));
    expect(musicalTwin(data, 'alice')).toEqual({
      status: 'ok',
      value: [{ userId: 'bob', meanAbsoluteDifference: 0, sharedSongs: 5 }],
      sampleSize: 2,
    });
  });

  it('needs 5 songs rated by both', () => {
    const data = dataset(shared({ bob: 7 }, 4));
    expect(musicalTwin(data, 'alice')).toEqual({ status: 'not-enough-data', sampleSize: 0, required: 5 });
  });

  it('returns ties', () => {
    const data = dataset(shared({ bob: 8, carol: 6 }, 5));
    const result = musicalTwin(data, 'alice');
    expect(result.status === 'ok' && result.value.map((t) => t.userId)).toEqual(['bob', 'carol']);
  });
});

// ---------- Group: songs ----------

describe('highestRatedSong and songRatingLeaderboard (min 3 ratings)', () => {
  const data = dataset([
    { id: 'nine', by: 'bob', ratings: { a: 9, b: 9, c: 9 } },
    { id: 'ten-but-two', by: 'bob', ratings: { a: 10, b: 10 } }, // too few ratings
    { id: 'eight', by: 'carol', ratings: { a: 8, b: 8, c: 8 } },
  ]);

  it('ignores songs with fewer than 3 ratings', () => {
    expect(winnerIds(highestRatedSong(data))).toEqual(['nine']);
  });

  it('leaderboard lists only qualifying songs, best first', () => {
    expect(songRatingLeaderboard(data).map((e) => [e.id, e.rank, e.sampleSize])).toEqual([
      ['nine', 1, 3],
      ['eight', 2, 3],
    ]);
  });

  it('says not enough data when no song has 3 ratings', () => {
    expect(highestRatedSong(dataset([{ id: 's', by: 'bob', ratings: { a: 9 } }]))).toEqual({
      status: 'not-enough-data',
      sampleSize: 0,
      required: 3,
    });
  });
});

describe('crowdFavorite (rated by 75%+ of that week’s active raters, min 3 ratings)', () => {
  const data = dataset([
    // Week 1: active raters u1–u4.
    { id: 'A', by: 'x', round: 'w1', ratings: { u1: 8, u2: 8, u3: 8 } }, // 3/4 = 75% ✓, avg 8
    { id: 'B', by: 'y', round: 'w1', ratings: { u1: 7, u2: 7, u3: 7, u4: 7 } }, // 100% ✓, avg 7
    // Week 2: active raters u1–u6.
    { id: 'D', by: 'x', round: 'w2', ratings: { u1: 10, u2: 10, u3: 10 } }, // 3/6 = 50% ✗, avg 10
    { id: 'E', by: 'y', round: 'w2', ratings: { u4: 5, u5: 5, u6: 5 } },
  ]);

  it('only counts songs most of that week’s raters actually rated', () => {
    expect(winnerIds(highestRatedSong(data))).toEqual(['D']);
    expect(winnerIds(crowdFavorite(data))).toEqual(['A']);
  });

  it('does not count the recommender as a rater who skipped their own song', () => {
    // Active raters this week: u1–u5. r1 (by u1) is rated by u2, u3, u4: 3 of the 4 people who could
    // rate it = 75%, so it qualifies. Counting u1 as a skipper would make it 3/5 = 60% and wrongly exclude it.
    const week = dataset([
      { id: 'r1', by: 'u1', ratings: { u2: 9, u3: 9, u4: 9 } },
      { id: 'r2', by: 'u5', ratings: { u1: 6, u2: 6, u3: 6, u4: 6 } },
    ]);
    expect(winnerIds(crowdFavorite(week))).toEqual(['r1']);
  });
});

describe('mostDivisive, everyoneAgreed, mostControversial (min 4 ratings)', () => {
  const data = dataset([
    { id: 'split', by: 'bob', ratings: { a: 1, b: 10, c: 1, d: 10 } }, // sd 4.5, controversy 1.0
    { id: 'lopsided', by: 'bob', ratings: { a: 2, b: 2, c: 2, d: 9 } }, // controversy 0.5
    { id: 'flat', by: 'bob', ratings: { a: 5, b: 5, c: 5, d: 5 } }, // sd 0, controversy 0
    { id: 'few', by: 'bob', ratings: { a: 1, b: 10 } }, // too few ratings
  ]);

  it('most divisive = highest spread; everyone agreed = lowest spread', () => {
    expect(winnerIds(mostDivisive(data))).toEqual(['split']);
    expect(winnerIds(everyoneAgreed(data))).toEqual(['flat']);
  });

  it('most controversial needs both lows and highs, and prefers an even split', () => {
    const result = mostControversial(data);
    expect(winnerIds(result)).toEqual(['split']);
    expect(result.status === 'ok' && result.value[0]?.value).toBe(1);
    expect(result.sampleSize).toBe(2); // "flat" has no extremes, so it doesn't qualify
  });

  it('says not enough data when no song has 4 ratings, or none has both lows and highs', () => {
    expect(mostDivisive(dataset([{ id: 'few', by: 'bob', ratings: { a: 1, b: 10 } }]))).toMatchObject({
      status: 'not-enough-data',
      required: 4,
    });
    expect(
      mostControversial(dataset([{ id: 'flat', by: 'bob', ratings: { a: 5, b: 5, c: 5, d: 5 } }])),
    ).toMatchObject({
      status: 'not-enough-data',
    });
  });

  it('returns ties', () => {
    const tied = dataset([
      { id: 'p', by: 'bob', ratings: { a: 5, b: 5, c: 5, d: 5 } },
      { id: 'q', by: 'bob', ratings: { a: 7, b: 7, c: 7, d: 7 } },
    ]);
    expect(winnerIds(everyoneAgreed(tied))).toEqual(['p', 'q']);
  });
});

describe('darkHorse and mostSurprising', () => {
  const raters = (rating: number) => ({ r1: rating, r2: rating, r3: rating });
  const history: SongSpec[] = [
    // Bob usually scores 5, then a 9 → +4.
    { id: 'b1', by: 'bob', date: '2026-09-01', ratings: raters(5) },
    { id: 'b2', by: 'bob', date: '2026-09-02', ratings: raters(5) },
    { id: 'b3', by: 'bob', date: '2026-09-03', ratings: raters(5) },
    { id: 'b4', by: 'bob', date: '2026-09-04', ratings: raters(9) },
    // Carol usually scores 8, then a 9 → +1.
    { id: 'c1', by: 'carol', date: '2026-09-01', ratings: raters(8) },
    { id: 'c2', by: 'carol', date: '2026-09-02', ratings: raters(8) },
    { id: 'c3', by: 'carol', date: '2026-09-03', ratings: raters(8) },
    { id: 'c4', by: 'carol', date: '2026-09-04', ratings: raters(9) },
  ];
  const data = dataset(history);

  it('dark horse = the song that beat its recommender’s earlier average by the most', () => {
    const result = darkHorse(data);
    expect(winnerIds(result)).toEqual(['b4']);
    expect(result.status === 'ok' && result.value[0]?.value).toBe(4);
  });

  it('most surprising counts 1+ point surprises (bob and carol tie with one each)', () => {
    expect(winnerIds(mostSurprising(data))).toEqual(['bob', 'carol']);
    expect(surpriseBoard(data).ranked.map((e) => [e.id, e.rank])).toEqual([
      ['bob', 1],
      ['carol', 1],
    ]);
  });

  it('needs 3 earlier rated songs from the recommender', () => {
    const short = dataset(history.filter((s) => s.id !== 'b1' && s.id !== 'c1'));
    expect(darkHorse(short)).toMatchObject({ status: 'not-enough-data', required: 3 });
  });

  it('only counts positive surprises', () => {
    const slump = dataset([
      { id: 'd1', by: 'dan', date: '2026-09-01', ratings: raters(9) },
      { id: 'd2', by: 'dan', date: '2026-09-02', ratings: raters(9) },
      { id: 'd3', by: 'dan', date: '2026-09-03', ratings: raters(9) },
      { id: 'd4', by: 'dan', date: '2026-09-04', ratings: raters(2) },
    ]);
    expect(darkHorse(slump)).toMatchObject({ status: 'not-enough-data' });
  });
});

// ---------- Group: people ----------

describe('mostConsistent and consistencyBoard (min 3 rated songs)', () => {
  const data = dataset([
    // Bob's song averages 5, 5, 5, 9 → sd ≈ 1.73
    ...[5, 5, 5, 9].map((avg, i) => ({ id: `b${i}`, by: 'bob', ratings: { a: avg } })),
    // Carol's 8, 8, 8, 9 → sd ≈ 0.43
    ...[8, 8, 8, 9].map((avg, i) => ({ id: `c${i}`, by: 'carol', ratings: { a: avg } })),
    // Dan has only 2 songs: excluded
    ...[1, 10].map((avg, i) => ({ id: `d${i}`, by: 'dan', ratings: { a: avg } })),
  ]);

  it('lowest spread of song averages wins', () => {
    expect(winnerIds(mostConsistent(data))).toEqual(['carol']);
    const board = consistencyBoard(data);
    expect(board.ranked.map((e) => e.id)).toEqual(['carol', 'bob']);
    expect(board.provisional).toEqual([{ id: 'dan', sampleSize: 2 }]); // 2 of 3 songs: listed apart, no value
  });
});

describe('mostPopular (most 8+ ratings received, min 3 recommendations)', () => {
  it('counts high ratings across the user’s songs', () => {
    const data = dataset([
      { id: 'b1', by: 'bob', ratings: { a: 8, b: 9 } },
      { id: 'b2', by: 'bob', ratings: { a: 10, b: 3 } },
      { id: 'b3', by: 'bob', ratings: { a: 7 } },
      { id: 'c1', by: 'carol', ratings: { a: 8 } },
      { id: 'c2', by: 'carol', ratings: { a: 8 } },
      { id: 'c3', by: 'carol', ratings: { a: 2 } },
      { id: 'd1', by: 'dan', ratings: { a: 10, b: 10, c: 10, e: 10 } }, // 1 song: excluded
    ]);
    const result = mostPopular(data);
    expect(winnerIds(result)).toEqual(['bob']);
    expect(result.status === 'ok' && result.value[0]?.value).toBe(3);
  });
});

describe('averageReceivedBoard and rankEntries', () => {
  it('ranks users by Average Recommendation Score with “based on” counts', () => {
    const data = dataset([
      ...[9, 9, 9].map((r, i) => ({ id: `b${i}`, by: 'bob', ratings: { a: r } })),
      ...[6, 7, 8].map((r, i) => ({ id: `c${i}`, by: 'carol', ratings: { a: r } })),
      ...[10, 10].map((r, i) => ({ id: `d${i}`, by: 'dan', ratings: { a: r } })), // only 2: excluded
    ]);
    expect(averageReceivedBoard(data)).toEqual({
      ranked: [
        { id: 'bob', rank: 1, value: 9, sampleSize: 3 },
        { id: 'carol', rank: 2, value: 7, sampleSize: 3 },
      ],
      // Dan's two 10s don't outrank anyone (D30): he's provisional, with no number shown.
      provisional: [{ id: 'dan', sampleSize: 2 }],
      required: 3,
    });
  });

  it('ties share a rank and the next rank skips (1, 2, 2, 4)', () => {
    const entries = rankEntries(
      [
        { id: 'a', value: 9, sampleSize: 3 },
        { id: 'b', value: 8, sampleSize: 3 },
        { id: 'c', value: 8, sampleSize: 4 },
        { id: 'd', value: 7, sampleSize: 3 },
      ],
      'highest',
    );
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 2, 4]);
  });

  it('values that show the same number tie (8.33 and 8.25 both show 8.3), like weekly results (D12)', () => {
    const entries = rankEntries(
      [
        { id: 'b', value: 8.25, sampleSize: 4 },
        { id: 'a', value: 25 / 3, sampleSize: 3 },
        { id: 'c', value: 8.2, sampleSize: 3 },
      ],
      'highest',
    );
    expect(entries.map((e) => [e.id, e.rank])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
    ]);
  });
});

// ---------- P13.11: leaderboard boards, periods, profile and group extras ----------

describe('personBoard (D30 provisional rankings)', () => {
  it('ranks only people meeting the minimum; the rest are provisional, most data first, with no value', () => {
    const board = personBoard(
      [
        { id: 'one-ten', value: 10, sampleSize: 1 },
        { id: 'steady', value: 9.5, sampleSize: 100 },
        { id: 'almost', value: 9.9, sampleSize: 4 },
        { id: 'nobody', value: 0, sampleSize: 0 },
      ],
      5,
      'highest',
    );
    expect(board.ranked).toEqual([{ id: 'steady', rank: 1, value: 9.5, sampleSize: 100 }]);
    expect(board.provisional).toEqual([
      { id: 'almost', sampleSize: 4 },
      { id: 'one-ten', sampleSize: 1 },
    ]);
    expect(board.required).toBe(5);
  });
});

describe('leaderboard boards (D30)', () => {
  // Ann gives 9s, Cal gives 5s (10 ratings each); Bob gives one 10.
  const specs: SongSpec[] = [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, by: 'dan', ratings: { ann: 9, cal: 5 } })),
    { id: 'e0', by: 'eve', ratings: { bob: 10, ann: 9 } },
  ];
  const data = dataset(specs);

  it('Highest Average Given needs 5 ratings', () => {
    const board = averageGivenBoard(data);
    expect(board.ranked.map((e) => [e.id, e.value, e.sampleSize])).toEqual([
      ['ann', 9, 11],
      ['cal', 5, 10],
    ]);
    expect(board.provisional).toEqual([{ id: 'bob', sampleSize: 1 }]);
    expect(board.required).toBe(5);
  });

  it('Most Generous / Toughest Critic use generosity and need 10 ratings', () => {
    expect(mostGenerousBoard(data).ranked.map((e) => e.id)).toEqual(['ann', 'cal']);
    expect(toughestCriticBoard(data).ranked.map((e) => e.id)).toEqual(['cal', 'ann']);
    expect(toughestCriticBoard(data).provisional).toEqual([{ id: 'bob', sampleSize: 1 }]);
    expect(mostGenerousBoard(data).required).toBe(10);
  });

  it('Most Bops and Most Ratings are plain counts (anyone with one is ranked)', () => {
    expect(mostBopsBoard(data).ranked.map((e) => [e.id, e.rank, e.value])).toEqual([
      ['dan', 1, 10],
      ['eve', 2, 1],
    ]);
    expect(mostRatingsBoard(data).ranked.map((e) => [e.id, e.value])).toEqual([
      ['ann', 11],
      ['cal', 10],
      ['bob', 1],
    ]);
    expect(mostRatingsBoard(data).provisional).toEqual([]);
  });

  it('Most Popular lists people with 1–2 songs as provisional (needs 3 songs shared)', () => {
    const board = popularityBoard(data);
    expect(board.ranked.map((e) => [e.id, e.value])).toEqual([['dan', 10]]);
    expect(board.provisional).toEqual([{ id: 'eve', sampleSize: 1 }]);
  });

  it('Crowd Favorites ranks songs rated by 75%+ of the week’s raters (3 ratings)', () => {
    const week = dataset([
      { id: 'wide', by: 'x', ratings: { a: 8, b: 8, c: 8, d: 8 } },
      { id: 'narrow', by: 'y', ratings: { a: 10, b: 10, c: 10 } }, // 3 of 4 raters = 75%: counts
      { id: 'few', by: 'z', ratings: { a: 10, b: 10 } }, // only 2 ratings
    ]);
    expect(crowdFavoriteLeaderboard(week).map((e) => [e.id, e.rank])).toEqual([
      ['narrow', 1],
      ['wide', 2],
    ]);
  });
});

describe('roundsInPeriod and lockMonth (D30)', () => {
  const rounds = [
    { roundId: 'aug', endsAt: '2026-08-31T05:00:00.000Z' }, // Monday 00:00 Chicago → locked Sunday 30 Aug
    { roundId: 'sep-end', endsAt: '2026-10-01T05:00:00.000Z' }, // Thursday 1 Oct 00:00 → locked 30 Sep
    { roundId: 'oct', endsAt: '2026-10-05T05:00:00.000Z' }, // Monday 5 Oct 00:00 → locked Sunday 4 Oct
  ];
  const now = new Date('2026-10-07T17:00:00.000Z');

  it('the lock belongs to the moment before endsAt, in the party timezone', () => {
    expect(lockMonth('2026-10-01T05:00:00.000Z', 'America/Chicago')).toBe('2026-09');
    expect(lockMonth('2026-10-01T05:00:00.000Z', 'Europe/London')).toBe('2026-10');
  });

  it('week = most recent closed week; month = locked this month; all = everything', () => {
    expect(roundsInPeriod(rounds, 'week', now, 'America/Chicago').map((r) => r.roundId)).toEqual(['oct']);
    expect(roundsInPeriod(rounds, 'month', now, 'America/Chicago').map((r) => r.roundId)).toEqual(['oct']);
    expect(roundsInPeriod(rounds, 'all', now, 'America/Chicago')).toHaveLength(3);
    expect(roundsInPeriod([], 'week', now, 'America/Chicago')).toEqual([]);
  });
});

describe('profile extras', () => {
  it('favoriteGenres: highest average given per genre, needs 2 rated songs, ignores songs without a genre', () => {
    const data = dataset([
      { id: 'p1', by: 'bob', genre: 'Pop', ratings: { me: 6 } },
      { id: 'p2', by: 'bob', genre: 'pop', ratings: { me: 8 } }, // same genre, different case
      { id: 'r1', by: 'bob', genre: 'Rock', ratings: { me: 9 } },
      { id: 'r2', by: 'bob', genre: 'Rock', ratings: { me: 9 } },
      { id: 'j1', by: 'bob', genre: 'Jazz', ratings: { me: 10 } }, // only 1: not enough
      { id: 'n1', by: 'bob', genre: null, ratings: { me: 10 } },
      { id: 'n2', by: 'bob', ratings: { me: 10 } },
    ]);
    expect(favoriteGenres(data, 'me')).toEqual({
      status: 'ok',
      value: [
        { genre: 'Rock', averageRating: 9, songCount: 2 },
        { genre: 'Pop', averageRating: 7, songCount: 2 },
      ],
      sampleSize: 2,
    });
    expect(favoriteGenres(data, 'bob')).toEqual({ status: 'not-enough-data', sampleSize: 0, required: 2 });
  });

  it('recentSongs: your newest closed-week songs first, at most 5', () => {
    const data = dataset([
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `m${i}`,
        by: 'me',
        date: `2026-09-0${i + 1}`,
        ratings: { a: 5 + i },
      })),
      { id: 'other', by: 'bob', date: '2026-09-09' },
    ]);
    const recent = recentSongs(data, 'me');
    expect(recent.map((s) => s.recommendationId)).toEqual(['m5', 'm4', 'm3', 'm2', 'm1']);
    expect(recent[0]).toMatchObject({ average: 10, ratingCount: 1, roundId: 'week1' });
  });

  it('weekRank: by average received as shown, ties share a rank, null without a rated song', () => {
    const data = dataset([
      { id: 'a', by: 'ann', round: 'w1', ratings: { x: 9 } },
      { id: 'b', by: 'bob', round: 'w1', ratings: { x: 7 } },
      { id: 'c', by: 'cal', round: 'w1', ratings: { x: 7 } },
      { id: 'd', by: 'dan', round: 'w1' }, // unrated
      { id: 'old', by: 'dan', round: 'w0', ratings: { x: 10 } },
    ]);
    expect(weekRank(data, 'w1', 'ann')).toEqual({ position: 1, of: 3 });
    expect(weekRank(data, 'w1', 'cal')).toEqual({ position: 2, of: 3 });
    expect(weekRank(data, 'w1', 'dan')).toBeNull();
  });
});

describe('group extras', () => {
  const data = dataset([
    { id: 's1', by: 'a', artist: 'Robyn', round: 'w1', ratings: { b: 8, c: 6 } },
    { id: 's2', by: 'b', artist: 'robyn ', round: 'w1', ratings: { a: 10 } },
    { id: 's3', by: 'c', artist: 'Björk', round: 'w2', ratings: { a: 4 } },
    { id: 's4', by: 'a', artist: 'Sade', round: 'w2' },
    { id: 's5', by: 'b', artist: 'Prince', round: 'w2' },
  ]);

  it('groupAverage and distribution need 1 rating', () => {
    expect(groupAverage(data)).toEqual({ status: 'ok', value: 7, sampleSize: 4 });
    expect(groupRatingDistribution(data)).toEqual({
      status: 'ok',
      value: [0, 0, 0, 1, 0, 1, 0, 1, 0, 1], // one each of 4, 6, 8, 10
      sampleSize: 4,
    });
    const empty = dataset([{ id: 'x', by: 'a' }]);
    expect(groupAverage(empty)).toEqual({ status: 'not-enough-data', sampleSize: 0, required: 1 });
    expect(groupRatingDistribution(empty)).toMatchObject({ status: 'not-enough-data' });
  });

  it('topArtists: most shared (spelling-insensitive), everyone tied at 3rd is included', () => {
    const result = topArtists(data);
    expect(result.status === 'ok' && result.value).toEqual([
      { artist: 'Robyn', songCount: 2 },
      { artist: 'Björk', songCount: 1 },
      { artist: 'Prince', songCount: 1 },
      { artist: 'Sade', songCount: 1 },
    ]);
    expect(topArtists(dataset([]))).toMatchObject({ status: 'not-enough-data' });
  });

  it('weekly and monthly activity: songs, ratings and average per period, newest first', () => {
    const rounds = [
      { roundId: 'w1', weekStart: '2026-09-21', endsAt: '2026-09-28T05:00:00.000Z' },
      { roundId: 'w2', weekStart: '2026-09-28', endsAt: '2026-10-05T05:00:00.000Z' },
    ];
    expect(weeklyActivity(data, rounds)).toEqual([
      { period: '2026-09-28', weeks: 1, songs: 3, ratings: 1, average: 4 },
      { period: '2026-09-21', weeks: 1, songs: 2, ratings: 3, average: 8 },
    ]);
    const unrated = dataset([{ id: 'u1', by: 'a', round: 'w3' }]);
    expect(weeklyActivity(unrated, [{ roundId: 'w3', weekStart: '2026-10-05' }])).toEqual([
      { period: '2026-10-05', weeks: 1, songs: 1, ratings: 0, average: null },
    ]);
    const many = Array.from({ length: 14 }, (_, i) => ({
      roundId: `r${i}`,
      weekStart: `2026-0${(i % 9) + 1}-1${i % 10}`,
    }));
    expect(weeklyActivity(unrated, many)).toHaveLength(12); // latest 12 only
    expect(monthlyActivity(data, rounds, 'America/Chicago')).toEqual([
      { period: '2026-10', weeks: 1, songs: 3, ratings: 1, average: 4 },
      { period: '2026-09', weeks: 1, songs: 2, ratings: 3, average: 8 },
    ]);
  });
});
