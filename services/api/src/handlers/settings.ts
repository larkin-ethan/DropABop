// PATCH /parties/{partyId}/settings (docs/API.md → Party settings).

import type { PartyResponse } from '@dropabop/shared';
import { sortWeekdays, updatePartySettingsRequestSchema } from '@dropabop/shared';
import { listMembers, updateParty } from '../data/parties';
import { canManageParty, canSetMaxMembers, canSetSchedule } from '../domain/party';
import { assertAllowed } from '../http/errors';
import { createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseBody, pathId } from '../http/request';
import { loadPartyForMember } from './parties';

/**
 * Host only (D13): rename the party or change settings (size limit, timezone, pause, visibility).
 * Timezone and schedule changes (sharing days, rating lock) apply from next week; the current week keeps the
 * rules it started with (D1, D2, ADR-0003).
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
  if (settings.shareDays !== undefined) {
    settings.shareDays = sortWeekdays(settings.shareDays); // stored in week order
  }
  if (
    settings.shareDays !== undefined ||
    settings.ratingCloseDay !== undefined ||
    settings.ratingCloseTime !== undefined
  ) {
    const schedule = {
      shareDays: settings.shareDays ?? party.settings.shareDays,
      ratingCloseDay: settings.ratingCloseDay ?? party.settings.ratingCloseDay,
      ratingCloseTime: settings.ratingCloseTime ?? party.settings.ratingCloseTime,
    };
    assertAllowed(canSetSchedule(schedule));
    // Write all three together, so two quick changes (say, days from one tab and the lock day from another) can't
    // combine into a schedule that was never checked: the last write stores a whole, valid schedule.
    Object.assign(settings, schedule);
  }

  const updated = await updateParty(data, partyId, {
    ...(name === undefined ? {} : { name }),
    ...(Object.keys(settings).length === 0 ? {} : { settings }),
  });
  return ok({
    party: updated,
    members: await listMembers(data, partyId),
    isHost: true,
  } satisfies PartyResponse);
};

export const updateSettingsHandler = createHandler(updateSettingsFn);
