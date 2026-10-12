// /saved: your private "Saved songs" list (P14.2, D34). Newest first; one song plays at a time (no queue).
// Removing a song offers Undo while you're still in that song's party (saving needs membership); after you've left
// a party its songs stay here, but a removed one can't be saved again.

import type { SavedSong } from '@dropabop/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useMe, useSaveSong, useSavedSongs, useUnsaveSong } from '../api/hooks';
import { Icon } from '../components/Icon';
import { PageHeader, QueryBoundary } from '../components/Page';
import { ListenLinks, MyPickBadge, SongTitleLink } from '../components/SongRow';
import { EmptyState } from '../components/States';
import { AlbumArt, Card, buttonClassName } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { formatShortDate, hueFor } from '../lib/format';
import { PlayVideoButton } from '../player/PlayVideoButton';
import { songDetailsPath } from './SongDetailsScreen';

export function SavedSongsScreen() {
  const saved = useSavedSongs();
  // Removed in this visit, kept on screen with Undo (the server list no longer has them).
  const [removed, setRemoved] = useState<SavedSong[]>([]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Saved songs"
        description="Songs you saved from your parties. Only you can see this list."
      />
      <QueryBoundary
        isPending={saved.isPending}
        error={saved.error}
        onRetry={() => void saved.refetch()}
        loadingLabel="Loading your saved songs…"
      >
        {() => {
          const data = saved.data;
          if (data === undefined) return null;
          const items = [
            ...data.songs,
            ...removed.filter((r) => !data.songs.some((s) => s.trackId === r.trackId)),
          ].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
          if (items.length === 0) {
            return (
              <Card>
                <EmptyState
                  title="No saved songs yet"
                  message="Tap Save on any song in your parties (on Rate, Results or a song’s page) to keep it here."
                  action={
                    <Link to="/rate" className={buttonClassName('secondary')}>
                      <Icon name="star" className="size-4" /> Go to this week’s songs
                    </Link>
                  }
                />
              </Card>
            );
          }
          return (
            <>
              <p className="mb-3 text-sm text-muted">
                {data.total} of {data.limit} saved
              </p>
              {data.total >= data.limit && (
                <p
                  role="status"
                  className="mb-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm"
                >
                  Your list is full. Remove a song to save another.
                </p>
              )}
              <ul className="flex flex-col gap-3">
                {items.map((item) => (
                  <SavedRow
                    key={item.trackId}
                    item={item}
                    isRemoved={removed.some((r) => r.trackId === item.trackId)}
                    onRemoved={() => setRemoved((list) => [...list, item])}
                    onRestored={() => setRemoved((list) => list.filter((r) => r.trackId !== item.trackId))}
                  />
                ))}
              </ul>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}

function SavedRow({
  item,
  isRemoved,
  onRemoved,
  onRestored,
}: {
  item: SavedSong;
  isRemoved: boolean;
  onRemoved: () => void;
  onRestored: () => void;
}) {
  const me = useMe();
  const preferred = me.data?.user.preferredProvider ?? null;
  const unsave = useUnsaveSong();
  const save = useSaveSong();
  const { song, from } = item;

  if (isRemoved) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line px-4 py-3 text-sm">
        <span className="min-w-0 truncate text-muted">
          Removed <span className="text-ink">{song.title}</span>
          {!from.isMember && ' (you’ve left that party, so it can’t be saved again)'}
        </span>
        {from.isMember && (
          <button
            type="button"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { roundId: from.roundId, recommendationId: from.recommendationId },
                { onSuccess: onRestored },
              )
            }
            className="font-semibold text-blue hover:underline"
          >
            Undo
          </button>
        )}
        {save.error !== null && (
          <span role="alert" className="w-full text-xs text-red-200">
            {errorMessage(save.error)}
          </span>
        )}
      </li>
    );
  }

  return (
    <li className="card-glow flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <AlbumArt url={song.albumArtUrl} hue={hueFor(from.recommendationId)} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 font-semibold break-words">
          {from.isMember ? (
            <SongTitleLink to={songDetailsPath(from.roundId, from.recommendationId)} title={song.title} />
          ) : (
            song.title
          )}
        </p>
        <p className="truncate text-sm text-muted">{song.artist}</p>
        <p className="mt-0.5 text-xs text-muted">
          From {from.partyName} · {formatShortDate(from.submittedOn)}
          {from.sharedBy !== undefined && !from.isMine && ` · shared by ${from.sharedBy.displayName}`}
        </p>
        <div className="mt-1.5 flex flex-col items-start gap-1.5">
          <ListenLinks song={song} preferred={preferred} />
          <PlayVideoButton
            songKey={from.recommendationId}
            song={song}
            submittedOn={from.submittedOn}
            preferred={preferred}
          />
        </div>
        {unsave.error !== null && (
          <p role="alert" className="mt-1 text-xs text-red-200">
            {errorMessage(unsave.error)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        {from.isMine && <MyPickBadge />}
        <button
          type="button"
          disabled={unsave.isPending}
          onClick={() => {
            onRemoved(); // show "Removed · Undo" straight away; put it back if the server says no
            unsave.mutate(item.trackId, { onError: onRestored });
          }}
          aria-label={`Remove ${song.title} from your saved songs`}
          className="rounded-full px-3 py-1 text-xs font-semibold text-muted hover:bg-surface-raised hover:text-ink"
        >
          Remove
        </button>
      </div>
    </li>
  );
}
