// Player layer (P13.3): YouTube's script loads lazily and once, errors become the right fallback, only one song
// plays at a time, unsupported controls stay hidden, and players are cleaned up. YouTube itself is faked: these
// tests never load anything from the internet.

import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROVIDER_CAPABILITIES } from './capabilities';
import { DockedPlayer, formatPlaybackTime } from './DockedPlayer';
import { MusicPlayerProvider, useMusicPlayer, type CreatePlayer } from './MusicPlayerContext';
import type { MusicPlayerProvider as Player, PlayableSong, PlaybackState } from './types';
import { INITIAL_PLAYBACK_STATE } from './types';
import {
  YOUTUBE_API_SCRIPT,
  createYouTubePlayer,
  loadYouTubeApi,
  resetYouTubeApiForTests,
  youtubeErrorKind,
  type YouTubeApi,
} from './youtube-player';

const song = (key: string, overrides: Partial<PlayableSong> = {}): PlayableSong => ({
  key,
  title: `Song ${key}`,
  artist: 'Artist',
  artworkUrl: null,
  provider: 'youtube',
  providerSongId: 'M7lc1UVf-VE',
  links: [{ provider: 'appleMusic', label: 'Apple Music', url: 'https://music.apple.com/x', exact: true }],
  ...overrides,
});

function youtubeScripts() {
  return Array.from(document.querySelectorAll(`script[src="${YOUTUBE_API_SCRIPT}"]`));
}

beforeEach(() => {
  resetYouTubeApiForTests();
  delete window.YT;
  delete window.onYouTubeIframeAPIReady;
  youtubeScripts().forEach((s) => s.remove());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('loading YouTube’s script (spec §38: lazy)', () => {
  it('adds nothing until asked, then one script however many times it’s asked', async () => {
    expect(youtubeScripts()).toHaveLength(0);
    const first = loadYouTubeApi();
    const second = loadYouTubeApi();
    expect(second).toBe(first);
    expect(youtubeScripts()).toHaveLength(1);

    const api = { Player: vi.fn() } as unknown as YouTubeApi;
    window.YT = api;
    window.onYouTubeIframeAPIReady?.();
    await expect(first).resolves.toBe(api);
  });

  it('fails cleanly if the script can’t load, and tries again next time', async () => {
    const attempt = loadYouTubeApi();
    youtubeScripts()[0]?.dispatchEvent(new Event('error'));
    await expect(attempt).rejects.toThrow('didn’t load');
    expect(youtubeScripts()).toHaveLength(0);
    void loadYouTubeApi().catch(() => undefined);
    expect(youtubeScripts()).toHaveLength(1);
  });
});

describe('YouTube errors → fallback (ADR-0011)', () => {
  it.each([
    [101, 'notEmbeddable'],
    [150, 'notEmbeddable'],
    [100, 'notFound'],
    [2, 'failed'],
    [5, 'failed'],
    [153, 'failed'],
  ])('error %i is %s', (code, kind) => {
    expect(youtubeErrorKind(code)).toBe(kind);
  });
});

/** A fake YT.Player that records what it was asked to do and lets the test fire its events. */
function fakeYouTube() {
  const calls: string[] = [];
  let options: {
    playerVars: Record<string, unknown>;
    events: {
      onReady: () => void;
      onStateChange: (e: { data: number }) => void;
      onError: (e: { data: number }) => void;
    };
  } | null = null;
  const Player = vi.fn(function (this: unknown, _el: HTMLElement, opts: typeof options) {
    options = opts;
    return {
      playVideo: () => calls.push('play'),
      pauseVideo: () => calls.push('pause'),
      seekTo: (s: number) => calls.push(`seek ${s}`),
      setVolume: (v: number) => calls.push(`volume ${v}`),
      getVolume: () => 80,
      getCurrentTime: () => 12,
      getDuration: () => 200,
      destroy: () => calls.push('destroy'),
    };
  });
  window.YT = { Player };
  return { Player, calls, events: () => options!.events, playerVars: () => options!.playerVars };
}

describe('createYouTubePlayer', () => {
  it('starts the video once YouTube says it’s ready, and reports state changes', async () => {
    const yt = fakeYouTube();
    const states: PlaybackState[] = [];
    const box = document.createElement('div');
    const player = createYouTubePlayer(box, 'abc123def45', (s) => states.push(s));
    await act(async () => {}); // let the (already loaded) API promise resolve

    expect(yt.Player).toHaveBeenCalledOnce();
    expect(yt.playerVars()).toMatchObject({ autoplay: 0, playsinline: 1, origin: window.location.origin });
    yt.events().onReady();
    expect(yt.calls).toContain('play');
    yt.events().onStateChange({ data: 1 });
    expect(player.getPlaybackState()).toMatchObject({
      status: 'playing',
      positionSeconds: 12,
      durationSeconds: 200,
    });
    yt.events().onError({ data: 150 });
    expect(states.at(-1)).toMatchObject({ status: 'error', error: 'notEmbeddable' });

    player.destroy();
    player.destroy(); // twice is fine
    expect(yt.calls.filter((c) => c === 'destroy')).toHaveLength(1);
    expect(box.children).toHaveLength(0);
  });

  it('never creates a player if it was closed before YouTube finished loading', async () => {
    const box = document.createElement('div');
    const player = createYouTubePlayer(box, 'abc123def45', () => undefined);
    player.destroy();
    const yt = fakeYouTube();
    window.onYouTubeIframeAPIReady?.();
    await act(async () => {});
    expect(yt.Player).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The docked play card, with a fake player so we control its state.
// ---------------------------------------------------------------------------------------------------------------

function fakeCreatePlayer() {
  const players: { song: PlayableSong; destroyed: boolean; emit: (s: Partial<PlaybackState>) => void }[] = [];
  const create: CreatePlayer = (_box, played, onChange) => {
    let state = { ...INITIAL_PLAYBACK_STATE };
    const entry = {
      song: played,
      destroyed: false,
      emit: (changes: Partial<PlaybackState>) => {
        state = { ...state, ...changes };
        onChange(state);
      },
    };
    players.push(entry);
    const player: Player = {
      play: () => entry.emit({ status: 'playing' }),
      pause: () => entry.emit({ status: 'paused' }),
      seek: (positionSeconds) => entry.emit({ positionSeconds }),
      setVolume: (volume) => entry.emit({ volume }),
      getPlaybackState: () => state,
      destroy: () => {
        entry.destroyed = true;
      },
    };
    return player;
  };
  return { create, players };
}

function Starter({ songs }: { songs: PlayableSong[] }) {
  const { playSong, close } = useMusicPlayer();
  return (
    <div>
      {songs.map((s) => (
        <button key={s.key} type="button" onClick={() => playSong(s)}>
          Play {s.key}
        </button>
      ))}
      <button type="button" onClick={close}>
        Stop
      </button>
    </div>
  );
}

function renderDock(songs: PlayableSong[]) {
  const fake = fakeCreatePlayer();
  render(
    <MusicPlayerProvider create={fake.create}>
      <Starter songs={songs} />
      <DockedPlayer />
    </MusicPlayerProvider>,
  );
  return fake;
}

describe('docked play card (spec §15, ADR-0011)', () => {
  it('shows nothing until a song is played', () => {
    renderDock([song('a')]);
    expect(screen.queryByRole('region', { name: 'Now playing' })).not.toBeInTheDocument();
  });

  it('plays one song at a time: starting another stops the first', async () => {
    const fake = renderDock([song('a'), song('b')]);
    await userEvent.click(screen.getByRole('button', { name: 'Play a' }));
    await userEvent.click(screen.getByRole('button', { name: 'Play b' }));
    expect(fake.players.map((p) => [p.song.key, p.destroyed])).toEqual([
      ['a', true],
      ['b', false],
    ]);
    expect(screen.getAllByText('Song b').length).toBeGreaterThan(0);
  });

  it('keeps the video at YouTube’s minimum 200 × 200 px and labels it honestly', async () => {
    renderDock([song('a')]);
    await userEvent.click(screen.getByRole('button', { name: 'Play a' }));
    const box = screen.getByTestId('player-video');
    expect(box.style.width).toBe('200px');
    expect(box.style.height).toBe('200px');
    expect(box.children).toHaveLength(0); // nothing of ours inside (or on top of) the player
    expect(screen.getAllByText('YouTube video linked by the sharer').length).toBeGreaterThan(0);
  });

  it('shows our controls once the player is ready, and they drive the player', async () => {
    const fake = renderDock([song('a')]);
    await userEvent.click(screen.getByRole('button', { name: 'Play a' }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading player…');
    expect(screen.queryByRole('slider', { name: 'Position in the song' })).not.toBeInTheDocument();

    act(() => fake.players[0]!.emit({ status: 'playing', durationSeconds: 175, positionSeconds: 32 }));
    expect(screen.getByText('0:32')).toBeInTheDocument();
    expect(screen.getByText('2:55')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('hides controls the service doesn’t support', async () => {
    const original = { ...PROVIDER_CAPABILITIES.youtube };
    PROVIDER_CAPABILITIES.youtube.seek = false;
    PROVIDER_CAPABILITIES.youtube.volume = false;
    try {
      const fake = renderDock([song('a')]);
      await userEvent.click(screen.getByRole('button', { name: 'Play a' }));
      act(() => fake.players[0]!.emit({ status: 'playing' }));
      expect(screen.queryByRole('slider')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    } finally {
      Object.assign(PROVIDER_CAPABILITIES.youtube, original);
    }
  });

  it('falls back to the song’s links when the video can’t play, and removes the player', async () => {
    const fake = renderDock([song('a')]);
    await userEvent.click(screen.getByRole('button', { name: 'Play a' }));
    act(() => fake.players[0]!.emit({ status: 'error', error: 'notEmbeddable' }));
    expect(screen.getByRole('alert')).toHaveTextContent('This song can’t be played here.');
    expect(screen.getByRole('link', { name: /Listen on Apple Music/ })).toHaveAttribute(
      'href',
      'https://music.apple.com/x',
    );
    expect(screen.queryByTestId('player-video')).not.toBeInTheDocument();
    expect(fake.players[0]!.destroyed).toBe(true);
  });

  it('closing stops and removes the player', async () => {
    const fake = renderDock([song('a')]);
    await userEvent.click(screen.getByRole('button', { name: 'Play a' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close player' }));
    expect(fake.players[0]!.destroyed).toBe(true);
    expect(screen.queryByRole('region', { name: 'Now playing' })).not.toBeInTheDocument();
  });

  it('ignores services that can’t play inside the app (Apple Music, Spotify: links only)', async () => {
    const fake = renderDock([song('a', { provider: 'appleMusic' })]);
    await userEvent.click(screen.getByRole('button', { name: 'Play a' }));
    expect(fake.players).toHaveLength(0);
    expect(screen.queryByRole('region', { name: 'Now playing' })).not.toBeInTheDocument();
  });
});

describe('docked play card: recovery and clean-up (P13.3 review)', () => {
  it('plays the next song after one failed', async () => {
    const fake = renderDock([song('a'), song('b')]);
    await userEvent.click(screen.getByRole('button', { name: 'Play a' }));
    act(() => fake.players[0]!.emit({ status: 'error', error: 'notEmbeddable' }));
    await userEvent.click(screen.getByRole('button', { name: 'Play b' }));
    expect(fake.players).toHaveLength(2);
    expect(fake.players[1]!.song.key).toBe('b');
    expect(screen.getByTestId('player-video')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('removing the card (e.g. signing out) destroys the player and forgets the song', async () => {
    const fake = fakeCreatePlayer();
    function App({ showDock }: { showDock: boolean }) {
      return (
        <MusicPlayerProvider create={fake.create}>
          <Starter songs={[song('a')]} />
          {showDock && <DockedPlayer />}
        </MusicPlayerProvider>
      );
    }
    const { rerender } = render(<App showDock />);
    await userEvent.click(screen.getByRole('button', { name: 'Play a' }));
    rerender(<App showDock={false} />);
    expect(fake.players[0]!.destroyed).toBe(true);
    rerender(<App showDock />);
    expect(screen.queryByRole('region', { name: 'Now playing' })).not.toBeInTheDocument();
    expect(fake.players).toHaveLength(1);
  });

  it('jumps in the song only when the progress bar is let go, not on every step of a drag', async () => {
    const fake = renderDock([song('a')]);
    const seeks: number[] = [];
    await userEvent.click(screen.getByRole('button', { name: 'Play a' }));
    act(() => fake.players[0]!.emit({ status: 'playing', durationSeconds: 200, positionSeconds: 10 }));
    const bar = screen.getByRole('slider', { name: 'Position in the song' });
    const original = fake.players[0]!.emit;
    fake.players[0]!.emit = (changes) => {
      if (changes.positionSeconds !== undefined && changes.status === undefined)
        seeks.push(changes.positionSeconds);
      original(changes);
    };
    fireEvent.change(bar, { target: { value: '50' } });
    fireEvent.change(bar, { target: { value: '90' } });
    expect(seeks).toEqual([]);
    expect(screen.getByText('1:30')).toBeInTheDocument(); // the time follows the thumb while dragging
    fireEvent.pointerUp(bar);
    expect(seeks).toEqual([90]);
  });
});

describe('formatPlaybackTime', () => {
  it.each([
    [0, '0:00'],
    [5.7, '0:05'],
    [75, '1:15'],
    [Number.NaN, '0:00'],
  ])('%s → %s', (seconds, text) => {
    expect(formatPlaybackTime(seconds)).toBe(text);
  });
});
