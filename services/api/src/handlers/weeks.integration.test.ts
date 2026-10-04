import type { Party, Round } from '@dropabop/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { aRecommendation, aVote, newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { putRecommendation } from '../data/recommendations';
import { putVote } from '../data/votes';
import { runHandler } from '../http/handler';
import { joinPartyFn } from './membership';
import { createPartyHandlerFn } from './parties';
import { updateSettingsFn } from './settings';
import { getCurrentWeekFn, listWeeksFn } from './weeks';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

// Week of Mon 2026-10-05 in Chicago (UTC-5).
const WEDNESDAY = '2026-10-07T17:00:00.000Z';
const SATURDAY = '2026-10-10T17:00:00.000Z';
const NEXT_MONDAY = '2026-10-12T15:00:00.000Z';

interface CurrentWeekBody {
  round: Round | null;
  status?: string;
  reason: string | null;
  today: { weekday: string; date: string; dayNumber: number } | null;
  sharedToday: boolean;
  sharedTodayCount: number;
  sharedTodayUserIds?: string[];
  progress: { songCount: number; ratableCount: number; ratedCount: number };
  nextWeekStartsAt?: string | null;
}

async function setupParty(): Promise<{ party: Party; hostId: string; memberId: string }> {
  deps.setNow(WEDNESDAY);
  const hostId = newId();
  const memberId = newId();
  const party = (
    bodyOf(
      await runHandler(
        createPartyHandlerFn,
        apiEvent({ userId: hostId, body: { name: 'P', timezone: 'America/Chicago' } }),
        deps,
      ),
    ) as { party: Party }
  ).party;
  await runHandler(
    joinPartyFn,
    apiEvent({
      userId: memberId,
      pathParameters: { partyId: party.partyId },
      body: { inviteCode: party.inviteCode },
    }),
    deps,
  );
  return { party, hostId, memberId };
}

async function currentWeek(userId: string, party: Party) {
  const result = await runHandler(
    getCurrentWeekFn,
    apiEvent({ userId, pathParameters: { partyId: party.partyId } }),
    deps,
  );
  return { status: result.statusCode, body: bodyOf(result) as CurrentWeekBody };
}

describe('GET /parties/{partyId}/rounds/current', () => {
  it('creates this week on the first visit and describes today', async () => {
    const { party, hostId } = await setupParty();
    const { status, body } = await currentWeek(hostId, party);

    expect(status).toBe(200);
    expect(body.round).toMatchObject({
      roundId: `${party.partyId}.2026-10-05`,
      weekStart: '2026-10-05',
      timezone: 'America/Chicago',
      endsAt: '2026-10-12T05:00:00.000Z',
    });
    expect(body.status).toBe('OPEN');
    expect(body.today).toEqual({ weekday: 'WED', date: '2026-10-07', dayNumber: 3, dayCount: 5 });
    expect(body.sharedToday).toBe(false);
    expect(body.progress).toEqual({ songCount: 0, ratableCount: 0, ratedCount: 0 });
  });

  it('reports how many shared today and each person’s own rating progress', async () => {
    const { party, hostId, memberId } = await setupParty();
    const thirdId = newId();
    await runHandler(
      joinPartyFn,
      apiEvent({
        userId: thirdId,
        pathParameters: { partyId: party.partyId },
        body: { inviteCode: party.inviteCode },
      }),
      deps,
    );
    const round = (await currentWeek(hostId, party)).body.round as Round;
    const hostSong = aRecommendation(round, hostId, '2026-10-07');
    const memberSong = aRecommendation(round, memberId, '2026-10-06'); // yesterday
    await putRecommendation(deps.data, hostSong);
    await putRecommendation(deps.data, memberSong);
    await putVote(deps.data, aVote(hostSong, memberId, 8));
    await putVote(deps.data, aVote(memberSong, thirdId, 3)); // someone else's rating: must not count for the host

    const host = (await currentWeek(hostId, party)).body;
    expect(host.sharedToday).toBe(true);
    expect(host.sharedTodayCount).toBe(1);
    expect(host.progress).toEqual({ songCount: 2, ratableCount: 1, ratedCount: 0 });

    const member = (await currentWeek(memberId, party)).body;
    expect(member.sharedToday).toBe(false);
    expect(member.progress).toEqual({ songCount: 2, ratableCount: 1, ratedCount: 1 });
  });

  it('only says *who* shared today when the party reveals recommenders (D10)', async () => {
    const { party, hostId, memberId } = await setupParty();
    const round = (await currentWeek(hostId, party)).body.round as Round;
    await putRecommendation(deps.data, aRecommendation(round, hostId, '2026-10-07'));

    // By default: count only. A list of who shared, compared with the songs list, would reveal whose song is whose.
    expect((await currentWeek(memberId, party)).body).not.toHaveProperty('sharedTodayUserIds');

    await runHandler(
      updateSettingsFn,
      apiEvent({
        userId: hostId,
        pathParameters: { partyId: party.partyId },
        body: { revealRecommenderDuringVoting: true },
      }),
      deps,
    );
    expect((await currentWeek(memberId, party)).body.sharedTodayUserIds).toEqual([hostId]);
  });

  it('has no submission day on the weekend', async () => {
    const { party, hostId } = await setupParty();
    deps.setNow(SATURDAY);
    const { body } = await currentWeek(hostId, party);
    expect(body.today).toBeNull();
    expect(body.sharedTodayCount).toBe(0);
    expect(body.status).toBe('OPEN');
  });

  it('starts a new week on Monday and records how the last one ended', async () => {
    const { party, hostId } = await setupParty();
    await currentWeek(hostId, party); // creates week of Oct 5 (no songs)
    deps.setNow(NEXT_MONDAY);

    const { body } = await currentWeek(hostId, party);
    expect(body.round?.weekStart).toBe('2026-10-12');
    expect(body.today?.weekday).toBe('MON');

    const history = bodyOf(
      await runHandler(
        listWeeksFn,
        apiEvent({ userId: hostId, pathParameters: { partyId: party.partyId } }),
        deps,
      ),
    ) as { rounds: Round[] };
    expect(history.rounds.map((r) => [r.weekStart, r.status])).toEqual([
      ['2026-10-12', 'OPEN'],
      ['2026-10-05', 'NOT_ENOUGH_SONGS'],
    ]);
  });

  it('a paused party has no current week once the open one ends', async () => {
    const { party, hostId } = await setupParty();
    await currentWeek(hostId, party);
    await runHandler(
      updateSettingsFn,
      apiEvent({ userId: hostId, pathParameters: { partyId: party.partyId }, body: { paused: true } }),
      deps,
    );
    expect((await currentWeek(hostId, party)).body.round).not.toBeNull(); // current week keeps running

    deps.setNow(NEXT_MONDAY);
    const { body } = await currentWeek(hostId, party);
    expect(body).toMatchObject({ round: null, reason: 'paused', nextWeekStartsAt: null });
  });

  it('creates only one round when several people open the app at once', async () => {
    const { party, hostId, memberId } = await setupParty();
    const results = await Promise.all(
      [hostId, memberId, hostId, memberId].map((id) => currentWeek(id, party)),
    );
    const ids = new Set(results.map((r) => r.body.round?.roundId));
    expect(ids.size).toBe(1);

    const history = bodyOf(
      await runHandler(
        listWeeksFn,
        apiEvent({ userId: hostId, pathParameters: { partyId: party.partyId } }),
        deps,
      ),
    ) as { rounds: Round[] };
    expect(history.rounds).toHaveLength(1);
  });

  it('refuses non-members', async () => {
    const { party } = await setupParty();
    expect((await currentWeek(newId(), party)).status).toBe(403);
  });
});

describe('GET /parties/{partyId}/rounds', () => {
  it('pages through history and rejects a bad cursor', async () => {
    const { party, hostId } = await setupParty();
    await currentWeek(hostId, party);
    deps.setNow(NEXT_MONDAY);
    await currentWeek(hostId, party);

    const firstPage = bodyOf(
      await runHandler(
        listWeeksFn,
        apiEvent({
          userId: hostId,
          pathParameters: { partyId: party.partyId },
          queryStringParameters: { limit: '1' },
        }),
        deps,
      ),
    ) as { rounds: Round[]; nextCursor: string | null };
    expect(firstPage.rounds.map((r) => r.weekStart)).toEqual(['2026-10-12']);
    expect(firstPage.nextCursor).toBe('2026-10-12');

    const secondPage = bodyOf(
      await runHandler(
        listWeeksFn,
        apiEvent({
          userId: hostId,
          pathParameters: { partyId: party.partyId },
          queryStringParameters: { limit: '1', cursor: firstPage.nextCursor ?? '' },
        }),
        deps,
      ),
    ) as { rounds: Round[] };
    expect(secondPage.rounds.map((r) => r.weekStart)).toEqual(['2026-10-05']);

    const bad = await runHandler(
      listWeeksFn,
      apiEvent({
        userId: hostId,
        pathParameters: { partyId: party.partyId },
        queryStringParameters: { cursor: 'PARTY#x' },
      }),
      deps,
    );
    expect(bad.statusCode).toBe(400);
  });
});
