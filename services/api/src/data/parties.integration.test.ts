import { afterAll, describe, expect, it } from 'vitest';
import { aMember, aParty, newInviteCode, settle, testContext } from '../../test/fixtures';
import { DomainError } from './errors';
import {
  InviteCodeTakenError,
  createParty,
  getMembership,
  getParty,
  getPartyIdByInviteCode,
  joinParty,
  listMembers,
  listUserParties,
  regenerateInviteCode,
  removeMember,
  updateParty,
} from './parties';

const ctx = testContext();
afterAll(() => ctx.db.destroy());

/** Creates a party with its host and returns both. */
async function setupParty(overrides: Parameters<typeof aParty>[0] = {}) {
  const party = aParty(overrides);
  const host = aMember(party.partyId, { userId: party.hostUserId, role: 'host', displayName: 'Host' });
  await createParty(ctx, party, host);
  return { party, host };
}

function expectDomainError(error: unknown, code: string) {
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

describe('createParty', () => {
  it('stores the party, host membership, "my parties" link, and invite code together', async () => {
    const { party, host } = await setupParty();
    expect(await getParty(ctx, party.partyId)).toEqual(party);
    expect(await getMembership(ctx, party.partyId, host.userId)).toEqual(host);
    expect(await listUserParties(ctx, host.userId)).toEqual([
      { partyId: party.partyId, partyName: party.name, role: 'host', joinedAt: host.joinedAt },
    ]);
    expect(await getPartyIdByInviteCode(ctx, party.inviteCode)).toBe(party.partyId);
  });

  it('fails cleanly when the invite code is taken, creating nothing', async () => {
    const { party: first } = await setupParty();
    const second = aParty({ inviteCode: first.inviteCode });
    const host = aMember(second.partyId, { userId: second.hostUserId, role: 'host' });

    await expect(createParty(ctx, second, host)).rejects.toBeInstanceOf(InviteCodeTakenError);
    expect(await getParty(ctx, second.partyId)).toBeNull();
    expect(await getMembership(ctx, second.partyId, host.userId)).toBeNull();
  });
});

describe('joinParty (spec §8, §26)', () => {
  it('adds the member and increments the count', async () => {
    const { party } = await setupParty();
    const member = aMember(party.partyId);
    await joinParty(ctx, party, party.inviteCode, member);

    expect((await getParty(ctx, party.partyId))?.memberCount).toBe(2);
    expect(await getMembership(ctx, party.partyId, member.userId)).toEqual(member);
    expect((await listMembers(ctx, party.partyId)).map((m) => m.userId).sort()).toEqual(
      [party.hostUserId, member.userId].sort(),
    );
  });

  it('rejects joining twice', async () => {
    const { party } = await setupParty();
    const member = aMember(party.partyId);
    await joinParty(ctx, party, party.inviteCode, member);

    const error = await joinParty(ctx, party, party.inviteCode, member).catch((e: unknown) => e);
    expectDomainError(error, 'ALREADY_MEMBER');
    expect((await getParty(ctx, party.partyId))?.memberCount).toBe(2);
  });

  it('rejects a full party', async () => {
    const { party } = await setupParty({ settings: { ...aParty().settings, maxMembers: 2 } });
    await joinParty(ctx, party, party.inviteCode, aMember(party.partyId));

    const error = await joinParty(ctx, party, party.inviteCode, aMember(party.partyId)).catch(
      (e: unknown) => e,
    );
    expectDomainError(error, 'PARTY_FULL');
  });

  it('rejects a wrong code', async () => {
    const { party } = await setupParty();
    const error = await joinParty(ctx, party, newInviteCode(), aMember(party.partyId)).catch(
      (e: unknown) => e,
    );
    expectDomainError(error, 'INVALID_INVITE');
  });

  it('lets exactly one of three simultaneous joiners take the last spot', async () => {
    const { party } = await setupParty({ settings: { ...aParty().settings, maxMembers: 2 } });
    const joiners = [aMember(party.partyId), aMember(party.partyId), aMember(party.partyId)];

    const { ok, errors } = await settle(joiners.map((m) => joinParty(ctx, party, party.inviteCode, m)));

    expect(ok).toBe(1);
    expect(errors).toHaveLength(2);
    // Losers get the friendly answer, not a generic failure.
    for (const error of errors) expectDomainError(error, 'PARTY_FULL');
    expect((await getParty(ctx, party.partyId))?.memberCount).toBe(2);
    expect(await listMembers(ctx, party.partyId)).toHaveLength(2);
  });
});

describe('joinParty edge cases (review follow-ups)', () => {
  it('a wrong code against a full party says the code is invalid, not that it is full', async () => {
    const { party } = await setupParty({ settings: { ...aParty().settings, maxMembers: 1 } });
    const error = await joinParty(ctx, party, newInviteCode(), aMember(party.partyId)).catch(
      (e: unknown) => e,
    );
    expectDomainError(error, 'INVALID_INVITE');
  });

  it('the same person joining twice at once is added once', async () => {
    const { party } = await setupParty();
    const member = aMember(party.partyId);
    const { ok, errors } = await settle([
      joinParty(ctx, party, party.inviteCode, member),
      joinParty(ctx, party, party.inviteCode, member),
    ]);
    expect(ok).toBe(1);
    expectDomainError(errors[0], 'ALREADY_MEMBER');
    expect((await getParty(ctx, party.partyId))?.memberCount).toBe(2);
  });
});

describe('removeMember', () => {
  it('removes the member and their link, and decrements the count', async () => {
    const { party } = await setupParty();
    const member = aMember(party.partyId);
    await joinParty(ctx, party, party.inviteCode, member);

    await removeMember(ctx, party.partyId, member.userId);

    expect(await getMembership(ctx, party.partyId, member.userId)).toBeNull();
    expect(await listUserParties(ctx, member.userId)).toEqual([]);
    expect((await getParty(ctx, party.partyId))?.memberCount).toBe(1);
  });

  it('removing the same member twice at once only decrements the count once', async () => {
    const { party } = await setupParty();
    const member = aMember(party.partyId);
    await joinParty(ctx, party, party.inviteCode, member);

    const { ok, errors } = await settle([
      removeMember(ctx, party.partyId, member.userId),
      removeMember(ctx, party.partyId, member.userId),
    ]);
    expect(ok).toBe(1);
    expectDomainError(errors[0], 'NOT_FOUND');
    expect((await getParty(ctx, party.partyId))?.memberCount).toBe(1);
  });

  it('refuses to remove the host, even if domain checks were skipped (D17)', async () => {
    const { party, host } = await setupParty();
    const error = await removeMember(ctx, party.partyId, host.userId).catch((e: unknown) => e);
    expectDomainError(error, 'FORBIDDEN');
    expect(await getMembership(ctx, party.partyId, host.userId)).not.toBeNull();
    expect((await getParty(ctx, party.partyId))?.memberCount).toBe(1);
  });

  it('reports not found for someone who isn’t a member, without changing the count', async () => {
    const { party } = await setupParty();
    const error = await removeMember(ctx, party.partyId, aMember(party.partyId).userId).catch(
      (e: unknown) => e,
    );
    expectDomainError(error, 'NOT_FOUND');
    expect((await getParty(ctx, party.partyId))?.memberCount).toBe(1);
  });
});

describe('regenerateInviteCode (D16)', () => {
  it('switches codes atomically; the old code stops working', async () => {
    const { party } = await setupParty();
    const newCode = newInviteCode();

    await regenerateInviteCode(ctx, party.partyId, party.inviteCode, newCode);

    expect(await getPartyIdByInviteCode(ctx, party.inviteCode)).toBeNull();
    expect(await getPartyIdByInviteCode(ctx, newCode)).toBe(party.partyId);
    expect((await getParty(ctx, party.partyId))?.inviteCode).toBe(newCode);

    const error = await joinParty(ctx, party, party.inviteCode, aMember(party.partyId)).catch(
      (e: unknown) => e,
    );
    expectDomainError(error, 'INVALID_INVITE');
  });

  it('a double tap (stale old code) gets a friendly "just changed" error, and only one change happens', async () => {
    const { party } = await setupParty();
    const first = newInviteCode();
    const second = newInviteCode();
    const { ok, errors } = await settle([
      regenerateInviteCode(ctx, party.partyId, party.inviteCode, first),
      regenerateInviteCode(ctx, party.partyId, party.inviteCode, second),
    ]);
    expect(ok).toBe(1);
    expectDomainError(errors[0], 'CONFLICT');

    const current = (await getParty(ctx, party.partyId))?.inviteCode;
    expect([first, second]).toContain(current);
    // Only the winning code works; the loser's code was never stored.
    const loser = current === first ? second : first;
    expect(await getPartyIdByInviteCode(ctx, loser)).toBeNull();
    expect(await getPartyIdByInviteCode(ctx, current as string)).toBe(party.partyId);
  });

  it('refuses a code another party already uses', async () => {
    const { party: a } = await setupParty();
    const { party: b } = await setupParty();
    await expect(regenerateInviteCode(ctx, a.partyId, a.inviteCode, b.inviteCode)).rejects.toBeInstanceOf(
      InviteCodeTakenError,
    );
    expect((await getParty(ctx, a.partyId))?.inviteCode).toBe(a.inviteCode);
  });
});

describe('updateParty', () => {
  it('updates settings without touching the others', async () => {
    const { party } = await setupParty();
    const updated = await updateParty(ctx, party.partyId, {
      settings: { paused: true, timezone: 'Europe/London' },
    });
    expect(updated.settings).toEqual({ ...party.settings, paused: true, timezone: 'Europe/London' });
  });

  it('renames the party everywhere members see it', async () => {
    const { party, host } = await setupParty();
    const member = aMember(party.partyId);
    await joinParty(ctx, party, party.inviteCode, member);

    await updateParty(ctx, party.partyId, { name: 'Renamed' });

    expect((await getParty(ctx, party.partyId))?.name).toBe('Renamed');
    expect((await listUserParties(ctx, host.userId))[0]?.partyName).toBe('Renamed');
    expect((await listUserParties(ctx, member.userId))[0]?.partyName).toBe('Renamed');
  });

  it('rejects a member limit below the current member count', async () => {
    const { party } = await setupParty();
    await joinParty(ctx, party, party.inviteCode, aMember(party.partyId));
    await joinParty(ctx, party, party.inviteCode, aMember(party.partyId));

    const error = await updateParty(ctx, party.partyId, { settings: { maxMembers: 2 } }).catch(
      (e: unknown) => e,
    );
    expectDomainError(error, 'VALIDATION_FAILED');
    expect((await getParty(ctx, party.partyId))?.settings.maxMembers).toBe(20);
  });

  it('refuses unknown setting names', async () => {
    const { party } = await setupParty();
    await expect(
      updateParty(ctx, party.partyId, { settings: { hostUserId: 'x' } as unknown as { paused: boolean } }),
    ).rejects.toThrow('Unknown setting');
  });
});
