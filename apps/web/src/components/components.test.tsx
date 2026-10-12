import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '@dropabop/shared';
import { Modal } from './Modal';
import { RatingControl } from './RatingControl';
import { ListenLinks, RatingBadge, SongRow } from './SongRow';
import { EmptyState, ErrorState, LoadingState } from './States';
import { Leaderboard, RatingDistribution, StatCard } from './Stats';
import { AlbumArt, Avatar, ProgressBar, buttonClassName } from './ui';

function ControlledRating({ onChange = () => {} }: { onChange?: (n: number) => void }) {
  const [value, setValue] = useState<number | null>(null);
  return (
    <RatingControl
      label="Rate Midnight City"
      value={value}
      onChange={(n) => {
        setValue(n);
        onChange(n);
      }}
    />
  );
}

describe('RatingControl', () => {
  it('offers ratings 0–10 as a labelled radio group (D36)', () => {
    render(<ControlledRating />);
    expect(screen.getByRole('radiogroup', { name: 'Rate Midnight City' })).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(11);
    expect(radios[0]).toHaveAccessibleName('0 out of 10');
  });

  it('selects a rating on click', async () => {
    const onChange = vi.fn();
    render(<ControlledRating onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: '8 out of 10' }));
    expect(onChange).toHaveBeenCalledWith(8);
    expect(screen.getByRole('radio', { name: '8 out of 10' })).toHaveAttribute('aria-checked', 'true');
  });

  it('works with the keyboard: arrow keys change the rating, Home/End jump', async () => {
    const onChange = vi.fn();
    render(<ControlledRating onChange={onChange} />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: '0 out of 10' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith(2);
    await userEvent.keyboard('{Home}');
    expect(onChange).toHaveBeenLastCalledWith(0);
    await userEvent.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith(10);
    expect(screen.getByRole('radio', { name: '10 out of 10' })).toHaveFocus();
  });

  it('can be disabled (e.g. after the week ends)', () => {
    render(<RatingControl label="Rate" value={7} onChange={() => {}} disabled />);
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
  });
});

describe('Modal', () => {
  it('shows a titled dialog and closes with Escape or the close button', async () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Share today’s song" onClose={onClose}>
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog', { name: 'Share today’s song' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps Tab inside the dialog', async () => {
    render(
      <>
        <button type="button">Behind the dialog</button>
        <Modal open title="Pause the party?" onClose={() => {}}>
          <button type="button">Cancel</button>
          <button type="button">Pause</button>
        </Modal>
      </>,
    );
    await userEvent.tab(); // Close
    await userEvent.tab(); // Cancel
    await userEvent.tab(); // Pause (the last one)
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveFocus();
    await userEvent.tab(); // wraps round instead of leaving the dialog
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveFocus();
  });

  it('renders nothing when closed', () => {
    render(
      <Modal open={false} title="Hidden" onClose={() => {}}>
        <p>Body</p>
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('StatCard', () => {
  it('shows the value with its sample size and a definition', () => {
    render(
      <StatCard
        label="Average score received"
        unit="songs"
        definition="Mean of the averages of your rated songs"
        stat={{ status: 'ok', value: 8.43, sampleSize: 12 }}
      />,
    );
    expect(screen.getByText('8.4')).toBeInTheDocument();
    expect(screen.getByText(/Based on 12 songs/)).toBeInTheDocument();
    expect(screen.getByLabelText(/How Average score received is calculated/)).toBeInTheDocument();
  });

  it('never shows a number without enough data (spec §17)', () => {
    render(
      <StatCard
        label="Generosity"
        unit="ratings"
        definition="Your average minus the party average"
        stat={{ status: 'not-enough-data', sampleSize: 4, required: 10 }}
      />,
    );
    expect(screen.getByText('Not enough data yet')).toBeInTheDocument();
    expect(screen.getByText('4 of 10 ratings so far')).toBeInTheDocument();
  });
});

describe('Leaderboard', () => {
  it('shows ranks (ties shared), names, values, and sample sizes', () => {
    render(
      <Leaderboard
        title="Highest Average Recommendation Score"
        definition="Average rating received by songs the user recommended"
        unit="songs"
        rows={[
          { id: 'a', rank: 1, value: 9, sampleSize: 12, name: 'Sarah Kim', avatarColor: '#14B8A6' },
          { id: 'b', rank: 2, value: 8, sampleSize: 10, name: 'Mike Torres', avatarColor: '#8B5CF6' },
          { id: 'c', rank: 2, value: 8, sampleSize: 9, name: 'John Park', avatarColor: '#F59E0B' },
        ]}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getAllByLabelText('Rank 2')).toHaveLength(2);
    expect(screen.getByText('Based on 12 songs')).toBeInTheDocument();
  });

  it('explains when nobody qualifies yet', () => {
    render(<Leaderboard title="Most Consistent" definition="…" unit="songs" rows={[]} />);
    expect(screen.getByText(/Nobody has enough data/)).toBeInTheDocument();
  });
});

describe('RatingDistribution', () => {
  it('gives screen readers a text table, 10 down to 0, and hides the bars from them (spec §37, D36)', () => {
    render(<RatingDistribution counts={[2, 0, 0, 0, 0, 0, 0, 1, 0, 2, 3]} />);
    const table = screen.getByRole('table', { name: 'Rating distribution' });
    const rows = within(table).getAllByRole('row').slice(1); // after the header row
    expect(rows).toHaveLength(11);
    expect(rows[0]).toHaveTextContent('103'); // rating 10, 3 times
    expect(rows[10]).toHaveTextContent('02'); // rating 0, 2 times
    expect(screen.queryAllByRole('listitem')).toHaveLength(0); // the bars are aria-hidden
  });
});

describe('states', () => {
  it('loading announces itself to screen readers', () => {
    render(<LoadingState label="Loading this week’s songs" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading this week’s songs');
  });

  it('empty state shows its message and action', () => {
    render(
      <EmptyState
        title="No songs yet."
        message="Be the first to share one today."
        action={<button>Share</button>}
      />,
    );
    expect(screen.getByText('No songs yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
  });

  it('error state shows the friendly message and retries', async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="You’ve already shared your song for today." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('already shared');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('basic pieces', () => {
  it('Avatar shows up to two initials', () => {
    render(<Avatar name="Ethan Larkin" color="#3B82F6" />);
    expect(screen.getByTitle('Ethan Larkin')).toHaveTextContent('EL');
  });

  it('AlbumArt uses the image when there is one, otherwise a placeholder', () => {
    const { container, rerender } = render(<AlbumArt url="https://images.example.com/a.jpg" />);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://images.example.com/a.jpg');
    rerender(<AlbumArt url={null} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('ProgressBar exposes its value', () => {
    render(<ProgressBar value={6} max={10} label="Songs rated" />);
    expect(screen.getByRole('progressbar', { name: 'Songs rated' })).toHaveAttribute('aria-valuenow', '6');
  });
});

describe('SongRow and ListenLinks', () => {
  const song: Song = {
    songId: 's1',
    title: 'Midnight City',
    artist: 'M83',
    album: null,
    albumArtUrl: null,
    durationMs: null,
    releaseDate: null,
    providers: [
      { provider: 'appleMusic', providerSongId: '1', externalUrl: 'https://music.apple.com/us/song/1' },
      { provider: 'spotify', providerSongId: 'abc', externalUrl: 'https://open.spotify.com/track/abc' },
    ],
  };

  it('shows the title, artist, and whatever the screen puts on the right', () => {
    render(
      <ul>
        <SongRow id="r1" song={song} preferred={null} right={<RatingBadge rating={8} />} />
      </ul>,
    );
    expect(screen.getByText('Midnight City')).toBeInTheDocument();
    expect(screen.getByLabelText('Your rating: 8 out of 10')).toBeInTheDocument();
  });

  it('opens a pasted YouTube link in YouTube Music', () => {
    const withVideo: Song = {
      ...song,
      providers: [
        ...song.providers,
        {
          provider: 'youtube',
          providerSongId: 'dQw4w9WgXcQ',
          externalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      ],
    };
    render(<ListenLinks song={withVideo} preferred="youtube" />);
    const first = screen.getAllByRole('link')[0];
    expect(first).toHaveAccessibleName('Open Midnight City on YouTube Music');
    expect(first).toHaveAttribute('href', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('puts the preferred app first, links out safely, and searches where there is no exact link (D22)', () => {
    render(<ListenLinks song={song} preferred="spotify" />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAccessibleName('Open Midnight City on Spotify');
    expect(links[0]).toHaveAttribute('href', 'https://open.spotify.com/track/abc');
    expect(links[0]).toHaveAttribute('rel', 'noreferrer');
    expect(screen.getByRole('link', { name: 'Search for Midnight City on YouTube Music' })).toHaveAttribute(
      'href',
      'https://music.youtube.com/search?q=M83%20Midnight%20City',
    );
  });
});

describe('buttonClassName', () => {
  it('uses its own padding when the caller sets one (two padding classes don’t override reliably)', () => {
    const classes = (extra?: string) => buttonClassName('ghost', extra).split(/\s+/);
    expect(classes()).toEqual(expect.arrayContaining(['px-5', 'py-2.5']));
    expect(classes('px-3 text-sm')).toContain('px-3');
    expect(classes('px-3 text-sm')).not.toContain('px-5');
    expect(classes('py-3')).not.toContain('py-2.5');
    expect(classes('py-3')).toContain('px-5');
  });
});
