// Whether this party shows who shared each song during the week (D10), and the "Shared by …" line when it does.
// The server only sends `recommendedBy` for open-week songs when the setting is on (or for your own song), so this
// can never reveal more than the API allows; it just displays what arrived.

import type { OpenWeekSongView } from '@dropabop/shared';
import { useMe, useParty } from '../api/hooks';
import { nameLookup } from '../lib/members';

export function useSharerNames(partyId: string | null) {
  const party = useParty(partyId);
  const me = useMe();
  const reveal = party.data?.party.settings.revealRecommenderDuringVoting ?? false;
  const names = nameLookup(party.data?.members ?? [], me.data?.user.userId);
  return {
    /** D10 setting: true = names are shown during the week. */
    reveal,
    /** "Shared by Sarah" for someone else's song when the API revealed it; null otherwise. */
    sharedBy: (song: OpenWeekSongView): string | null =>
      song.recommendedBy !== undefined && !song.isMine ? `Shared by ${names.name(song.recommendedBy)}` : null,
  };
}
