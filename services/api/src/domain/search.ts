// Party search (spec §24, D33). Only the current party: its songs, artists, members and weeks. Nothing from outside
// the party and no external music search (finding a new song stays in Share's iTunes search).
//
// Privacy, the same as the rest of the app:
// - While a week is open, its songs appear without who shared them (D10), unless the song is yours or that week
//   was run with "reveal who shared" on. Ratings never appear here at all, so nothing from an open week leaks (D9).
// - Members are the party's current members, shown with the same public fields as everywhere else.

import type {
  MemberName,
  PartySearchResponse,
  PartySearchType,
  Recommendation,
  Round,
  RoundStatus,
  SearchArtistHit,
  SearchSongHit,
  SearchWeekHit,
} from '@dropabop/shared';
import { weekPrivacyOf } from '@dropabop/shared';

/** How many of each category `all` shows, and how many one category shows per page. */
export const SEARCH_PREVIEW_SIZE = 5;
export const SEARCH_PAGE_SIZE = 20;
/**
 * The most songs one search reads (newest weeks first). DynamoDB has no text search, so the party's songs are read
 * and filtered here (a documented exception, D33); a party adds about 5,000 songs a year at most.
 */
export const SEARCH_MAX_SONGS = 5000;

export interface SearchInput {
  q: string;
  type: PartySearchType;
  /** Position of the first result to return (for a single category). */
  offset: number;
  viewerId: string;
  /** The party's songs, newest weeks first (as read). */
  recommendations: Recommendation[];
  /** Every week with its status from the server clock (ADR-0003). */
  rounds: { round: Round; status: RoundStatus }[];
  members: MemberName[];
  /** True if there were more songs than SEARCH_MAX_SONGS. */
  truncated: boolean;
}

/** Lower case, accents removed and spaces squeezed, so "Björk" matches "bjork" and "  Sade " matches "sade". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * How well `fields` match the (normalized) query: 0 = a word starts with it (best), 1 = it appears inside a word,
 * null = no match. A query of several words matches if the whole phrase appears.
 */
export function matchScore(query: string, fields: (string | null | undefined)[]): 0 | 1 | null {
  let best: 0 | 1 | null = null;
  for (const field of fields) {
    if (field === null || field === undefined) continue;
    const text = normalize(field);
    const at = text.indexOf(query);
    if (at === -1) continue;
    // A word start: the beginning, or after a space or punctuation (e.g. "(feat. Robyn)").
    const wordStart = at === 0 || !/[\p{L}\p{N}]/u.test(text[at - 1] ?? '');
    if (wordStart) return 0;
    best = 1;
  }
  return best;
}

const MONTHS_LONG = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });
const MONTHS_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

/** The ways a week can be typed: "2026-10-05", "Week of October 5, 2026", "Oct 5". */
function weekLabels(weekStart: string): string[] {
  const date = new Date(`${weekStart}T12:00:00Z`);
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  return [
    weekStart,
    `week of ${MONTHS_LONG.format(date)} ${day}, ${year}`,
    `${MONTHS_SHORT.format(date)} ${day} ${year}`,
  ];
}

function bestFirst<T>(hits: { hit: T; score: 0 | 1 }[], tieBreak: (a: T, b: T) => number): T[] {
  return hits.sort((a, b) => a.score - b.score || tieBreak(a.hit, b.hit)).map((h) => h.hit);
}

export function searchParty(input: SearchInput): PartySearchResponse {
  const query = normalize(input.q);
  if (query.length < 2) {
    // e.g. only accent marks: nothing left to search for, and an empty query would match everything.
    const none = { songs: 0, artists: 0, members: 0, weeks: 0 };
    return {
      q: input.q,
      type: input.type,
      songs: [],
      artists: [],
      members: [],
      weeks: [],
      totals: none,
      nextCursor: null,
      truncated: input.truncated,
    };
  }
  const statusByRound = new Map(input.rounds.map((r) => [r.round.roundId, r]));

  // Songs: title, artist or album.
  const songHits: { hit: SearchSongHit; score: 0 | 1 }[] = [];
  for (const rec of input.recommendations) {
    const score = matchScore(query, [rec.song.title, rec.song.artist, rec.song.album]);
    if (score === null) continue;
    const week = statusByRound.get(rec.roundId);
    const weekOpen = week === undefined || week.status === 'OPEN'; // unknown week: treat as open (safest)
    const isMine = rec.userId === input.viewerId;
    const reveal =
      !weekOpen || isMine || (week !== undefined && weekPrivacyOf(week.round).revealRecommenderDuringVoting);
    songHits.push({
      score,
      hit: {
        recommendationId: rec.recommendationId,
        roundId: rec.roundId,
        submittedOn: rec.submittedOn,
        title: rec.song.title,
        artist: rec.song.artist,
        album: rec.song.album,
        albumArtUrl: rec.song.albumArtUrl,
        weekOpen,
        isMine,
        ...(reveal ? { recommendedBy: rec.userId } : {}),
      },
    });
  }
  const songs = bestFirst(
    songHits,
    (a, b) => b.submittedOn.localeCompare(a.submittedOn) || a.title.localeCompare(b.title),
  );

  // Artists: grouped spelling-insensitively (first spelling seen = the newest), with how many songs each has.
  const artistByKey = new Map<string, { hit: SearchArtistHit; score: 0 | 1 }>();
  for (const rec of input.recommendations) {
    const score = matchScore(query, [rec.song.artist]);
    if (score === null) continue;
    const key = normalize(rec.song.artist);
    const entry = artistByKey.get(key) ?? { hit: { artist: rec.song.artist.trim(), songCount: 0 }, score };
    entry.hit.songCount += 1;
    artistByKey.set(key, entry);
  }
  const artists = bestFirst(
    [...artistByKey.values()],
    (a, b) => b.songCount - a.songCount || a.artist.localeCompare(b.artist),
  );

  // Members: current members by display name.
  const members = bestFirst(
    input.members.flatMap((m) => {
      const score = matchScore(query, [m.displayName]);
      return score === null ? [] : [{ hit: m, score }];
    }),
    (a, b) => a.displayName.localeCompare(b.displayName),
  );

  // Weeks: by their date, typed any of the usual ways.
  const songCount = new Map<string, number>();
  for (const rec of input.recommendations) songCount.set(rec.roundId, (songCount.get(rec.roundId) ?? 0) + 1);
  const weeks = bestFirst(
    input.rounds.flatMap(({ round, status }) => {
      const score = matchScore(query, weekLabels(round.weekStart));
      if (score === null) return [];
      const hit: SearchWeekHit = {
        roundId: round.roundId,
        weekStart: round.weekStart,
        status,
        songCount: songCount.get(round.roundId) ?? 0,
      };
      return [{ hit, score }];
    }),
    (a, b) => b.weekStart.localeCompare(a.weekStart),
  );

  const totals = {
    songs: songs.length,
    artists: artists.length,
    members: members.length,
    weeks: weeks.length,
  };
  const base = { q: input.q, type: input.type, totals, truncated: input.truncated };

  if (input.type === 'all') {
    return {
      ...base,
      songs: songs.slice(0, SEARCH_PREVIEW_SIZE),
      artists: artists.slice(0, SEARCH_PREVIEW_SIZE),
      members: members.slice(0, SEARCH_PREVIEW_SIZE),
      weeks: weeks.slice(0, SEARCH_PREVIEW_SIZE),
      nextCursor: null,
    };
  }

  const lists = { songs, artists, members, weeks };
  const all = lists[input.type];
  const end = input.offset + SEARCH_PAGE_SIZE;
  return {
    ...base,
    songs: [],
    artists: [],
    members: [],
    weeks: [],
    [input.type]: all.slice(input.offset, end),
    nextCursor: end < all.length ? String(end) : null,
  };
}
