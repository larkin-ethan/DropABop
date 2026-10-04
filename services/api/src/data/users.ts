// User profiles (docs/DATABASE.md patterns 1–2). Email is never stored here; it lives in Cognito (D19).

import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { MusicProviderId, User } from '@dropabop/shared';
import type { DataContext } from './context';
import { withoutKeys } from './context';
import { isConditionalCheckFailed } from './errors';
import { keys } from './keys';
import { listUserParties } from './parties';

export async function getUserProfile(ctx: DataContext, userId: string): Promise<User | null> {
  const { Item } = await ctx.db.send(
    new GetCommand({ TableName: ctx.tableName, Key: keys.userProfile(userId) }),
  );
  return Item === undefined ? null : withoutKeys<User>(Item);
}

/**
 * Creates the profile on first sign-in, or returns the existing one. Safe to call on every request:
 * two simultaneous first requests can't create two profiles.
 */
export async function getOrCreateUserProfile(ctx: DataContext, newUser: User): Promise<User> {
  try {
    await ctx.db.send(
      new PutCommand({
        TableName: ctx.tableName,
        Item: { ...keys.userProfile(newUser.userId), entity: 'User', ...newUser },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
    return newUser;
  } catch (error) {
    if (!isConditionalCheckFailed(error)) throw error;
    const existing = await getUserProfile(ctx, newUser.userId);
    if (existing === null) throw error;
    return existing;
  }
}

export interface ProfileChanges {
  displayName?: string;
  avatarColor?: string;
  preferredProvider?: MusicProviderId | null;
}

/**
 * Updates only the fields that changed (so edits from two devices don't undo each other), and returns the
 * updated profile. Display name and avatar color are also copied onto the user's membership in each party (so
 * member lists need one query); that copy is best-effort, because the user may leave a party meanwhile.
 */
export async function updateUserProfile(
  ctx: DataContext,
  userId: string,
  changes: ProfileChanges,
): Promise<User> {
  const fields = Object.entries(changes).filter(([, value]) => value !== undefined);
  if (fields.length === 0) {
    throw new Error('Nothing to update');
  }
  for (const [field] of fields) {
    if (!PROFILE_FIELDS.includes(field as keyof ProfileChanges)) {
      throw new Error(`Unknown profile field: ${field}`);
    }
  }

  let updated: User;
  try {
    const result = await ctx.db.send(
      new UpdateCommand({
        TableName: ctx.tableName,
        Key: keys.userProfile(userId),
        UpdateExpression: `SET ${fields.map(([field]) => `#${field} = :${field}`).join(', ')}`,
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: Object.fromEntries(fields.map(([field]) => [`#${field}`, field])),
        ExpressionAttributeValues: Object.fromEntries(fields.map(([field, value]) => [`:${field}`, value])),
        ReturnValues: 'ALL_NEW',
      }),
    );
    updated = withoutKeys<User>(result.Attributes ?? {});
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      throw new Error('Profile not found', { cause: error });
    }
    throw error;
  }

  if (changes.displayName !== undefined || changes.avatarColor !== undefined) {
    const parties = await listUserParties(ctx, userId);
    const results = await Promise.allSettled(
      parties.map((party) =>
        ctx.db.send(
          new UpdateCommand({
            TableName: ctx.tableName,
            Key: keys.member(party.partyId, userId),
            UpdateExpression: 'SET displayName = :name, avatarColor = :color',
            ConditionExpression: 'attribute_exists(PK)',
            ExpressionAttributeValues: { ':name': updated.displayName, ':color': updated.avatarColor },
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

const PROFILE_FIELDS: (keyof ProfileChanges)[] = ['displayName', 'avatarColor', 'preferredProvider'];
