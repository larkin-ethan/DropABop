// Recognising song links people paste (ADR-0007). Shared so the website can give instant feedback and the API can
// enforce the same rules. Each parser returns the provider's id for the track, or null if the link isn't one we accept.
// Only https links on the providers' official domains are accepted.

function parse(url: string): URL | null {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null;
  }
}

/** https://open.spotify.com/track/<id> (optionally with /intl-xx/ and query params). */
export function parseSpotifyTrackUrl(url: string): string | null {
  const parsed = parse(url);
  if (parsed === null || parsed.hostname !== 'open.spotify.com') return null;
  const match = /^\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})\/?$/.exec(parsed.pathname);
  return match?.[1] ?? null;
}

/** youtube.com/watch?v=, music.youtube.com/watch?v=, youtu.be/<id>. YouTube video ids are 11 characters. */
export function parseYouTubeUrl(url: string): string | null {
  const parsed = parse(url);
  if (parsed === null) return null;
  const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '');
  let id: string | null = null;
  if ((host === 'youtube.com' || host === 'music.youtube.com') && parsed.pathname === '/watch') {
    id = parsed.searchParams.get('v');
  } else if (host === 'youtu.be') {
    id = parsed.pathname.slice(1);
  }
  return id !== null && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/**
 * An Apple Music song link: music.apple.com/<country>/album/<name>/<albumId>?i=<trackId>
 * or music.apple.com/<country>/song/<name>/<trackId>. Returns the track id (what the iTunes API calls trackId).
 */
export function parseAppleMusicSongUrl(url: string): string | null {
  const parsed = parse(url);
  if (parsed === null || parsed.hostname !== 'music.apple.com') return null;
  const songMatch = /^\/[a-z]{2}\/song\/[^/]+\/(\d+)\/?$/.exec(parsed.pathname);
  if (songMatch?.[1] !== undefined) return songMatch[1];
  if (/^\/[a-z]{2}\/album\/[^/]+\/\d+\/?$/.test(parsed.pathname)) {
    const trackId = parsed.searchParams.get('i');
    return trackId !== null && /^\d+$/.test(trackId) ? trackId : null;
  }
  return null;
}

/** Canonical links we store (no tracking parameters). */
export const canonicalLinks = {
  spotify: (id: string) => `https://open.spotify.com/track/${id}`,
  youtube: (id: string) => `https://www.youtube.com/watch?v=${id}`,
  /** The same video id opens in YouTube Music (what the app links to, 2026-10-04). */
  youtubeMusic: (id: string) => `https://music.youtube.com/watch?v=${id}`,
};

/** Plain search links shown when nobody pasted a link for that service (ADR-0007). */
export const searchLinks = {
  spotify: (artist: string, title: string) =>
    `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${title}`)}`,
  youtube: (artist: string, title: string) =>
    `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${title}`)}`,
  youtubeMusic: (artist: string, title: string) =>
    `https://music.youtube.com/search?q=${encodeURIComponent(`${artist} ${title}`)}`,
};
