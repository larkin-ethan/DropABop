// One song in a list: artwork, title/artist, and either "Your pick", your rating, or a Rate button.

import type { SongView } from '../preview/sample-data';
import { Icon } from './Icon';
import { AlbumArt } from './ui';

export function SongCard({ item, onRate }: { item: SongView; onRate?: (id: string) => void }) {
  const link = item.song.providers[0]?.externalUrl;
  return (
    <li className="flex items-center gap-3 rounded-xl border border-transparent p-2 transition hover:border-line hover:bg-surface-raised sm:gap-4">
      <AlbumArt url={item.song.albumArtUrl} hue={item.hue} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{item.song.title}</p>
        <p className="truncate text-sm text-muted">{item.song.artist}</p>
      </div>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="hidden items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-blue hover:bg-blue/10 sm:inline-flex"
          aria-label={`Open ${item.song.title} in Spotify`}
        >
          Open <Icon name="external" className="size-3.5" />
        </a>
      )}
      {item.isMine ? (
        <span className="rounded-full bg-purple/20 px-3 py-1 text-xs font-semibold text-purple">
          Your pick
        </span>
      ) : item.myRating !== null ? (
        <span
          className="inline-flex min-w-12 items-center justify-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-sm font-bold text-primary"
          aria-label={`Your rating: ${item.myRating} out of 10`}
        >
          {item.myRating}
          <span className="text-xs font-medium text-primary/70">/10</span>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => onRate?.(item.recommendationId)}
          className="rounded-full border border-blue/60 px-3.5 py-1 text-sm font-semibold text-blue hover:bg-blue/10"
        >
          Rate
        </button>
      )}
    </li>
  );
}
