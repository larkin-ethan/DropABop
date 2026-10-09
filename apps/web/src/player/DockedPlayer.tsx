// The play card docked at the bottom of the screen (Ethan, 2026-10-09: "playcard style, not a full video window").
// YouTube's rules shape it (ADR-0011): the video sits where the album art would be, at YouTube's minimum
// 200 × 200 px, always visible, with nothing drawn on top of it. Our own controls sit beside and below it.
// It lives in the app shell so the song keeps playing while you move between screens; closing it stops the song.
// There's no smaller "minimised" state, because a hidden or tiny YouTube player isn't allowed.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../components/Icon';
import { PROVIDER_CAPABILITIES } from './capabilities';
import { useMusicPlayer } from './MusicPlayerContext';
import { PlaybackFallback } from './PlaybackFallback';
import {
  INITIAL_PLAYBACK_STATE,
  type MusicPlayerProvider,
  type PlayableSong,
  type PlaybackState,
} from './types';
import { YOUTUBE_MIN_PLAYER_PX } from './youtube-player';

/** 75 → "1:15". */
export function formatPlaybackTime(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

export function DockedPlayer() {
  const { song, close } = useMusicPlayer();

  // Leaving the signed-in app (e.g. signing out) removes the card; don't bring the song back next time.
  useEffect(() => () => close(), [close]);

  if (song === null) return null;
  // A new song gets a brand-new card (key): fresh state and a fresh player, even if the last one failed.
  return <PlayCard key={song.key} song={song} onClose={close} />;
}

function PlayCard({ song, onClose }: { song: PlayableSong; onClose: () => void }) {
  const { createPlayer } = useMusicPlayer();
  const videoBox = useRef<HTMLDivElement>(null);
  const player = useRef<MusicPlayerProvider | null>(null);
  const [state, setState] = useState<PlaybackState>(INITIAL_PLAYBACK_STATE);
  /** While the progress bar is being dragged: where the thumb is. The song only jumps there on release. */
  const [dragSeconds, setDragSeconds] = useState<number | null>(null);

  // One player per card. Unmounting the card (new song, close, sign-out) destroys it, so two never play at once.
  useEffect(() => {
    const box = videoBox.current;
    if (box === null) return;
    const created = createPlayer(box, song, setState);
    player.current = created;
    return () => {
      created.destroy();
      player.current = null;
    };
  }, [song, createPlayer]);

  // A failed player is removed straight away; the card shows the song's links instead.
  useEffect(() => {
    if (state.status === 'error') player.current?.destroy();
  }, [state.status]);

  function finishSeek() {
    if (dragSeconds === null) return;
    player.current?.seek(dragSeconds);
    setDragSeconds(null);
  }

  const capabilities = PROVIDER_CAPABILITIES[song.provider];
  const failed = state.status === 'error' && state.error !== null;
  const loading = state.status === 'loading';
  const playing = state.status === 'playing' || state.status === 'buffering';
  const togglePlay = () => (playing ? player.current?.pause() : player.current?.play());

  // Album art behind the (not yet loaded) player: YouTube's iframe covers it. Nothing is ever on top of the video, and
  // the box isn't rounded or clipped, so no part of YouTube's player is cut off.
  const boxStyle: CSSProperties = {
    width: YOUTUBE_MIN_PLAYER_PX,
    height: YOUTUBE_MIN_PLAYER_PX,
    backgroundImage: song.artworkUrl !== null ? `url("${song.artworkUrl}")` : undefined,
  };

  const titleBlock = (
    <div className="min-w-0">
      <p className="truncate font-semibold">{song.title}</p>
      <p className="truncate text-sm text-muted">{song.artist}</p>
      <p className="mt-0.5 text-xs text-muted">YouTube video linked by the sharer</p>
    </div>
  );

  return (
    <section
      aria-label="Now playing"
      className="fixed inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[60] rounded-2xl border border-line bg-surface-raised p-3 shadow-2xl md:inset-x-auto md:right-6 md:bottom-6 md:w-[30rem]"
    >
      {failed ? (
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {titleBlock}
            <div className="mt-3">
              <PlaybackFallback error={state.error ?? 'failed'} links={song.links} />
            </div>
          </div>
          <CloseButton onClose={onClose} />
        </div>
      ) : (
        <>
          <div className="flex gap-3">
            {/* The YouTube player is created inside this box. */}
            <div
              ref={videoBox}
              data-testid="player-video"
              className="shrink-0 bg-black bg-cover bg-center"
              style={boxStyle}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-end gap-2">
                <div className="hidden min-w-0 flex-1 sm:block [@media(max-height:520px)]:block">
                  {titleBlock}
                </div>
                <CloseButton onClose={onClose} />
              </div>
              <div className="mt-auto flex flex-col items-center gap-1 sm:items-start">
                {loading ? (
                  <p role="status" className="text-sm text-muted">
                    Loading player…
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={playing ? 'Pause' : 'Play'}
                    className="inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-ink transition hover:brightness-110"
                  >
                    <Icon name={playing ? 'pause' : 'play'} className="size-5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Short screens (landscape phones): title beside the video and no progress row, so the whole 200 × 200
              video always fits on screen. YouTube's own player still has its seek bar. */}
          <div className="mt-2 sm:hidden [@media(max-height:520px)]:hidden">{titleBlock}</div>

          {!loading && (capabilities.seek || capabilities.volume) && (
            <div className="mt-2 flex items-center gap-3 [@media(max-height:520px)]:hidden">
              {capabilities.seek && (
                <>
                  <span className="w-10 text-right text-xs text-muted tabular-nums">
                    {formatPlaybackTime(dragSeconds ?? state.positionSeconds)}
                  </span>
                  <input
                    type="range"
                    aria-label="Position in the song"
                    min={0}
                    max={Math.max(1, Math.floor(state.durationSeconds))}
                    value={Math.floor(dragSeconds ?? state.positionSeconds)}
                    onChange={(e) => setDragSeconds(Number(e.target.value))}
                    onPointerUp={finishSeek}
                    onKeyUp={finishSeek}
                    onBlur={finishSeek}
                    className="min-w-0 flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="w-10 text-xs text-muted tabular-nums">
                    {formatPlaybackTime(state.durationSeconds)}
                  </span>
                </>
              )}
              {capabilities.volume && (
                // Phones control volume with their own buttons (and iOS ignores web volume), so tablet and up only.
                <label className="hidden items-center gap-1.5 text-muted sm:flex">
                  <Icon name="volume" className="size-4" />
                  <span className="sr-only">Volume</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={state.volume}
                    onChange={(e) => player.current?.setVolume(Number(e.target.value))}
                    className="w-20 accent-[var(--color-primary)]"
                  />
                </label>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close player"
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink"
    >
      <Icon name="close" className="size-4" />
    </button>
  );
}
