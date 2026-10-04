// Screen tests (roadmap Phase 8): each screen against the in-memory preview API, checking the behaviour the roadmap
// and PRODUCT_DECISIONS ask for, plus loading/empty/error states.

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/client';
import { createPreviewApi, createPreviewState } from '../preview/preview-api';
import { fakeAuth, renderApp } from '../test/render-app';

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
          : Promise.resolve({
              user: {
                userId: 'me',
                displayName: 'Ethan',
                avatarColor: '#3B82F6',
                preferredProvider: null,
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

describe('Weekly results and history (P8.6, P8.7)', () => {
  it('shows the latest finished week: Bop of the Day and the ranking', async () => {
    renderApp('/results');
    expect(await screen.findByRole('heading', { name: 'Week complete!' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Bop of the Day/ })).toBeInTheDocument();
    expect(screen.getAllByLabelText('Rank 1').length).toBeGreaterThan(0);
    expect(screen.getByText(/This week’s unlock Sunday 11:59 pm/)).toBeInTheDocument();
  });

  it('switches to the per-day view and shows a rating spread', async () => {
    renderApp('/results/p1.2026-09-28');
    await userEvent.click(await screen.findByRole('button', { name: 'By day' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Details' })[0] as HTMLElement);
    expect(screen.getByRole('list', { name: 'Rating distribution' })).toBeInTheDocument();
  });

  it('explains that the current week’s results aren’t ready', async () => {
    renderApp('/results/p1.2026-10-05');
    expect(await screen.findByText('Not ready yet')).toBeInTheDocument();
    expect(screen.getByText(/unlock when this week’s ratings lock/)).toBeInTheDocument();
  });

  it('lists past weeks, linking finished ones to their results', async () => {
    renderApp('/history');
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
    expect(screen.getAllByLabelText(/How it’s calculated/).length).toBeGreaterThan(5);
  });

  it('ranks people, with "Based on N" on every row', async () => {
    renderApp('/leaderboard');
    expect(
      await screen.findByRole('heading', { name: 'Highest average recommendation score' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Based on \d+ songs/).length).toBeGreaterThan(0);
    expect(screen.getByText('Nobody has enough data for this one yet.')).toBeInTheDocument(); // Most surprising
  });
});

describe('Party settings and profile (P8.10, P8.11)', () => {
  it('lets the host change settings and explains the timezone', async () => {
    const { state } = renderApp('/settings');
    expect(await screen.findByText(/days run midnight to midnight in/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: /Show who rated what/ }));
    await waitFor(() => expect(state.parties[0]?.settings.showWhoRatedWhat).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Pause the party' }));
    await waitFor(() => expect(state.parties[0]?.settings.paused).toBe(true));
  });

  it('lets the host choose the sharing days and when ratings lock (D1, D2)', async () => {
    const { state } = renderApp('/settings');
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Friday' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Saturday' }));
    await userEvent.selectOptions(screen.getByLabelText('Ratings lock on'), 'Saturday');
    const time = screen.getByLabelText('At');
    await userEvent.clear(time);
    await userEvent.type(time, '21:00');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(state.parties[0]?.settings).toMatchObject({
        shareDays: ['MON', 'TUE', 'WED', 'THU', 'SAT'],
        ratingCloseDay: 'SAT',
        ratingCloseTime: '21:00',
      }),
    );
  });

  it('won’t let ratings lock before the last sharing day', async () => {
    const { state } = renderApp('/settings');
    await userEvent.selectOptions(await screen.findByLabelText('Ratings lock on'), 'Wednesday');
    expect(screen.getByRole('alert')).toHaveTextContent('Ratings can’t lock before the last sharing day');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(state.parties[0]?.settings.ratingCloseDay).toBe('SUN');
  });

  it('shows members the schedule without letting them change it', async () => {
    renderApp('/settings', {
      setup: (s) => {
        s.parties[0]!.hostUserId = 'someone-else';
        s.members = s.members.map((m, i) => (i === 0 ? { ...m, role: 'member' } : m));
      },
    });
    expect(await screen.findByRole('checkbox', { name: 'Monday' })).toBeDisabled();
    expect(screen.getByLabelText('Ratings lock on')).toBeDisabled();
  });

  it('after removing someone, offers a new invite link (D17)', async () => {
    const { state } = renderApp('/settings');
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
    renderApp('/settings', {
      setup: (s) => {
        s.parties[0]!.hostUserId = 'u2';
        s.members[0]!.role = 'member';
        s.members[1]!.role = 'host';
      },
    });
    expect(await screen.findByText('Only the host can change these settings.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Show who rated what/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument();
  });

  it('lets a member leave the party and takes them home', async () => {
    const { state } = renderApp('/settings', {
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

  it('saves your name, colour, and preferred music app (D22)', async () => {
    const { state } = renderApp('/profile');
    const name = await screen.findByLabelText('Display name');
    await userEvent.clear(name);
    await userEvent.type(name, 'E');
    await userEvent.click(screen.getByLabelText('Color #22C55E'));
    await userEvent.selectOptions(screen.getByLabelText('Preferred music app'), 'spotify');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(state.user).toMatchObject({
      displayName: 'E',
      avatarColor: '#22C55E',
      preferredProvider: 'spotify',
    });
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
