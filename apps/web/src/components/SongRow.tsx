// One song in a list: artwork, title and artist, "Listen on …" links (preferred app first, D22), and whatever the
// screen puts on the right (a rating, "Your pick", a rank…).

import type { MusicProviderId, Song } from '@dropabop/shared';
import type { ReactNode } from 'react';
import { hueFor } from '../lib/format';
import { musicLinks } from '../lib/music-links';
import { Icon } from './Icon';
import { AlbumArt } from './ui';

/** Small "Listen" links. Exact links say the service's name; search links add "search". */
export function ListenLinks({
  song,
  preferred,
  limit = 3,
}: {
  song: Song;
  preferred: MusicProviderId | null;
  limit?: number;
}) {
  const links = musicLinks(song, preferred).slice(0, limit);
  return (
    <span className="flex flex-wrap gap-1.5">
      {links.map((link, index) => (
        <a
          key={link.provider}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`${link.exact ? 'Open' : 'Search for'} ${song.title} on ${link.label}`}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
            index === 0
              ? 'bg-blue/15 text-blue hover:bg-blue/25'
              : 'text-muted hover:bg-surface-raised hover:text-ink'
          }`}
        >
          {link.label}
          <Icon name="external" className="size-3" />
        </a>
      ))}
    </span>
  );
}

export function SongRow({
  id,
  song,
  preferred,
  detail,
  right,
  showLinks = true,
}: {
  /** Seeds the placeholder artwork colour. */
  id: string;
  song: Song;
  preferred: MusicProviderId | null;
  /** Extra line under the artist, e.g. "Shared by Sarah". */
  detail?: ReactNode;
  right?: ReactNode;
  showLinks?: boolean;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-transparent p-2 transition hover:border-line hover:bg-surface-raised sm:items-center sm:gap-4">
      <AlbumArt url={song.albumArtUrl} hue={hueFor(id)} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-semibold break-words">{song.title}</p>
        <p className="truncate text-sm text-muted">{song.artist}</p>
        {detail && <div className="mt-0.5 text-xs text-muted">{detail}</div>}
        {showLinks && (
          <div className="mt-1.5">
            <ListenLinks song={song} preferred={preferred} />
          </div>
        )}
      </div>
      {right && <div className="shrink-0 self-center">{right}</div>}
    </li>
  );
}

/** "Your pick" / "8/10" badges used on the right of a SongRow. */
export function MyPickBadge() {
  return (
    <span className="rounded-full bg-purple/20 px-3 py-1 text-xs font-semibold text-violet-200">
      Your pick
    </span>
  );
}

export function RatingBadge({ rating, label = 'Your rating' }: { rating: number; label?: string }) {
  return (
    <span
      className="inline-flex min-w-12 items-center justify-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary"
      aria-label={`${label}: ${rating} out of 10`}
    >
      {rating}
      <span className="text-xs font-medium text-primary/70">/10</span>
    </span>
  );
}
