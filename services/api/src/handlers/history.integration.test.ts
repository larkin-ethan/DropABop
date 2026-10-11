import type { HistoryResponse, Party, Round } from '@dropabop/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { aRecommendation, aRound, aVote, newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { putRecommendation } from '../data/recommendations';
import { createRoundIfMissing } from '../data/rounds';
import { putVote } from '../data/votes';
import { runHandler } from '../http/handler';
import { getHistoryFn } from './history';
import { joinPartyFn } from './membership';
import { createPartyHandlerFn } from './parties';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

let party: Party;
const host = newId();
const friend = newId();
const outsider = newId();

beforeAll(async () => {
  deps.setNow('2026-09-28T17:00:00.000Z');
  party = (
    bodyOf(
      await runHandler(
        createPartyHandlerFn,
        apiEvent({ userId: host, body: { name: 'History party', timezone: 'America/Chicago' } }),
        deps,
      ),
    ) as { party: Party }
  ).party;
  await runHandler(
    joinPartyFn,
    apiEvent({
      userId: friend,
      pathParameters: { partyId: party.partyId },
      body: { inviteCode: party.inviteCode },
    }),
    deps,
  );

  // A finished week (Mon Sep 28 – it overlaps October): the host's song rated 9, the friend's rated 6.
  const past: Round = aRound(party.partyId, '2026-09-28', {
    startsAt: '2026-09-28T05:00:00.000Z',
    endsAt: '2026-10-05T05:00:00.000Z',
  });
  await createRoundIfMissing(deps.data, past);
  const hostSong = aRecommendation(past, host, '2026-09-28');
  const friendSong = aRecommendation(past, friend, '2026-09-29', { weekday: 'TUE' });
  await putRecommendation(deps.data, hostSong);
  await putRecommendation(deps.data, friendSong);
  await putVote(deps.data, { ...aVote(hostSong, friend, 9), updatedAt: '2026-09-30T00:00:00.000Z' });
  await putVote(deps.data, { ...aVote(friendSong, host, 6), updatedAt: '2026-09-30T00:00:00.000Z' });

  // The current, still-open week: its rating must not show (D9).
  const open = aRound(party.partyId, '2026-10-05', { endsAt: '2026-10-12T05:00:00.000Z' });
  await createRoundIfMissing(deps.data, open);
  const openSong = aRecommendation(open, friend, '2026-10-05');
  await putRecommendation(deps.data, openSong);
  await putVote(deps.data, { ...aVote(openSong, host, 1), updatedAt: '2026-10-06T00:00:00.000Z' });

  deps.setNow('2026-10-07T17:00:00.000Z');
});

const ask = (userId: string | undefined, month: string, partyId = party.partyId) =>
  runHandler(
    getHistoryFn,
    apiEvent({ userId, pathParameters: { partyId }, queryStringParameters: { month } }),
    deps,
  );

describe('GET /parties/{partyId}/history (P13.8)', () => {
  it('returns the month’s weeks with closed-week numbers and only counts for the open week', async () => {
    const result = await ask(host, '2026-10');
    expect(result.statusCode).toBe(200);
    const body = bodyOf(result) as HistoryResponse;
    expect(body.weeks.map((w) => [w.weekStart, w.status])).toEqual([
      ['2026-09-28', 'CLOSED'],
      ['2026-10-05', 'OPEN'],
    ]);

    const [past, open] = body.weeks;
    expect(past!.days[0]).toMatchObject({
      date: '2026-09-28',
      songCount: 1,
      iShared: true,
      personalBest: true,
    });
    expect(past!.days[0]!.stats).toMatchObject({ groupAverage: 9, myAverageReceived: 9 });
    expect(past!.days[1]!.stats).toMatchObject({ myAverageGiven: 6 });
    expect(past!.yourWeek).toMatchObject({
      songsRated: 1,
      averageGiven: 6,
      averageReceived: 9,
      rank: { position: 1, of: 2 },
    });
    expect(past!.summary).toMatchObject({ songCount: 2, ratingCount: 2, averageRating: 7.5 });

    // D9: the open week shows that a song was shared, nothing about its ratings.
    expect(open!.days[0]).toMatchObject({ songCount: 1, iShared: false, stats: null });
    expect(open!.summary).toBeNull();
    expect(JSON.stringify(open)).not.toContain('"average"');
    expect(body.members.map((m) => m.userId).sort()).toEqual([host, friend].sort());
  });

  it('never says who rated what', async () => {
    const body = bodyOf(await ask(host, '2026-10')) as HistoryResponse;
    expect(JSON.stringify(body)).not.toContain('"ratings"');
  });

  it('is empty for a month with no weeks', async () => {
    const body = bodyOf(await ask(host, '2025-01')) as HistoryResponse;
    expect(body.weeks).toEqual([]);
  });

  it('requires sign-in, membership and a valid month', async () => {
    expect((await ask(undefined, '2026-10')).statusCode).toBe(401);
    expect((await ask(outsider, '2026-10')).statusCode).toBe(403);
    expect((await ask(host, '2026-13')).statusCode).toBe(400);
    expect((await ask(host, 'October')).statusCode).toBe(400);
  });
});
