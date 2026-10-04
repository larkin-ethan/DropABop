// Onboarding, joining a party, and creating one (roadmap P8.2 / P8.3; spec §26, §27; mockup screens 6, 7, 11).

import {
  DEFAULT_MAX_PARTY_SIZE,
  MAX_PARTY_SIZE,
  MIN_PARTY_SIZE,
  createPartyRequestSchema,
} from '@dropabop/shared';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useCreateParty, useInvitePreview, useJoinParty } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { PageHeader, QueryBoundary } from '../components/Page';
import { LoadingState } from '../components/States';
import { TextField } from '../components/TextField';
import { Button, Card, buttonClassName } from '../components/ui';
import { errorCode, errorMessage } from '../lib/errors';
import {
  inviteLink,
  normalizeInviteInput,
  peekPendingInvite,
  rememberInvite,
  takePendingInvite,
} from '../lib/pending-invite';
import { useCurrentParty } from '../party/CurrentParty';
import { AuthLayout } from './AuthScreens';

/** The weekly flow in short steps (spec §27: explain without overwhelming). */
export function OnboardingSteps() {
  const steps = [
    ['Join or start a party', 'Parties are private and invite-only.'],
    ['Drop a bop every weekday', 'Monday to Friday, share one song you love.'],
    ['Listen to everyone’s picks', 'Open them in Apple Music, Spotify, or YouTube Music.'],
    ['Rate them 1–10', 'Any time before Sunday 11:59 pm. You can change a rating until then.'],
    ['See the results', 'The week’s ranking, each day’s Bop of the Day, and your stats.'],
  ];
  return (
    <Card className="mt-6">
      <h2 className="text-lg font-bold">How a week works</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map(([title, text], index) => (
          <li key={title} className="flex gap-3">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-active text-sm font-bold text-primary">
              {index + 1}
            </span>
            <span>
              <span className="block font-semibold">{title}</span>
              <span className="block text-sm text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** /join: type or paste a code (mockup screen 7). */
export function JoinWithCodeScreen() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const code = normalizeInviteInput(input);
    if (code === '') {
      setError('Enter the invite code or paste the link.');
      return;
    }
    void navigate(`/join/${encodeURIComponent(code)}`);
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader
        title="Join a party"
        description="Enter the code or paste the invite link a friend sent you."
      />
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            label="Invite code or link"
            placeholder="SONG-7K4P"
            autoCapitalize="characters"
            autoComplete="off"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            error={error ?? undefined}
          />
          <Button type="submit">Continue</Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        Don’t have a code?{' '}
        <Link to="/parties/new" className="font-semibold text-blue hover:underline">
          Create your own party
        </Link>
      </p>
    </div>
  );
}

/** /join/:code: works signed out too (sign up or log in, then come back here). */
export function JoinByLinkScreen() {
  const { code: rawCode = '' } = useParams();
  const code = normalizeInviteInput(rawCode);
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <LoadingState label="Checking your sign-in…" rows={2} />
      </div>
    );
  }
  if (status === 'signedOut') {
    return <InvitedSignedOut code={code} />;
  }
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <JoinPreview code={code} />
    </div>
  );
}

function InvitedSignedOut({ code }: { code: string }) {
  // Remember the code so that after signing up (email code, then log in) the app brings them back to join.
  useEffect(() => rememberInvite(code), [code]);
  return (
    <AuthLayout title="You’re invited!" subtitle="Someone wants you in their Drop a Bop party.">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          Create a free account or log in, and we’ll take you straight back to join with code{' '}
          <span className="font-mono font-semibold text-ink">{code}</span>.
        </p>
        <Link to="/sign-up" className={buttonClassName('primary')}>
          Create an account
        </Link>
        <Link
          to="/sign-in"
          state={{ from: `/join/${encodeURIComponent(code)}` }}
          className={buttonClassName('secondary')}
        >
          I already have an account
        </Link>
      </div>
    </AuthLayout>
  );
}

function JoinPreview({ code }: { code: string }) {
  const preview = useInvitePreview(code);
  const join = useJoinParty();
  const { select } = useCurrentParty();
  const navigate = useNavigate();

  const location = useLocation();
  // Came here by signing up or logging in from an invite link (roadmap P8.2: "sign up then auto-join")?
  const [autoJoin] = useState(
    () =>
      (location.state as { autoJoin?: boolean } | null)?.autoJoin === true || peekPendingInvite() === code,
  );
  const autoJoinStarted = useRef(false);

  // Arriving here is the end of the invite flow: forget any remembered code so it doesn't redirect again later.
  useEffect(() => {
    takePendingInvite();
  }, []);

  // Join straight away for people who just signed up or logged in from the invite (once).
  const invite = preview.data;
  useEffect(() => {
    if (!autoJoin || autoJoinStarted.current || invite === undefined || invite.alreadyMember || invite.isFull)
      return;
    autoJoinStarted.current = true;
    join.mutate(
      { partyId: invite.partyId, inviteCode: code },
      { onSuccess: () => goToParty(invite.partyId) },
    );
  });

  function goToParty(partyId: string) {
    select(partyId);
    void navigate('/', { replace: true });
  }

  return (
    <Card>
      <QueryBoundary
        isPending={preview.isPending}
        error={preview.error}
        onRetry={() => void preview.refetch()}
        loadingLabel="Checking the invite…"
      >
        {() => {
          const invite = preview.data;
          if (invite === undefined) return null;
          return (
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="inline-flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-purple to-blue">
                <Icon name="users" className="size-7" />
              </span>
              <p className="text-sm text-muted">You’re invited to</p>
              <h1 className="text-2xl font-bold">{invite.partyName}</h1>
              <p className="text-sm text-muted">
                {invite.memberCount} of {invite.maxMembers} members
              </p>
              {invite.alreadyMember ? (
                <>
                  <p>You’re already in this party.</p>
                  <Button onClick={() => goToParty(invite.partyId)}>Go to the party</Button>
                </>
              ) : invite.isFull ? (
                <p className="text-muted">This party is full. Ask the host to make room.</p>
              ) : (
                <>
                  {join.error && (
                    <p role="alert" className="text-sm text-red-200">
                      {errorMessage(join.error)}
                    </p>
                  )}
                  {errorCode(join.error) === 'ALREADY_MEMBER' ? (
                    <Button onClick={() => goToParty(invite.partyId)}>Go to the party</Button>
                  ) : (
                    <Button
                      disabled={join.isPending}
                      onClick={() =>
                        join.mutate(
                          { partyId: invite.partyId, inviteCode: code },
                          { onSuccess: () => goToParty(invite.partyId) },
                        )
                      }
                    >
                      {join.isPending ? 'Joining…' : 'Join party'}
                    </Button>
                  )}
                </>
              )}
            </div>
          );
        }}
      </QueryBoundary>
    </Card>
  );
}

function detectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'America/Chicago';
  }
}

/** /parties/new (mockup screen 6, without the "Privacy" field: every party is private). */
export function CreatePartyScreen() {
  const create = useCreateParty();
  const { select } = useCurrentParty();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [maxMembers, setMaxMembers] = useState(String(DEFAULT_MAX_PARTY_SIZE));
  const [timezone, setTimezone] = useState(detectedTimezone);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ partyId: string; name: string; inviteCode: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return [];
    }
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Same rules as the server (shared schema), so mistakes show up before sending anything.
    const parsed = createPartyRequestSchema.safeParse({ name, timezone, maxMembers: Number(maxMembers) });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Please check the details.');
      return;
    }
    setFieldError(null);
    create.mutate(parsed.data, {
      onSuccess: (data) => {
        select(data.party.partyId);
        setCreated({ partyId: data.party.partyId, name: data.party.name, inviteCode: data.party.inviteCode });
      },
    });
  }

  if (created !== null) {
    const link = inviteLink(created.inviteCode);
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader eyebrow="Party created" title={created.name} description="Now invite your friends." />
        <Card>
          <p className="text-sm text-muted">
            Send this link (or the code) to the people you want in the party.
          </p>
          <p className="mt-3 rounded-xl border border-line bg-surface-raised px-3 py-2.5 font-mono text-sm break-all">
            {link}
          </p>
          <p className="mt-2 text-sm text-muted">
            Code: <span className="font-mono font-semibold text-ink">{created.inviteCode}</span>
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(link)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              <Icon name="copy" className="size-4" /> {copied ? 'Copied!' : 'Copy invite link'}
            </Button>
            <Button variant="secondary" onClick={() => void navigate('/')}>
              Go to the party
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Create a new party" description="Set up a private party and invite your friends." />
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <TextField
            label="Party name"
            placeholder="Ethan’s Music Party"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            label="Max members"
            type="number"
            inputMode="numeric"
            min={MIN_PARTY_SIZE}
            max={MAX_PARTY_SIZE}
            value={maxMembers}
            onChange={(e) => setMaxMembers(e.target.value)}
            hint={`Between ${MIN_PARTY_SIZE} and ${MAX_PARTY_SIZE}. You can change it later.`}
          />
          <TextField
            label="Timezone"
            list="timezones"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            hint="Days run midnight to midnight here, and ratings lock Sunday 11:59 pm."
          />
          <datalist id="timezones">
            {timezones.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
          {(fieldError ?? create.error) && (
            <p
              role="alert"
              className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200"
            >
              {fieldError ?? errorMessage(create.error)}
            </p>
          )}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create party'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
