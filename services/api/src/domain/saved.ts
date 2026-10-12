// Saved songs (D34): one private list per person, across all their parties. Rules only, no I/O.
//
// - The list keeps its own copy of each song, so it survives leaving a party or the song being removed.
// - That copy never holds YouTube data (ADR-0011/0012: video ids are deleted 29 days after sharing). A video is added
//   only when reading the list, from the party's own expiring item, while you're still a member.
// - Who shared a song is shown only after that week ended and while you're still in the party (D10).

import type { MemberName, Recommendation, SavedSong, Song } from '@dropabop/shared';
import { SAVED_SONGS_PAGE_SIZE, canonicalLinks } from '@dropabop/shared';

/** What's stored per saved song (`USER#<userId> / SAVED#<trackId>`). `sharedBy` never leaves the server as an id. */
export interface StoredSavedSong {
  trackId: string;
  savedAt: string;
  song: Song;
  partyId: string;
  /** The party's name when the song was saved, for after you've left. */
  partyName: string;
  roundId: string;
  recommendationId: string;
  submittedOn: string;
  /** When that week's ratings locked (the round's `endsAt`). */
  weekEndsAt: string;
  sharedBy: string;
}

/** The Apple Music track id that identifies a song (every shared song has one: they come from iTunes). */
export function trackIdOf(song: Song): string | null {
  return song.providers.find((p) => p.provider === 'appleMusic')?.providerSongId ?? null;
}

/** The copy kept in the list: everything except YouTube links (pasted or found), which must not be kept (D34). */
export function savedSnapshot(song: Song): Song {
  return {
    ...song,
    providers: song.providers.filter((p) => p.provider !== 'youtube' && p.provider !== 'youtubeMusic'),
  };
}

export function toStoredSavedSong(args: {
  recommendation: Recommendation;
  partyName: string;
  weekEndsAt: string;
  now: Date;
}): StoredSavedSong | null {
  const { recommendation } = args;
  const trackId = trackIdOf(recommendation.song);
  if (trackId === null) return null;
  return {
    trackId,
    savedAt: args.now.toISOString(),
    song: savedSnapshot(recommendation.song),
    partyId: recommendation.partyId,
    partyName: args.partyName,
    roundId: recommendation.roundId,
    recommendationId: recommendation.recommendationId,
    submittedOn: recommendation.submittedOn,
    weekEndsAt: args.weekEndsAt,
    sharedBy: recommendation.userId,
  };
}

/** Newest saved first (ties by track id, so pages are stable), one page from `offset`. */
export function pageOfSaved(
  all: StoredSavedSong[],
  offset: number,
): { page: StoredSavedSong[]; nextCursor: string | null } {
  const sorted = [...all].sort(
    (a, b) => b.savedAt.localeCompare(a.savedAt) || a.trackId.localeCompare(b.trackId),
  );
  const end = offset + SAVED_SONGS_PAGE_SIZE;
  return { page: sorted.slice(offset, end), nextCursor: end < sorted.length ? String(end) : null };
}

export interface SavedViewContext {
  viewerId: string;
  now: Date;
  /** The parties the viewer is in now: partyId → current name. */
  memberOf: Map<string, string>;
  /** Current members of those parties: partyId → userId → name. */
  membersByParty: Map<string, Map<string, MemberName>>;
  /** recommendationId → live YouTube video id (only for parties the viewer is in). */
  videos: Map<string, string>;
}

export function toSavedSongView(stored: StoredSavedSong, ctx: SavedViewContext): SavedSong {
  const currentName = ctx.memberOf.get(stored.partyId);
  const isMember = currentName !== undefined;
  const weekEnded = ctx.now.getTime() >= new Date(stored.weekEndsAt).getTime();
  const sharer =
    isMember && weekEnded ? ctx.membersByParty.get(stored.partyId)?.get(stored.sharedBy) : undefined;
  const videoId = isMember ? ctx.videos.get(stored.recommendationId) : undefined;
  const song: Song =
    videoId === undefined
      ? stored.song
      : {
          ...stored.song,
          providers: [
            ...stored.song.providers,
            { provider: 'youtube', providerSongId: videoId, externalUrl: canonicalLinks.youtube(videoId) },
          ],
        };
  return {
    trackId: stored.trackId,
    savedAt: stored.savedAt,
    song,
    from: {
      partyId: stored.partyId,
      partyName: currentName ?? stored.partyName,
      roundId: stored.roundId,
      recommendationId: stored.recommendationId,
      submittedOn: stored.submittedOn,
      isMember,
      isMine: stored.sharedBy === ctx.viewerId,
      ...(sharer === undefined ? {} : { sharedBy: sharer }),
    },
  };
}

/**
 * Saved songs whose video might still be playable: in a party you're in and shared within the last 30 days. Only
 * these are looked up, so reading a long list stays cheap. (The video item itself expires after 29 days.)
 */
export function needsVideoLookup(stored: StoredSavedSong, memberOf: Map<string, string>, now: Date): boolean {
  if (!memberOf.has(stored.partyId)) return false;
  const sharedAt = Date.parse(`${stored.submittedOn}T00:00:00Z`);
  return !Number.isNaN(sharedAt) && now.getTime() - sharedAt < 31 * 24 * 60 * 60 * 1000;
}
