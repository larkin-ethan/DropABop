// "▶ Play video" on a song card (P13.4). Shown only when the sharer linked a YouTube video, the song was shared in
// the last 30 days, and you've agreed to the privacy policy and terms (ADR-0011). Otherwise nothing: the card's
// "Listen on …" links are always there, and rating never depends on playback (spec v2 §14).

import { hasAcceptedCurrentPrivacy, type MusicProviderId, type Song } from '@dropabop/shared';
import { useMe } from '../api/hooks';
import { Icon } from '../components/Icon';
import { useNow } from '../lib/useNow';
import { useMusicPlayer } from './MusicPlayerContext';
import { toPlayableSong } from './playable';

export function PlayVideoButton({
  songKey,
  song,
  submittedOn,
  preferred,
  label = 'Play video',
  showSource = true,
}: {
  songKey: string;
  song: Song;
  /** YYYY-MM-DD the song was shared, or null for the preview before sharing. */
  submittedOn: string | null;
  preferred: MusicProviderId | null;
  /** The button's words; the share dialog says "Preview video". */
  label?: string;
  /** "YouTube video linked by the sharer" next to the button. Not needed in the sharer's own preview. */
  showSource?: boolean;
}) {
  const me = useMe();
  const now = useNow();
  const { song: current, playSong } = useMusicPlayer();
  const user = me.data?.user;
  if (user === undefined || !hasAcceptedCurrentPrivacy(user)) return null;
  const playable = toPlayableSong({ key: songKey, song, submittedOn, preferred, now });
  if (playable === null) return null;

  const isCurrent = current?.key === songKey;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        onClick={() => playSong(playable)}
        disabled={isCurrent}
        aria-label={
          isCurrent
            ? `${song.title} is in the player`
            : `Play the YouTube video linked by the sharer for ${song.title}`
        }
        className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary transition hover:bg-primary/25 disabled:cursor-default disabled:opacity-70"
      >
        <Icon name="play" className="size-3.5" />
        {isCurrent ? 'In the player' : label}
      </button>
      {showSource && <span className="text-xs text-muted">YouTube video linked by the sharer</span>}
    </span>
  );
}
