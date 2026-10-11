// The one "now playing" song for the whole app (spec v2 §15). Any screen can start a song; starting another one
// replaces it, so only one player ever exists. The docked play card (DockedPlayer) shows it and owns the player.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { PROVIDER_CAPABILITIES } from './capabilities';
import type { MusicPlayerProvider, PlayableSong, PlaybackState } from './types';
import { createYouTubePlayer } from './youtube-player';

/** Builds a player for a song inside the given element. Swapped for a fake in tests. */
export type CreatePlayer = (
  container: HTMLElement,
  song: PlayableSong,
  onChange: (state: PlaybackState) => void,
) => MusicPlayerProvider;

/** The real players. Only YouTube plays in the app today (capabilities.ts); others never get here. */
export const createPlayer: CreatePlayer = (container, song, onChange) => {
  if (song.provider === 'youtube') return createYouTubePlayer(container, song.providerSongId, onChange);
  throw new Error(`${song.provider} can't play inside Drop a Bop.`);
};

interface MusicPlayerValue {
  /** The song in the play card, or null when nothing is loaded. */
  song: PlayableSong | null;
  /** Load a song into the play card and start it. Replaces whatever was playing. */
  playSong: (song: PlayableSong) => void;
  /** Stop and remove the play card. */
  close: () => void;
  createPlayer: CreatePlayer;
}

const NO_PLAYER: MusicPlayerValue = {
  song: null,
  playSong: () => undefined,
  close: () => undefined,
  createPlayer,
};

const MusicPlayerContext = createContext<MusicPlayerValue>(NO_PLAYER);

export function MusicPlayerProvider({
  children,
  create = createPlayer,
}: {
  children: ReactNode;
  create?: CreatePlayer;
}) {
  const [song, setSong] = useState<PlayableSong | null>(null);

  // Call this only from a tap inside the signed-in app, where the docked card is on screen: the video starts as soon
  // as YouTube is ready, and that must follow from the person's own tap (no autoplay, ADR-0011).
  const playSong = useCallback((next: PlayableSong) => {
    // A service that can't play here never reaches the player; the card shows its links instead.
    if (!PROVIDER_CAPABILITIES[next.provider].embeddedPlayback) return;
    setSong(next);
  }, []);
  const close = useCallback(() => setSong(null), []);

  const value = useMemo(
    () => ({ song, playSong, close, createPlayer: create }),
    [song, playSong, close, create],
  );
  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>;
}

export function useMusicPlayer(): MusicPlayerValue {
  return useContext(MusicPlayerContext);
}
