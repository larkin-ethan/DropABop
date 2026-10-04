// Weekly rounds (docs/DATABASE.md patterns 7–9; ADR-0003).

import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Round, RoundStatus } from '@dropabop/shared';
import type { DataContext } from './context';
import { withoutKeys } from './context';
import { isConditionalCheckFailed } from './errors';
import { keys, parseRoundId, partitionKeys, prefixes } from './keys';

export async function getRound(ctx: DataContext, roundId: string): Promise<Round | null> {
  const parts = parseRoundId(roundId);
  if (parts === null) {
    return null;
  }
  const { Item } = await ctx.db.send(
    new GetCommand({ TableName: ctx.tableName, Key: keys.round(parts.partyId, parts.weekStart) }),
  );
  return Item === undefined ? null : withoutKeys<Round>(Item);
}

/** The party's most recent week (input to planCurrentWeek), or null if it has none yet. */
export async function getLatestRound(ctx: DataContext, partyId: string): Promise<Round | null> {
  const { Items = [] } = await ctx.db.send(
    new QueryCommand({
      TableName: ctx.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': partitionKeys.party(partyId), ':prefix': prefixes.rounds() },
      ScanIndexForward: false, // newest week first
      Limit: 1,
    }),
  );
  const item = Items[0];
  return item === undefined ? null : withoutKeys<Round>(item);
}

/**
 * Stores this week's round if nobody has yet. When two requests race, exactly one write wins; the other gets
 * the stored round back. Either way the caller ends up with the same round.
 */
export async function createRoundIfMissing(ctx: DataContext, round: Round): Promise<Round> {
  try {
    await ctx.db.send(
      new PutCommand({
        TableName: ctx.tableName,
        Item: { ...keys.round(round.partyId, round.weekStart), entity: 'Round', ...round },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    return round;
  } catch (error) {
    if (!isConditionalCheckFailed(error)) throw error;
    const existing = await getRound(ctx, round.roundId);
    if (existing === null) throw error;
    return existing;
  }
}

/**
 * Records that a week has closed (status derived from time; see getPendingStatusChange). Only the first request
 * to do this succeeds; later ones are harmless no-ops.
 */
export async function recordRoundStatus(ctx: DataContext, round: Round, status: RoundStatus): Promise<void> {
  try {
    await ctx.db.send(
      new UpdateCommand({
        TableName: ctx.tableName,
        Key: keys.round(round.partyId, round.weekStart),
        UpdateExpression: 'SET #status = :status',
        ConditionExpression: '#status = :open',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status, ':open': 'OPEN' },
      }),
    );
  } catch (error) {
    if (!isConditionalCheckFailed(error)) throw error;
    // Someone else already recorded it.
  }
}

export interface RoundPage {
  rounds: Round[];
  /** Pass back as `cursor` to get the next page; null when there are no more. */
  nextCursor: string | null;
}

/**
 * Past weeks, newest first, a page at a time. The cursor is just the last week's start date, never a raw
 * database key, so a crafted cursor can't reach outside this party's partition.
 */
export async function listRounds(
  ctx: DataContext,
  partyId: string,
  options: { limit?: number; cursor?: string | null } = {},
): Promise<RoundPage> {
  const pk = partitionKeys.party(partyId);
  const startAfter =
    options.cursor !== undefined && options.cursor !== null ? keys.round(partyId, options.cursor) : undefined;
  const { Items = [], LastEvaluatedKey } = await ctx.db.send(
    new QueryCommand({
      TableName: ctx.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': pk, ':prefix': prefixes.rounds() },
      ScanIndexForward: false,
      Limit: Math.min(Math.max(options.limit ?? 20, 1), 50),
      ExclusiveStartKey: startAfter,
    }),
  );
  const rounds = Items.map((item) => withoutKeys<Round>(item));
  const last = rounds[rounds.length - 1];
  return { rounds, nextCursor: LastEvaluatedKey !== undefined && last !== undefined ? last.weekStart : null };
}

/** Every week the party has had (for stats). Small: one item per week. */
export async function listAllRounds(ctx: DataContext, partyId: string): Promise<Round[]> {
  const rounds: Round[] = [];
  let cursor: string | null = null;
  do {
    const page: RoundPage = await listRounds(ctx, partyId, { limit: 50, cursor });
    rounds.push(...page.rounds);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return rounds;
}
