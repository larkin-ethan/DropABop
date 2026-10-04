// "Open in …" links for a song (ADR-0007, D22). Every song has an Apple Music link from the iTunes catalog; Spotify and
// YouTube links are the sharer's own pasted links when they gave one, otherwise a plain search on that service.
// The viewer's preferred app comes first.

import { searchLinks, type MusicProviderId, type Song } from '@dropabop/shared';

export interface MusicLink {
  provider: MusicProviderId;
  label: string;
  url: string;
  /** False when it's a search on that service rather than the exact song. */
  exact: boolean;
}

export const PROVIDER_NAMES: Record<MusicProviderId, string> = {
  appleMusic: 'Apple Music',
  spotify: 'Spotify',
  youtube: 'YouTube',
  youtubeMusic: 'YouTube Music',
};

export function musicLinks(song: Song, preferred: MusicProviderId | null): MusicLink[] {
  const exact = (provider: MusicProviderId) =>
    song.providers.find((p) => p.provider === provider)?.externalUrl;
  const links: MusicLink[] = [];

  const apple = exact('appleMusic');
  if (apple !== undefined) {
    links.push({ provider: 'appleMusic', label: PROVIDER_NAMES.appleMusic, url: apple, exact: true });
  }
  const spotify = exact('spotify');
  links.push({
    provider: 'spotify',
    label: PROVIDER_NAMES.spotify,
    url: spotify ?? searchLinks.spotify(song.artist, song.title),
    exact: spotify !== undefined,
  });
  const youtube = exact('youtube') ?? exact('youtubeMusic');
  links.push({
    provider: 'youtube',
    label: PROVIDER_NAMES.youtube,
    url: youtube ?? searchLinks.youtube(song.artist, song.title),
    exact: youtube !== undefined,
  });

  // Preferred app first; YouTube Music counts as YouTube here (same links).
  const wanted = preferred === 'youtubeMusic' ? 'youtube' : preferred;
  return [...links.filter((l) => l.provider === wanted), ...links.filter((l) => l.provider !== wanted)];
}
