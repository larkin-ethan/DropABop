// PATCH /parties/{partyId}/settings (docs/API.md → Party settings).

import { updatePartySettingsRequestSchema } from '@dropabop/shared';
import { listMembers, updateParty } from '../data/parties';
import { canManageParty, canSetMaxMembers } from '../domain/party';
import { assertAllowed } from '../http/errors';
import { createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseBody, pathId } from '../http/request';
import { loadPartyForMember } from './parties';

/**
 * Host only (D13): rename the party or change settings (size limit, timezone, pause, visibility).
 * A timezone change applies from next week; the current week keeps its timezone (D1, ADR-0003).
 */
export const updateSettingsFn: HandlerFn = async (event, { data }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  const { name, ...settings } = parseBody(event, updatePartySettingsRequestSchema);

  const { party, membership } = await loadPartyForMember(data, partyId, userId);
  assertAllowed(canManageParty(party, membership));
  if (settings.maxMembers !== undefined) {
    assertAllowed(canSetMaxMembers(settings.maxMembers, party.memberCount)); // the database re-checks this too
  }

  const updated = await updateParty(data, partyId, {
    ...(name === undefined ? {} : { name }),
    ...(Object.keys(settings).length === 0 ? {} : { settings }),
  });
  return ok({ party: updated, members: await listMembers(data, partyId), isHost: true });
};

export const updateSettingsHandler = createHandler(updateSettingsFn);
