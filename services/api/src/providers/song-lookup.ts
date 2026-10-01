// How handlers find songs (ADR-0007). Production uses the iTunes Search API (providers/itunes.ts); tests use a fake.
//
// The server always looks songs up itself from the id the client sends, so titles, artwork, and links can't be
// forged by the client (see submitRecommendationRequestSchema).

import type { MusicProviderId, ProviderCapabilities, Song } from '@sotd/shared';
import { DomainError } from '../data/errors';

export interface SongLookup {
  /** Search the catalog. Returns up to 10 songs, best match first. */
  searchSongs(query: string): Promise<Song[]>;
  /** One song's details, or null if the provider has no such song (or isn't supported). */
  getSong(provider: MusicProviderId, providerSongId: string): Promise<Song | null>;
}

/** Spec §10: what each provider can do in v1 (ADR-0007). */
export const PROVIDER_CAPABILITIES: Record<MusicProviderId, ProviderCapabilities> = {
  appleMusic: { canSearch: true, canPlayInApp: false, requiresSubscription: false, canOpenExternal: true },
  spotify: { canSearch: false, canPlayInApp: false, requiresSubscription: false, canOpenExternal: true },
  youtube: { canSearch: false, canPlayInApp: false, requiresSubscription: false, canOpenExternal: true },
  youtubeMusic: { canSearch: false, canPlayInApp: false, requiresSubscription: false, canOpenExternal: true },
};

/** For environments where no catalog is configured. */
export const unavailableSongLookup: SongLookup = {
  searchSongs: () => Promise.reject(unavailable()),
  getSong: () => Promise.reject(unavailable()),
};

function unavailable() {
  return new DomainError(
    'PROVIDER_UNAVAILABLE',
    'Song lookup isn’t available right now. Please try again later.',
  );
}
