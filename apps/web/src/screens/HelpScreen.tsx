// "How Drop a Bop works" (Ethan, 2026-10-04): a plain-language guide for friends who've just been sent an invite.
// Public, so it can be read before signing up; every rule here matches docs/PRODUCT_DECISIONS.md (D1–D19).

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Logo, buttonClassName } from '../components/ui';

const SECTIONS: { title: string; body: ReactNode }[] = [
  {
    title: 'Join a party',
    body: (
      <>
        <p>
          A party is a private group of friends, up to 20 people unless the host changes it. You need an
          invite: open the link a friend sent you, or enter their code (it looks like SONG-7K4P) after signing
          up.
        </p>
        <p>You can be in up to 5 parties at once, and switch between them from the menu.</p>
      </>
    ),
  },
  {
    title: 'Share one song each sharing day',
    body: (
      <>
        <p>
          Every party has sharing days: Monday to Friday unless the host picks others. On each one you can
          share one song. Search for it, or paste a link from Apple Music, Spotify or YouTube Music.
        </p>
        <p>
          Choose carefully: a shared song can’t be changed. Skipping a day is fine, but a missed day can’t be
          filled in later. Joined partway through the week? Share on the days that are left.
        </p>
      </>
    ),
  },
  {
    title: 'Listen and rate',
    body: (
      <>
        <p>
          Every song has links to play it in Apple Music, Spotify and YouTube Music. Pick your favourite app
          in your profile and its link comes first.
        </p>
        <p>
          Rate everyone else’s songs from 1 to 10, any time until ratings lock (Sunday 11:59 pm unless the
          host changes it). You can change a rating until then. You don’t rate your own songs, and you don’t
          have to rate every song.
        </p>
        <p>
          While the week is running, songs are anonymous and nobody can see anyone’s ratings, so nobody is
          swayed by who shared what or how others voted. (A host can choose to show who shared each song
          during the week.)
        </p>
      </>
    ),
  },
  {
    title: 'See the results',
    body: (
      <>
        <p>
          When ratings lock, the week’s results come out: every song ranked by its average rating, the Bop of
          the Day for each sharing day, how the ratings were spread, and your rating next to the group’s.
          That’s also when you find out who shared each song.
        </p>
        <p>A week needs at least 2 songs to have results.</p>
      </>
    ),
  },
  {
    title: 'Stats and leaderboards',
    body: (
      <p>
        After a few weeks, your stats show your taste: your average rating, who you agree with most, and how
        the group rates your picks. Leaderboards compare everyone. Each one says how much it’s based on, and
        shows “Not enough data yet” until there’s enough.
      </p>
    ),
  },
  {
    title: 'Your privacy',
    body: (
      <p>
        Drop a Bop keeps only what it needs: your email (just for signing in), your display name, your avatar
        colour or optional profile picture, and your preferred music app. Only people in your parties see your
        name and picture. You can leave a party any time; songs and ratings you already gave stay in that
        party’s history.
      </p>
    ),
  },
];

export function HelpScreen() {
  const { status } = useAuth();
  const signedIn = status === 'signedIn';

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-4 py-4 md:px-10">
        <Link to={signedIn ? '/' : '/welcome'} aria-label="Drop a Bop home">
          <Logo />
        </Link>
        <Link to={signedIn ? '/' : '/welcome'} className={buttonClassName('ghost', 'px-3 text-ink')}>
          {signedIn ? 'Back to the app' : 'Back'}
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-4 pb-16">
        <h1 className="text-3xl font-bold">How Drop a Bop works</h1>
        <p className="mt-2 text-lg text-muted">One song a day. One group. Endless good vibes.</p>

        <ol className="mt-8 flex flex-col gap-4">
          {SECTIONS.map((section, index) => (
            <li
              key={section.title}
              className="card-glow rounded-[var(--radius-card)] border border-line bg-surface p-5"
            >
              <h2 className="flex items-center gap-3 text-lg font-bold">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-active text-sm font-bold text-primary">
                  {index + 1}
                </span>
                {section.title}
              </h2>
              <div className="mt-2 flex flex-col gap-2 text-muted">{section.body}</div>
            </li>
          ))}
        </ol>

        {!signedIn && (
          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <Link to="/sign-up" className={buttonClassName('primary', 'w-full max-w-xs py-3')}>
              Get started
            </Link>
            <p className="text-sm text-muted">
              Already have an account?{' '}
              <Link to="/sign-in" className="font-semibold text-blue hover:underline">
                Log in
              </Link>
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
