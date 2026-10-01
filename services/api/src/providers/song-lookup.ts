// How handlers look up a song's details from a music service. The real implementation (search, link resolution,
// provider capabilities) arrives in P6.3; until then production uses `unavailableSongLookup`.
//
// The server always looks songs up itself from the provider id the client sends, so titles, artwork, and links
// can't be forged by the client (see submitRecommendationRequestSchema).

import type { MusicProviderId, Song } from '@sotd/shared';
import { DomainError } from '../data/errors';

export interface SongLookup {
  /** The song's provider-independent details, or null if the provider has no such song. */
  getSong(provider: MusicProviderId, providerSongId: string): Promise<Song | null>;
}

/** Used until P6.3 wires up a real provider. */
export const unavailableSongLookup: SongLookup = {
  getSong: () =>
    Promise.reject(
      new DomainError('PROVIDER_UNAVAILABLE', 'Song lookup isn’t available yet. Please try again later.'),
    ),
};
