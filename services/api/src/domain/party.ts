// Invite codes, joining, and who may manage a party (spec §8, §24, §26; decisions D13–D17).

import { randomBytes } from 'node:crypto';
import type { Party, PartyMember } from '@sotd/shared';
import { INVITE_CODE_ALPHABET } from '@sotd/shared';
import { MESSAGES, deny, type RuleResult } from './messages';

/** Returns `count` cryptographically secure random bytes. Swappable in tests. */
export type RandomSource = (count: number) => Uint8Array;

const secureRandom: RandomSource = (count) => randomBytes(count);

/**
 * A new invite code like SONG-7K4P (D16).
 *
 * Uses a secure random source so codes can't be predicted. Bytes that would make some characters more
 * likely than others are thrown away (256 isn't a multiple of 31), so every character is equally likely.
 * Uniqueness is enforced when the code is stored (conditional write); on the rare clash, generate again.
 */
export function generateInviteCode(random: RandomSource = secureRandom): string {
  const alphabetSize = INVITE_CODE_ALPHABET.length;
  const usableLimit = 256 - (256 % alphabetSize); // 248 for 31 characters
  let code = '';
  while (code.length < 4) {
    for (const byte of random(8)) {
      if (byte < usableLimit && code.length < 4) {
        code += INVITE_CODE_ALPHABET[byte % alphabetSize];
      }
    }
  }
  return `SONG-${code}`;
}

export interface JoinPartyContext {
  /** The party the code belongs to, or null if no party has that code. */
  party: Party | null;
  /** The (normalized) code the person entered. */
  providedCode: string;
  /** Whether the requester is already a member. */
  alreadyMember: boolean;
}

/** Spec §26: code exists, code is active, party has room, user isn't already a member. */
export function canJoinParty(ctx: JoinPartyContext): RuleResult {
  // A regenerated code stops working immediately (D16): it must match the party's current code.
  if (ctx.party === null || ctx.party.inviteCode !== ctx.providedCode) {
    return deny('INVALID_INVITE', MESSAGES.INVALID_INVITE);
  }
  if (ctx.alreadyMember) {
    return deny('ALREADY_MEMBER', MESSAGES.ALREADY_MEMBER);
  }
  if (ctx.party.memberCount >= ctx.party.settings.maxMembers) {
    return deny('PARTY_FULL', MESSAGES.PARTY_FULL);
  }
  return { ok: true };
}

export function isHost(party: Pick<Party, 'hostUserId'>, userId: string): boolean {
  return party.hostUserId === userId;
}

/** Any member may view the party. */
export function canViewParty(membership: PartyMember | null): RuleResult {
  return membership === null ? deny('NOT_A_MEMBER', MESSAGES.NOT_A_MEMBER) : { ok: true };
}

/**
 * Host-only actions: change settings, pause/resume, regenerate the invite code, remove members (D13).
 * Checks the party record (the source of truth for who the host is) as well as the membership role.
 */
export function canManageParty(party: Pick<Party, 'hostUserId'>, membership: PartyMember | null): RuleResult {
  if (membership === null) {
    return deny('NOT_A_MEMBER', MESSAGES.NOT_A_MEMBER);
  }
  if (membership.role !== 'host' || !isHost(party, membership.userId)) {
    return deny('NOT_HOST', MESSAGES.NOT_HOST);
  }
  return { ok: true };
}

export interface RemoveMemberContext {
  party: Pick<Party, 'hostUserId'>;
  /** The person making the request. */
  actor: PartyMember | null;
  /** The member being removed, or null if they aren't in the party. */
  target: PartyMember | null;
}

/**
 * Members may leave (remove themselves); the host may remove anyone else (D13, D17).
 * The host can't leave or be removed, because host transfer isn't in v1 and a party needs a host.
 */
export function canRemoveMember(ctx: RemoveMemberContext): RuleResult {
  if (ctx.actor === null) {
    return deny('NOT_A_MEMBER', MESSAGES.NOT_A_MEMBER);
  }
  if (ctx.target === null) {
    return deny('NOT_FOUND', MESSAGES.MEMBER_NOT_FOUND);
  }
  if (isHost(ctx.party, ctx.target.userId)) {
    return deny('FORBIDDEN', MESSAGES.HOST_CANNOT_LEAVE);
  }
  const leavingThemselves = ctx.actor.userId === ctx.target.userId;
  if (!leavingThemselves && !isHost(ctx.party, ctx.actor.userId)) {
    return deny('NOT_HOST', MESSAGES.NOT_HOST);
  }
  return { ok: true };
}

/** A new member limit can't be lower than the number of people already in the party. */
export function canSetMaxMembers(newMax: number, currentMemberCount: number): RuleResult {
  if (newMax < currentMemberCount) {
    return deny('VALIDATION_FAILED', MESSAGES.maxBelowMembers(currentMemberCount));
  }
  return { ok: true };
}
