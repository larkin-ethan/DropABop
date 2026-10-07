// D25 comments, end to end against DynamoDB Local: who may comment, read and delete, and when.

import type { Party, Round } from '@dropabop/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { runHandler } from '../http/handler';
import { addCommentFn, deleteCommentFn, listCommentsFn } from './comments';
import { joinPartyFn } from './membership';
import { createPartyHandlerFn } from './parties';
import { submitRecommendationFn } from './recommendations';
import { getCurrentWeekFn } from './weeks';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

const WEDNESDAY = '2026-10-07T17:00:00.000Z';
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

interface CommentBody {
  commentId: string;
  recommendationId: string;
  userId: string;
  text: string;
}

const add = (userId: string, roundId: string, recommendationId: string, text: unknown) =>
  runHandler(
    addCommentFn,
    apiEvent({ userId, pathParameters: { roundId, recommendationId }, body: { text } }),
    deps,
  );
const list = (userId: string, roundId: string) =>
  runHandler(listCommentsFn, apiEvent({ userId, pathParameters: { roundId } }), deps);
const remove = (userId: string, roundId: string, commentId: string) =>
  runHandler(deleteCommentFn, apiEvent({ userId, pathParameters: { roundId, commentId } }), deps);
const comments = async (userId: string, roundId: string) =>
  (bodyOf(await list(userId, roundId)) as { comments: CommentBody[] }).comments;
const errorCode = (result: { body?: string }) => (bodyOf(result) as { error: { code: string } }).error.code;

describe('comments (D25)', () => {
  it('lets members comment on a song (their own too) and read the week’s comments in order', async () => {
    const { round, hostId, memberId, songId } = await setup();
    const first = await add(memberId, round.roundId, songId, '  Love this one  ');
    expect(first.statusCode).toBe(201);
    expect(bodyOf(first)).toMatchObject({
      comment: { recommendationId: songId, userId: memberId, text: 'Love this one' },
    });
    deps.setNow('2026-10-07T17:05:00.000Z');
    expect((await add(hostId, round.roundId, songId, 'Thanks! (my pick)')).statusCode).toBe(201);
    expect((await comments(memberId, round.roundId)).map((c) => [c.userId, c.text])).toEqual([
      [memberId, 'Love this one'],
      [hostId, 'Thanks! (my pick)'],
    ]);
  });

  it('keeps comments to the party: outsiders and other parties’ members can’t read or write', async () => {
    const { round, songId } = await setup();
    const other = await setup();
    expect((await list(newId(), round.roundId)).statusCode).toBe(403);
    expect((await list(other.memberId, round.roundId)).statusCode).toBe(403);
    expect((await add(other.memberId, round.roundId, songId, 'hi')).statusCode).toBe(403);
    // A song id from another week/party can't be commented on through this week.
    expect((await add(other.memberId, other.round.roundId, songId, 'hi')).statusCode).toBe(404);
  });

  it('validates the text', async () => {
    const { round, memberId, songId } = await setup();
    expect((await add(memberId, round.roundId, songId, '')).statusCode).toBe(400);
    expect((await add(memberId, round.roundId, songId, 'a'.repeat(281))).statusCode).toBe(400);
    expect((await add(memberId, round.roundId, songId, 42)).statusCode).toBe(400);
  });

  it('closes comments when ratings lock; finished weeks’ comments can still be read', async () => {
    const { round, memberId, songId } = await setup();
    expect((await add(memberId, round.roundId, songId, 'On time')).statusCode).toBe(201);
    deps.setNow(WEEK_END);
    const late = await add(memberId, round.roundId, songId, 'Too late');
    expect(late.statusCode).toBe(409);
    expect(errorCode(late)).toBe('WEEK_CLOSED');
    expect((await comments(memberId, round.roundId)).map((c) => c.text)).toEqual(['On time']);
  });

  it('deletes: your own while open, never someone else’s; the host can delete any, any time', async () => {
    const { round, hostId, memberId, songId } = await setup();
    const mine = (bodyOf(await add(memberId, round.roundId, songId, 'oops')) as { comment: CommentBody })
      .comment;
    const hosts = (bodyOf(await add(hostId, round.roundId, songId, 'host note')) as { comment: CommentBody })
      .comment;

    const notYours = await remove(memberId, round.roundId, hosts.commentId);
    expect(notYours.statusCode).toBe(403);
    expect(errorCode(notYours)).toBe('FORBIDDEN');
    expect((await remove(memberId, round.roundId, mine.commentId)).statusCode).toBe(204);

    const second = (bodyOf(await add(memberId, round.roundId, songId, 'kept')) as { comment: CommentBody })
      .comment;
    deps.setNow(WEEK_END);
    expect(errorCode(await remove(memberId, round.roundId, second.commentId))).toBe('WEEK_CLOSED');
    expect((await remove(hostId, round.roundId, second.commentId)).statusCode).toBe(204); // moderation
    expect((await remove(hostId, round.roundId, second.commentId)).statusCode).toBe(404);
    expect((await comments(hostId, round.roundId)).map((c) => c.text)).toEqual(['host note']);
  });
});
