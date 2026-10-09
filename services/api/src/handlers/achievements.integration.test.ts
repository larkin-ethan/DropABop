import type { AchievementsResponse, Party, Round } from '@dropabop/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { aRecommendation, aRound, aVote, newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { putRecommendation } from '../data/recommendations';
import { createRoundIfMissing } from '../data/rounds';
import { putVote } from '../data/votes';
import { runHandler } from '../http/handler';
import { getAchievementsFn, markAchievementsSeenFn } from './achievements';
import { joinPartyFn } from './membership';
import { createPartyHandlerFn } from './parties';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

let party: Party;
const host = newId();
const friend = newId();
const outsider = newId();
let closedEndsAt = '';

beforeAll(async () => {
  deps.setNow('2026-09-28T17:00:00.000Z');
  party = (
    bodyOf(
      await runHandler(
        createPartyHandlerFn,
        apiEvent({ userId: host, body: { name: 'Badge party', timezone: 'America/Chicago' } }),
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

  // A finished week: the host's song gets a 10 from the friend, the friend's song gets a 9 from the host.
  const past: Round = aRound(party.partyId, '2026-09-28', {
    startsAt: '2026-09-28T05:00:00.000Z',
    endsAt: '2026-10-05T05:00:00.000Z',
  });
  closedEndsAt = past.endsAt;
  await createRoundIfMissing(deps.data, past);
  const hostSong = aRecommendation(past, host, '2026-09-28');
  const friendSong = aRecommendation(past, friend, '2026-09-29', { weekday: 'TUE' });
  await putRecommendation(deps.data, hostSong);
  await putRecommendation(deps.data, friendSong);
  await putVote(deps.data, { ...aVote(hostSong, friend, 10), updatedAt: '2026-09-30T00:00:00.000Z' });
  await putVote(deps.data, { ...aVote(friendSong, host, 9), updatedAt: '2026-09-30T00:00:00.000Z' });

  // The open week: the friend's 1 here must not count yet (D9).
  const open = aRound(party.partyId, '2026-10-05', { endsAt: '2026-10-12T05:00:00.000Z' });
  await createRoundIfMissing(deps.data, open);
  const openSong = aRecommendation(open, host, '2026-10-05');
  await putRecommendation(deps.data, openSong);
  await putVote(deps.data, { ...aVote(openSong, friend, 1), updatedAt: '2026-10-06T00:00:00.000Z' });

  deps.setNow('2026-10-07T17:00:00.000Z');
});

const get = async (userId: string | undefined, query: Record<string, string> = {}) => {
  const result = await runHandler(
    getAchievementsFn,
    apiEvent({ userId, pathParameters: { partyId: party.partyId }, queryStringParameters: query }),
    deps,
  );
  return { status: result.statusCode, body: bodyOf(result) as AchievementsResponse };
};
const unlocked = (body: AchievementsResponse, id: string) =>
  body.achievements.find((a) => a.id === id)?.unlockedOn;

describe('GET /parties/{partyId}/achievements (P13.9)', () => {
  it('works out your achievements from closed weeks only', async () => {
    const { status, body } = await get(host);
    expect(status).toBe(200);
    expect(body.memberId).toBe(host);
    expect(body.achievements).toHaveLength(26);
    expect(unlocked(body, 'first-drop')).toBe(closedEndsAt);
    expect(unlocked(body, 'first-rating')).toBe(closedEndsAt);
    expect(unlocked(body, 'top-bop')).toBe(closedEndsAt); // 10.0 beat 9.0
    // Ratings locked Mon 05:00 UTC = Sunday 11:59 pm in Chicago, the party's timezone.
    expect(body.achievements.find((a) => a.id === 'top-bop')?.unlockedDay).toBe('2026-10-04');
    expect(unlocked(body, 'first-10')).toBeNull(); // the host gave a 9
    expect(body.unlockedCount).toBe(body.achievements.filter((a) => a.unlockedOn !== null).length);
  });

  it('shows another member’s, but never their "seen" state', async () => {
    const { body } = await get(host, { memberId: friend });
    expect(body.memberId).toBe(friend);
    // D11: another member's "gave a 10" shows as unlocked, but not which week.
    const first10 = body.achievements.find((a) => a.id === 'first-10');
    expect(first10).toMatchObject({ unlocked: true, unlockedOn: null, unlockedDay: null });
    expect(unlocked(body, 'first-drop')).toBe(closedEndsAt); // not rating-revealing: dated as usual
    expect(body.achievements.find((a) => a.id === 'first-1')?.unlocked).toBe(false); // their 1 is in the open week (D9)
    expect(body.newlyUnlocked).toEqual([]);
    expect(body.seenAt).toBeNull();
  });

  it('banner: nothing the first time; after "seen", only what unlocks later', async () => {
    const first = await get(friend);
    expect(first.body.seenAt).toBeNull();
    expect(first.body.newlyUnlocked).toEqual([]);

    deps.setNow('2026-10-01T00:00:00.000Z'); // pretend they looked before the week ended
    const seen = await runHandler(
      markAchievementsSeenFn,
      apiEvent({ userId: friend, pathParameters: { partyId: party.partyId } }),
      deps,
    );
    expect(seen.statusCode).toBe(200);
    deps.setNow('2026-10-07T17:00:00.000Z');
    const after = await get(friend);
    expect(after.body.seenAt).toBe('2026-10-01T00:00:00.000Z');
    expect(after.body.newlyUnlocked).toContain('first-10');
  });

  it('requires sign-in, membership, and a member of the party', async () => {
    expect((await get(undefined)).status).toBe(401);
    expect((await get(outsider)).status).toBe(403);
    expect((await get(host, { memberId: outsider })).status).toBe(404);
    expect((await get(host, { memberId: 'not valid!' })).status).toBe(400);
    const seen = await runHandler(
      markAchievementsSeenFn,
      apiEvent({ userId: outsider, pathParameters: { partyId: party.partyId } }),
      deps,
    );
    expect(seen.statusCode).toBe(403);
  });
});
