// Comments on songs (D25; docs/DATABASE.md patterns 22–24).
//
// Scoping: handlers check membership of `parseRoundId(roundId).partyId` (loadRoundForMember) before any of these,
// and run canAddComment / canDeleteComment first. A week's comments are one small query (at most
// MAX_COMMENTS_PER_PERSON_PER_WEEK per member), so the app loads them all at once and groups them by song.

import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Comment } from '@dropabop/shared';
import type { DataContext } from './context';
import { queryByPrefix, withoutKeys } from './context';
import { keys, parseRoundId, partitionKeys, prefixes } from './keys';

function weekOf(roundId: string): { partyId: string; weekStart: string } {
  const parts = parseRoundId(roundId);
  if (parts === null) {
    throw new Error('Invalid roundId');
  }
  return parts;
}

export async function putComment(ctx: DataContext, comment: Comment): Promise<void> {
  const { partyId, weekStart } = weekOf(comment.roundId);
  await ctx.db.send(
    new PutCommand({
      TableName: ctx.tableName,
      Item: {
        ...keys.comment(partyId, weekStart, comment.createdAt, comment.commentId),
        entity: 'Comment',
        ...comment,
      },
      ConditionExpression: 'attribute_not_exists(PK)', // ids are random; never overwrite
    }),
  );
}

/** Every comment in a week, oldest first. */
export async function listWeekComments(ctx: DataContext, roundId: string): Promise<Comment[]> {
  const parts = parseRoundId(roundId);
  if (parts === null) {
    return [];
  }
  const items = await queryByPrefix(
    ctx,
    partitionKeys.party(parts.partyId),
    prefixes.weekComments(parts.weekStart),
  );
  return items.map((item) => withoutKeys<Comment>(item));
}

export async function deleteComment(ctx: DataContext, comment: Comment): Promise<void> {
  const { partyId, weekStart } = weekOf(comment.roundId);
  await ctx.db.send(
    new DeleteCommand({
      TableName: ctx.tableName,
      Key: keys.comment(partyId, weekStart, comment.createdAt, comment.commentId),
    }),
  );
}
