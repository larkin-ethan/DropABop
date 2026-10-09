// Settings (spec v2 §9, §29; roadmap P13.6): a short list of sections, then Account and Music pages. Only controls
// that work are shown (§29). Notification choices arrive with notifications themselves (P13.10); who sees ratings
// and sharers are party settings (D10, D11), so Privacy points there.

import { MUSIC_PROVIDERS, wantsInAppVideos, type MusicProviderId, type User } from '@dropabop/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useMe, useUpdateProfile } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { friendlyAuthError } from '../auth/auth-errors';
import { Icon, type IconName } from '../components/Icon';
import { PageHeader, QueryBoundary } from '../components/Page';
import { TextField } from '../components/TextField';
import { Button, Card } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { PROVIDER_NAMES } from '../lib/music-links';
import { PRIVACY_CONTACT_EMAIL } from './PrivacyScreen';
import { Alert, ProfileForm, Saved, Toggle } from './SettingsScreens';

// ---------------------------------------------------------------------------------------------------------------
// The hub
// ---------------------------------------------------------------------------------------------------------------

interface Section {
  to: string;
  icon: IconName;
  title: string;
  description: string;
}

const SECTIONS: Section[] = [
  {
    to: '/settings/account',
    icon: 'user',
    title: 'Account',
    description: 'Name, picture, email and password',
  },
  { to: '/settings/music', icon: 'music', title: 'Music', description: 'Preferred app and in-app videos' },
  {
    to: '/settings/notifications',
    icon: 'bell',
    title: 'Notifications',
    description: 'What shows up under the bell',
  },
  { to: '/settings/party', icon: 'users', title: 'Party', description: 'Invites, members, days and privacy' },
  { to: '/privacy', icon: 'check', title: 'Privacy', description: 'What we keep and who sees it' },
  { to: '/how-it-works', icon: 'list', title: 'Help', description: 'How Drop a Bop works' },
];

export function SettingsHubScreen() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Settings" />
      <Card>
        <ul className="flex flex-col">
          {SECTIONS.map((section) => (
            <li key={section.to} className="border-b border-line last:border-b-0">
              <Link
                to={section.to}
                className="flex items-center gap-3 rounded-lg px-1 py-3 transition hover:bg-surface-raised"
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-active text-primary">
                  <Icon name={section.icon} className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{section.title}</span>
                  <span className="block text-sm text-muted">{section.description}</span>
                </span>
                <Icon name="chevronDown" className="size-4 -rotate-90 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Drop a Bop · Questions:{' '}
        <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`} className="text-blue hover:underline">
          {PRIVACY_CONTACT_EMAIL}
        </a>
      </p>
    </div>
  );
}

function BackToSettings() {
  return (
    <Link
      to="/settings"
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue hover:underline"
    >
      <Icon name="arrowLeft" className="size-4" /> Settings
    </Link>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------------------------------------------

export function AccountSettingsScreen() {
  const me = useMe();
  return (
    <div className="mx-auto max-w-xl">
      <BackToSettings />
      <PageHeader title="Account" />
      <div className="flex flex-col gap-5">
        <QueryBoundary isPending={me.isPending} error={me.error} onRetry={() => void me.refetch()}>
          {() => (me.data ? <ProfileForm user={me.data.user} showPreferredApp={false} /> : null)}
        </QueryBoundary>
        <EmailCard />
        <ChangePasswordCard />
      </div>
    </div>
  );
}

function EmailCard() {
  const { service } = useAuth();
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let current = true;
    void service.getEmail().then((value) => current && setEmail(value));
    return () => {
      current = false;
    };
  }, [service]);
  return (
    <Card>
      <h2 className="font-semibold">Email</h2>
      <p className="mt-1 text-muted">
        {email === undefined ? 'Loading…' : (email ?? 'Not available right now.')}
      </p>
      <p className="mt-1 text-xs text-muted">Used only to sign in. Nobody else sees it.</p>
    </Card>
  );
}

function ChangePasswordCard() {
  const { service } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    if (next !== confirm) {
      setError('The new passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await service.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setSaved(true);
    } catch (caught) {
      // Here "not authorized" means the current password was wrong, not the email/password pair at sign-in.
      // Cognito's lockout after too many tries arrives the same way; friendlyAuthError explains that one.
      const name =
        typeof caught === 'object' && caught !== null && 'name' in caught ? String(caught.name) : '';
      const lockedOut = caught instanceof Error && caught.message.includes('Password attempts exceeded');
      setError(
        name === 'NotAuthorizedException' && !lockedOut
          ? 'Your current password isn’t right.'
          : friendlyAuthError(caught),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h2 className="font-semibold">Change password</h2>
      <form onSubmit={(e) => void submit(e)} className="mt-3 flex flex-col gap-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, with upper- and lower-case letters and a number."
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <TextField
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || current === '' || next === ''}>
            {busy ? 'Changing…' : 'Change password'}
          </Button>
          <Saved show={saved} />
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Music (spec v2 §9, D27)
// ---------------------------------------------------------------------------------------------------------------

export function MusicSettingsScreen() {
  const me = useMe();
  return (
    <div className="mx-auto max-w-xl">
      <BackToSettings />
      <PageHeader title="Music" description="How you listen to songs in Drop a Bop." />
      <QueryBoundary isPending={me.isPending} error={me.error} onRetry={() => void me.refetch()}>
        {() => (me.data ? <MusicSettings user={me.data.user} /> : null)}
      </QueryBoundary>
    </div>
  );
}

function MusicSettings({ user }: { user: User }) {
  const update = useUpdateProfile();
  const [preferred, setPreferred] = useState<MusicProviderId | ''>(user.preferredProvider ?? '');
  // Shown straight away when flipped (the saved profile catches up after the save).
  const [videosOn, setVideosOn] = useState(wantsInAppVideos(user));
  const [savedField, setSavedField] = useState<'preferred' | 'videos' | null>(null);

  function save(
    changes: { preferredProvider?: MusicProviderId | null; playInApp?: boolean },
    field: 'preferred' | 'videos',
  ) {
    setSavedField(null);
    update.mutate(changes, { onSuccess: () => setSavedField(field) });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <label htmlFor="preferred-app" className="font-semibold">
          Preferred music app
        </label>
        <p className="mt-1 text-sm text-muted">Its “Listen” link shows first on every song.</p>
        <div className="mt-3 flex items-center gap-3">
          <select
            id="preferred-app"
            value={preferred}
            disabled={update.isPending} // one save at a time, so they can't land out of order
            onChange={(e) => {
              const value = e.target.value as MusicProviderId | '';
              setPreferred(value);
              save({ preferredProvider: value === '' ? null : value }, 'preferred');
            }}
            className="rounded-xl border border-line bg-surface-raised px-3.5 py-2.5 text-ink focus:border-blue focus:outline-none"
          >
            <option value="">No preference</option>
            {/* Plain YouTube is offered as YouTube Music (the app the links open), unless already chosen. */}
            {MUSIC_PROVIDERS.filter((p) => p !== 'youtube' || preferred === 'youtube').map((p) => (
              <option key={p} value={p}>
                {PROVIDER_NAMES[p]}
              </option>
            ))}
          </select>
          <Saved show={savedField === 'preferred' && !update.isPending} />
        </div>
      </Card>

      <Card>
        <Toggle
          label="Play videos in Drop a Bop"
          description="Shows a Play video button on songs that have a YouTube video. Turn off to use links only."
          checked={videosOn}
          disabled={update.isPending}
          onChange={(on) => {
            setVideosOn(on);
            save({ playInApp: on }, 'videos');
          }}
        />
        <Saved show={savedField === 'videos' && !update.isPending} />
      </Card>

      {update.error && <Alert>{errorMessage(update.error)}</Alert>}

      <Card>
        <h2 className="font-semibold">Music services</h2>
        <ul className="mt-2 flex flex-col">
          <ServiceRow name="YouTube" status="Plays in the app">
            Songs with a YouTube video play right here, in YouTube’s own player.
          </ServiceRow>
          <ServiceRow name="Apple Music" status="Links">
            Every song links to Apple Music. Playing inside the app isn’t available yet.
          </ServiceRow>
          <ServiceRow name="Spotify" status="Links">
            Opens the song in Spotify, or a Spotify search.
          </ServiceRow>
        </ul>
        <p className="mt-3 text-xs text-muted">
          No accounts to connect: Drop a Bop never signs in to your music apps.
        </p>
      </Card>
    </div>
  );
}

function ServiceRow({ name, status, children }: { name: string; status: string; children: ReactNode }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-line py-3 last:border-b-0">
      <span className="min-w-0">
        <span className="block font-medium">{name}</span>
        <span className="block text-sm text-muted">{children}</span>
      </span>
      <span className="shrink-0 rounded-full bg-active px-2.5 py-1 text-xs font-medium text-primary">
        {status}
      </span>
    </li>
  );
}
