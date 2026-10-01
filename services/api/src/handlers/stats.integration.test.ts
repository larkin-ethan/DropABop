import type { Party, Round } from '@sotd/shared';
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
  });

  it('refuses non-members', async () => {
    expect((await get(groupStatsFn, newId(), { pathParameters: { partyId: party.partyId } })).status).toBe(
      403,
    );
  });
});

describe('GET /parties/{partyId}/leaderboard', () => {
  it('ranks Average Recommendation Score with “based on” counts', async () => {
    const { body } = await get(leaderboardFn, people.c, { pathParameters: { partyId: party.partyId } });
    expect(body.highestAverageRecommendationScore).toEqual([
      { id: people.a, rank: 1, value: 9, sampleSize: 3 },
      { id: people.c, rank: 2, value: 7, sampleSize: 3 },
      { id: people.b, rank: 3, value: 5, sampleSize: 3 },
    ]);
    expect((body.highestAverageSongRating as unknown as unknown[]).length).toBe(9);
    expect(Array.isArray(body.members)).toBe(true);
  });
});
