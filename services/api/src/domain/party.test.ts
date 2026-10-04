import { describe, expect, it } from 'vitest';
import type { Party, PartyMember } from '@dropabop/shared';
import { INVITE_CODE_ALPHABET, INVITE_CODE_PATTERN, inviteCodeSchema } from '@dropabop/shared';
import {
  canSetSchedule,
  canJoinParty,
  canManageParty,
  canRemoveMember,
  canSetMaxMembers,
  canViewParty,
  generateInviteCode,
  isHost,
  type RandomSource,
} from './party';

const party: Party = {
  partyId: 'p1',
  name: 'Ethan’s Music Party',
  hostUserId: 'ethan',
  inviteCode: 'SONG-7K4P',
  memberCount: 5,
  settings: {
    maxMembers: 20,
    timezone: 'America/Chicago',
    paused: false,
    revealRecommenderDuringVoting: false,
    showWhoRatedWhat: false,
    shareDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    ratingCloseDay: 'SUN',
    ratingCloseTime: '23:59',
  },
  createdAt: '2026-09-01T00:00:00.000Z',
};

function membership(userId: string, role: PartyMember['role'] = 'member'): PartyMember {
  return {
    partyId: 'p1',
    userId,
    displayName: userId,
    avatarColor: '#3B82F6',
    role,
    joinedAt: '2026-09-01T00:00:00.000Z',
  };
}

const host = membership('ethan', 'host');
const sarah = membership('sarah');
const mike = membership('mike');

/** A fake random source that returns the given bytes in order. */
function fixedBytes(bytes: number[]): RandomSource {
  let index = 0;
  return (count) => Uint8Array.from({ length: count }, () => bytes[index++ % bytes.length] ?? 0);
}

describe('generateInviteCode (D16)', () => {
  it('produces codes that match the shared invite pattern and schema', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(INVITE_CODE_PATTERN);
      expect(inviteCodeSchema.parse(code)).toBe(code);
    }
  });

  it('maps random bytes onto the alphabet', () => {
    // 0 → 'A', 1 → 'B', 30 → '9', 31 → 'A' (31 % 31 = 0)
    expect(generateInviteCode(fixedBytes([0, 1, 30, 31]))).toBe('SONG-AB9A');
  });

  it('throws away biased bytes (248–255) instead of skewing the alphabet', () => {
    expect(generateInviteCode(fixedBytes([255, 248, 0, 250, 1, 2, 3]))).toBe('SONG-ABCD');
  });

  it('keeps asking for bytes if a whole batch is unusable', () => {
    const bytes = [...new Array<number>(8).fill(255), 5, 6, 7, 8];
    expect(generateInviteCode(fixedBytes(bytes))).toBe(
      `SONG-${[5, 6, 7, 8].map((b) => INVITE_CODE_ALPHABET[b]).join('')}`,
    );
  });

  it('uses every character of the alphabet over many codes', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      for (const char of generateInviteCode().slice(5)) seen.add(char);
    }
    expect(seen.size).toBe(INVITE_CODE_ALPHABET.length);
  });
});

describe('canJoinParty (spec §26)', () => {
  it('allows a valid code when there’s room', () => {
    expect(canJoinParty({ party, providedCode: 'SONG-7K4P', alreadyMember: false })).toEqual({ ok: true });
  });

  it('rejects a code that matches no party', () => {
    expect(canJoinParty({ party: null, providedCode: 'SONG-ZZZZ', alreadyMember: false })).toMatchObject({
      ok: false,
      code: 'INVALID_INVITE',
    });
  });

  it('rejects an old code after the host regenerated it', () => {
    expect(canJoinParty({ party, providedCode: 'SONG-OLD2', alreadyMember: false })).toMatchObject({
      ok: false,
      code: 'INVALID_INVITE',
    });
  });

  it('rejects someone already in the party', () => {
    expect(canJoinParty({ party, providedCode: 'SONG-7K4P', alreadyMember: true })).toMatchObject({
      ok: false,
      code: 'ALREADY_MEMBER',
    });
  });

  it('rejects joining a full party (spec §8: enforced server-side)', () => {
    const full = { ...party, memberCount: 20 };
    expect(canJoinParty({ party: full, providedCode: 'SONG-7K4P', alreadyMember: false })).toEqual({
      ok: false,
      code: 'PARTY_FULL',
      message: 'This party is full.',
    });
  });

  it('allows the last open spot', () => {
    expect(
      canJoinParty({ party: { ...party, memberCount: 19 }, providedCode: 'SONG-7K4P', alreadyMember: false }),
    ).toEqual({
      ok: true,
    });
  });
});

describe('host and member permissions (D13)', () => {
  it('isHost checks the party record', () => {
    expect(isHost(party, 'ethan')).toBe(true);
    expect(isHost(party, 'sarah')).toBe(false);
  });

  it('any member can view; non-members can’t', () => {
    expect(canViewParty(sarah)).toEqual({ ok: true });
    expect(canViewParty(null)).toMatchObject({ ok: false, code: 'NOT_A_MEMBER' });
  });

  it('only the host can manage the party', () => {
    expect(canManageParty(party, host)).toEqual({ ok: true });
    expect(canManageParty(party, sarah)).toMatchObject({ ok: false, code: 'NOT_HOST' });
    expect(canManageParty(party, null)).toMatchObject({ ok: false, code: 'NOT_A_MEMBER' });
  });

  it('a membership claiming "host" isn’t enough if the party record disagrees', () => {
    expect(canManageParty(party, membership('sarah', 'host'))).toMatchObject({ ok: false, code: 'NOT_HOST' });
  });
});

describe('canRemoveMember (D13, D17)', () => {
  it('a member can leave', () => {
    expect(canRemoveMember({ party, actor: sarah, target: sarah })).toEqual({ ok: true });
  });

  it('the host can remove a member', () => {
    expect(canRemoveMember({ party, actor: host, target: sarah })).toEqual({ ok: true });
  });

  it('a member can’t remove someone else', () => {
    expect(canRemoveMember({ party, actor: mike, target: sarah })).toMatchObject({
      ok: false,
      code: 'NOT_HOST',
    });
  });

  it('the host can’t leave or be removed (no host transfer in v1)', () => {
    expect(canRemoveMember({ party, actor: host, target: host })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(canRemoveMember({ party, actor: sarah, target: host })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('non-members can’t remove anyone; removing a non-member is not found', () => {
    expect(canRemoveMember({ party, actor: null, target: sarah })).toMatchObject({ code: 'NOT_A_MEMBER' });
    expect(canRemoveMember({ party, actor: host, target: null })).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('canSetMaxMembers', () => {
  it('allows a limit at or above the current member count', () => {
    expect(canSetMaxMembers(5, 5)).toEqual({ ok: true });
    expect(canSetMaxMembers(30, 5)).toEqual({ ok: true });
  });

  it('rejects a limit below the current member count with a clear message', () => {
    expect(canSetMaxMembers(4, 5)).toEqual({
      ok: false,
      code: 'VALIDATION_FAILED',
      message: 'This party already has 5 members, so the limit can’t be lower than 5.',
    });
  });
});

describe('canSetSchedule (D1, D2)', () => {
  it('allows ratings to lock at 11:59 pm on the last sharing day, or any time after', () => {
    expect(
      canSetSchedule({ shareDays: ['MON', 'TUE'], ratingCloseDay: 'TUE', ratingCloseTime: '23:59' }),
    ).toEqual({
      ok: true,
    });
    expect(
      canSetSchedule({ shareDays: ['MON', 'TUE'], ratingCloseDay: 'WED', ratingCloseTime: '08:00' }),
    ).toEqual({
      ok: true,
    });
  });

  it('refuses an earlier lock: a day before the last sharing day, or earlier on that day', () => {
    expect(
      canSetSchedule({ shareDays: ['MON', 'TUE'], ratingCloseDay: 'TUE', ratingCloseTime: '00:00' }),
    ).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(
      canSetSchedule({ shareDays: ['MON', 'SAT'], ratingCloseDay: 'FRI', ratingCloseTime: '23:59' }),
    ).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
  });
});
