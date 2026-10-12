// No repeat songs in a party (D35). The same recording (Apple Music track) can only be shared once per party; a
// different version with the same title and artist (a remaster, a live take, the single vs the album) only gets a
// warning. Pure functions; the markers that enforce it are in data/shared-songs.ts.

import type { Song } from '@dropabop/shared';

/** Longest version key kept, in UTF-8 bytes (sort keys can be 1,024 bytes; real titles and artists are far shorter). */
const VERSION_KEY_MAX_BYTES = 900;

/**
 * Lower case, accents and apostrophes removed ("Don't" = "Dont"), anything else that isn't a letter or digit turned
 * into a space, spaces squeezed.
 */
function plain(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/['’‘`]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** "Song (feat. X)" / "Song ft. X" / "Song featuring X" → "Song". Works on titles and artists. */
function withoutFeaturing(text: string): string {
  return text.replace(/[([]?\s*\b(feat|ft|featuring)\b\.?.*$/i, '');
}

/**
 * The title without version notes: bracketed parts ("(Remastered 2011)", "[Live]") and anything after a spaced dash
 * ("- Live", "- Single Version"). A title with a dash in its real name is cut too; that only ever causes a warning
 * that can be dismissed, never a block.
 */
function baseTitle(title: string): string {
  const noBrackets = withoutFeaturing(title).replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  return noBrackets.split(/\s[-–—]\s/)[0] ?? noBrackets;
}

/** The main artist: before "feat.", "&", "," or " x " (so "Drake & Rihanna" and "Drake" are the same artist). */
function mainArtist(artist: string): string {
  const first = withoutFeaturing(artist).split(/\s*(?:,|&|\band\b|\sx\s)\s*/i)[0] ?? artist;
  return first;
}

/**
 * Two songs with the same key are versions of each other (D35). Empty when there's nothing left to compare (a title
 * made only of punctuation): those songs never get a version warning.
 */
export function versionKey(song: Pick<Song, 'title' | 'artist'>): string {
  const title = plain(baseTitle(song.title));
  const artist = plain(mainArtist(song.artist));
  if (title === '' || artist === '') return '';
  // Cut whole characters (never half of one) until it fits.
  const characters = Array.from(`${title}|${artist}`);
  while (new TextEncoder().encode(characters.join('')).length > VERSION_KEY_MAX_BYTES) characters.pop();
  return characters.join('');
}

const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const SHORT_DATE_WITH_YEAR = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2026-10-05" → "Oct 5" (this year) or "Oct 5, 2025" (another year). */
export function shortDate(isoDate: string, today: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return isoDate.slice(0, 4) === today.slice(0, 4)
    ? SHORT_DATE.format(date)
    : SHORT_DATE_WITH_YEAR.format(date);
}

/** The friendly 409 message: the date only, never who (D10). */
export function alreadySharedMessage(sharedOn: string, today: string): string {
  return `That song was already shared in this party on ${shortDate(sharedOn, today)}. Pick a different one.`;
}
