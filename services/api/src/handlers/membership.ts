// Invites, joining, leaving, and removing members (docs/API.md → Invites & membership).

import type { InviteCodeResponse, InvitePreviewResponse, PartyResponse } from '@dropabop/shared';
import type { PartyMember } from '@dropabop/shared';
import { inviteCodeSchema, joinPartyRequestSchema } from '@dropabop/shared';
import {
  InviteCodeTakenError,
  getMembership,
  getParty,
  getPartyIdByInviteCode,
  joinParty,
  listMembers,
  regenerateInviteCode,
  removeMember,
} from '../data/parties';
import {
  MAX_INVITE_FAILURES_PER_HOUR,
  countInviteFailures,
  recordInviteFailure,
} from '../data/invite-attempts';
import type { DataContext } from '../data/context';
import { DomainError } from '../data/errors';
import { getOrCreateUserProfile } from '../data/users';
import { MESSAGES } from '../domain/messages';
import { canJoinParty, canManageParty, canRemoveMember, generateInviteCode } from '../domain/party';
import { buildNewUser } from '../domain/profile';
import { assertAllowed, fail } from '../http/errors';
import { createHandler, noContent, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseBody, pathId, pathParam } from '../http/request';
import { assertCanJoinAnotherParty, loadPartyForMember } from './parties';

/**
 * Stops people guessing invite codes (P9.3 security review): after too many wrong codes in an hour, lookups pause.
 * Wrong codes are counted per person; a correct code never counts.
 */
async function guardInviteGuessing<T>(
  data: DataContext,
  userId: string,
  now: Date,
  attempt: () => Promise<T>,
) {
  if ((await countInviteFailures(data, userId, now)) >= MAX_INVITE_FAILURES_PER_HOUR) {
    fail('RATE_LIMITED', MESSAGES.TOO_MANY_INVITE_TRIES);
  }
  try {
    return await attempt();
  } catch (error) {
    if (error instanceof DomainError && error.code === 'INVALID_INVITE') {
      await recordInviteFailure(data, userId, now);
    }
    throw error;
  }
}

/**
 * Preview a party from its invite code, before joining (spec §26). Shows only the party's name and whether there's
 * room; members, songs, and ratings stay private until you join.
 */
export const previewInviteFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  return guardInviteGuessing(data, userId, now(), () => previewInvite(event, data, userId));
};

async function previewInvite(event: Parameters<HandlerFn>[0], data: DataContext, userId: string) {
  const parsed = inviteCodeSchema.safeParse(pathParam(event, 'code'));
  const partyId = parsed.success ? await getPartyIdByInviteCode(data, parsed.data) : null;
  const party = partyId === null ? null : await getParty(data, partyId);
  if (party === null || !parsed.success || party.inviteCode !== parsed.data) {
    fail('INVALID_INVITE', MESSAGES.INVALID_INVITE);
  }
  const alreadyMember = (await getMembership(data, party.partyId, userId)) !== null;
  return ok({
    partyId: party.partyId,
    partyName: party.name,
    memberCount: party.memberCount,
    maxMembers: party.settings.maxMembers,
    isFull: party.memberCount >= party.settings.maxMembers,
    alreadyMember,
  } satisfies InvitePreviewResponse);
}

/** Join a party with its current invite code (spec §8, §26). */
export const joinPartyFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  const { inviteCode } = parseBody(event, joinPartyRequestSchema);
  return guardInviteGuessing(data, userId, now(), () => joinWithCode(data, userId, partyId, inviteCode, now));
};

async function joinWithCode(
  data: DataContext,
  userId: string,
  partyId: string,
  inviteCode: string,
  now: () => Date,
) {
  const [party, existing] = await Promise.all([
    getParty(data, partyId),
    getMembership(data, partyId, userId),
  ]);
  assertAllowed(canJoinParty({ party, providedCode: inviteCode, alreadyMember: existing !== null }));
  if (party === null) {
    fail('INVALID_INVITE', MESSAGES.INVALID_INVITE); // canJoinParty already rejects this; keeps types honest
  }
  await assertCanJoinAnotherParty(data, userId);

  const profile = await getOrCreateUserProfile(data, buildNewUser(userId, now()));
  const member: PartyMember = {
    partyId,
    userId,
    displayName: profile.displayName,
    avatarColor: profile.avatarColor,
    avatarImage: profile.avatarImage ?? null,
    role: 'member',
    joinedAt: now().toISOString(),
  };
  // The database re-checks the code, the size limit, and duplicate membership atomically.
  await joinParty(data, party, inviteCode, member);

  const [updated, members] = await Promise.all([getParty(data, partyId), listMembers(data, partyId)]);
  // Re-read for the new member count; parties are never deleted, but fall back to what we loaded just in case.
  return ok({ party: updated ?? party, members, isHost: false } satisfies PartyResponse);
}

/** Host only: replace the invite code; the old one stops working immediately (D16). */
export const regenerateInviteFn: HandlerFn = async (event, { data }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  const { party, membership } = await loadPartyForMember(data, partyId, userId);
  assertAllowed(canManageParty(party, membership));

  for (let attempt = 1; attempt <= 5; attempt++) {
    const inviteCode = generateInviteCode();
    try {
      await regenerateInviteCode(data, partyId, party.inviteCode, inviteCode);
      return ok({ inviteCode } satisfies InviteCodeResponse);
    } catch (error) {
      if (!(error instanceof InviteCodeTakenError) || attempt === 5) throw error;
    }
  }
  throw new Error('unreachable');
};

/** Leave a party (memberId = yourself) or, as host, remove someone (D13, D17). */
export const removeMemberFn: HandlerFn = async (event, { data }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  const memberId = pathId(event, 'memberId');

  const party = await getParty(data, partyId);
  if (party === null) {
    fail('NOT_FOUND', 'We couldn’t find that party.');
  }
  const [actor, target] = await Promise.all([
    getMembership(data, partyId, userId),
    getMembership(data, partyId, memberId),
  ]);
  assertAllowed(canRemoveMember({ party, actor, target }));
  await removeMember(data, partyId, memberId);
  return noContent();
};

export const previewInviteHandler = createHandler(previewInviteFn);
export const joinPartyHandler = createHandler(joinPartyFn);
export const regenerateInviteHandler = createHandler(regenerateInviteFn);
export const removeMemberHandler = createHandler(removeMemberFn);
