// Privacy policy and terms of use (P13.2a). Public, because people must be able to read it before agreeing at
// sign-up, and YouTube requires it to be reachable at all times (ADR-0011).
// The text is the "shown in the app" part of docs/PRIVACY.md: change both together, and bump
// PRIVACY_POLICY_VERSION when users should be asked to agree again.

import { PRIVACY_POLICY_VERSION } from '@dropabop/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Logo, buttonClassName } from '../components/ui';

export const PRIVACY_CONTACT_EMAIL = 'droppa.bop@gmail.com';
export const YOUTUBE_TERMS_URL = 'https://www.youtube.com/t/terms';
export const GOOGLE_PRIVACY_URL = 'https://www.google.com/policies/privacy';

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-blue hover:underline"
    >
      {children}
    </a>
  );
}

const SECTIONS: { title: string; body: ReactNode }[] = [
  {
    title: 'What we collect and why',
    body: (
      <ul className="flex list-disc flex-col gap-2 pl-5">
        <li>
          <strong className="text-ink">Your email and password</strong>, to sign you in. They’re kept by
          Amazon Cognito (AWS’s sign-in service). Your password is never sent to us; only a protected form is
          stored. Your email isn’t shown to anyone.
        </li>
        <li>
          <strong className="text-ink">Your display name, avatar colour and optional profile picture</strong>,
          so your party knows who you are. A profile picture is shrunk to a small copy in your browser before
          it’s uploaded; the original never leaves your device.
        </li>
        <li>
          <strong className="text-ink">Your settings</strong>: preferred music app, whether videos play in
          Drop a Bop, notification choices, and when you agreed to this policy.
        </li>
        <li>
          <strong className="text-ink">What you do in a party</strong>: the parties you belong to, the songs
          you share (with any links you paste), your ratings and your comments. Your party uses these for
          results and stats.
        </li>
        <li>
          <strong className="text-ink">Basic request logs</strong>: time, which feature was used, whether it
          worked, and a random user id (not your email). Kept for 30 days. Never your password or sign-in
          tokens.
        </li>
        <li>
          We don’t collect your location, contacts, or listening history from any music service, and we don’t
          use advertising or analytics trackers.
        </li>
      </ul>
    ),
  },
  {
    title: 'Who can see it',
    body: (
      <p>
        Only members of your parties see your name, picture, shared songs, comments, achievements and stats.
        Ratings stay hidden until the week’s ratings lock, and after that individual ratings are shown only if
        your party’s host turned that on. Nobody outside your parties can see anything.
      </p>
    ),
  },
  {
    title: 'Services we use',
    body: (
      <ul className="flex list-disc flex-col gap-2 pl-5">
        <li>
          <strong className="text-ink">Amazon Web Services</strong> (sign-in, database, servers) and,
          currently, <strong className="text-ink">Cloudflare Pages</strong> (delivers the website) process
          data to run the app.
        </li>
        <li>
          <strong className="text-ink">Apple (iTunes Search and album art).</strong> When you search for a
          song, our server sends the search words to Apple. Album artwork is loaded by your browser straight
          from Apple’s servers, which (like any website) see your IP address and browser type.
        </li>
        <li>
          <strong className="text-ink">YouTube.</strong> Drop a Bop uses YouTube API Services to find and play
          videos for shared songs. When you choose a song to share, our server asks YouTube for matching
          videos, sending only the song’s artist and title. Videos kept with a song are forgotten 29 days
          after it was shared. In your browser, nothing is loaded from YouTube until you press Play. Once a
          video loads, YouTube may set cookies and collect data about the playback, as it does on any site
          with a YouTube video. That’s covered by the{' '}
          <External href={YOUTUBE_TERMS_URL}>YouTube Terms of Service</External> and the{' '}
          <External href={GOOGLE_PRIVACY_URL}>Google Privacy Policy</External>. You can switch in-app videos
          off in Settings → Music and use links instead.
        </li>
        <li>
          Links to Apple Music, Spotify and YouTube Music open those services, which have their own privacy
          policies.
        </li>
        <li>
          We don’t sell or share your data with anyone else, and we don’t connect to your music accounts.
        </li>
      </ul>
    ),
  },
  {
    title: 'Cookies and storage',
    body: (
      <p>
        Drop a Bop itself doesn’t use cookies. Your browser stores your sign-in session and a few app
        preferences (like the party you last opened, or an invite link you’re in the middle of using) in its
        local and session storage. YouTube’s player may set its own cookies when you play a video.
      </p>
    ),
  },
  {
    title: 'Your choices',
    body: (
      <ul className="flex list-disc flex-col gap-2 pl-5">
        <li>Change your name, picture and settings any time.</li>
        <li>
          Leave a party any time, unless you’re its host (your past songs and ratings stay in that party’s
          history, so its results stay correct).
        </li>
      </ul>
    ),
  },
  {
    title: 'Terms of use',
    body: (
      <>
        <p>
          Drop a Bop is a free, private app for friends, provided as is. Be kind in comments and only share
          links to real music. The host of a party can remove members and comments.
        </p>
        <p>
          <strong className="text-ink">YouTube:</strong> Drop a Bop’s video player uses YouTube API Services.
          By using Drop a Bop, you agree to be bound by the{' '}
          <External href={YOUTUBE_TERMS_URL}>YouTube Terms of Service</External>.
        </p>
      </>
    ),
  },
  {
    title: 'Contact',
    body: (
      <p>
        Questions or complaints about privacy:{' '}
        <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="font-semibold text-blue hover:underline">
          {PRIVACY_CONTACT_EMAIL}
        </a>
        .
      </p>
    ),
  },
];

function PrivacyPolicyText() {
  return (
    <div className="flex flex-col gap-4">
      {SECTIONS.map((section) => (
        <section
          key={section.title}
          className="card-glow rounded-[var(--radius-card)] border border-line bg-surface p-5"
        >
          <h2 className="text-lg font-bold">{section.title}</h2>
          <div className="mt-2 flex flex-col gap-2 text-muted">{section.body}</div>
        </section>
      ))}
    </div>
  );
}

export function PrivacyScreen() {
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
        <h1 className="text-3xl font-bold">Privacy policy and terms</h1>
        <p className="mt-2 text-muted">
          Drop a Bop is a small, private, invite-only app where a group of friends share songs and rate each
          other’s picks. It’s run by one person for a small group; it isn’t a company and doesn’t sell
          anything.
        </p>
        <p className="mt-1 text-sm text-muted">Version {PRIVACY_POLICY_VERSION}</p>
        <div className="mt-8">
          <PrivacyPolicyText />
        </div>
      </main>
    </div>
  );
}
