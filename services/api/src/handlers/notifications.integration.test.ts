import type { NotificationsResponse, Party, Round } from '@dropabop/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { aRecommendation, aRound, aVote, newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { putRecommendation } from '../data/recommendations';
import { createRoundIfMissing, recordRoundStatus } from '../data/rounds';
import { putVote } from '../data/votes';
import { runHandler } from '../http/handler';
import { joinPartyFn } from './membership';
import { getNotificationsFn, markNotificationsSeenFn } from './notifications';
import { addCommentFn } from './comments';
import { createPartyHandlerFn } from './parties';
import { updateMe } from './users';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

let party: Party;
const host = newId();
const friend = newId();
const outsider = newId();
let openSong: ReturnType<typeof aRecommendation>;

beforeAll(async () => {
  deps.setNow('2026-09-28T17:00:00.000Z');
  party = (
    bodyOf(
      await runHandler(
        createPartyHandlerFn,
        apiEvent({ userId: host, body: { name: 'Bell party', timezone: 'America/Chicago' } }),
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
  // Last week, closed with results: the host's song rated 9 by the friend.
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
  await recordRoundStatus(deps.data, past, 'CLOSED');
  // This week (Wednesday): the friend has shared a song the host hasn't rated.
  const open = aRound(party.partyId, '2026-10-05', { endsAt: '2026-10-12T05:00:00.000Z' });
  await createRoundIfMissing(deps.data, open);
  openSong = aRecommendation(open, friend, '2026-10-06', {
    weekday: 'TUE',
    createdAt: '2026-10-06T15:00:00.000Z',
  });
  await putRecommendation(deps.data, openSong);
  deps.setNow('2026-10-07T17:00:00.000Z');
});

const get = async (userId: string | undefined) => {
  const result = await runHandler(
    getNotificationsFn,
    apiEvent({ userId, pathParameters: { partyId: party.partyId } }),
    deps,
  );
  return { status: result.statusCode, body: bodyOf(result) as NotificationsResponse };
};

describe('GET /parties/{partyId}/notifications (P13.10)', () => {
  it('lists this week’s and last week’s news, all unread the first time', async () => {
    const { status, body } = await get(host);
    expect(status).toBe(200);
    expect(body.notifications.map((x) => x.type).sort()).toEqual([
      'results',
      'shareToday',
      'toRate',
      'weeklyRank',
    ]);
    expect(body.unreadCount).toBe(4);
    expect(body.seenAt).toBeNull();
  });

  it('after "seen" in this party, only newer news is unread', async () => {
    deps.setNow('2026-10-07T18:00:00.000Z');
    const seen = await runHandler(
      markNotificationsSeenFn,
      apiEvent({ userId: host, pathParameters: { partyId: party.partyId } }),
      deps,
    );
    expect(seen.statusCode).toBe(200);
    deps.setNow('2026-10-07T17:00:00.000Z');
    const { body } = await get(host);
    expect(body.seenAt).toBe('2026-10-07T18:00:00.000Z');
    expect(body.unreadCount).toBe(0);
    expect(body.notifications.length).toBeGreaterThan(0); // still listed, just read
    // The friend's "seen" is their own (stored per person and party).
    expect((await get(friend)).body.seenAt).toBeNull();
  });

  it('tells you about comments on your songs, and never names other members', async () => {
    await runHandler(
      addCommentFn,
      apiEvent({
        userId: host,
        pathParameters: { roundId: openSong.roundId, recommendationId: openSong.recommendationId },
        body: { text: 'Great pick' },
      }),
      deps,
    );
    const { body } = await get(friend);
    expect(body.notifications.find((x) => x.type === 'comments')?.title).toBe(
      '1 comment on your songs this week',
    );
    expect(JSON.stringify(body)).not.toContain(host);
  });

  it('leaves out types you switched off', async () => {
    const before = await get(friend);
    expect(before.body.notifications.map((x) => x.type)).toEqual(
      expect.arrayContaining(['results', 'weeklyRank']),
    );
    await runHandler(
      updateMe,
      apiEvent({ userId: friend, body: { notificationPrefs: { results: false, weeklyRank: false } } }),
      deps,
    );
    const { body } = await get(friend);
    expect(body.notifications.some((x) => x.type === 'results' || x.type === 'weeklyRank')).toBe(false);
  });

  it('requires sign-in and membership; preferences only accept known types', async () => {
    expect((await get(undefined)).status).toBe(401);
    expect((await get(outsider)).status).toBe(403);
    const bad = await runHandler(
      updateMe,
      apiEvent({ userId: host, body: { notificationPrefs: { spam: true } } }),
      deps,
    );
    expect(bad.statusCode).toBe(400);
    const sneaky = await runHandler(
      updateMe,
      apiEvent({ userId: host, body: { notificationsSeenAt: '2099-01-01T00:00:00.000Z' } }),
      deps,
    );
    expect(sneaky.statusCode).toBe(400);
    const outsiderSeen = await runHandler(
      markNotificationsSeenFn,
      apiEvent({ userId: outsider, pathParameters: { partyId: party.partyId } }),
      deps,
    );
    expect(outsiderSeen.statusCode).toBe(403);
  });
});
