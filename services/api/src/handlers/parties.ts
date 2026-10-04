// POST /parties, GET /parties, GET /parties/{partyId} (docs/API.md → Parties).

import type { Party, PartyMember } from '@dropabop/shared';
import { DEFAULT_MAX_PARTY_SIZE, MAX_PARTIES_PER_USER, createPartyRequestSchema } from '@dropabop/shared';
import type { DataContext } from '../data/context';
import {
  InviteCodeTakenError,
  createParty,
  getMembership,
  getParty,
  listMembers,
  listUserParties,
} from '../data/parties';
import { getOrCreateUserProfile } from '../data/users';
import { MESSAGES } from '../domain/messages';
import { canViewParty, generateInviteCode, isHost } from '../domain/party';
import { buildNewUser } from '../domain/profile';
import { assertAllowed, fail } from '../http/errors';
import { created, createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseBody, pathId } from '../http/request';

/** Spec §32: stops one account joining or creating unlimited parties. */
export async function assertCanJoinAnotherParty(data: DataContext, userId: string): Promise<void> {
  const parties = await listUserParties(data, userId);
  if (parties.length >= MAX_PARTIES_PER_USER) {
    fail('VALIDATION_FAILED', MESSAGES.TOO_MANY_PARTIES);
  }
}

/** Loads a party and the caller's membership; non-members get 403, unknown parties 404. */
export async function loadPartyForMember(
  data: DataContext,
  partyId: string,
  userId: string,
): Promise<{ party: Party; membership: PartyMember }> {
  const [party, membership] = await Promise.all([
    getParty(data, partyId),
    getMembership(data, partyId, userId),
  ]);
  if (party === null) {
    fail('NOT_FOUND', 'We couldn’t find that party.');
  }
  assertAllowed(canViewParty(membership));
  return { party, membership: membership as PartyMember };
}

/** Create a party; you become its host (D13). */
export const createPartyHandlerFn: HandlerFn = async (event, { data, now, newId }) => {
  const { userId } = getAuthenticatedUser(event);
  const request = parseBody(event, createPartyRequestSchema);
  await assertCanJoinAnotherParty(data, userId);

  const createdAt = now().toISOString();
  const profile = await getOrCreateUserProfile(data, buildNewUser(userId, now()));
  const partyId = newId();
  const host: PartyMember = {
    partyId,
    userId,
    displayName: profile.displayName,
    avatarColor: profile.avatarColor,
    role: 'host',
    joinedAt: createdAt,
  };

  // Invite codes are random; on the rare clash with an existing code, try a new one.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const party: Party = {
      partyId,
      name: request.name,
      hostUserId: userId,
      inviteCode: generateInviteCode(),
      memberCount: 1,
      settings: {
        maxMembers: request.maxMembers ?? DEFAULT_MAX_PARTY_SIZE,
        timezone: request.timezone,
        paused: false,
        revealRecommenderDuringVoting: false,
        showWhoRatedWhat: false,
      },
      createdAt,
    };
    try {
      await createParty(data, party, host);
      return created({ party, members: [host], isHost: true });
    } catch (error) {
      if (!(error instanceof InviteCodeTakenError) || attempt === 5) throw error;
    }
  }
  throw new Error('unreachable');
};

/** The parties you're in. */
export const listPartiesHandlerFn: HandlerFn = async (event, { data }) => {
  const { userId } = getAuthenticatedUser(event);
  return ok({ parties: await listUserParties(data, userId) });
};

/** One party with its members. Members only (spec §24). */
export const getPartyHandlerFn: HandlerFn = async (event, { data }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  const { party } = await loadPartyForMember(data, partyId, userId);
  const members = await listMembers(data, partyId);
  return ok({ party, members, isHost: isHost(party, userId) });
};

export const createPartyHandler = createHandler(createPartyHandlerFn);
export const listPartiesHandler = createHandler(listPartiesHandlerFn);
export const getPartyHandler = createHandler(getPartyHandlerFn);
