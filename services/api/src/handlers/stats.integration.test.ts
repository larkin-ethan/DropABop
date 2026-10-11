import type { Party, Round } from '@dropabop/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { aRecommendation, aRound, aVote, newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { putRecommendation } from '../data/recommendations';
import { createRoundIfMissing } from '../data/rounds';
import { putVote } from '../data/votes';
import { runHandler } from '../http/handler';
import { joinPartyFn } from './membership';
import { createPartyHandlerFn } from './parties';
import { groupStatsFn, leaderboardFn, personalStatsFn } from './stats';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

const NOW = '2026-10-07T17:00:00.000Z'; // Wednesday of the open week of Oct 5
const PAST_WEEKS = ['2026-09-14', '2026-09-21', '2026-09-28'];

let party: Party;
const people = { a: newId(), b: newId(), c: newId(), d: newId() };
/** Everyone rates A's songs 9, B's 5, C's 7. D rates but doesn't share. */
const SCORE = { a: 9, b: 5, c: 7 } as const;

beforeAll(async () => {
  deps.setNow('2026-09-14T17:00:00.000Z');
  party = (
    bodyOf(
      await runHandler(
        createPartyHandlerFn,
        apiEvent({ userId: people.a, body: { name: 'Stats party', timezone: 'America/Chicago' } }),
        deps,
      ),
    ) as { party: Party }
  ).party;
  for (const userId of [people.b, people.c, people.d]) {
    await runHandler(
      joinPartyFn,
      apiEvent({
        userId,
        pathParameters: { partyId: party.partyId },
        body: { inviteCode: party.inviteCode },
      }),
      deps,
    );
  }

  // Three finished weeks (stored as OPEN; their close is derived from time).
  for (const week of PAST_WEEKS) {
    const round: Round = aRound(party.partyId, week, {
      startsAt: `${week}T05:00:00.000Z`,
      endsAt: new Date(new Date(`${week}T05:00:00.000Z`).getTime() + 7 * 86400000).toISOString(),
    });
    await createRoundIfMissing(deps.data, round);
    for (const sharer of ['a', 'b', 'c'] as const) {
      const song = aRecommendation(round, people[sharer], week, {
        createdAt: `${week}T15:00:00.000Z`,
        song: { ...aRecommendation(round, people[sharer], week).song, artist: `Artist ${sharer}` },
      });
      await putRecommendation(deps.data, song);
      for (const rater of ['a', 'b', 'c', 'd'] as const) {
        if (rater === sharer) continue;
        await putVote(deps.data, {
          ...aVote(song, people[rater], SCORE[sharer]),
          updatedAt: `${week}T20:00:00.000Z`,
        });
      }
    }
  }

  // The current, still-open week: its ratings are hidden and must not appear in any stat (D9).
  const open = aRound(party.partyId, '2026-10-05', { endsAt: '2026-10-12T05:00:00.000Z' });
  await createRoundIfMissing(deps.data, open);
  const openSong = aRecommendation(open, people.b, '2026-10-05');
  await putRecommendation(deps.data, openSong);
  for (const rater of ['a', 'c', 'd'] as const) {
    await putVote(deps.data, { ...aVote(openSong, people[rater], 1), updatedAt: '2026-10-06T00:00:00.000Z' });
  }
  deps.setNow(NOW);
});

type StatValue = { status: string; value?: unknown; sampleSize: number };
const get = async (fn: typeof groupStatsFn, userId: string, opts: Parameters<typeof apiEvent>[0]) => {
  const result = await runHandler(fn, apiEvent({ userId, ...opts }), deps);
  return { status: result.statusCode, body: bodyOf(result) as Record<string, StatValue> };
};

describe('GET /users/me/stats?partyId=', () => {
  it('computes personal stats from closed weeks only', async () => {
    const { status, body } = await get(personalStatsFn, people.b, {
      queryStringParameters: { partyId: party.partyId },
    });
    expect(status).toBe(200);
    expect(body.weeksPlayed).toBe(3);
    // B's songs were rated 5 in closed weeks; the open week's 1s must not count.
    expect(body.averageScoreReceived).toEqual({ status: 'ok', value: 5, sampleSize: 3 });
    expect(body.songsRecommended).toBe(3);
    // B rated A's songs 9 and C's 7 → 8 over 6 ratings.
    expect(body.averageRatingGiven).toEqual({ status: 'ok', value: 8, sampleSize: 6 });
    expect(body.generosity).toMatchObject({ status: 'not-enough-data', required: 10 });
    expect(body.ratingsGiven).toBe(6);
    // B's songs were all rated 5; everyone shared one song in the last closed week → B is last of 3.
    expect(body.lastWeekRank).toMatchObject({ weekStart: '2026-09-28', position: 3, of: 3 });
    const recent = body.recentSongs as unknown as { submittedOn: string; average: number }[];
    expect(recent.map((s) => s.submittedOn)).toEqual(['2026-09-28', '2026-09-21', '2026-09-14']);
    expect(recent[0]?.average).toBe(5); // not the open week's song or its 1s
    expect(body.favoriteGenres).toMatchObject({ status: 'not-enough-data', required: 2 });
  });

  it('shows the highest-rated recommendation with its song summary', async () => {
    const { body } = await get(personalStatsFn, people.a, {
      queryStringParameters: { partyId: party.partyId },
    });
    const best = body.highestRatedRecommendation as {
      status: string;
      value: { value: number; song: { artist: string } }[];
    };
    expect(best.status).toBe('ok');
    expect(best.value).toHaveLength(3); // three songs tied at 9
    expect(best.value[0]?.song.artist).toBe('Artist a');
  });

  it('requires a party the caller belongs to', async () => {
    expect((await get(personalStatsFn, people.a, {})).status).toBe(400);
    expect(
      (await get(personalStatsFn, newId(), { queryStringParameters: { partyId: party.partyId } })).status,
    ).toBe(403);
  });
});

describe('GET /parties/{partyId}/stats', () => {
  it('computes group stats with transparent sample sizes', async () => {
    const { status, body } = await get(groupStatsFn, people.d, {
      pathParameters: { partyId: party.partyId },
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ weeksPlayed: 3, songsShared: 9, ratingsGiven: 27 });
    const best = body.highestRatedSong as { status: string; value: { song: { recommendedBy: string } }[] };
    expect(best.status).toBe('ok');
    expect(best.value.every((w) => w.song.recommendedBy === people.a)).toBe(true);
    expect(body.mostDivisive).toMatchObject({ status: 'not-enough-data' }); // only 3 ratings per song
    expect(body.memberCount).toBe(4);
    expect(body.groupAverage).toEqual({ status: 'ok', value: 7, sampleSize: 27 });
    expect(body.topArtists).toMatchObject({ status: 'ok', sampleSize: 9 });
    const weekly = body.weeklyActivity as unknown as { period: string; songs: number; ratings: number }[];
    expect(weekly.map((w) => [w.period, w.songs, w.ratings])).toEqual([
      ['2026-09-28', 3, 9],
      ['2026-09-21', 3, 9],
      ['2026-09-14', 3, 9],
    ]);
    const monthly = body.monthlyActivity as unknown as { period: string; weeks: number }[];
    expect(monthly.map((m) => [m.period, m.weeks])).toEqual([
      ['2026-10', 1],
      ['2026-09', 2],
    ]);
  });

  it('refuses non-members', async () => {
    expect((await get(groupStatsFn, newId(), { pathParameters: { partyId: party.partyId } })).status).toBe(
      403,
    );
  });
});

describe('GET /parties/{partyId}/leaderboard', () => {
  const board = (body: Record<string, unknown>, name: string) =>
    body[name] as { ranked: unknown[]; provisional: unknown[]; required: number };

  it('ranks Highest Average Received with “based on” counts (all time by default)', async () => {
    const { body } = await get(leaderboardFn, people.c, { pathParameters: { partyId: party.partyId } });
    expect(body.period).toBe('all');
    expect(body.weeksPlayed).toBe(3);
    expect(board(body, 'highestAverageReceived')).toEqual({
      ranked: [
        { id: people.a, rank: 1, value: 9, sampleSize: 3 },
        { id: people.c, rank: 2, value: 7, sampleSize: 3 },
        { id: people.b, rank: 3, value: 5, sampleSize: 3 },
      ],
      provisional: [],
      required: 3,
    });
    expect((body.highestAverageSongRating as unknown as unknown[]).length).toBe(9);
    expect(board(body, 'mostRatings').ranked).toHaveLength(4);
    expect(Array.isArray(body.members)).toBe(true);
  });

  it('period=week uses only the most recent closed week; people below a minimum are provisional', async () => {
    const { status, body } = await get(leaderboardFn, people.c, {
      pathParameters: { partyId: party.partyId },
      queryStringParameters: { period: 'week' },
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ period: 'week', weeksPlayed: 1 });
    // One song each that week: nobody has the 3 rated songs needed, so all three are provisional, never ranked.
    expect(board(body, 'highestAverageReceived')).toEqual({
      ranked: [],
      provisional: [
        { id: people.a, sampleSize: 1 },
        { id: people.b, sampleSize: 1 },
        { id: people.c, sampleSize: 1 },
      ].sort((x, y) => x.id.localeCompare(y.id)),
      required: 3,
    });
    expect(board(body, 'mostBops').ranked).toHaveLength(3);
    // The open week's ratings never count (D9).
    expect(board(body, 'mostRatings').ranked).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: people.d, value: 3 })]),
    );
  });

  it('period=month counts closed weeks whose ratings locked this month (party timezone)', async () => {
    // Weeks of Sep 14 and 21 locked in September; the week of Sep 28 locked at the end of Sunday 4 Oct.
    const { body } = await get(leaderboardFn, people.c, {
      pathParameters: { partyId: party.partyId },
      queryStringParameters: { period: 'month' },
    });
    expect(body).toMatchObject({ period: 'month', weeksPlayed: 1 });
    expect((body.highestAverageSongRating as unknown as unknown[]).length).toBe(3);
  });

  it('rejects an unknown period and non-members', async () => {
    const bad = await get(leaderboardFn, people.c, {
      pathParameters: { partyId: party.partyId },
      queryStringParameters: { period: 'year' },
    });
    expect(bad.status).toBe(400);
    expect((await get(leaderboardFn, newId(), { pathParameters: { partyId: party.partyId } })).status).toBe(
      403,
    );
  });
});
