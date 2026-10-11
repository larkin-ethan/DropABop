// The Play video button respects the privacy agreement YouTube requires before use (ADR-0011, P13.4).

import type { Song } from '@dropabop/shared';
import { PRIVACY_POLICY_VERSION } from '@dropabop/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import { createPreviewApi, createPreviewState, type PreviewState } from '../preview/preview-api';
import { MusicPlayerProvider } from './MusicPlayerContext';
import { PlayVideoButton } from './PlayVideoButton';

const song: Song = {
  songId: 's1',
  title: 'Blinding Lights',
  artist: 'The Weeknd',
  album: null,
  albumArtUrl: null,
  durationMs: null,
  releaseDate: null,
  providers: [
    { provider: 'appleMusic', providerSongId: '1', externalUrl: 'https://music.apple.com/us/song/x/1' },
    {
      provider: 'youtube',
      providerSongId: 'dX3k_QDnzHE',
      externalUrl: 'https://www.youtube.com/watch?v=dX3k_QDnzHE',
    },
  ],
};

function renderButton(setup: (state: PreviewState) => void) {
  const state = createPreviewState();
  setup(state);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ApiProvider client={createPreviewApi(state)}>
        <MusicPlayerProvider>
          <p>loaded</p>
          <PlayVideoButton songKey="r1" song={song} submittedOn={null} preferred={null} />
        </MusicPlayerProvider>
      </ApiProvider>
    </QueryClientProvider>,
  );
}

describe('PlayVideoButton and the privacy agreement', () => {
  it('appears once the person has agreed to the current policy', async () => {
    renderButton(() => undefined);
    expect(await screen.findByRole('button', { name: /Play the YouTube video/ })).toBeInTheDocument();
  });

  it.each([
    [
      'never agreed',
      (s: PreviewState) => void (delete s.user.privacyAcceptedAt, delete s.user.privacyVersion),
    ],
    [
      'agreed to an older version',
      (s: PreviewState) => void (s.user.privacyVersion = `${PRIVACY_POLICY_VERSION}-old`),
    ],
  ])('stays hidden for someone who %s', async (_name, setup) => {
    renderButton(setup);
    // Wait until the profile has loaded (the preview API answers immediately), then check.
    await waitFor(() => expect(screen.getByText('loaded')).toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('button', { name: /Play the YouTube video/ })).not.toBeInTheDocument();
  });
});
