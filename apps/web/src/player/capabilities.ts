// What each music service lets Drop a Bop do inside the app (spec v2 §34). The screens read this instead of
// assuming every service works the same, so a control only appears when the service really supports it.
// Every value was checked against the provider's official docs on 2026-10-09 (ADR-0011, docs/API_COMPLIANCE.md).

export type PlayerProviderId = 'youtube' | 'appleMusic' | 'spotify';

export interface MusicProviderCapabilities {
  /** Searching the service's catalog from Drop a Bop. (Song search uses iTunes for everyone, ADR-0007.) */
  search: boolean;
  /** Playing the song inside Drop a Bop. */
  embeddedPlayback: boolean;
  /** Jumping to a point in the song. */
  seek: boolean;
  /** Changing the volume from our controls. */
  volume: boolean;
  /** Signing in to the service from Drop a Bop. */
  accountConnection: boolean;
  /** Playing while the player isn't on screen. */
  backgroundPlayback: boolean;
}

export const PROVIDER_CAPABILITIES: Record<PlayerProviderId, MusicProviderCapabilities> = {
  // IFrame Player API: playVideo/pauseVideo/seekTo/setVolume exist; no account needed. Background (hidden) players
  // are forbidden by the Developer Policies, so the player is always on screen while it plays.
  youtube: {
    search: false, // the YouTube Data API isn't used (D27): videos come from links members paste
    embeddedPlayback: true,
    seek: true,
    volume: true,
    accountConnection: false,
    backgroundPlayback: false,
  },
  // MusicKit needs a paid Apple Developer membership, so it's deferred (P13.L). Links only for now.
  appleMusic: {
    search: false,
    embeddedPlayback: false,
    seek: false,
    volume: false,
    accountConnection: false,
    backgroundPlayback: false,
  },
  // Spec v2 §4: no Spotify integration in the first release. Plain links only.
  spotify: {
    search: false,
    embeddedPlayback: false,
    seek: false,
    volume: false,
    accountConnection: false,
    backgroundPlayback: false,
  },
};
