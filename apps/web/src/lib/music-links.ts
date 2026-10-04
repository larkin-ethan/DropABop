// "Open in …" links for a song (ADR-0007, D22). Every song has an Apple Music link from the iTunes catalog; Spotify and
// YouTube Music links are the sharer's own pasted links when they gave one, otherwise a plain search on that service.
// The viewer's preferred app comes first.

import {
  canonicalLinks,
  parseYouTubeUrl,
  searchLinks,
  type MusicProviderId,
  type Song,
} from '@dropabop/shared';

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
  // YouTube Music rather than YouTube (Ethan, 2026-10-04). A pasted YouTube link is the same video id, so it opens
  // straight in YouTube Music.
  const pasted = exact('youtubeMusic') ?? exact('youtube');
  const videoId = pasted === undefined ? null : parseYouTubeUrl(pasted);
  links.push({
    provider: 'youtubeMusic',
    label: PROVIDER_NAMES.youtubeMusic,
    url:
      videoId !== null
        ? canonicalLinks.youtubeMusic(videoId)
        : searchLinks.youtubeMusic(song.artist, song.title),
    exact: videoId !== null,
  });

  // Preferred app first; someone who picked plain YouTube gets YouTube Music (the same music, the app we link to).
  const wanted = preferred === 'youtube' ? 'youtubeMusic' : preferred;
  return [...links.filter((l) => l.provider === wanted), ...links.filter((l) => l.provider !== wanted)];
}
