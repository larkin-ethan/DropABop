import type { Party, Round } from '@dropabop/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { newId, setWeekPrivacy } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { putVote } from '../data/votes';
import { runHandler } from '../http/handler';
import { joinPartyFn } from './membership';
import { createPartyHandlerFn } from './parties';
import { submitRecommendationFn } from './recommendations';
import { getResultsFn } from './results';
import { updateSettingsFn } from './settings';
import { castVoteFn } from './votes';
import { getCurrentWeekFn, listWeeksFn } from './weeks';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

const MONDAY = '2026-10-05T17:00:00.000Z';
const TUESDAY = '2026-10-06T17:00:00.000Z';
const SATURDAY = '2026-10-10T17:00:00.000Z';
const AFTER_WEEK = '2026-10-12T15:00:00.000Z';

interface ResultsBody {
  round: Round;
  results: {
    songs: {
      recommendationId: string;
      rank: number;
      averageRating: number | null;
      ratingCount: number;
      recommendedBy: string;
      myRating: number | null;
      ratings?: unknown[];
    }[];
    days: { weekday: string; songIds: string[]; winnerIds: string[] }[];
    totalRatings: number;
  };
  members: { userId: string; displayName: string }[];
}

async function joinNew(party: Party) {
  const userId = newId();
  await runHandler(
    joinPartyFn,
    apiEvent({ userId, pathParameters: { partyId: party.partyId }, body: { inviteCode: party.inviteCode } }),
    deps,
  );
  return userId;
}

/** Test ids like 'a-mon' → a stable numeric iTunes-style id. */
function songNumber(id: string): string {
  return String([...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 1_000_000_000, 7));
}

async function share(userId: string, roundId: string, id: string) {
  const result = await runHandler(
    submitRecommendationFn,
    apiEvent({
      userId,
      pathParameters: { roundId },
      body: { provider: 'appleMusic', providerSongId: songNumber(id) },
    }),
    deps,
  );
  return (bodyOf(result) as { song: { recommendationId: string } }).song.recommendationId;
}

const rate = (userId: string, roundId: string, recommendationId: string, rating: number) =>
  runHandler(
    castVoteFn,
    apiEvent({ userId, pathParameters: { roundId, recommendationId }, body: { rating } }),
    deps,
  );

const results = (userId: string, roundId: string) =>
  runHandler(getResultsFn, apiEvent({ userId, pathParameters: { roundId } }), deps);

/** A week with three people: A shares Mon, B shares Mon and Tue; everyone rates the others. */
async function playWeek() {
  deps.setNow(MONDAY);
  const a = newId();
  const party = (
    bodyOf(
      await runHandler(
        createPartyHandlerFn,
        apiEvent({ userId: a, body: { name: 'P', timezone: 'America/Chicago' } }),
        deps,
      ),
    ) as { party: Party }
  ).party;
  const b = await joinNew(party);
  const c = await joinNew(party);
  const round = (
    bodyOf(
      await runHandler(
        getCurrentWeekFn,
        apiEvent({ userId: a, pathParameters: { partyId: party.partyId } }),
        deps,
      ),
    ) as {
      round: Round;
    }
  ).round;

  const aMon = await share(a, round.roundId, 'a-mon');
  const bMon = await share(b, round.roundId, 'b-mon');
  deps.setNow(TUESDAY);
  const bTue = await share(b, round.roundId, 'b-tue');

  deps.setNow(SATURDAY);
  await rate(b, round.roundId, aMon, 9);
  await rate(c, round.roundId, aMon, 7); // aMon: 8.0
  await rate(a, round.roundId, bMon, 6);
  await rate(c, round.roundId, bMon, 6); // bMon: 6.0
  await rate(a, round.roundId, bTue, 10); // bTue: 10.0
  return { party, round, a, b, c, aMon, bMon, bTue };
}

describe('GET /rounds/{roundId}/results', () => {
  it('is locked until the week ends', async () => {
    const { round, a } = await playWeek();
    const result = await results(a, round.roundId);
    expect(result.statusCode).toBe(403);
    expect(bodyOf(result)).toEqual({
      error: { code: 'RESULTS_NOT_READY', message: 'Results unlock when this week’s ratings lock.' },
    });
  });

  it('ranks the week, picks each day’s Bop of the Day, and reveals recommenders', async () => {
    const { round, a, b, c, aMon, bMon, bTue } = await playWeek();
    deps.setNow(AFTER_WEEK);
    const result = await results(c, round.roundId);
    expect(result.statusCode).toBe(200);
    const body = bodyOf(result) as ResultsBody;

    expect(
      body.results.songs.map((s) => [s.recommendationId, s.rank, s.averageRating, s.ratingCount]),
    ).toEqual([
      [bTue, 1, 10, 1],
      [aMon, 2, 8, 2],
      [bMon, 3, 6, 2],
    ]);
    expect(body.results.days.slice(0, 2)).toEqual([
      { weekday: 'MON', songIds: [aMon, bMon], winnerIds: [aMon] },
      { weekday: 'TUE', songIds: [bTue], winnerIds: [bTue] },
    ]);
    expect(body.results.songs.find((s) => s.recommendationId === aMon)).toMatchObject({
      recommendedBy: a,
      myRating: 7,
    });
    expect(body.results.songs.every((s) => !('ratings' in s))).toBe(true); // D11 default
    expect(body.members.map((m) => m.userId).sort()).toEqual([a, b, c].sort());
    expect(body.round.status).toBe('CLOSED');
  });

  it('shows who rated what only for weeks that started with it on (D11)', async () => {
    const { party, round, a } = await playWeek();
    // Turned on after the week was played: ratings given anonymously stay anonymous.
    await runHandler(
      updateSettingsFn,
      apiEvent({ userId: a, pathParameters: { partyId: party.partyId }, body: { showWhoRatedWhat: true } }),
      deps,
    );
    deps.setNow(AFTER_WEEK);
    const hidden = bodyOf(await results(a, round.roundId)) as ResultsBody;
    expect(hidden.results.songs.every((s) => s.ratings === undefined)).toBe(true);

    // A week run with it on shows them.
    await setWeekPrivacy(deps.data, round, { showWhoRatedWhat: true });
    const shown = bodyOf(await results(a, round.roundId)) as ResultsBody;
    expect(shown.results.songs.every((s) => Array.isArray(s.ratings))).toBe(true);
  });

  it('ignores a rating saved after the week ended', async () => {
    const { round, c, bTue } = await playWeek();
    await putVote(deps.data, {
      roundId: round.roundId,
      recommendationId: bTue,
      userId: c,
      rating: 1,
      updatedAt: '2026-10-12T05:00:00.010Z', // 10 ms after the lock
    });
    deps.setNow(AFTER_WEEK);
    const body = bodyOf(await results(c, round.roundId)) as ResultsBody;
    expect(body.results.songs.find((s) => s.recommendationId === bTue)).toMatchObject({
      averageRating: 10,
      ratingCount: 1,
    });
  });

  it('a week with fewer than 2 songs has no results, and history says so', async () => {
    deps.setNow(MONDAY);
    const a = newId();
    const party = (
      bodyOf(
        await runHandler(
          createPartyHandlerFn,
          apiEvent({ userId: a, body: { name: 'P', timezone: 'America/Chicago' } }),
          deps,
        ),
      ) as { party: Party }
    ).party;
    const round = (
      bodyOf(
        await runHandler(
          getCurrentWeekFn,
          apiEvent({ userId: a, pathParameters: { partyId: party.partyId } }),
          deps,
        ),
      ) as {
        round: Round;
      }
    ).round;
    await share(a, round.roundId, 'lonely');

    deps.setNow(AFTER_WEEK);
    const result = await results(a, round.roundId);
    expect(result.statusCode).toBe(403);
    expect((bodyOf(result) as { error: { message: string } }).error.message).toContain('Not enough songs');

    const history = bodyOf(
      await runHandler(
        listWeeksFn,
        apiEvent({ userId: a, pathParameters: { partyId: party.partyId } }),
        deps,
      ),
    ) as { rounds: Round[] };
    expect(history.rounds.find((r) => r.roundId === round.roundId)?.status).toBe('NOT_ENOUGH_SONGS');
  });

  it('refuses non-members', async () => {
    const { round } = await playWeek();
    deps.setNow(AFTER_WEEK);
    expect((await results(newId(), round.roundId)).statusCode).toBe(403);
  });
});
