// YouTube's official embedded player, wrapped in our MusicPlayerProvider shape (ADR-0011).
// Only documented IFrame Player API calls are used (https://developers.google.com/youtube/iframe_api_reference,
// checked 2026-10-09). The rules we must keep: the player stays visible at 200 × 200 px or more with nothing on top
// of it, never plays hidden, and doesn't start by itself on page load. Those are the docked play card's job
// (DockedPlayer.tsx); this file only drives the player.

import {
  INITIAL_PLAYBACK_STATE,
  type MusicPlayerProvider,
  type PlaybackErrorKind,
  type PlaybackState,
} from './types';

export const YOUTUBE_API_SCRIPT = 'https://www.youtube.com/iframe_api';
/** The smallest player YouTube allows (Required Minimum Functionality). */
export const YOUTUBE_MIN_PLAYER_PX = 200;
const LOAD_TIMEOUT_MS = 15_000;
/** YouTube has no "time changed" event, so the progress bar reads the time this often while a player exists. */
const POLL_MS = 500;

// ---------------------------------------------------------------------------------------------------------------
// The small part of YouTube's API we use. Written out here instead of adding a types package (CLAUDE.md: few deps).
// ---------------------------------------------------------------------------------------------------------------

interface YouTubePlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  getVolume: () => number;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}

interface YouTubePlayerOptions {
  width: number | string;
  height: number | string;
  videoId: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady: () => void;
    onStateChange: (event: { data: number }) => void;
    onError: (event: { data: number }) => void;
  };
}

export interface YouTubeApi {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** YT.PlayerState values from the reference. */
const STATE = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

// ---------------------------------------------------------------------------------------------------------------
// Loading YouTube's script: only when someone first presses Play (spec §38), and only once.
// ---------------------------------------------------------------------------------------------------------------

let apiPromise: Promise<YouTubeApi> | null = null;

export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player !== undefined) return Promise.resolve(window.YT);
  if (apiPromise !== null) return apiPromise;

  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => {
      window.clearTimeout(timer);
      apiPromise = null; // let a later Play try again
      script.remove();
      reject(new Error('The YouTube player didn’t load.'));
    };
    const timer = window.setTimeout(fail, LOAD_TIMEOUT_MS);
    // YouTube's script calls this global when it's ready (that's how its API is designed).
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      window.clearTimeout(timer);
      if (window.YT?.Player !== undefined) resolve(window.YT);
      else fail();
    };
    script.src = YOUTUBE_API_SCRIPT;
    script.async = true;
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return apiPromise;
}

/** Tests only: forget the loaded script so each test starts clean. */
export function resetYouTubeApiForTests(): void {
  apiPromise = null;
}

/** YouTube's onError codes → what the fallback should say. */
export function youtubeErrorKind(code: number): PlaybackErrorKind {
  if (code === 101 || code === 150) return 'notEmbeddable';
  if (code === 100) return 'notFound';
  return 'failed'; // 2 bad id, 5 HTML5 player error, 153 missing Referer, anything new
}

// ---------------------------------------------------------------------------------------------------------------
// One player
// ---------------------------------------------------------------------------------------------------------------

/**
 * Creates a YouTube player inside `container` and starts the video as soon as it's ready (the person pressed Play,
 * so this isn't autoplay on page load). Every state change is passed to `onChange`.
 */
export function createYouTubePlayer(
  container: HTMLElement,
  videoId: string,
  onChange: (state: PlaybackState) => void,
): MusicPlayerProvider {
  let state: PlaybackState = { ...INITIAL_PLAYBACK_STATE };
  let player: YouTubePlayer | null = null;
  let ready = false;
  let destroyed = false;
  let poll: number | undefined;

  function update(changes: Partial<PlaybackState>) {
    const next = { ...state, ...changes };
    const changed = (Object.keys(changes) as (keyof PlaybackState)[]).some((key) => next[key] !== state[key]);
    state = next;
    if (changed && !destroyed) onChange(state);
  }

  function readTimes() {
    if (player === null || !ready) return;
    update({
      positionSeconds: player.getCurrentTime(),
      durationSeconds: player.getDuration(),
      volume: player.getVolume(),
    });
  }

  // YouTube replaces the element it's given with its iframe, so give it a child of ours rather than React's node.
  const mount = document.createElement('div');
  container.appendChild(mount);

  loadYouTubeApi()
    .then((api) => {
      if (destroyed) return;
      player = new api.Player(mount, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: {
          autoplay: 0, // never on load; we start it from the person's tap in onReady
          playsinline: 1, // iOS: play in the card, not full screen
          rel: 0, // related videos from the same channel only
          enablejsapi: 1,
          origin: window.location.origin, // identifies us honestly (ADR-0011)
        },
        events: {
          onReady: () => {
            ready = true;
            update({ status: 'ready' });
            readTimes();
            player?.playVideo();
          },
          onStateChange: (event) => {
            if (event.data === STATE.PLAYING) update({ status: 'playing' });
            else if (event.data === STATE.PAUSED) update({ status: 'paused' });
            else if (event.data === STATE.BUFFERING) update({ status: 'buffering' });
            else if (event.data === STATE.ENDED) update({ status: 'ended' });
            else if (event.data === STATE.CUED) update({ status: 'ready' });
            readTimes();
          },
          onError: (event) => update({ status: 'error', error: youtubeErrorKind(event.data) }),
        },
      });
      poll = window.setInterval(readTimes, POLL_MS);
    })
    .catch(() => update({ status: 'error', error: 'failed' }));

  return {
    play: () => player?.playVideo(),
    pause: () => player?.pauseVideo(),
    seek: (positionSeconds) => {
      player?.seekTo(positionSeconds, true);
      update({ positionSeconds });
    },
    setVolume: (volume) => {
      player?.setVolume(volume);
      update({ volume });
    },
    getPlaybackState: () => state,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      window.clearInterval(poll);
      player?.destroy();
      player = null;
      mount.remove();
    },
  };
}
