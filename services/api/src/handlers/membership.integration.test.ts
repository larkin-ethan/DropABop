import type { Party } from '@dropabop/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { runHandler } from '../http/handler';
import { joinPartyFn, previewInviteFn, regenerateInviteFn, removeMemberFn } from './membership';
import { createPartyHandlerFn, getPartyHandlerFn } from './parties';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

async function newParty(hostId = newId(), maxMembers = 20): Promise<Party> {
  const result = await runHandler(
    createPartyHandlerFn,
    apiEvent({ userId: hostId, body: { name: 'Party', timezone: 'America/Chicago', maxMembers } }),
    deps,
  );
  return (bodyOf(result) as { party: Party }).party;
}

const join = (userId: string, party: Party, inviteCode = party.inviteCode) =>
  runHandler(
    joinPartyFn,
    apiEvent({ userId, pathParameters: { partyId: party.partyId }, body: { inviteCode } }),
    deps,
  );

const remove = (userId: string, party: Party, memberId: string) =>
  runHandler(
    removeMemberFn,
    apiEvent({ userId, pathParameters: { partyId: party.partyId, memberId } }),
    deps,
  );

const errorCode = (result: { body?: string }) => (bodyOf(result) as { error: { code: string } }).error.code;

describe('GET /invites/{code}', () => {
  it('previews a party without revealing members', async () => {
    const party = await newParty();
    const result = await runHandler(
      previewInviteFn,
      apiEvent({ userId: newId(), pathParameters: { code: party.inviteCode.toLowerCase() } }),
      deps,
    );
    expect(result.statusCode).toBe(200);
    expect(bodyOf(result)).toEqual({
      partyId: party.partyId,
      partyName: 'Party',
      memberCount: 1,
      maxMembers: 20,
      isFull: false,
      alreadyMember: false,
    });
  });

  it('rejects unknown and malformed codes the same way', async () => {
    for (const code of ['SONG-ZZZZ', 'not-a-code', 'SONG-0000']) {
      const result = await runHandler(
        previewInviteFn,
        apiEvent({ userId: newId(), pathParameters: { code } }),
        deps,
      );
      expect(result.statusCode).toBe(400);
      expect(errorCode(result)).toBe('INVALID_INVITE');
    }
  });
});

describe('POST /parties/{partyId}/join', () => {
  it('joins with a valid code and returns the party', async () => {
    const party = await newParty();
    const userId = newId();
    const result = await join(userId, party);
    expect(result.statusCode).toBe(200);
    const body = bodyOf(result) as { party: Party; members: { userId: string }[] };
    expect(body.party.memberCount).toBe(2);
    expect(body.members.map((m) => m.userId)).toContain(userId);
  });

  it('rejects a wrong code, a second join, and a full party', async () => {
    const party = await newParty(newId(), 2);
    const first = newId();
    expect(errorCode(await join(first, party, 'SONG-ZZZZ'))).toBe('INVALID_INVITE');
    expect((await join(first, party)).statusCode).toBe(200);
    expect(errorCode(await join(first, party))).toBe('ALREADY_MEMBER');
    expect(errorCode(await join(newId(), party))).toBe('PARTY_FULL');
  });

  it('rejects a code that belongs to a different party', async () => {
    const a = await newParty();
    const b = await newParty();
    expect(errorCode(await join(newId(), a, b.inviteCode))).toBe('INVALID_INVITE');
  });
});

describe('guessing invite codes (P9.3)', () => {
  const preview = (userId: string, code: string) =>
    runHandler(previewInviteFn, apiEvent({ userId, pathParameters: { code } }), deps);

  it('pauses lookups and joins for someone who tries too many wrong codes, but not for others', async () => {
    const party = await newParty();
    const guesser = newId();
    for (let i = 0; i < 10; i++) {
      expect(errorCode(await preview(guesser, 'SONG-ZZZZ'))).toBe('INVALID_INVITE');
    }
    // Even the right code is refused now, so guessing can't continue...
    const blocked = await preview(guesser, party.inviteCode);
    expect(blocked.statusCode).toBe(429);
    expect(errorCode(blocked)).toBe('RATE_LIMITED');
    expect((await join(guesser, party)).statusCode).toBe(429);
    // ...while everyone else is unaffected, and correct codes never count against anyone.
    const friend = newId();
    for (let i = 0; i < 12; i++) {
      expect((await preview(friend, party.inviteCode)).statusCode).toBe(200);
    }
    expect((await join(friend, party)).statusCode).toBe(200);
  });

  it('counts a wrong code sent straight to join, too', async () => {
    const party = await newParty();
    const guesser = newId();
    for (let i = 0; i < 10; i++) {
      expect(errorCode(await join(guesser, party, 'SONG-ZZZZ'))).toBe('INVALID_INVITE');
    }
    expect((await join(guesser, party)).statusCode).toBe(429);
  });
});

describe('POST /parties/{partyId}/invite-code', () => {
  it('lets the host replace the code; the old one stops working', async () => {
    const hostId = newId();
    const party = await newParty(hostId);
    const result = await runHandler(
      regenerateInviteFn,
      apiEvent({ userId: hostId, pathParameters: { partyId: party.partyId } }),
      deps,
    );
    expect(result.statusCode).toBe(200);
    const { inviteCode } = bodyOf(result) as { inviteCode: string };
    expect(inviteCode).not.toBe(party.inviteCode);
    expect(errorCode(await join(newId(), party))).toBe('INVALID_INVITE');
    expect((await join(newId(), party, inviteCode)).statusCode).toBe(200);
  });

  it('refuses members who aren’t the host', async () => {
    const party = await newParty();
    const member = newId();
    await join(member, party);
    const result = await runHandler(
      regenerateInviteFn,
      apiEvent({ userId: member, pathParameters: { partyId: party.partyId } }),
      deps,
    );
    expect(result.statusCode).toBe(403);
    expect(errorCode(result)).toBe('NOT_HOST');
  });
});

describe('DELETE /parties/{partyId}/members/{memberId}', () => {
  it('lets a member leave; they lose access', async () => {
    const party = await newParty();
    const member = newId();
    await join(member, party);
    expect((await remove(member, party, member)).statusCode).toBe(204);

    const after = await runHandler(
      getPartyHandlerFn,
      apiEvent({ userId: member, pathParameters: { partyId: party.partyId } }),
      deps,
    );
    expect(after.statusCode).toBe(403);
  });

  it('lets the host remove a member, but not members remove each other or the host', async () => {
    const hostId = newId();
    const party = await newParty(hostId);
    const a = newId();
    const b = newId();
    await join(a, party);
    await join(b, party);

    expect(errorCode(await remove(a, party, b))).toBe('NOT_HOST');
    expect(errorCode(await remove(a, party, hostId))).toBe('FORBIDDEN');
    expect(errorCode(await remove(hostId, party, hostId))).toBe('FORBIDDEN');
    expect((await remove(hostId, party, b)).statusCode).toBe(204);
  });

  it('outsiders can’t remove anyone', async () => {
    const hostId = newId();
    const party = await newParty(hostId);
    expect(errorCode(await remove(newId(), party, hostId))).toBe('NOT_A_MEMBER');
  });
});
