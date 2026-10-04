// Whether this week shows who shared each song (D10), and the "Shared by …" line when it does. The switch is fixed
// per week, so it comes from the current week, not the party's latest setting.
// The server only sends `recommendedBy` for open-week songs when the setting is on (or for your own song), so this
// can never reveal more than the API allows; it just displays what arrived.

import type { OpenWeekSongView } from '@dropabop/shared';
import { weekPrivacyOf } from '@dropabop/shared';
import { useCurrentWeek, useMe, useParty } from '../api/hooks';
import { nameLookup } from '../lib/members';

export function useSharerNames(partyId: string | null) {
  const party = useParty(partyId);
  const week = useCurrentWeek(partyId);
  const me = useMe();
  const round = week.data?.round ?? null;
  const reveal = round !== null && weekPrivacyOf(round).revealRecommenderDuringVoting;
  const names = nameLookup(party.data?.members ?? [], me.data?.user.userId);
  return {
    /** D10, for this week: true = names are shown during the week. */
    reveal,
    /** "Shared by Sarah" for someone else's song when the API revealed it; null otherwise. */
    sharedBy: (song: OpenWeekSongView): string | null =>
      song.recommendedBy !== undefined && !song.isMine ? `Shared by ${names.name(song.recommendedBy)}` : null,
  };
}
