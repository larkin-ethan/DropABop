// Which songs can play inside Drop a Bop, and how to hand them to the player (P13.4, ADR-0011).

import { IN_APP_VIDEO_MAX_AGE_DAYS, youtubeVideoId, type MusicProviderId, type Song } from '@dropabop/shared';
import { musicLinks } from '../lib/music-links';
import type { PlayableSong } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True if a song shared on `submittedOn` (YYYY-MM-DD) is recent enough to play in the app: within the last 30 days
 * (cautious reading of YouTube's 30-day rule). `null` means it hasn't been shared yet (the share preview).
 * Display only: it decides whether to show a button, not who may do what.
 */
export function withinInAppPlayWindow(submittedOn: string | null, now: Date): boolean {
  if (submittedOn === null) return true;
  const sharedAt = Date.parse(`${submittedOn}T00:00:00Z`);
  if (Number.isNaN(sharedAt)) return false;
  // The date is the party's local date, read here as UTC midnight. In timezones east of UTC the real share time can
  // be up to ~14 hours earlier than that, so one day of margin keeps us inside 30 days everywhere (ADR-0011).
  return now.getTime() - sharedAt < (IN_APP_VIDEO_MAX_AGE_DAYS - 1) * DAY_MS;
}

/**
 * The song in the player's shape, or null if it can't play here: no YouTube video linked, or shared too long ago.
 * `key` must be unique per shared song (the recommendation id).
 */
export function toPlayableSong(args: {
  key: string;
  song: Song;
  submittedOn: string | null;
  preferred: MusicProviderId | null;
  now: Date;
}): PlayableSong | null {
  const videoId = youtubeVideoId(args.song);
  if (videoId === null || !withinInAppPlayWindow(args.submittedOn, args.now)) return null;
  return {
    key: args.key,
    title: args.song.title,
    artist: args.song.artist,
    artworkUrl: args.song.albumArtUrl,
    provider: 'youtube',
    providerSongId: videoId,
    links: musicLinks(args.song, args.preferred),
  };
}
