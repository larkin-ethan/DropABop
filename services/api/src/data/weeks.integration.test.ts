// Rounds, shared songs, and ratings against DynamoDB Local.
import { afterAll, describe, expect, it } from 'vitest';
import { aRecommendation, aRound, aVote, newId, settle, testContext } from '../../test/fixtures';
import { DomainError } from './errors';
import {
  getRecommendation,
  listMySubmissionDates,
  listPartyRecommendations,
  listWeekRecommendations,
  putRecommendation,
} from './recommendations';
import {
  createRoundIfMissing,
  getLatestRound,
  getRound,
  listAllRounds,
  listRounds,
  recordRoundStatus,
} from './rounds';
import { listMyWeekVotes, listPartyVotes, listWeekVotes, putVote } from './votes';

const ctx = testContext();
afterAll(() => ctx.db.destroy());

describe('rounds', () => {
  it('creates a week once, even when several requests race (ADR-0003)', async () => {
    const partyId = newId();
    const round = aRound(partyId);
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => createRoundIfMissing(ctx, round)));
    expect(results.every((r) => r.roundId === round.roundId)).toBe(true);
    expect((await listAllRounds(ctx, partyId)).map((r) => r.roundId)).toEqual([round.roundId]);
  });

  it('a second create returns the stored round, not the new object', async () => {
    const partyId = newId();
    await createRoundIfMissing(ctx, aRound(partyId, '2026-10-05', { timezone: 'America/Chicago' }));
    const again = await createRoundIfMissing(ctx, aRound(partyId, '2026-10-05', { timezone: 'Asia/Tokyo' }));
    expect(again.timezone).toBe('America/Chicago');
  });

  it('getLatestRound returns the newest week; getRound finds a week by id', async () => {
    const partyId = newId();
    for (const week of ['2026-09-21', '2026-10-05', '2026-09-28']) {
      await createRoundIfMissing(ctx, aRound(partyId, week));
    }
    expect((await getLatestRound(ctx, partyId))?.weekStart).toBe('2026-10-05');
    expect((await getRound(ctx, `${partyId}.2026-09-28`))?.weekStart).toBe('2026-09-28');
    expect(await getLatestRound(ctx, newId())).toBeNull();
  });

  it('getRound returns null for malformed or unknown ids', async () => {
    expect(await getRound(ctx, 'not-a-round-id')).toBeNull();
    expect(await getRound(ctx, `${newId()}.2026-10-05`)).toBeNull();
    expect(await getRound(ctx, 'bad#id.2026-10-05')).toBeNull();
  });

  it('records the close only once', async () => {
    const round = aRound(newId());
    await createRoundIfMissing(ctx, round);
    await recordRoundStatus(ctx, round, 'CLOSED');
    await recordRoundStatus(ctx, round, 'NOT_ENOUGH_SONGS'); // late, different answer: ignored
    expect((await getRound(ctx, round.roundId))?.status).toBe('CLOSED');
  });

  it('rejects a malformed cursor instead of reading something else', async () => {
    await expect(listRounds(ctx, newId(), { cursor: 'PARTY#someone-else' })).rejects.toThrow();
  });

  it('pages through history newest first with an opaque cursor', async () => {
    const partyId = newId();
    const weeks = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'];
    for (const week of weeks) await createRoundIfMissing(ctx, aRound(partyId, week));

    const first = await listRounds(ctx, partyId, { limit: 2 });
    expect(first.rounds.map((r) => r.weekStart)).toEqual(['2026-09-28', '2026-09-21']);
    const second = await listRounds(ctx, partyId, { limit: 2, cursor: first.nextCursor });
    expect(second.rounds.map((r) => r.weekStart)).toEqual(['2026-09-14', '2026-09-07']);
    const third = await listRounds(ctx, partyId, { limit: 2, cursor: second.nextCursor });
    expect(third.rounds.map((r) => r.weekStart)).toEqual(['2026-08-31']);
    expect(third.nextCursor).toBeNull();
  });
});

describe('recommendations (D1: one per member per day)', () => {
  it('saves a song and reads it back by id and by week', async () => {
    const round = aRound(newId());
    const rec = aRecommendation(round, newId(), '2026-10-05');
    await putRecommendation(ctx, rec);

    expect(await getRecommendation(ctx, round.roundId, rec.recommendationId)).toEqual(rec);
    expect(await listWeekRecommendations(ctx, round.roundId)).toEqual([rec]);
  });

  it('rejects a second song on the same day with the friendly message', async () => {
    const round = aRound(newId());
    const userId = newId();
    await putRecommendation(ctx, aRecommendation(round, userId, '2026-10-05'));

    const error = await putRecommendation(ctx, aRecommendation(round, userId, '2026-10-05')).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('ALREADY_SUBMITTED_TODAY');
    expect(await listWeekRecommendations(ctx, round.roundId)).toHaveLength(1);
  });

  it('lets only one of two simultaneous same-day shares through', async () => {
    const round = aRound(newId());
    const userId = newId();
    const { ok, errors } = await settle([
      putRecommendation(ctx, aRecommendation(round, userId, '2026-10-06')),
      putRecommendation(ctx, aRecommendation(round, userId, '2026-10-06')),
    ]);
    expect(ok).toBe(1);
    expect(errors).toHaveLength(1);
    expect((errors[0] as DomainError).code).toBe('ALREADY_SUBMITTED_TODAY');
    expect(await listWeekRecommendations(ctx, round.roundId)).toHaveLength(1);
  });

  it('allows one song per day across the week, and lists the days used', async () => {
    const round = aRound(newId());
    const userId = newId();
    for (const day of ['2026-10-05', '2026-10-07', '2026-10-09']) {
      await putRecommendation(ctx, aRecommendation(round, userId, day));
    }
    await putRecommendation(ctx, aRecommendation(round, newId(), '2026-10-05')); // someone else, same day: fine

    expect((await listMySubmissionDates(ctx, round.roundId, userId)).sort()).toEqual([
      '2026-10-05',
      '2026-10-07',
      '2026-10-09',
    ]);
    expect(await listWeekRecommendations(ctx, round.roundId)).toHaveLength(4);
  });

  it('lists every song in the party across weeks (for stats), and only that party', async () => {
    const partyId = newId();
    const week1 = aRound(partyId, '2026-09-28');
    const week2 = aRound(partyId, '2026-10-05');
    await putRecommendation(ctx, aRecommendation(week1, newId(), '2026-09-28'));
    await putRecommendation(ctx, aRecommendation(week2, newId(), '2026-10-05'));
    await putRecommendation(ctx, aRecommendation(aRound(newId()), newId(), '2026-10-05')); // other party

    expect(await listPartyRecommendations(ctx, partyId)).toHaveLength(2);
    expect(await listWeekRecommendations(ctx, week2.roundId)).toHaveLength(1);
  });
});

describe('recommendation safety checks', () => {
  it('refuses a recommendation whose partyId doesn’t match its round', async () => {
    const round = aRound(newId());
    await expect(
      putRecommendation(ctx, aRecommendation(round, newId(), '2026-10-05', { partyId: newId() })),
    ).rejects.toThrow('does not match');
  });

  it('refuses a recommendationId that isn’t a random UUID (it must not reveal the recommender, D10)', async () => {
    const round = aRound(newId());
    const userId = newId();
    await expect(
      putRecommendation(
        ctx,
        aRecommendation(round, userId, '2026-10-05', { recommendationId: `rec-${userId.slice(0, 8)}` }),
      ),
    ).rejects.toThrow('random UUID');
  });
});

describe('votes (one per member per song)', () => {
  it('stores a rating, replaces it on change, and lists by week and by member', async () => {
    const round = aRound(newId());
    const song = aRecommendation(round, newId(), '2026-10-05');
    await putRecommendation(ctx, song);
    const alice = newId();
    const bob = newId();

    await putVote(ctx, aVote(song, alice, 6));
    await putVote(ctx, aVote(song, alice, 9)); // change of mind
    await putVote(ctx, aVote(song, bob, 4));

    const all = await listWeekVotes(ctx, round.roundId);
    expect(all.map((v) => [v.userId === alice ? 'alice' : 'bob', v.rating]).sort()).toEqual([
      ['alice', 9],
      ['bob', 4],
    ]);
    expect((await listMyWeekVotes(ctx, round.roundId, alice)).map((v) => v.rating)).toEqual([9]);
    expect(await listPartyVotes(ctx, round.partyId)).toHaveLength(2);
  });

  it('keeps weeks and parties separate', async () => {
    const partyId = newId();
    const week1 = aRound(partyId, '2026-09-28');
    const week2 = aRound(partyId, '2026-10-05');
    const otherParty = aRound(newId(), '2026-10-05');
    const voter = newId();
    for (const round of [week1, week2, otherParty]) {
      const song = aRecommendation(round, newId(), round.weekStart);
      await putRecommendation(ctx, song);
      await putVote(ctx, aVote(song, voter, 7));
    }

    expect(await listWeekVotes(ctx, week1.roundId)).toHaveLength(1);
    expect(await listMyWeekVotes(ctx, week2.roundId, voter)).toHaveLength(1);
    expect(await listPartyVotes(ctx, partyId)).toHaveLength(2);
    expect(await listPartyVotes(ctx, otherParty.partyId)).toHaveLength(1);
  });
});
