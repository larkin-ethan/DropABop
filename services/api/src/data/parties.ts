// Parties, members, and invite codes (docs/DATABASE.md patterns 2–6 and the write table).

import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { MemberRole, Party, PartyMember, PartySettings } from '@sotd/shared';
import { MESSAGES } from '../domain/messages';
import type { DataContext } from './context';
import { queryByPrefix, transactWrite, withoutKeys } from './context';
import { DomainError, failedTransactionItems, isConditionalCheckFailed } from './errors';
import { keys, partitionKeys, prefixes } from './keys';

/** The "my parties" link stored under the user. */
export interface UserPartyLink {
  partyId: string;
  partyName: string;
  role: MemberRole;
  joinedAt: string;
}

/** Thrown when a newly generated invite code already exists. The caller generates another and retries. */
export class InviteCodeTakenError extends Error {
  constructor() {
    super('Invite code already in use');
    this.name = 'InviteCodeTakenError';
  }
}

export async function getParty(ctx: DataContext, partyId: string): Promise<Party | null> {
  const { Item } = await ctx.db.send(
    new GetCommand({ TableName: ctx.tableName, Key: keys.partyMeta(partyId) }),
  );
  return Item === undefined ? null : withoutKeys<Party>(Item);
}

export async function getMembership(
  ctx: DataContext,
  partyId: string,
  userId: string,
): Promise<PartyMember | null> {
  const { Item } = await ctx.db.send(
    new GetCommand({ TableName: ctx.tableName, Key: keys.member(partyId, userId) }),
  );
  return Item === undefined ? null : withoutKeys<PartyMember>(Item);
}

export async function listMembers(ctx: DataContext, partyId: string): Promise<PartyMember[]> {
  const items = await queryByPrefix(ctx, partitionKeys.party(partyId), prefixes.members());
  return items.map((item) => withoutKeys<PartyMember>(item));
}

export async function listUserParties(ctx: DataContext, userId: string): Promise<UserPartyLink[]> {
  const items = await queryByPrefix(ctx, partitionKeys.user(userId), prefixes.userParties());
  return items.map((item) => withoutKeys<UserPartyLink>(item));
}

export async function getPartyIdByInviteCode(ctx: DataContext, code: string): Promise<string | null> {
  const { Item } = await ctx.db.send(new GetCommand({ TableName: ctx.tableName, Key: keys.invite(code) }));
  return typeof Item?.partyId === 'string' ? Item.partyId : null;
}

function memberItems(ctx: DataContext, party: Pick<Party, 'partyId' | 'name'>, member: PartyMember) {
  const link: UserPartyLink = {
    partyId: party.partyId,
    partyName: party.name,
    role: member.role,
    joinedAt: member.joinedAt,
  };
  return [
    {
      Put: {
        TableName: ctx.tableName,
        Item: { ...keys.member(party.partyId, member.userId), entity: 'PartyMember', ...member },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    {
      Put: {
        TableName: ctx.tableName,
        Item: { ...keys.userParty(member.userId, party.partyId), entity: 'UserPartyLink', ...link },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
  ];
}

/** Creates the party, its host membership, and its invite code, all or nothing. */
export async function createParty(ctx: DataContext, party: Party, host: PartyMember): Promise<void> {
  try {
    await transactWrite(ctx, {
      TransactItems: [
        {
          Put: {
            TableName: ctx.tableName,
            Item: { ...keys.partyMeta(party.partyId), entity: 'Party', ...party },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        ...memberItems(ctx, party, host),
        {
          Put: {
            TableName: ctx.tableName,
            Item: { ...keys.invite(party.inviteCode), entity: 'Invitation', partyId: party.partyId },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
      ],
    });
  } catch (error) {
    if (failedTransactionItems(error)?.includes(3)) {
      throw new InviteCodeTakenError();
    }
    throw error;
  }
}

/**
 * Adds a member if the code is the party's current one and there's room (spec §8, §26). The size limit is
 * enforced by the database condition, so simultaneous joins can't overfill the party.
 */
export async function joinParty(
  ctx: DataContext,
  party: Pick<Party, 'partyId' | 'name'>,
  inviteCode: string,
  member: PartyMember,
): Promise<void> {
  try {
    await transactWrite(ctx, {
      TransactItems: [
        {
          Update: {
            TableName: ctx.tableName,
            Key: keys.partyMeta(party.partyId),
            UpdateExpression: 'ADD memberCount :one',
            ConditionExpression:
              'attribute_exists(PK) AND inviteCode = :code AND memberCount < settings.maxMembers',
            ExpressionAttributeValues: { ':one': 1, ':code': inviteCode },
          },
        },
        ...memberItems(ctx, party, member),
      ],
    });
  } catch (error) {
    const failed = failedTransactionItems(error);
    if (failed === null) throw error;
    if (failed.includes(1) || failed.includes(2)) {
      throw new DomainError('ALREADY_MEMBER', MESSAGES.ALREADY_MEMBER);
    }
    if (failed.includes(0)) {
      // Work out which part of the condition failed, so the message is accurate.
      const current = await getParty(ctx, party.partyId);
      if (current !== null && current.inviteCode === inviteCode) {
        throw new DomainError('PARTY_FULL', MESSAGES.PARTY_FULL);
      }
      throw new DomainError('INVALID_INVITE', MESSAGES.INVALID_INVITE);
    }
    throw error;
  }
}

/** Removes a member (leaving or removed by the host). Their past songs and ratings stay (D17). */
export async function removeMember(ctx: DataContext, partyId: string, userId: string): Promise<void> {
  try {
    await transactWrite(ctx, {
      TransactItems: [
        {
          Delete: {
            TableName: ctx.tableName,
            Key: keys.member(partyId, userId),
            // The host can't be removed (D17); checked in domain code and enforced here too.
            ConditionExpression: 'attribute_exists(PK) AND #role <> :host',
            ExpressionAttributeNames: { '#role': 'role' },
            ExpressionAttributeValues: { ':host': 'host' },
          },
        },
        { Delete: { TableName: ctx.tableName, Key: keys.userParty(userId, partyId) } },
        {
          Update: {
            TableName: ctx.tableName,
            Key: keys.partyMeta(partyId),
            UpdateExpression: 'ADD memberCount :minusOne',
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeValues: { ':minusOne': -1 },
          },
        },
      ],
    });
  } catch (error) {
    if (failedTransactionItems(error)?.includes(0)) {
      const member = await getMembership(ctx, partyId, userId);
      if (member?.role === 'host') {
        throw new DomainError('FORBIDDEN', MESSAGES.HOST_CANNOT_LEAVE);
      }
      throw new DomainError('NOT_FOUND', MESSAGES.MEMBER_NOT_FOUND);
    }
    throw error;
  }
}

/** Replaces the invite code. The old code stops working in the same instant (D16). */
export async function regenerateInviteCode(
  ctx: DataContext,
  partyId: string,
  oldCode: string,
  newCode: string,
): Promise<void> {
  try {
    await transactWrite(ctx, {
      TransactItems: [
        {
          Put: {
            TableName: ctx.tableName,
            Item: { ...keys.invite(newCode), entity: 'Invitation', partyId },
            ConditionExpression: 'attribute_not_exists(PK)',
          },
        },
        { Delete: { TableName: ctx.tableName, Key: keys.invite(oldCode) } },
        {
          Update: {
            TableName: ctx.tableName,
            Key: keys.partyMeta(partyId),
            UpdateExpression: 'SET inviteCode = :new',
            ConditionExpression: 'inviteCode = :old',
            ExpressionAttributeValues: { ':new': newCode, ':old': oldCode },
          },
        },
      ],
    });
  } catch (error) {
    const failed = failedTransactionItems(error);
    if (failed?.includes(0)) {
      throw new InviteCodeTakenError();
    }
    if (failed?.includes(2)) {
      // The code was already changed by another request (e.g. a double tap); nothing to undo.
      throw new DomainError('CONFLICT', MESSAGES.INVITE_JUST_CHANGED);
    }
    throw error;
  }
}

const SETTINGS_FIELDS: (keyof PartySettings)[] = [
  'maxMembers',
  'timezone',
  'paused',
  'revealRecommenderDuringVoting',
  'showWhoRatedWhat',
];

export interface PartyChanges {
  name?: string;
  settings?: Partial<PartySettings>;
}

/**
 * Updates the party name and/or settings (host-only; checked by the caller). A new member limit below the
 * current member count is rejected by the database too.
 */
export async function updateParty(ctx: DataContext, partyId: string, changes: PartyChanges): Promise<Party> {
  const sets: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  if (changes.name !== undefined) {
    sets.push('#name = :name');
    names['#name'] = 'name';
    values[':name'] = changes.name;
  }
  for (const [field, value] of Object.entries(changes.settings ?? {})) {
    if (!SETTINGS_FIELDS.includes(field as keyof PartySettings)) {
      throw new Error(`Unknown setting: ${field}`);
    }
    sets.push(`settings.#${field} = :${field}`);
    names[`#${field}`] = field;
    values[`:${field}`] = value;
  }
  if (sets.length === 0) {
    throw new Error('Nothing to update');
  }

  let condition = 'attribute_exists(PK)';
  if (changes.settings?.maxMembers !== undefined) {
    condition += ' AND memberCount <= :maxMembers';
  }

  let updated: Party;
  try {
    const result = await ctx.db.send(
      new UpdateCommand({
        TableName: ctx.tableName,
        Key: keys.partyMeta(partyId),
        UpdateExpression: `SET ${sets.join(', ')}`,
        ConditionExpression: condition,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: 'ALL_NEW',
      }),
    );
    updated = withoutKeys<Party>(result.Attributes ?? {});
  } catch (error) {
    if (isConditionalCheckFailed(error) && changes.settings?.maxMembers !== undefined) {
      const current = await getParty(ctx, partyId);
      if (current !== null) {
        throw new DomainError('VALIDATION_FAILED', MESSAGES.maxBelowMembers(current.memberCount));
      }
    }
    throw error;
  }

  // Keep the party name shown in each member's "my parties" list in sync. This copy is best-effort (eventually
  // consistent): the rename itself has already succeeded, and a member who leaves meanwhile has no link to update.
  if (changes.name !== undefined) {
    const members = await listMembers(ctx, partyId);
    const results = await Promise.allSettled(
      members.map((member) =>
        ctx.db.send(
          new UpdateCommand({
            TableName: ctx.tableName,
            Key: keys.userParty(member.userId, partyId),
            UpdateExpression: 'SET partyName = :name',
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeValues: { ':name': changes.name },
          }),
        ),
      ),
    );
    const unexpected = results.find((r) => r.status === 'rejected' && !isConditionalCheckFailed(r.reason));
    if (unexpected?.status === 'rejected') {
      throw unexpected.reason;
    }
  }
  return updated;
}
