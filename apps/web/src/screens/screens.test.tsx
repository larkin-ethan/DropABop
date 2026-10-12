// Screen tests (roadmap Phase 8): each screen against the in-memory preview API, checking the behaviour the roadmap
// and PRODUCT_DECISIONS ask for, plus loading/empty/error states.

import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PRIVACY_POLICY_VERSION } from '@dropabop/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/client';
import { createPreviewApi, createPreviewState } from '../preview/preview-api';
import { rememberSignUpAgreement } from '../lib/privacy-consent';
import { fakeAuth, renderApp, signedInAuth } from '../test/render-app';

describe('Home (P8.3)', () => {
  it('shows today, rating progress, and today’s songs first', async () => {
    renderApp('/');
    expect(await screen.findByText('Wednesday · Day 3 of 5')).toBeInTheDocument();
    expect(await screen.findByText('You’ve shared today’s song')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Rate 4 more/ })).toHaveAttribute('href', '/rate?show=unrated');
    const dayHeadings = await screen.findAllByRole('heading', { level: 3 });
    expect(dayHeadings[0]).toHaveTextContent('Today · Wednesday');
    expect(screen.getByText(/Ratings lock/)).toBeInTheDocument();
  });

  it('shows your averages, latest achievement and last week’s rank (spec §26)', async () => {
    renderApp('/');
    const highlights = await screen.findByRole('region', { name: 'Your highlights' });
    expect(within(highlights).getByText('7.4')).toBeInTheDocument(); // average given
    expect(within(highlights).getByText('8.1')).toBeInTheDocument(); // average received
    expect(within(highlights).getByText('#2')).toBeInTheDocument();
    expect(within(highlights).getByRole('link', { name: 'View stats' })).toHaveAttribute('href', '/stats');
  });

  it('has one main button: sharing comes before rating', async () => {
    renderApp('/', {
      setup: (s) => {
        s.songs = s.songs.filter((x) => x.recommendationId !== 'r9');
      },
    });
    expect(await screen.findByRole('link', { name: 'Share today’s song' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Rate \d+ more/ })).not.toBeInTheDocument();
  });

  it('asks you to share when you haven’t yet today', async () => {
    renderApp('/', {
      setup: (s) => {
        s.songs = s.songs.filter((x) => x.recommendationId !== 'r9');
      },
    });
    expect(await screen.findByRole('link', { name: 'Share today’s song' })).toHaveAttribute('href', '/share');
  });

  it('on weekends, points to catching up instead of sharing', async () => {
    renderApp('/', {
      setup: (s) => {
        s.today = null;
      },
    });
    expect(await screen.findByText('No sharing today · catch-up time')).toBeInTheDocument();
    expect(screen.getByText(/Today isn’t a sharing day \(this week: Monday to Friday\)/)).toBeInTheDocument();
  });

  it('between weeks, names the first sharing day rather than assuming Monday', async () => {
    renderApp('/', {
      setup: (s) => {
        s.weekClosed = true;
        s.parties[0]!.settings.shareDays = ['TUE', 'THU'];
      },
    });
    expect(
      await screen.findByText('The next week starts Monday; sharing opens Tuesday.'),
    ).toBeInTheDocument();
  });

  it('counts sharing days from the week’s own schedule (D1)', async () => {
    renderApp('/', {
      setup: (s) => {
        s.round.shareDays = ['MON', 'WED', 'FRI'];
        s.today = { weekday: 'WED', date: '2026-10-07', dayNumber: 2, dayCount: 3 };
      },
    });
    expect(await screen.findByText('Wednesday · Day 2 of 3')).toBeInTheDocument();
  });

  it('shows the paused state with a link to the last results', async () => {
    renderApp('/', {
      setup: (s) => {
        s.parties[0]!.settings.paused = true;
      },
    });
    expect(await screen.findByRole('heading', { name: 'This party is paused' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /last week’s results/ })).toHaveAttribute(
      'href',
      '/results/p1.2026-09-28',
    );
  });

  it('welcomes people who aren’t in a party yet, with join and create', async () => {
    renderApp('/', {
      setup: (s) => {
        s.parties = [];
      },
    });
    expect(await screen.findByText('You’re not in a party yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Join with a code/ })).toHaveAttribute('href', '/join');
    expect(screen.getByRole('link', { name: /Create a party/ })).toHaveAttribute('href', '/parties/new');
    expect(screen.getByRole('heading', { name: 'How a week works' })).toBeInTheDocument();
  });

  it('asks new people for their name (D18) and saves it', async () => {
    const { state } = renderApp('/', {
      setup: (s) => {
        s.user.displayName = 'New member';
      },
    });
    const field = await screen.findByLabelText('Display name');
    await userEvent.type(field, 'Sam');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.user.displayName).toBe('Sam'));
  });

  it('doesn’t reveal who has shared today unless the party allows it (D10)', async () => {
    renderApp('/');
    await screen.findByText('You’ve shared today’s song');
    expect(screen.queryByLabelText(/has shared today/)).not.toBeInTheDocument();
  });

  it('marks who has shared today when the party reveals recommenders', async () => {
    renderApp('/', {
      setup: (s) => {
        s.parties[0]!.settings.revealRecommenderDuringVoting = true;
        s.round.revealRecommenderDuringVoting = true; // the week started with it on
      },
    });
    expect(await screen.findByLabelText('Ethan Larkin has shared today')).toBeInTheDocument();
  });

  it('keeps songs anonymous by default (D10)', async () => {
    renderApp('/');
    await screen.findByText('Heat Waves');
    expect(screen.queryByText(/^Shared by /)).not.toBeInTheDocument();
    expect(screen.getByText('Who shared what is revealed with the results')).toBeInTheDocument();
  });

  it('shows who shared each song when the party reveals it (D10)', async () => {
    renderApp('/', {
      setup: (s) => {
        s.parties[0]!.settings.revealRecommenderDuringVoting = true;
        s.round.revealRecommenderDuringVoting = true; // the week started with it on
      },
    });
    expect((await screen.findAllByText(/^Shared by /)).length).toBeGreaterThan(0);
    expect(screen.getByText('This party shows who shared each song')).toBeInTheDocument();
  });

  it('shows a friendly error with Try again when the week can’t load', async () => {
    const failing: ApiClient = {
      get: (path) =>
        path.includes('rounds/current')
          ? Promise.reject(new ApiError(500, 'INTERNAL', 'Something went wrong. Please try again.'))
          : !path.startsWith('/users/me')
            ? Promise.reject(new ApiError(404, 'NOT_FOUND', 'Not found.'))
            : Promise.resolve({
                user: {
                  userId: 'me',
                  displayName: 'Ethan',
                  avatarColor: '#3B82F6',
                  preferredProvider: null,
                  privacyAcceptedAt: '2026-10-09T12:00:00.000Z',
                  privacyVersion: PRIVACY_POLICY_VERSION,
                  createdAt: '',
                },
                parties: [{ partyId: 'p1', partyName: 'Party', role: 'host', joinedAt: '' }],
              } as never),
      post: () => Promise.reject(new Error('unused')),
      put: () => Promise.reject(new Error('unused')),
      patch: () => Promise.reject(new Error('unused')),
      delete: () => Promise.reject(new Error('unused')),
    };
    renderApp('/', { api: failing });
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Please try again.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('Share today’s song (P8.4)', () => {
  const notSharedYet = {
    setup: (s: { songs: { recommendationId: string }[] }) =>
      void (s.songs = s.songs.filter((x) => x.recommendationId !== 'r9')),
  };

  it('searches, confirms ("can’t change it"), shares, and goes home', async () => {
    const { state } = renderApp('/share', {
      setup: (s) => {
        s.songs = s.songs.filter((x) => x.recommendationId !== 'r9');
      },
    });
    await userEvent.type(await screen.findByLabelText('Search for a song, artist, or album'), 'blue sky');
    await userEvent.click(await screen.findByRole('button', { name: 'Choose Mr. Blue Sky' }));
    const dialog = await screen.findByRole('dialog', { name: 'Share this song?' });
    expect(within(dialog).getByText(/You can’t change it after sharing/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Share song' }));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/));
    expect(state.songs.some((s) => s.isMine && s.song.title === 'Mr. Blue Sky')).toBe(true);
  });

  it('rejects a link that isn’t a Spotify song before sending anything', async () => {
    const { state } = renderApp('/share', notSharedYet);
    await userEvent.type(await screen.findByLabelText('Search for a song, artist, or album'), 'abba');
    await userEvent.click(await screen.findByRole('button', { name: 'Choose Dancing Queen' }));
    await userEvent.click(screen.getByText('Add your Spotify or YouTube Music link (optional)'));
    await userEvent.type(screen.getByLabelText('Spotify link'), 'https://example.com/nope');
    await userEvent.click(screen.getByRole('button', { name: 'Share song' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Spotify');
    expect(state.songs.some((s) => s.song.title === 'Dancing Queen')).toBe(false);
  });

  it('tells the sharer the truth about anonymity in the confirm step (D10)', async () => {
    renderApp('/share', {
      setup: (s) => {
        s.songs = s.songs.filter((x) => x.recommendationId !== 'r9');
        s.parties[0]!.settings.revealRecommenderDuringVoting = true;
        s.round.revealRecommenderDuringVoting = true; // the week started with it on
      },
    });
    await userEvent.type(await screen.findByLabelText('Search for a song, artist, or album'), 'abba');
    await userEvent.click(await screen.findByRole('button', { name: 'Choose Dancing Queen' }));
    expect(await screen.findByText(/people will see it’s yours/)).toBeInTheDocument();
  });

  it('accepts a pasted Spotify link: you pick the song, and the link is attached when sharing', async () => {
    const state = createPreviewState();
    state.songs = state.songs.filter((x) => x.recommendationId !== 'r9');
    const preview = createPreviewApi(state);
    const posts: { path: string; body: unknown }[] = [];
    const api: ApiClient = {
      ...preview,
      post: (path, body) => {
        posts.push({ path, body });
        return preview.post(path, body);
      },
    };
    renderApp('/share', { api });
    await userEvent.click(await screen.findByRole('tab', { name: 'Paste a link' }));
    const spotify = 'https://open.spotify.com/track/1eyzqe2QqGZUmfcPZtrIyt';
    await userEvent.type(screen.getByLabelText('Song link'), spotify);
    await userEvent.click(screen.getByRole('button', { name: 'Find this song' }));

    // Back on search, with a note that the link will be attached.
    expect(await screen.findByText(/Got your Spotify link/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search for a song, artist, or album'), 'midnight');
    await userEvent.click(await screen.findByRole('button', { name: 'Choose Midnight City' }));
    const dialog = await screen.findByRole('dialog', { name: 'Share this song?' });
    expect(within(dialog).getByLabelText('Spotify link')).toHaveValue(spotify);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Share song' }));

    await waitFor(() => expect(posts.some((p) => p.path.endsWith('/recommendations'))).toBe(true));
    const shared = posts.find((p) => p.path.endsWith('/recommendations'));
    expect(shared?.body).toMatchObject({ provider: 'appleMusic', links: { spotify } });
  });

  it('accepts a pasted YouTube Music link the same way', async () => {
    renderApp('/share', notSharedYet);
    await userEvent.click(await screen.findByRole('tab', { name: 'Paste a link' }));
    await userEvent.type(screen.getByLabelText('Song link'), 'https://music.youtube.com/watch?v=dQw4w9WgXcQ');
    await userEvent.click(screen.getByRole('button', { name: 'Find this song' }));
    expect(await screen.findByText(/Got your YouTube Music link/)).toBeInTheDocument();
  });

  it('explains when a pasted link isn’t from a supported music app', async () => {
    renderApp('/share', notSharedYet);
    await userEvent.click(await screen.findByRole('tab', { name: 'Paste a link' }));
    await userEvent.type(screen.getByLabelText('Song link'), 'https://example.com/song');
    await userEvent.click(screen.getByRole('button', { name: 'Find this song' }));
    expect(
      await screen.findByText(/isn’t a song link from Apple Music, Spotify, or YouTube Music/),
    ).toBeInTheDocument();
  });

  it('says so when you’ve already shared today', async () => {
    renderApp('/share');
    expect(await screen.findByText('You’ve shared today’s song')).toBeInTheDocument();
  });

  it('is closed on weekends', async () => {
    renderApp('/share', {
      setup: (s) => {
        s.today = null;
      },
    });
    expect(await screen.findByText('Today isn’t a sharing day')).toBeInTheDocument();
    expect(screen.getByText(/sharing days are Monday to Friday/)).toBeInTheDocument();
  });

  it('can find a song from a pasted Apple Music link', async () => {
    renderApp('/share', notSharedYet);
    await userEvent.click(await screen.findByRole('tab', { name: 'Paste a link' }));
    await userEvent.type(screen.getByLabelText('Song link'), 'https://music.apple.com/us/song/x/1001');
    await userEvent.click(screen.getByRole('button', { name: 'Find this song' }));
    expect(await screen.findByRole('dialog', { name: 'Share this song?' })).toBeInTheDocument();
  });

  it('a pasted Apple Music link finds that song (not a fixed one) and can be shared', async () => {
    const { state } = renderApp('/share', notSharedYet);
    await userEvent.click(await screen.findByRole('tab', { name: 'Paste a link' }));
    await userEvent.type(
      screen.getByLabelText('Song link'),
      'https://music.apple.com/us/album/after-hours/1499378108?i=1499378615',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Find this song' }));
    const dialog = await screen.findByRole('dialog', { name: 'Share this song?' });
    expect(within(dialog).getByText('After Hours')).toBeInTheDocument();
    expect(within(dialog).queryByText('Midnight City')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Share song' }));
    await waitFor(() =>
      expect(state.songs.some((s) => s.isMine && s.song.providers[0]?.providerSongId === '1499378615')).toBe(
        true,
      ),
    );
  });
});

describe('Rate this week’s songs (P8.5)', () => {
  it('shows progress, filters to unrated, and saves a rating', async () => {
    const { state } = renderApp('/rate');
    expect(await screen.findByText('6 of 10 rated')).toBeInTheDocument();
    expect(screen.getByText(/Ratings lock/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Unrated \(4\)/ }));
    expect(screen.getByTestId('path')).toHaveTextContent('/rate?show=unrated');
    expect(screen.queryByText('Good 4 U')).not.toBeInTheDocument(); // already rated
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: /Rate Heat Waves/ })).getByRole('radio', {
        name: '9 out of 10',
      }),
    );
    await waitFor(() => expect(state.songs.find((s) => s.recommendationId === 'r10')?.myRating).toBe(9));
  });

  it('keeps a song you just rated on the Unrated list, so a mis-tap can be fixed, and says it saved', async () => {
    const { state } = renderApp('/rate?show=unrated');
    const group = await screen.findByRole('radiogroup', { name: /Rate Heat Waves/ });
    await userEvent.click(within(group).getByRole('radio', { name: '7 out of 10' }));
    expect(await screen.findByText(/✓ Saved/)).toBeInTheDocument();
    // Still there after saving: fix the rating.
    await userEvent.click(
      within(screen.getByRole('radiogroup', { name: /Rate Heat Waves/ })).getByRole('radio', {
        name: '8 out of 10',
      }),
    );
    await waitFor(() => expect(state.songs.find((s) => s.recommendationId === 'r10')?.myRating).toBe(8));
  });

  it('shows a failed save on the song itself', async () => {
    const state = createPreviewState();
    const base = createPreviewApi(state);
    const api: ApiClient = {
      ...base,
      put: () =>
        Promise.reject(new ApiError(409, 'WEEK_CLOSED', 'This week has ended, so ratings are locked.')),
    };
    renderApp('/rate', { api });
    const group = await screen.findByRole('radiogroup', { name: /Rate Heat Waves/ });
    await userEvent.click(within(group).getByRole('radio', { name: '5 out of 10' }));
    const card = group.closest('li') as HTMLElement;
    expect(await within(card).findByRole('alert')).toHaveTextContent(
      'This week has ended, so ratings are locked. Your rating wasn’t saved.',
    );
  });

  it('still saves a rating when you leave the page right after tapping it', async () => {
    const { state } = renderApp('/rate');
    const group = await screen.findByRole('radiogroup', { name: /Rate Heat Waves/ });
    await userEvent.click(within(group).getByRole('radio', { name: '6 out of 10' }));
    await userEvent.click(screen.getAllByRole('link', { name: 'Home' })[0] as HTMLElement); // within the 0.4 s pause
    await waitFor(() => expect(state.songs.find((s) => s.recommendationId === 'r10')?.myRating).toBe(6));
  });

  it('doesn’t let you rate your own song (D6)', async () => {
    renderApp('/rate');
    await screen.findByText('6 of 10 rated');
    expect(screen.getAllByText('This is your song, so you can’t rate it.').length).toBeGreaterThan(0);
    expect(screen.queryByRole('radiogroup', { name: /Rate Midnight City/ })).not.toBeInTheDocument();
  });

  it('shows an empty state before anyone has shared', async () => {
    renderApp('/rate', {
      setup: (s) => {
        s.songs = [];
      },
    });
    expect(await screen.findByText('No songs yet')).toBeInTheDocument();
  });
});

describe('Comments on songs (D25)', () => {
  it('are collapsed by default, and open to show names, times and a box to add one', async () => {
    renderApp('/rate');
    const toggle = await screen.findByRole('button', { name: /Comments \(2\) on Heat Waves/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Perfect road trip song')).not.toBeInTheDocument();

    await userEvent.click(toggle);
    const list = screen.getByRole('list', { name: 'Comments on Heat Waves' });
    expect(within(list).getByText('Perfect road trip song')).toBeInTheDocument();
    expect(within(list).getByText('John Park')).toBeInTheDocument(); // names always shown (D25)
    expect(screen.getByText(/Your name shows with your comment/)).toBeInTheDocument();
  });

  it('posts a comment, then lets you delete your own', async () => {
    const { state } = renderApp('/rate');
    await userEvent.click(await screen.findByRole('button', { name: /Comments \(2\) on Heat Waves/ }));
    await userEvent.type(screen.getByLabelText('Add a comment'), 'Instant add to my playlist');
    await userEvent.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(state.comments.at(-1)?.text).toBe('Instant add to my playlist'));
    expect(await screen.findByText('Instant add to my playlist')).toBeInTheDocument();
    expect(screen.getByLabelText('Add a comment')).toHaveValue('');

    // Delete buttons appear only on your own comments (you're not the host... except in sample mode, where you are).
    await userEvent.click(screen.getByRole('button', { name: 'Delete comment by You' }));
    await waitFor(() =>
      expect(state.comments.some((c) => c.text === 'Instant add to my playlist')).toBe(false),
    );
  });

  it('only shows Delete on your own comments when you’re not the host', async () => {
    renderApp('/rate', {
      setup: (s) => {
        s.parties[0]!.hostUserId = 'u2';
        s.members = s.members.map((m) => ({ ...m, role: m.userId === 'u2' ? 'host' : 'member' }));
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: /Comments \(2\) on Heat Waves/ }));
    expect(screen.queryByRole('button', { name: /Delete comment by/ })).not.toBeInTheDocument();
  });

  it('are read-only once the week is over', async () => {
    renderApp('/results', {
      setup: (s) => {
        s.comments = [
          {
            commentId: 'old',
            roundId: s.pastRound.roundId,
            recommendationId: s.pastResults[0]!.recommendationId,
            userId: 'u3',
            text: 'Called it',
            createdAt: '2026-10-01T12:00:00.000Z',
          },
        ];
      },
    });
    await userEvent.click(
      (await screen.findAllByRole('button', { name: /Comments \(1\)/ }))[0] as HTMLElement,
    );
    expect(screen.getByText('Called it')).toBeInTheDocument();
    expect(screen.getByText('Comments are closed for this week.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Add a comment')).not.toBeInTheDocument();
  });
});

describe('Weekly results and history (P8.6, P8.7)', () => {
  it('shows the latest finished week: Bop of the Day and the ranking', async () => {
    renderApp('/results');
    expect(await screen.findByRole('heading', { name: 'Week complete!' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Bop of the Day/ })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Rank 1').length).toBeGreaterThan(0);
    expect(screen.getByText(/This week’s unlock Sunday 11:59 pm/)).toBeInTheDocument();
  });

  it('says so when the newest week had too few songs, instead of calling an older week "last week"', async () => {
    const state = createPreviewState();
    const base = createPreviewApi(state);
    const api: ApiClient = {
      ...base,
      get: <T,>(path: string) =>
        /\/rounds(\?|$)/.test(path)
          ? (Promise.resolve({
              rounds: [{ ...state.round, status: 'NOT_ENOUGH_SONGS' }, state.pastRound],
              nextCursor: null,
            }) as Promise<T>)
          : base.get<T>(path),
    };
    renderApp('/results', { api });
    expect(
      await screen.findByText(
        /The most recent finished week didn’t have enough songs for results, so these are from the week of Sep 28/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/These are last week’s results/)).not.toBeInTheDocument();
  });

  it('switches to the per-day view and shows a rating spread', async () => {
    renderApp('/results/p1.2026-09-28');
    await userEvent.click(await screen.findByRole('button', { name: 'By day' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Details' })[0] as HTMLElement);
    expect(screen.getByRole('table', { name: 'Rating distribution' })).toBeInTheDocument();
  });

  it('explains that the current week’s results aren’t ready', async () => {
    renderApp('/results/p1.2026-10-05');
    expect(await screen.findByText('Not ready yet')).toBeInTheDocument();
    expect(screen.getByText(/unlock when this week’s ratings lock/)).toBeInTheDocument();
  });

  it('lists past weeks, linking finished ones to their results', async () => {
    renderApp('/history?view=list');
    expect(await screen.findByText('This week · in progress')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Week of Sep 28/ })).toHaveAttribute(
      'href',
      '/results/p1.2026-09-28',
    );
  });
});

describe('Stats and leaderboard (P8.8, P8.9)', () => {
  it('shows personal stats with their sample size, or "Not enough data yet"', async () => {
    renderApp('/stats');
    expect(await screen.findByText('Average rating given')).toBeInTheDocument();
    expect(screen.getByText('7.4')).toBeInTheDocument();
    expect(screen.getAllByText(/Based on 12 ratings/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not enough data yet').length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/How Generosity is calculated/)).toBeInTheDocument();
  });

  it('shows group stats with definitions', async () => {
    renderApp('/stats/group');
    expect(await screen.findByText('Highest-rated song')).toBeInTheDocument();
    expect(screen.getByText('Most generous voter')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /is calculated/ }).length).toBeGreaterThan(5);
    // Tap (not hover) shows the definition, so it works on phones.
    await userEvent.click(screen.getByRole('button', { name: 'How Most divisive is calculated' }));
    expect(screen.getByText(/ratings were most spread out/)).toBeInTheDocument();
  });

  it('ranks people, with "Based on N" on every row', async () => {
    renderApp('/leaderboard');
    expect(await screen.findByRole('heading', { name: 'Highest average received' })).toBeInTheDocument();
    for (const board of [
      'Highest average given',
      'Most bops',
      'Most ratings',
      'Crowd favorites',
      'Most generous',
    ]) {
      expect(screen.getByRole('heading', { name: board })).toBeInTheDocument();
    }
    expect(screen.getAllByText(/Based on \d+ rated songs/).length).toBeGreaterThan(0);
    expect(screen.getByText('Nobody has enough data for this one yet.')).toBeInTheDocument(); // Most surprising
  });

  it('lists people below a minimum as Provisional with the rule, never with a number (D30)', async () => {
    renderApp('/leaderboard');
    const card = (await screen.findByRole('heading', { name: 'Highest average received' })).closest(
      'div',
    )!.parentElement!;
    expect(within(card).getByText('Provisional')).toBeInTheDocument();
    expect(within(card).getByText('Not ranked yet: needs 3 rated songs.')).toBeInTheDocument();
    expect(within(card).getByText('2 of 3')).toBeInTheDocument();
  });

  it('switches period (This week / This month / All time) and asks the API for it', async () => {
    const api = createPreviewApi(createPreviewState());
    const get = vi.spyOn(api, 'get');
    renderApp('/leaderboard', { api });
    const week = await screen.findByRole('button', { name: 'This week' });
    expect(screen.getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(week);
    expect(week).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText(/The most recent finished week/)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/leaderboard\?period=week$/));
    expect(get).toHaveBeenCalledWith(expect.stringMatching(/\/leaderboard\?period=all$/));
  });

  it('group stats show counts, group average, top artists and activity tables', async () => {
    renderApp('/stats/group');
    expect(await screen.findByText('Group average')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByText('Members')).toBeInTheDocument();
    expect(screen.getAllByText('7.3').length).toBeGreaterThan(0);
    expect(screen.getByText('Robyn')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /each finished week/ })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /month their ratings locked/ })).toBeInTheDocument();
    expect(screen.getByText('Most consistent')).toBeInTheDocument();
  });
});

describe('Profile (P13.11, spec §18)', () => {
  it('is a stats page: averages, counts, badges, favourites and recent songs; editing is in Settings', async () => {
    renderApp('/profile');
    expect(await screen.findByText('Average received')).toBeInTheDocument();
    expect(screen.getByText('Ratings given')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Achievements' })).toBeInTheDocument();
    expect(screen.getByText('Electronic')).toBeInTheDocument(); // favourite genre
    expect(screen.getByRole('heading', { name: 'Recent bops' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Edit profile/ })).toHaveAttribute('href', '/settings/account');
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
  });
});

describe('Party settings and profile (P8.10, P8.11)', () => {
  it('lets the host change settings and explains the timezone', async () => {
    const { state } = renderApp('/settings/party');
    expect(await screen.findByText(/days run midnight to midnight in/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: /Show who rated what/ }));
    await waitFor(() => expect(state.parties[0]?.settings.showWhoRatedWhat).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Pause the party' }));
    // Pausing affects everyone, so it asks first.
    const dialog = await screen.findByRole('dialog', { name: 'Pause the party?' });
    expect(state.parties[0]?.settings.paused).toBe(false);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pause the party' }));
    await waitFor(() => expect(state.parties[0]?.settings.paused).toBe(true));
  });

  it('lets the host choose the sharing days and when ratings lock (D1, D2)', async () => {
    const { state } = renderApp('/settings/party');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Friday' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Saturday' }));
    await userEvent.selectOptions(screen.getByLabelText('Ratings lock on'), 'Sunday');
    const time = screen.getByLabelText('At');
    await userEvent.clear(time);
    await userEvent.type(time, '21:00');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(state.parties[0]?.settings).toMatchObject({
        shareDays: ['MON', 'TUE', 'WED', 'THU', 'SAT'],
        ratingCloseDay: 'SUN',
        ratingCloseTime: '21:00',
      }),
    );
  });

  it('won’t let ratings lock before 11:59 pm on the last sharing day', async () => {
    const { state } = renderApp('/settings/party');
    await userEvent.selectOptions(await screen.findByLabelText('Ratings lock on'), 'Wednesday');
    expect(screen.getByRole('alert')).toHaveTextContent('11:59 pm on the last sharing day at the earliest');
    // Friday is the last sharing day: only 11:59 pm is allowed on it.
    await userEvent.selectOptions(screen.getByLabelText('Ratings lock on'), 'Friday');
    const time = screen.getByLabelText('At');
    await userEvent.clear(time);
    await userEvent.type(time, '00:00');
    expect(screen.getByRole('alert')).toHaveTextContent('11:59 pm on the last sharing day at the earliest');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(state.parties[0]?.settings.ratingCloseDay).toBe('SUN');
  });

  it('shows members the schedule without letting them change it', async () => {
    renderApp('/settings/party', {
      setup: (s) => {
        s.parties[0]!.hostUserId = 'someone-else';
        s.members = s.members.map((m, i) => (i === 0 ? { ...m, role: 'member' } : m));
      },
    });
    // Plain text, not fields that look editable.
    expect(await screen.findByText('Only the host can change these settings.')).toBeInTheDocument();
    expect(screen.getByText('Monday to Friday')).toBeInTheDocument();
    expect(screen.getByText('Sunday at 11:59 pm')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Monday' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
  });

  it('after removing someone, offers a new invite link (D17)', async () => {
    const { state } = renderApp('/settings/party');
    await userEvent.click(await screen.findByRole('button', { name: 'Remove Sarah Kim' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    expect(await screen.findByRole('dialog', { name: 'Make a new invite link?' })).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Make a new link' }),
    );
    await waitFor(() => expect(state.parties[0]?.inviteCode).toBe('SONG-9QX3'));
    expect(state.members.some((m) => m.userId === 'u2')).toBe(false);
  });

  it('is read-only for members, who can leave instead', async () => {
    renderApp('/settings/party', {
      setup: (s) => {
        s.parties[0]!.hostUserId = 'u2';
        s.members[0]!.role = 'member';
        s.members[1]!.role = 'host';
      },
    });
    expect(await screen.findByText('Only the host can change these settings.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.getByText('Not shown (anonymous spreads)')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
  });

  it('lets a member leave the party and takes them home', async () => {
    const { state } = renderApp('/settings/party', {
      setup: (s) => {
        s.parties[0]!.hostUserId = 'u2';
        s.members[0]!.role = 'member';
        s.members[1]!.role = 'host';
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave party' }));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/));
    expect(state.parties).toHaveLength(0);
  });

  it('saves your name and colour in Settings → Account (the preferred app is in Settings → Music)', async () => {
    const { state } = renderApp('/settings/account');
    const name = await screen.findByLabelText('Display name');
    await userEvent.clear(name);
    await userEvent.type(name, 'E');
    await userEvent.click(screen.getByLabelText('Color #22C55E'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(state.user).toMatchObject({ displayName: 'E', avatarColor: '#22C55E' });
  });
});

describe('Joining and creating parties (P8.2)', () => {
  it('shows the invite and its party when signed in', async () => {
    renderApp('/join/song-7k4p');
    expect(await screen.findByRole('heading', { name: 'Ethan’s Music Party' })).toBeInTheDocument();
    expect(screen.getByText('You’re already in this party.')).toBeInTheDocument();
  });

  it('works signed out: remembers the code, then offers sign up or log in', async () => {
    renderApp('/join/SONG-7K4P', { auth: fakeAuth() });
    expect(await screen.findByRole('heading', { name: 'You’re invited!' })).toBeInTheDocument();
    expect(window.sessionStorage.getItem('dropabop.pendingInvite')).toBe('SONG-7K4P');
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/sign-up');
    window.sessionStorage.clear();
  });

  it('after signing in, brings people back to the invite they opened', async () => {
    window.sessionStorage.setItem('dropabop.pendingInvite', 'SONG-7K4P');
    renderApp('/');
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/join/SONG-7K4P'));
    expect(window.sessionStorage.getItem('dropabop.pendingInvite')).toBeNull();
  });

  it('joins automatically after signing in from an invite link (P8.2)', async () => {
    window.sessionStorage.setItem('dropabop.pendingInvite', 'SONG-2ABC');
    const { state } = renderApp('/');
    await waitFor(() => expect(state.parties.some((p) => p.partyId === 'p2')).toBe(true));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/$/));
  });

  it('opening an invite link while signed in still asks before joining', async () => {
    const { state } = renderApp('/join/SONG-2ABC');
    await userEvent.click(await screen.findByRole('button', { name: 'Join party' }));
    await waitFor(() => expect(state.parties.some((p) => p.partyId === 'p2')).toBe(true));
  });

  it('doesn’t crash on a malformed link', async () => {
    renderApp('/join/%25ZZ');
    expect(await screen.findByRole('alert')).toHaveTextContent('That invite code isn’t valid');
  });

  it('says clearly when a code is wrong', async () => {
    renderApp('/join/SONG-ZZZZ');
    expect(await screen.findByRole('alert')).toHaveTextContent('That invite code isn’t valid');
  });

  it('accepts a pasted invite link in the code box', async () => {
    renderApp('/join');
    await userEvent.type(
      await screen.findByLabelText('Invite code or link'),
      'https://dropabop.example/join/song-7k4p',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/join/SONG-7K4P');
  });

  it('creates a party and shows its invite link', async () => {
    renderApp('/parties/new');
    await userEvent.type(await screen.findByLabelText('Party name'), 'Road Trip');
    await userEvent.click(screen.getByRole('button', { name: 'Create party' }));
    expect(await screen.findByRole('heading', { name: 'Road Trip' })).toBeInTheDocument();
    expect(screen.getByText(/\/join\/SONG-NEW2/)).toBeInTheDocument();
  });

  it('checks the party details before sending', async () => {
    renderApp('/parties/new');
    await userEvent.click(await screen.findByRole('button', { name: 'Create party' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('Privacy switches are fixed per week (D10, 2026-10-04)', () => {
  it('turning on “show who shared” mid-week keeps this week’s songs anonymous', async () => {
    renderApp('/', {
      setup: (s) => {
        s.parties[0]!.settings.revealRecommenderDuringVoting = true; // changed after the week started
      },
    });
    expect(await screen.findByText('Who shared what is revealed with the results')).toBeInTheDocument();
    expect(screen.queryByText(/^Shared by /)).not.toBeInTheDocument();
  });
});

describe('How it works guide and invite message (2026-10-04)', () => {
  it('can be read signed out, from the invite page, with a way to sign up', async () => {
    renderApp('/join/SONG-7K4P', { auth: fakeAuth() });
    await userEvent.click(await screen.findByRole('link', { name: /See how it works/ }));
    expect(await screen.findByRole('heading', { name: 'How Drop a Bop works' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Share one song each sharing day/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/sign-up');
    window.sessionStorage.clear();
  });

  it('copies an invite message with the party’s schedule, link and code', async () => {
    let copied = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text: string) => ((copied = text), Promise.resolve()) },
    });
    renderApp('/settings/party', {
      setup: (s) => {
        s.parties[0]!.settings.shareDays = ['MON', 'WED', 'FRI'];
        s.parties[0]!.settings.ratingCloseDay = 'SAT';
        s.parties[0]!.settings.ratingCloseTime = '21:00';
      },
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Copy invite message' }));
    expect(await screen.findByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    expect(copied).toContain('Join my Drop a Bop party “Ethan’s Music Party”!');
    expect(copied).toContain('On Monday, Wednesday and Friday we each share a song');
    expect(copied).toContain('Ratings lock Saturday at 9:00 pm');
    expect(copied).toContain('/join/SONG-7K4P (or use code SONG-7K4P)');
    expect(copied).toContain('/how-it-works');
  });
});

describe('Privacy policy and agreement (P13.2a, ADR-0011)', () => {
  it('the policy is public, names the contact, and binds video use to the YouTube Terms', async () => {
    renderApp('/privacy', { auth: fakeAuth() });
    expect(
      await screen.findByRole('heading', { name: 'Privacy policy and terms', level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'droppa.bop@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:droppa.bop@gmail.com',
    );
    for (const link of screen.getAllByRole('link', { name: 'YouTube Terms of Service' })) {
      expect(link).toHaveAttribute('href', 'https://www.youtube.com/t/terms');
    }
    expect(screen.getByRole('link', { name: 'Google Privacy Policy' })).toHaveAttribute(
      'href',
      'https://www.google.com/policies/privacy',
    );
    expect(screen.getByText(/you agree to be bound by the/)).toBeInTheDocument();
  });

  it('asks a member who hasn’t agreed, and lets them in once they do', async () => {
    const { state } = renderApp('/', {
      setup: (s) => {
        delete s.user.privacyAcceptedAt;
        delete s.user.privacyVersion;
      },
    });
    expect(await screen.findByRole('heading', { name: 'Privacy policy and terms' })).toBeInTheDocument();
    expect(screen.queryByText('Wednesday · Day 3 of 5')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Read the privacy policy and terms' })).toHaveAttribute(
      'href',
      '/privacy',
    );

    await userEvent.click(screen.getByRole('button', { name: 'I agree' }));
    expect(await screen.findByText('Wednesday · Day 3 of 5')).toBeInTheDocument();
    expect(state.user.privacyVersion).toBeDefined();
  });

  it('asks again when the policy version changes', async () => {
    renderApp('/', {
      setup: (s) => {
        s.user.privacyVersion = '2000-01-01';
      },
    });
    expect(await screen.findByRole('button', { name: 'I agree' })).toBeInTheDocument();
  });

  it('never counts another account’s sign-up agreement (shared computers)', async () => {
    rememberSignUpAgreement('someone-else');
    const { state } = renderApp('/', {
      setup: (s) => {
        delete s.user.privacyAcceptedAt;
        delete s.user.privacyVersion;
      },
    });
    expect(await screen.findByRole('button', { name: 'I agree' })).toBeInTheDocument();
    expect(state.user.privacyAcceptedAt).toBeUndefined();
    window.localStorage.clear();
  });

  it('doesn’t ask again someone who agreed at sign-up on this browser', async () => {
    rememberSignUpAgreement('me');
    const { state } = renderApp('/', {
      setup: (s) => {
        delete s.user.privacyAcceptedAt;
        delete s.user.privacyVersion;
      },
    });
    expect(await screen.findByText('Wednesday · Day 3 of 5')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'I agree' })).not.toBeInTheDocument();
    await waitFor(() => expect(state.user.privacyAcceptedAt).toBeDefined());
    expect(window.localStorage.getItem('dropabop.privacyAgreedAtSignUp')).toBeNull();
  });
});

describe('Play video on song cards (P13.4, ADR-0011)', () => {
  /** Today's date as the API writes it, so the 30-day rule holds whenever these tests run. */
  const today = new Date().toISOString().slice(0, 10);

  it('shows Play video only on songs whose sharer linked a YouTube video, and opens the play card', async () => {
    renderApp('/rate', {
      setup: (s) => {
        for (const song of s.songs) song.submittedOn = today;
      },
    });
    const buttons = await screen.findAllByRole('button', {
      name: /Play the YouTube video linked by the sharer/,
    });
    expect(buttons).toHaveLength(1); // only Blinding Lights has a linked video in the sample data
    expect(buttons[0]).toHaveAccessibleName(
      'Play the YouTube video linked by the sharer for Blinding Lights',
    );
    await userEvent.click(buttons[0]!);
    const card = await screen.findByRole('region', { name: 'Now playing' });
    expect(within(card).getAllByText('Blinding Lights').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Blinding Lights is in the player' })).toBeDisabled();
    // Rating still works with the card open.
    expect(screen.getAllByRole('radiogroup').length).toBeGreaterThan(0);
  });

  it('offers no in-app video for songs shared more than 30 days ago (links only)', async () => {
    renderApp('/rate', {
      setup: (s) => {
        for (const song of s.songs) song.submittedOn = '2020-01-06';
      },
    });
    expect(await screen.findByText('Blinding Lights')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Play the YouTube video/ })).not.toBeInTheDocument();
  });

  it('shows Play video on results cards too', async () => {
    renderApp('/results/p1.2026-09-28', {
      setup: (s) => {
        const first = s.pastResults[0]!;
        first.submittedOn = today;
        first.song = {
          ...first.song,
          providers: [
            ...first.song.providers,
            {
              provider: 'youtube',
              providerSongId: 'dX3k_QDnzHE',
              externalUrl: 'https://www.youtube.com/watch?v=dX3k_QDnzHE',
            },
          ],
        };
      },
    });
    expect(
      await screen.findByRole('button', {
        name: /Play the YouTube video linked by the sharer for Midnight City/,
      }),
    ).toBeInTheDocument();
  });

  it('lets the sharer preview the YouTube link they typed before sharing', async () => {
    renderApp('/share', {
      setup: (s) => {
        s.songs = s.songs.filter((x) => x.recommendationId !== 'r9');
      },
    });
    await userEvent.type(await screen.findByLabelText('Search for a song, artist, or album'), 'blue sky');
    await userEvent.click(await screen.findByRole('button', { name: 'Choose Mr. Blue Sky' }));
    const dialog = await screen.findByRole('dialog', { name: 'Share this song?' });
    await userEvent.click(within(dialog).getByText('Add your Spotify or YouTube Music link (optional)'));
    await userEvent.type(
      within(dialog).getByLabelText('YouTube Music link'),
      'https://music.youtube.com/watch?v=dX3k_QDnzHE',
    );
    expect(
      within(dialog).getByRole('button', {
        name: 'Play the YouTube video linked by the sharer for Mr. Blue Sky',
      }),
    ).toBeInTheDocument();
  });
});

describe('YouTube video found automatically when sharing (ADR-0012)', () => {
  function capture(setup?: (s: ReturnType<typeof createPreviewState>) => void) {
    const state = createPreviewState();
    state.songs = state.songs.filter((x) => x.recommendationId !== 'r9');
    setup?.(state);
    const preview = createPreviewApi(state);
    const posts: { path: string; body: unknown }[] = [];
    const api: ApiClient = {
      ...preview,
      post: (path, body) => {
        posts.push({ path, body });
        return preview.post(path, body);
      },
    };
    return { api, posts };
  }

  async function chooseSong() {
    await userEvent.type(await screen.findByLabelText('Search for a song, artist, or album'), 'blue sky');
    await userEvent.click(await screen.findByRole('button', { name: 'Choose Mr. Blue Sky' }));
    return screen.findByRole('dialog', { name: 'Share this song?' });
  }

  const shared = (posts: { path: string; body: unknown }[]) =>
    posts.find((p) => p.path.endsWith('/recommendations'))?.body;

  it('picks YouTube’s first result, shows the results as YouTube gave them, and attaches the one you keep', async () => {
    const { api, posts } = capture();
    renderApp('/share', { api });
    const dialog = await chooseSong();
    const group = await within(dialog).findByRole('group', { name: 'Video from YouTube' });
    const first = within(group).getByRole('radio', { name: /Automatic embedded web player/ });
    expect(first).toBeChecked();
    expect(within(group).getByText('Sample video')).toBeInTheDocument();
    const previewButton = within(group).getByRole('button', {
      name: /Play the YouTube video linked by the sharer/,
    });
    expect(previewButton).toHaveTextContent('Preview video');
    expect(within(group).queryByText('YouTube video linked by the sharer')).not.toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Share song' }));
    await waitFor(() => expect(shared(posts)).toBeDefined());
    expect(shared(posts)).toMatchObject({
      links: { youtube: 'https://www.youtube.com/watch?v=M7lc1UVf-VE' },
      youtubeSource: 'search',
    });
  });

  it('shares without a video when you choose "No video"', async () => {
    const { api, posts } = capture();
    renderApp('/share', { api });
    const dialog = await chooseSong();
    await userEvent.click(await within(dialog).findByRole('radio', { name: 'No video' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Share song' }));
    await waitFor(() => expect(shared(posts)).toBeDefined());
    expect(shared(posts)).not.toHaveProperty('links.youtube');
    expect(shared(posts)).not.toHaveProperty('youtubeSource');
  });

  it('uses your own pasted link instead, marked as yours', async () => {
    const { api, posts } = capture();
    renderApp('/share', { api });
    const dialog = await chooseSong();
    await userEvent.click(within(dialog).getByText('Add your Spotify or YouTube Music link (optional)'));
    await userEvent.type(within(dialog).getByLabelText('YouTube Music link'), 'https://youtu.be/dX3k_QDnzHE');
    expect(within(dialog).queryByRole('group', { name: 'Video from YouTube' })).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Share song' }));
    await waitFor(() => expect(shared(posts)).toBeDefined());
    expect(shared(posts)).toMatchObject({
      links: { youtube: 'https://youtu.be/dX3k_QDnzHE' },
      youtubeSource: 'pasted',
    });
  });

  it('stays out of the way when YouTube isn’t set up, and explains when searches are used up', async () => {
    const notConfigured = capture();
    const api: ApiClient = {
      ...notConfigured.api,
      get: (path) =>
        path.startsWith('/songs/youtube')
          ? Promise.resolve({ videos: [], unavailable: 'notConfigured' } as never)
          : notConfigured.api.get(path),
    };
    const { unmount } = renderApp('/share', { api });
    const dialog = await chooseSong();
    await waitFor(() => expect(within(dialog).queryByText('Finding a video…')).not.toBeInTheDocument());
    expect(within(dialog).queryByRole('group', { name: 'Video from YouTube' })).not.toBeInTheDocument();
    unmount();

    const limited: ApiClient = {
      ...notConfigured.api,
      get: (path) =>
        path.startsWith('/songs/youtube')
          ? Promise.resolve({ videos: [], unavailable: 'dailyLimit' } as never)
          : notConfigured.api.get(path),
    };
    renderApp('/share', { api: limited });
    const second = await chooseSong();
    expect(await within(second).findByText('No more video searches today.')).toBeInTheDocument();
  });
});

describe('Song Details (P13.5)', () => {
  it('open week: shows the song, your own rating only, and keeps the sharer hidden (D9, D10)', async () => {
    const { state } = renderApp('/songs/p1.2026-10-05/r2');
    const song = state.songs.find((s) => s.recommendationId === 'r2')!;
    expect(await screen.findByRole('heading', { level: 1, name: song.song.title })).toBeInTheDocument();
    expect(screen.getByText(song.song.artist)).toBeInTheDocument();
    expect(screen.getByText(/The group’s average and ranking appear when ratings lock/)).toBeInTheDocument();
    expect(screen.queryByText(/Week result/)).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Rating distribution' })).not.toBeInTheDocument();
    expect(screen.queryByText(/· by/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to this week’s songs/ })).toHaveAttribute('href', '/rate');
  });

  it('closed week: shows the average, rank, distribution and who shared it', async () => {
    const { state } = renderApp('/songs/p1.2026-09-28/past-r1');
    const result = state.pastResults[0]!;
    expect(await screen.findByRole('heading', { level: 1, name: result.song.title })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Week result' })).toBeInTheDocument();
    expect(screen.getByText(`#${result.rank}`, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(`of ${state.pastResults.length}`)).toBeInTheDocument();
    expect(screen.getByText(`Average of ${result.ratingCount} ratings`)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Rating distribution' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to the week’s results/ })).toHaveAttribute(
      'href',
      '/results/p1.2026-09-28',
    );
  });

  it('says so when the song isn’t there', async () => {
    renderApp('/songs/p1.2026-10-05/nope');
    expect(await screen.findByRole('heading', { level: 1, name: 'Song not found' })).toBeInTheDocument();
    expect(screen.getByText('We couldn’t find that song')).toBeInTheDocument();
  });

  it('is linked from the song titles on Rate, Results and Home', async () => {
    const { unmount } = renderApp('/rate');
    expect(await screen.findByRole('link', { name: 'Midnight City' })).toHaveAttribute(
      'href',
      '/songs/p1.2026-10-05/r1',
    );
    unmount();
    const results = renderApp('/results/p1.2026-09-28');
    expect(await screen.findByRole('link', { name: 'Midnight City' })).toHaveAttribute(
      'href',
      '/songs/p1.2026-09-28/past-r1',
    );
    results.unmount();
    renderApp('/');
    expect((await screen.findAllByRole('link', { name: 'Midnight City' }))[0]).toHaveAttribute(
      'href',
      '/songs/p1.2026-10-05/r1',
    );
  });
});

describe('Settings (P13.6)', () => {
  it('lists the sections, each going to a working page', async () => {
    renderApp('/settings');
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Account/ })).toHaveAttribute('href', '/settings/account');
    expect(screen.getByRole('link', { name: /Music/ })).toHaveAttribute('href', '/settings/music');
    expect(within(screen.getByRole('main')).getByRole('link', { name: /^Party/ })).toHaveAttribute(
      'href',
      '/settings/party',
    );
    expect(screen.getByRole('link', { name: /^Privacy/ })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('link', { name: /^Help/ })).toHaveAttribute('href', '/how-it-works');
  });

  it('account: shows your email read-only and changes your password', async () => {
    const auth = signedInAuth();
    renderApp('/settings/account', { auth });
    expect(await screen.findByText('me@example.com')).toBeInTheDocument();
    expect(screen.queryByLabelText('Preferred music app')).not.toBeInTheDocument(); // that's in Music now
    await userEvent.type(screen.getByLabelText('Current password'), 'OldPass123');
    await userEvent.type(screen.getByLabelText('New password'), 'NewPass123');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'NewPass124');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The new passwords don’t match.');
    expect(auth.changePassword).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('Confirm new password'));
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'NewPass123');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(auth.changePassword).toHaveBeenCalledWith('OldPass123', 'NewPass123'));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('account: a wrong current password gets a clear message', async () => {
    const auth = signedInAuth();
    auth.changePassword = vi.fn(() =>
      Promise.reject(
        Object.assign(new Error('Incorrect username or password.'), { name: 'NotAuthorizedException' }),
      ),
    );
    renderApp('/settings/account', { auth });
    await userEvent.type(await screen.findByLabelText('Current password'), 'Wrong123');
    await userEvent.type(screen.getByLabelText('New password'), 'NewPass123');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'NewPass123');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your current password isn’t right.');
  });

  it('music: saves the preferred app and the Play videos switch, which hides Play video buttons', async () => {
    const { state, unmount } = renderApp('/settings/music');
    await userEvent.selectOptions(await screen.findByLabelText('Preferred music app'), 'spotify');
    await waitFor(() => expect(state.user.preferredProvider).toBe('spotify'));
    const toggle = screen.getByRole('switch', { name: /Play videos in Drop a Bop/ });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(toggle).not.toBeChecked(); // stays where you put it while saving
    await waitFor(() => expect(state.user.playInApp).toBe(false));
    expect(screen.getByText('Plays in the app')).toBeInTheDocument();
    unmount();

    const today = new Date().toISOString().slice(0, 10);
    renderApp('/rate', {
      setup: (s) => {
        s.user.playInApp = false;
        for (const song of s.songs) song.submittedOn = today;
      },
    });
    expect(await screen.findByText('Blinding Lights')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Play the YouTube video/ })).not.toBeInTheDocument();
  });

  it('account: a lockout after too many tries says so (not "wrong password")', async () => {
    const auth = signedInAuth();
    auth.changePassword = vi.fn(() =>
      Promise.reject(
        Object.assign(new Error('Password attempts exceeded'), { name: 'NotAuthorizedException' }),
      ),
    );
    renderApp('/settings/account', { auth });
    await userEvent.type(await screen.findByLabelText('Current password'), 'Wrong123');
    await userEvent.type(screen.getByLabelText('New password'), 'NewPass123');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'NewPass123');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
  });

  it('help explains listening in the app', async () => {
    renderApp('/how-it-works', { auth: fakeAuth() });
    expect(await screen.findByRole('heading', { name: /Listening in Drop a Bop/ })).toBeInTheDocument();
  });
});

describe('History calendar (P13.8)', () => {
  it('shows the month with marked days and the weeks, and switches to the list', async () => {
    renderApp('/history?month=2026-10');
    expect(await screen.findByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    // Days with songs are links to the Day view; their names say what's there.
    const oct5 = await screen.findByRole('link', { name: /Monday, October 5, 2026, \d+ songs?/ });
    expect(oct5).toHaveAttribute('href', '/history/day/2026-10-05');
    expect(screen.getByRole('link', { name: /Week of Sep 28/ })).toHaveAttribute(
      'href',
      '/history/week/2026-09-28',
    );
    expect(screen.getByRole('link', { name: /Week of Oct 5/ })).toHaveTextContent('ratings open');
    expect(screen.getByRole('link', { name: 'Previous month' })).toHaveAttribute(
      'href',
      '/history?month=2026-09',
    );
    expect(screen.getByText('Achievement unlocked')).toBeInTheDocument(); // the calendar legend (D31)

    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(await screen.findByText('This week · in progress')).toBeInTheDocument();
  });

  it('day view of a closed week: the numbers, Bop of the Day and the songs', async () => {
    renderApp('/history/day/2026-09-28');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Monday, September 28, 2026' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /Bop of the Day/ })).toBeInTheDocument();
    expect(screen.getByText('Your average given')).toBeInTheDocument();
    expect(screen.getByText('Songs you rated')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Midnight City/ })[0]).toHaveAttribute(
      'href',
      '/songs/p1.2026-09-28/past-r1',
    );
  });

  it('day view of the open week: counts only, results after the lock (D9)', async () => {
    renderApp('/history/day/2026-10-05');
    expect(await screen.findByText('Results after ratings lock')).toBeInTheDocument();
    expect(screen.queryByText('Your average given')).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Rating distribution' })).not.toBeInTheDocument();
  });

  it('week view with "Your week", highlights and the day-by-day list', async () => {
    renderApp('/history/week/2026-09-28');
    expect(await screen.findByRole('heading', { name: 'Your week' })).toBeInTheDocument();
    expect(screen.getByText('Your rank')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Top artists' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Monday · Sep 28/ })).toHaveAttribute(
      'href',
      '/history/day/2026-09-28',
    );
    expect(screen.getByRole('link', { name: 'Next week' })).toHaveAttribute(
      'href',
      '/history/week/2026-10-05',
    );
  });

  it('shows the lowest-rated song of a closed day', async () => {
    const { state } = renderApp('/history/day/2026-09-30');
    const wednesday = state.pastResults.filter((r) => r.weekday === 'WED');
    expect(await screen.findByRole('heading', { name: 'Lowest rated' })).toBeInTheDocument();
    expect(wednesday.length).toBeGreaterThan(1);
  });

  it('a link with an impossible date says so instead of failing', async () => {
    renderApp('/history/day/2026-13-05');
    expect(await screen.findByText('That isn’t a date')).toBeInTheDocument();
  });

  it('says so for a day without sharing', async () => {
    renderApp('/history/day/2026-10-31');
    expect(await screen.findByText('No sharing that day')).toBeInTheDocument();
  });
});

describe('Achievements (P13.9)', () => {
  it('shows how many are unlocked, grouped, with progress, and details in a dialog', async () => {
    renderApp('/achievements');
    expect(await screen.findByText(/\d+ \/ \d+ unlocked/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Taking part' })).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Achievements' })).toHaveAttribute(
      'href',
      '/achievements',
    );
    await userEvent.click(screen.getByRole('button', { name: /10 Weeks: 2 of 10 weeks/ }));
    const dialog = await screen.findByRole('dialog', { name: '10 Weeks' });
    expect(within(dialog).getByText('2 of 10 weeks')).toBeInTheDocument();
    expect(within(dialog).getByText('Take part in 10 weeks.')).toBeInTheDocument();
  });

  it('opening the page marks new ones as seen', async () => {
    const { state } = renderApp('/achievements');
    expect(await screen.findByText(/\d+ \/ \d+ unlocked/)).toBeInTheDocument();
    await waitFor(() => expect(state.achievementsSeenAt).not.toBe('2026-10-01T00:00:00.000Z'));
  });

  it('home shows a quiet "Achievement unlocked" banner that can be dismissed', async () => {
    const { state } = renderApp('/');
    const banner = await screen.findByRole('status', { name: 'Achievement unlocked' });
    expect(within(banner).getByText(/and \d+ more/)).toBeInTheDocument();
    expect(within(banner).getByRole('link', { name: 'View' })).toHaveAttribute('href', '/achievements');
    await userEvent.click(within(banner).getByRole('button', { name: 'Dismiss' }));
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: 'Achievement unlocked' })).not.toBeInTheDocument(),
    );
    expect(state.achievementsSeenAt).not.toBe('2026-10-01T00:00:00.000Z');
  });

  it('never interrupts rating (no banner on Rate)', async () => {
    renderApp('/rate');
    expect(await screen.findByText('Blinding Lights')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Achievement unlocked' })).not.toBeInTheDocument();
  });

  it('the first visit announces nothing old, and just records "seen"', async () => {
    const { state } = renderApp('/', {
      setup: (s) => {
        s.achievementsSeenAt = null;
      },
    });
    expect(await screen.findByText('Wednesday · Day 3 of 5')).toBeInTheDocument();
    await waitFor(() => expect(state.achievementsSeenAt).not.toBeNull());
    expect(screen.queryByRole('status', { name: 'Achievement unlocked' })).not.toBeInTheDocument();
  });
});

describe('Notifications (P13.10)', () => {
  it('the bell shows how many are unread', async () => {
    renderApp('/');
    const bells = await screen.findAllByRole('link', { name: /Notifications, \d+ unread/ });
    expect(bells[0]).toHaveAttribute('href', '/notifications');
  });

  it('the list shows this week’s news and recent achievements, and opening it marks them read', async () => {
    const { state } = renderApp('/notifications');
    expect(await screen.findByRole('link', { name: /songs are waiting for your rating/ })).toHaveAttribute(
      'href',
      '/rate?show=unrated',
    );
    expect(screen.getByRole('link', { name: /Weekly results are ready/ })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Achievement unlocked: Top Bop/ })).toHaveAttribute(
      'href',
      '/achievements',
    );
    expect(screen.getAllByText('(new)').length).toBeGreaterThan(0); // still shown as new on this visit
    await waitFor(() => expect(state.notificationsSeenAt).not.toBeNull());
  });

  it('settings switches turn types off, and the list leaves them out', async () => {
    const { state, unmount } = renderApp('/settings/notifications');
    const results = await screen.findByRole('switch', { name: /Weekly results/ });
    expect(results).toBeChecked();
    await userEvent.click(results);
    expect(results).not.toBeChecked();
    await waitFor(() => expect(state.user.notificationPrefs?.results).toBe(false));
    expect(screen.getByText(/never sends push notifications or emails/)).toBeInTheDocument();
    unmount();

    renderApp('/notifications', {
      setup: (s) => {
        s.user.notificationPrefs = { results: false, achievements: false };
      },
    });
    expect(
      await screen.findByRole('link', { name: /songs are waiting for your rating/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Weekly results are ready/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Achievement unlocked/ })).not.toBeInTheDocument();
  });

  it('the achievement banner respects the switch', async () => {
    renderApp('/', {
      setup: (s) => {
        s.user.notificationPrefs = { achievements: false };
      },
    });
    expect(await screen.findByText('Wednesday · Day 3 of 5')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Achievement unlocked' })).not.toBeInTheDocument();
  });
});

describe('Search (P13.12, D33)', () => {
  it('finds songs in this party; an open week’s song hides who shared it (D10)', async () => {
    renderApp('/search');
    expect(await screen.findByText(/Type at least 2 characters/)).toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText('Search your party'), 'good 4');
    const songs = (await screen.findByRole('heading', { name: 'Songs' })).closest('div')!;
    const links = await within(songs).findAllByRole('link', { name: 'Good 4 U' });
    expect(links).toHaveLength(2);
    expect(within(songs).getByText(/Sharer revealed with the results · this week/)).toBeInTheDocument();
    expect(within(songs).getByText(/Shared by Sarah Kim/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/search'));
  });

  it('switches category, keeps it in the address, and shows counts', async () => {
    renderApp('/search?q=sarah');
    const members = await screen.findByRole('button', { name: /Members\s*1/ });
    await userEvent.click(members);
    expect(members).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Sarah Kim')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Songs' })).not.toBeInTheDocument();
  });

  it('finds a week by its date and links to it', async () => {
    renderApp('/search?q=2026-09-28');
    const link = await screen.findByRole('link', { name: /Week of Sep 28/ });
    expect(link).toHaveAttribute('href', '/history/week/2026-09-28');
  });

  it('says so when nothing matches', async () => {
    renderApp('/search?q=zzzz');
    expect(await screen.findByText('No matches')).toBeInTheDocument();
  });
});

describe('Navigation (P13.13, D32)', () => {
  const linkNames = (nav: HTMLElement) =>
    within(nav)
      .getAllByRole('link')
      .map((l) => l.textContent?.trim());

  it('desktop sidebar and mobile bar follow D32', async () => {
    renderApp('/');
    await screen.findByText('Wednesday · Day 3 of 5');
    const [sidebar, bar] = screen.getAllByRole('navigation', { name: 'Main' });
    expect(linkNames(sidebar!)).toEqual([
      'Home',
      'Today’s Drop',
      'History',
      'Stats',
      'Leaderboard',
      'Achievements',
      'Search',
      'Saved songs',
      'Party',
      'Members',
      'Settings',
    ]);
    expect(linkNames(bar!)).toEqual(['Home', 'Drop', 'History', 'Stats', 'Profile']);
    // Bell, search and settings sit in the mobile header.
    // The header's icon links carry an aria-label (the sidebar's use visible text).
    const iconLink = (name: string) =>
      screen.getAllByRole('link', { name }).find((l) => l.getAttribute('aria-label') === name);
    expect(iconLink('Search')).toHaveAttribute('href', '/search');
    expect(iconLink('Settings')).toHaveAttribute('href', '/settings');
    expect(within(sidebar!).getByRole('link', { name: 'Members' })).toHaveAttribute(
      'href',
      '/settings/party#members',
    );
  });

  it('Drop is a hub: Share · Rate · Results tabs, and Drop stays highlighted on each', async () => {
    renderApp('/rate');
    const tabs = await screen.findByRole('navigation', { name: 'Today’s drop' });
    expect(linkNames(tabs)).toEqual(['Share', 'Rate', 'Results']);
    expect(within(tabs).getByRole('link', { name: 'Rate' })).toHaveAttribute('aria-current', 'page');
    const [sidebar, bar] = screen.getAllByRole('navigation', { name: 'Main' });
    expect(within(sidebar!).getByRole('link', { name: 'Today’s Drop' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(bar!).getByRole('link', { name: 'Drop' })).toHaveAttribute('aria-current', 'page');
    await userEvent.click(within(tabs).getByRole('link', { name: 'Results' }));
    expect(screen.getByTestId('path')).toHaveTextContent('/results');
  });

  it('/drop opens the tab that fits: Share if you haven’t shared today, otherwise Rate', async () => {
    renderApp('/drop');
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(/^\/rate$/));
    renderApp('/drop', {
      setup: (s) => {
        s.songs = s.songs.filter((x) => x.recommendationId !== 'r9');
      },
    });
    await waitFor(() =>
      expect(screen.getAllByTestId('path').some((p) => p.textContent === '/share')).toBe(true),
    );
  });
});

describe('Saved songs (P14.2, D34)', () => {
  it('Save on a Rate card adds the song; the list shows the party, not who shared it while the week is open', async () => {
    const { state } = renderApp('/rate');
    const save = await screen.findByRole('button', { name: 'Save Heat Waves to your saved songs' });
    expect(save).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(save);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remove Heat Waves from your saved songs' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(state.saved).toHaveLength(1);
    expect(JSON.stringify(state.saved)).not.toContain('youtubeMusic');

    cleanup(); // one app on the page at a time
    renderApp('/saved', { setup: (s) => (s.saved = state.saved) });
    const row = (await screen.findByText('Heat Waves')).closest('li')!;
    expect(within(row).getByText(/From Ethan’s Music Party/)).toBeInTheDocument();
    expect(within(row).queryByText(/shared by/)).not.toBeInTheDocument();
  });

  it('after a week ends, a saved song says who shared it', async () => {
    const { state } = renderApp('/results/p1.2026-09-28');
    await userEvent.click(await screen.findByRole('button', { name: 'Save Good 4 U to your saved songs' }));
    await waitFor(() => expect(state.saved).toHaveLength(1));
    expect(state.saved[0]?.from.sharedBy?.displayName).toBe('Sarah Kim');
  });

  it('removing offers Undo, which saves it again', async () => {
    const { state } = renderApp('/rate');
    await userEvent.click(await screen.findByRole('button', { name: 'Save Heat Waves to your saved songs' }));
    await waitFor(() => expect(state.saved).toHaveLength(1));
    const saved = state.saved;
    cleanup(); // one app on the page at a time
    const { state: listState } = renderApp('/saved', { setup: (s) => (s.saved = saved) });
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Heat Waves from your saved songs' }),
    );
    expect(await screen.findByText(/^Removed/)).toBeInTheDocument();
    await waitFor(() => expect(listState.saved).toHaveLength(0));
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(listState.saved).toHaveLength(1));
  });

  it('shows an empty state, and says when the list is full', async () => {
    renderApp('/saved');
    expect(await screen.findByText('No saved songs yet')).toBeInTheDocument();
    cleanup();

    renderApp('/rate', {
      setup: (s) => {
        const one = {
          trackId: 'x',
          savedAt: '2026-10-01T00:00:00.000Z',
          song: s.songs[0]!.song,
          from: {
            partyId: 'p1',
            partyName: 'Ethan’s Music Party',
            roundId: 'p1.2026-10-05',
            recommendationId: 'r1',
            submittedOn: '2026-10-05',
            isMember: true,
            isMine: true,
          },
        };
        s.saved = Array.from({ length: 500 }, (_, i) => ({ ...one, trackId: `t${i}` }));
      },
    });
    const save = (await screen.findAllByRole('button', { name: 'Save Heat Waves to your saved songs' })).at(
      -1,
    )!;
    await userEvent.click(save);
    expect(await screen.findByText('Your saved songs list is full (500).')).toBeInTheDocument();
  });
});

describe('Scoring key (P15.2, D37)', () => {
  const custom = [
    'Unlistenable',
    'Painful',
    'Awful',
    'Bad',
    'Below average',
    'Middle of the road',
    'Above average',
    'Good',
    'Great',
    'Excellent',
    'Absolute anthem',
  ];
  const withKey = (s: { parties: { settings: { scoringKey?: string[] } }[] }) => {
    s.parties[0]!.settings.scoringKey = custom;
  };

  it('Rate shows “How to score” open the first time, then remembers it closed', async () => {
    window.localStorage.clear();
    renderApp('/rate', { setup: withKey });
    const toggle = await screen.findByRole('button', { name: 'How to score' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Absolute anthem')).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    cleanup();
    renderApp('/rate', { setup: withKey });
    expect(await screen.findByRole('button', { name: 'How to score' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    window.localStorage.clear();
  });

  it('shows the chosen score’s meaning under the picker, and reads it with the picker', async () => {
    renderApp('/rate', { setup: withKey });
    const picker = await screen.findByRole('radiogroup', { name: /Rate Heat Waves/ });
    await userEvent.click(within(picker).getByRole('radio', { name: '8 out of 10' }));
    const id = picker.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    await waitFor(() => expect(document.getElementById(id!)).toHaveTextContent('8: Great'));
  });

  it('the host edits the key in Party settings, and can reset it to the default', async () => {
    const { state } = renderApp('/settings/party');
    const ten = await screen.findByLabelText('What does a 10 mean?');
    await userEvent.clear(ten);
    await userEvent.type(ten, 'Absolute anthem');
    await userEvent.click(screen.getByRole('button', { name: 'Save scoring key' }));
    await waitFor(() => expect(state.parties[0]?.settings.scoringKey?.[10]).toBe('Absolute anthem'));
    await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(screen.getByLabelText('What does a 10 mean?')).toHaveValue('Instant favorite');
  });

  it('members see the key but can’t edit it', async () => {
    renderApp('/settings/party', {
      setup: (s) => {
        withKey(s);
        s.parties[0]!.hostUserId = 'u2';
        s.members[0]!.role = 'member';
        s.members[1]!.role = 'host';
      },
    });
    expect(await screen.findByText('Absolute anthem')).toBeInTheDocument();
    expect(screen.queryByLabelText('What does a 10 mean?')).not.toBeInTheDocument();
  });

  it('How it works shows your party’s key when signed in, and the default when signed out', async () => {
    renderApp('/how-it-works', { setup: withKey });
    expect(await screen.findByText('Absolute anthem')).toBeInTheDocument();
    cleanup();
    renderApp('/how-it-works', { auth: fakeAuth() });
    expect(await screen.findByText('Instant favorite')).toBeInTheDocument();
  });
});
