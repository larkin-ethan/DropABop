// Comments on songs (D25): GET /rounds/{roundId}/comments, POST /rounds/{roundId}/recommendations/{recommendationId}/comments,
// DELETE /rounds/{roundId}/comments/{commentId} (docs/API.md → Comments).

import type { Comment, CommentResponse, CommentsResponse } from '@dropabop/shared';
import { addCommentRequestSchema } from '@dropabop/shared';
import { deleteComment, listWeekComments, putComment } from '../data/comments';
import { getRecommendation } from '../data/recommendations';
import { MESSAGES } from '../domain/messages';
import { canAddComment, canDeleteComment } from '../domain/rules';
import { isWeekOpen } from '../domain/week';
import { assertAllowed, fail } from '../http/errors';
import { created, createHandler, noContent, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseBody, pathId } from '../http/request';
import { loadRoundForMember } from './weeks';

/** Every comment in the week, oldest first. Members only (loadRoundForMember checks the week's own party). */
export const listCommentsFn: HandlerFn = async (event, { data }) => {
  const { userId } = getAuthenticatedUser(event);
  const { round } = await loadRoundForMember(event, data, userId);
  return ok({ comments: await listWeekComments(data, round.roundId) } satisfies CommentsResponse);
};

/** Comment on one of the week's songs, while the week is open. */
export const addCommentFn: HandlerFn = async (event, { data, now, newId }) => {
  const { userId } = getAuthenticatedUser(event);
  const { round, membership } = await loadRoundForMember(event, data, userId);
  const recommendationId = pathId(event, 'recommendationId');
  const { text } = parseBody(event, addCommentRequestSchema);

  const recommendation = await getRecommendation(data, round.roundId, recommendationId);
  if (recommendation === null) {
    fail('NOT_FOUND', 'We couldn’t find that song in this week.');
  }
  const existing = await listWeekComments(data, round.roundId);
  assertAllowed(
    canAddComment({
      membership,
      round,
      recommendation,
      myCommentCountThisWeek: existing.filter((c) => c.userId === userId).length,
      now: now(),
    }),
  );

  // Fresh clock read for the timestamp, and refuse if the lock passed meanwhile (same reasoning as ratings).
  const writeTime = now();
  if (!isWeekOpen(round, writeTime)) {
    fail('WEEK_CLOSED', MESSAGES.WEEK_CLOSED_COMMENT);
  }
  const comment: Comment = {
    commentId: newId(),
    roundId: round.roundId,
    recommendationId,
    userId,
    text,
    createdAt: writeTime.toISOString(),
  };
  await putComment(data, comment);
  return created({ comment } satisfies CommentResponse);
};

/** Delete a comment: your own while the week is open, or any comment if you're the host. */
export const deleteCommentFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const { round, party, membership } = await loadRoundForMember(event, data, userId);
  const commentId = pathId(event, 'commentId');

  const comment = (await listWeekComments(data, round.roundId)).find((c) => c.commentId === commentId);
  if (comment === undefined) {
    fail('NOT_FOUND', MESSAGES.COMMENT_NOT_FOUND);
  }
  assertAllowed(canDeleteComment({ membership, party, round, comment, userId, now: now() }));
  await deleteComment(data, comment);
  return noContent();
};

export const listCommentsHandler = createHandler(listCommentsFn);
export const addCommentHandler = createHandler(addCommentFn);
export const deleteCommentHandler = createHandler(deleteCommentFn);
