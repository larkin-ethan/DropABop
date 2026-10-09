// Shared shapes for the player layer (spec v2 §7). Screens talk to the player through these, never to YouTube
// directly, so adding another service later (Apple MusicKit, P13.L) doesn't change the screens.

import type { MusicLink } from '../lib/music-links';
import type { PlayerProviderId } from './capabilities';

/** A song the player can load: what to show on the play card, what to play, and where else to listen. */
export interface PlayableSong {
  /** Unique per shared song (the recommendation id), so "is this one playing?" is a simple comparison. */
  key: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  provider: PlayerProviderId;
  /** The provider's id for the recording, e.g. the YouTube video id the sharer linked. */
  providerSongId: string;
  /** Shown when the song can't play here (spec §14). Only real links, never guesses. */
  links: MusicLink[];
}

export type PlaybackStatus = 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';

/**
 * Why playback failed, in words the fallback can explain:
 * - `notEmbeddable`: the video's owner doesn't allow playing it on other sites (YouTube errors 101 / 150).
 * - `notFound`: removed or private (100).
 * - `failed`: anything else (bad id 2, player error 5, missing Referer 153, or the script didn't load).
 */
export type PlaybackErrorKind = 'notEmbeddable' | 'notFound' | 'failed';

export interface PlaybackState {
  status: PlaybackStatus;
  positionSeconds: number;
  durationSeconds: number;
  /** 0–100. */
  volume: number;
  error: PlaybackErrorKind | null;
}

export const INITIAL_PLAYBACK_STATE: PlaybackState = {
  status: 'loading',
  positionSeconds: 0,
  durationSeconds: 0,
  volume: 100,
  error: null,
};

/**
 * One loaded song in one provider's player (spec v2 §7, adjusted to what's real: loading happens when the player is
 * created, and state changes are pushed to a callback instead of being polled by the screens).
 */
export interface MusicPlayerProvider {
  play: () => void;
  pause: () => void;
  seek: (positionSeconds: number) => void;
  setVolume: (volume: number) => void;
  getPlaybackState: () => PlaybackState;
  /** Stops playback and removes the player from the page. Safe to call twice. */
  destroy: () => void;
}
