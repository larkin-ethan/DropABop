// Landing / Welcome (spec §19 screen 1, §27; mockup screen 1, adapted to the weekly flow: docs/design/README.md).
// The first thing signed-out visitors see at "/". Static: no data to load, so no loading or error states.

import { Link } from 'react-router';
import { Logo, buttonClassName } from '../components/ui';

/** The weekly flow in plain words (spec §27: explain without overwhelming). */
const STEPS: { title: string; text: string }[] = [
  { title: 'Join a party', text: 'Use the invite link or code a friend sends you. Parties are private.' },
  { title: 'Drop a bop every weekday', text: 'Monday to Friday, share one song you love.' },
  {
    title: 'Listen and rate',
    text: 'Rate everyone else’s songs from 1 to 10 any time before Sunday night. Songs are anonymous by default.',
  },
  {
    title: 'See the results',
    text: 'When the week ends, the ratings are revealed: the week’s ranking, each day’s Bop of the Day, and your stats.',
  },
];

/** Night sky with mountains, like the mockup's hero illustration. Decorative only. */
function NightSky() {
  return (
    <svg
      className="absolute inset-0 size-full"
      viewBox="0 0 1200 800"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="landing-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a1660" />
          <stop offset="0.55" stopColor="#123a7a" />
          <stop offset="1" stopColor="#011420" />
        </linearGradient>
      </defs>
      <rect width="1200" height="800" fill="url(#landing-sky)" />
      {[
        [90, 80],
        [260, 150],
        [410, 60],
        [620, 120],
        [780, 50],
        [930, 140],
        [1100, 90],
        [180, 260],
        [1020, 250],
        [520, 220],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill="#e6f1ff" opacity="0.7" />
      ))}
      <path
        d="M0 620 L180 430 L330 560 L520 380 L700 560 L880 420 L1050 560 L1200 470 L1200 800 L0 800 Z"
        fill="#1b2f6b"
        opacity="0.8"
      />
      <path
        d="M0 700 L220 540 L400 660 L600 520 L800 680 L980 560 L1200 680 L1200 800 L0 800 Z"
        fill="#0b2148"
      />
      <rect y="720" width="1200" height="80" fill="#011420" />
    </svg>
  );
}

export function LandingScreen() {
  return (
    <div className="min-h-screen">
      <section className="relative flex min-h-[88vh] flex-col overflow-hidden">
        <NightSky />
        <header className="relative flex items-center justify-between px-4 py-4 md:px-10">
          <Logo />
          <nav aria-label="Account" className="flex items-center gap-2">
            <Link to="/sign-in" className={buttonClassName('ghost', 'px-3 text-ink')}>
              Log in
            </Link>
            <Link to="/sign-up" className={buttonClassName('secondary', 'hidden sm:inline-flex')}>
              Sign up
            </Link>
          </nav>
        </header>

        <div className="relative flex flex-1 flex-col items-center justify-center px-4 pb-16 text-center">
          <span className="inline-flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-purple to-blue text-white shadow-2xl shadow-purple/40">
            <svg viewBox="0 0 24 24" className="size-9" fill="currentColor" aria-hidden="true">
              <path d="M9 18V6l11-2v12a3 3 0 1 1-2-2.8V7.3l-7 1.3V18a3 3 0 1 1-2-2.8" />
            </svg>
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">Drop a Bop</h1>
          <p className="mt-3 text-lg text-ink/90">One song a day. One group. Endless good vibes.</p>
          <p className="mt-4 max-w-md text-muted">
            Every weekday, everyone in your party shares a song. Rate each other’s picks all week, then see
            what the group loved most when the week ends.
          </p>
          <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
            <Link to="/sign-up" className={buttonClassName('primary', 'py-3')}>
              Get started
            </Link>
            <a href="#how-it-works" className={buttonClassName('ghost', 'text-ink')}>
              Learn more
            </a>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-4xl px-4 py-14 md:px-8">
        <h2 className="text-center text-2xl font-bold">How it works</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="card-glow rounded-[var(--radius-card)] border border-line bg-surface p-5"
            >
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-active text-sm font-bold text-blue">
                {index + 1}
              </span>
              <h3 className="mt-3 font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-center text-sm text-muted">
          Already have an account?{' '}
          <Link to="/sign-in" className="font-semibold text-blue hover:underline">
            Log in
          </Link>
        </p>
      </section>
    </div>
  );
}
