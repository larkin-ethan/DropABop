import type { Party, Round } from '@dropabop/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { runHandler } from '../http/handler';
import { joinPartyFn } from './membership';
import { createPartyHandlerFn } from './parties';
import { submitRecommendationFn } from './recommendations';
import { getResultsFn } from './results';
import { castVoteFn, listMyVotesFn } from './votes';
import { getCurrentWeekFn } from './weeks';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

const WEDNESDAY = '2026-10-07T17:00:00.000Z';
const SUNDAY_LAST_MS = '2026-10-12T04:59:59.999Z';
const WEEK_END = '2026-10-12T05:00:00.000Z';

async function setup() {
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
  const round = (
    bodyOf(
      await runHandler(
        getCurrentWeekFn,
        apiEvent({ userId: hostId, pathParameters: { partyId: party.partyId } }),
        deps,
      ),
    ) as { round: Round }
  ).round;
  const shared = bodyOf(
    await runHandler(
      submitRecommendationFn,
      apiEvent({
        userId: hostId,
        pathParameters: { roundId: round.roundId },
        body: { provider: 'appleMusic', providerSongId: '100' },
      }),
      deps,
    ),
  ) as { song: { recommendationId: string } };
  return { party, round, hostId, memberId, songId: shared.song.recommendationId };
}

const rate = (userId: string, roundId: string, recommendationId: string, body: unknown) =>
  runHandler(castVoteFn, apiEvent({ userId, pathParameters: { roundId, recommendationId }, body }), deps);

const myVotes = async (userId: string, roundId: string) =>
  bodyOf(await runHandler(listMyVotesFn, apiEvent({ userId, pathParameters: { roundId } }), deps)) as {
    votes: { recommendationId: string; rating: number }[];
  };

const errorCode = (result: { body?: string }) => (bodyOf(result) as { error: { code: string } }).error.code;

describe('PUT /rounds/{roundId}/votes/{recommendationId}', () => {
  it('rates a song and lets you change your mind', async () => {
    const { round, memberId, songId } = await setup();
    const first = await rate(memberId, round.roundId, songId, { rating: 6 });
    expect(first.statusCode).toBe(200);
    expect(bodyOf(first)).toMatchObject({ vote: { recommendationId: songId, rating: 6 } });

    await rate(memberId, round.roundId, songId, { rating: 9 });
    expect((await myVotes(memberId, round.roundId)).votes).toEqual([
      expect.objectContaining({ recommendationId: songId, rating: 9 }),
    ]);
  });

  it('accepts a rating at the last millisecond of Sunday and locks at Monday 00:00 (D8)', async () => {
    const { round, memberId, songId } = await setup();
    deps.setNow(SUNDAY_LAST_MS);
    expect((await rate(memberId, round.roundId, songId, { rating: 7 })).statusCode).toBe(200);

    deps.setNow(WEEK_END);
    const late = await rate(memberId, round.roundId, songId, { rating: 2 });
    expect(late.statusCode).toBe(409);
    expect(bodyOf(late)).toEqual({
      error: { code: 'WEEK_CLOSED', message: 'This week has ended, so ratings are locked.' },
    });
    expect((await myVotes(memberId, round.roundId)).votes[0]?.rating).toBe(7);
  });

  it('saves the rating with a fresh clock read, so a request straddling midnight doesn’t count', async () => {
    const { round, hostId, memberId, songId } = await setup();
    // Results need at least 2 songs this week.
    await runHandler(
      submitRecommendationFn,
      apiEvent({
        userId: memberId,
        pathParameters: { roundId: round.roundId },
        body: { provider: 'appleMusic', providerSongId: '101' },
      }),
      deps,
    );
    // Clock that moves during the request: the check sees Sunday 23:59:59.999, the save happens after midnight.
    const reads = [SUNDAY_LAST_MS, '2026-10-12T05:00:00.001Z'];
    const movingClock = { ...deps, now: () => new Date(reads.shift() ?? '2026-10-12T05:00:00.001Z') };

    const result = await runHandler(
      castVoteFn,
      apiEvent({
        userId: memberId,
        pathParameters: { roundId: round.roundId, recommendationId: songId },
        body: { rating: 3 },
      }),
      movingClock,
    );
    expect(result.statusCode).toBe(200); // passed the check…
    const saved = (bodyOf(result) as { vote: { updatedAt: string } }).vote.updatedAt;
    expect(saved >= round.endsAt).toBe(true); // …but was stamped after the end

    deps.setNow('2026-10-12T15:00:00.000Z');
    const results = bodyOf(
      await runHandler(
        getResultsFn,
        apiEvent({ userId: hostId, pathParameters: { roundId: round.roundId } }),
        deps,
      ),
    ) as { results: { songs: { recommendationId: string; ratingCount: number }[] } };
    expect(results.results.songs.find((s) => s.recommendationId === songId)?.ratingCount).toBe(0);
  });

  it('won’t let you rate your own song', async () => {
    const { round, hostId, songId } = await setup();
    const result = await rate(hostId, round.roundId, songId, { rating: 10 });
    expect(result.statusCode).toBe(403);
    expect(errorCode(result)).toBe('OWN_SONG');
  });

  it('rejects invalid ratings and extra fields', async () => {
    const { round, memberId, songId } = await setup();
    for (const body of [
      { rating: 0 },
      { rating: 11 },
      { rating: 7.5 },
      { rating: '8' },
      { rating: 8, userId: newId() },
    ]) {
      expect((await rate(memberId, round.roundId, songId, body)).statusCode).toBe(400);
    }
  });

  it('rejects unknown songs, non-members, and songs from another party', async () => {
    const { round, memberId, songId } = await setup();
    expect((await rate(memberId, round.roundId, newId(), { rating: 5 })).statusCode).toBe(404);
    expect((await rate(newId(), round.roundId, songId, { rating: 5 })).statusCode).toBe(403);

    const other = await setup();
    // A member of party A tries to rate party B's song via B's round: not a member of B.
    expect((await rate(memberId, other.round.roundId, other.songId, { rating: 5 })).statusCode).toBe(403);
    // Or pairs their own round with B's song id: that song isn't in this week.
    expect((await rate(memberId, round.roundId, other.songId, { rating: 5 })).statusCode).toBe(404);
  });
});

describe('GET /rounds/{roundId}/votes/me', () => {
  it('returns only your own ratings', async () => {
    const { party, round, hostId, memberId, songId } = await setup();
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
    await rate(memberId, round.roundId, songId, { rating: 4 });
    await rate(thirdId, round.roundId, songId, { rating: 10 });

    expect((await myVotes(memberId, round.roundId)).votes.map((v) => v.rating)).toEqual([4]);
    expect((await myVotes(thirdId, round.roundId)).votes.map((v) => v.rating)).toEqual([10]);
    expect((await myVotes(hostId, round.roundId)).votes).toEqual([]);
  });
});
