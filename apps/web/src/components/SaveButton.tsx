// The Save (heart) toggle on a shared song (D34). Saved state comes from the one "Saved songs" list, so every card
// and the Saved songs page agree. Private: nothing about saving is ever shown to anyone else.

import type { Song } from '@dropabop/shared';
import { useState } from 'react';
import { useSaveSong, useSavedSongs, useUnsaveSong } from '../api/hooks';
import { errorCode, errorMessage } from '../lib/errors';
import { Icon } from './Icon';

export function SaveButton({
  roundId,
  recommendationId,
  song,
}: {
  roundId: string;
  recommendationId: string;
  song: Song;
}) {
  const saved = useSavedSongs();
  const save = useSaveSong();
  const unsave = useUnsaveSong();
  // What the person just pressed, shown straight away while the server catches up.
  const [pressed, setPressed] = useState<boolean | null>(null);
  const trackId = song.providers.find((p) => p.provider === 'appleMusic')?.providerSongId;
  if (trackId === undefined) return null; // every shared song has one; nothing to save otherwise

  const inList = saved.data?.songs.some((s) => s.trackId === trackId) ?? false;
  const isSaved = pressed ?? inList;
  const error = save.error ?? unsave.error;

  function toggle() {
    if (isSaved) {
      setPressed(false);
      unsave.mutate(trackId as string, { onSettled: () => setPressed(null) });
    } else {
      setPressed(true);
      save.mutate({ roundId, recommendationId }, { onSettled: () => setPressed(null) });
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isSaved}
        aria-label={
          isSaved ? `Remove ${song.title} from your saved songs` : `Save ${song.title} to your saved songs`
        }
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
          isSaved
            ? 'bg-pink-500/15 text-pink-300 hover:bg-pink-500/25'
            : 'bg-surface-raised text-muted hover:text-ink'
        }`}
      >
        <Icon name="heart" className={`size-3.5 ${isSaved ? 'fill-current' : ''}`} />
        {isSaved ? 'Saved' : 'Save'}
      </button>
      {error !== null && (
        <span role="alert" className="text-xs text-red-200">
          {errorCode(error) === 'SAVED_LIMIT' ? 'Your saved songs list is full (500).' : errorMessage(error)}
        </span>
      )}
    </span>
  );
}
