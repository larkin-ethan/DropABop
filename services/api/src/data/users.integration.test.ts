import { afterAll, describe, expect, it } from 'vitest';
import { aMember, aParty, aUser, testContext } from '../../test/fixtures';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { keys } from './keys';
import { createParty, getMembership, joinParty } from './parties';
import { getOrCreateUserProfile, getUserProfile, updateUserProfile } from './users';

const ctx = testContext();
afterAll(() => ctx.db.destroy());

describe('user profiles', () => {
  it('creates a profile on first call and returns the stored one afterwards', async () => {
    const user = aUser({ displayName: 'Original' });
    expect(await getOrCreateUserProfile(ctx, user)).toEqual(user);
    const again = await getOrCreateUserProfile(ctx, { ...user, displayName: 'Should not overwrite' });
    expect(again.displayName).toBe('Original');
  });

  it('creates only one profile when first requests race', async () => {
    const user = aUser();
    const results = await Promise.all(
      [1, 2, 3].map((n) => getOrCreateUserProfile(ctx, { ...user, displayName: `N${n}` })),
    );
    const stored = await getUserProfile(ctx, user.userId);
    expect(results.every((r) => r.displayName === stored?.displayName)).toBe(true);
  });

  it('returns null for an unknown user', async () => {
    expect(await getUserProfile(ctx, aUser().userId)).toBeNull();
  });

  it('updates the profile and the copies shown in each party’s member list', async () => {
    const user = aUser({ displayName: 'Old Name' });
    await getOrCreateUserProfile(ctx, user);
    const party = aParty({ hostUserId: user.userId });
    await createParty(
      ctx,
      party,
      aMember(party.partyId, { userId: user.userId, role: 'host', displayName: 'Old Name' }),
    );

    const updated = await updateUserProfile(ctx, user.userId, {
      displayName: 'New Name',
      avatarColor: '#8B5CF6',
      preferredProvider: 'appleMusic',
    });

    expect(updated).toMatchObject({
      displayName: 'New Name',
      avatarColor: '#8B5CF6',
      preferredProvider: 'appleMusic',
    });
    expect(await getUserProfile(ctx, user.userId)).toEqual(updated);
    expect(await getMembership(ctx, party.partyId, user.userId)).toMatchObject({
      displayName: 'New Name',
      avatarColor: '#8B5CF6',
    });
  });

  it('changes only the given fields, so two devices editing different fields don’t undo each other', async () => {
    const user = aUser({ displayName: 'Same', preferredProvider: null, avatarColor: '#3B82F6' });
    await getOrCreateUserProfile(ctx, user);

    await Promise.all([
      updateUserProfile(ctx, user.userId, { preferredProvider: 'youtube' }),
      updateUserProfile(ctx, user.userId, { avatarColor: '#14B8A6' }),
    ]);

    expect(await getUserProfile(ctx, user.userId)).toMatchObject({
      displayName: 'Same',
      preferredProvider: 'youtube',
      avatarColor: '#14B8A6',
    });
  });

  it('still succeeds if the user left a party meanwhile (member copy is best-effort)', async () => {
    const user = aUser();
    await getOrCreateUserProfile(ctx, user);
    const party = aParty();
    await createParty(ctx, party, aMember(party.partyId, { userId: party.hostUserId, role: 'host' }));
    await joinParty(ctx, party, party.inviteCode, aMember(party.partyId, { userId: user.userId }));
    // Simulate leaving between listing parties and updating the copy: remove only the membership item.
    await ctx.db.send(
      new DeleteCommand({ TableName: ctx.tableName, Key: keys.member(party.partyId, user.userId) }),
    );

    await expect(updateUserProfile(ctx, user.userId, { displayName: 'Renamed' })).resolves.toMatchObject({
      displayName: 'Renamed',
    });
  });

  it('ignores fields explicitly set to undefined, and rejects an empty update', async () => {
    const user = aUser({ displayName: 'Keep' });
    await getOrCreateUserProfile(ctx, user);
    await updateUserProfile(ctx, user.userId, { displayName: undefined, avatarColor: '#8B5CF6' });
    expect((await getUserProfile(ctx, user.userId))?.displayName).toBe('Keep');
    await expect(updateUserProfile(ctx, user.userId, {})).rejects.toThrow('Nothing to update');
  });
});
