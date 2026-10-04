// Party settings and Profile (roadmap P8.10, P8.11; spec §19 screens 10 and 12; mockup screens 24, 25, 27).
// The server enforces who may change what; this screen just shows hosts the controls and everyone else a read-only
// view (D16, D17).

import {
  AVATAR_COLORS,
  DEFAULT_DISPLAY_NAME,
  MAX_PARTY_SIZE,
  MUSIC_PROVIDERS,
  displayNameSchema,
  type MusicProviderId,
  type Party,
  type PartyMember,
  type UpdatePartySettingsRequest,
} from '@dropabop/shared';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  useMe,
  useParty,
  useRegenerateInvite,
  useRemoveMember,
  useUpdateProfile,
  useUpdateSettings,
} from '../api/hooks';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { PageHeader, QueryBoundary } from '../components/Page';
import { TextField } from '../components/TextField';
import { Avatar, Button, Card } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { PROVIDER_NAMES } from '../lib/music-links';
import { inviteLink } from '../lib/pending-invite';
import { useCurrentParty } from '../party/CurrentParty';
import { NoPartyCard } from './ResultsScreens';

function Alert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200"
    >
      {children}
    </p>
  );
}

function Saved({ show }: { show: boolean }) {
  return show ? (
    <p role="status" className="text-sm text-success">
      Saved
    </p>
  ) : null;
}

function Toggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start justify-between gap-4 py-3 ${disabled ? 'opacity-80' : 'cursor-pointer'}`}
    >
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-muted">{description}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// /settings (P8.10)
// ---------------------------------------------------------------------------

export function PartySettingsScreen() {
  const { partyId, status, retry } = useCurrentParty();
  const party = useParty(partyId);
  if (status === 'ready' && partyId === null) return <NoPartyCard />;

  return (
    <QueryBoundary
      isPending={status === 'loading' || party.isPending}
      error={status === 'error' ? true : party.error}
      onRetry={() => {
        retry();
        void party.refetch();
      }}
      loadingLabel="Loading party settings…"
    >
      {() => {
        const data = party.data;
        if (data === undefined) return null;
        return <PartySettings party={data.party} members={data.members} isHost={data.isHost} />;
      }}
    </QueryBoundary>
  );
}

function PartySettings({
  party,
  members,
  isHost,
}: {
  party: Party;
  members: PartyMember[];
  isHost: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Party settings"
        description={
          isHost ? 'You’re the host: you can change these.' : 'Only the host can change these settings.'
        }
      />
      <SettingsForm party={party} isHost={isHost} memberCount={members.length} />
      <InviteCard party={party} isHost={isHost} />
      <MembersCard party={party} members={members} isHost={isHost} />
    </div>
  );
}

function SettingsForm({
  party,
  isHost,
  memberCount,
}: {
  party: Party;
  isHost: boolean;
  memberCount: number;
}) {
  const update = useUpdateSettings(party.partyId);
  const [name, setName] = useState(party.name);
  const [maxMembers, setMaxMembers] = useState(String(party.settings.maxMembers));
  const [timezone, setTimezone] = useState(party.settings.timezone);
  const [saved, setSaved] = useState(false);

  // If the party changes underneath (e.g. switching parties), start from its values.
  useEffect(() => {
    setName(party.name);
    setMaxMembers(String(party.settings.maxMembers));
    setTimezone(party.settings.timezone);
  }, [party]);

  function save(changes: UpdatePartySettingsRequest) {
    setSaved(false);
    update.mutate(changes, { onSuccess: () => setSaved(true) });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const changes: UpdatePartySettingsRequest = {};
    if (name.trim() !== party.name) changes.name = name.trim();
    if (Number(maxMembers) !== party.settings.maxMembers) changes.maxMembers = Number(maxMembers);
    if (timezone.trim() !== party.settings.timezone) changes.timezone = timezone.trim();
    if (Object.keys(changes).length === 0) {
      setSaved(true);
      return;
    }
    save(changes);
  }

  const readOnly = !isHost;
  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Party name"
          value={name}
          readOnly={readOnly}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Max members"
            type="number"
            inputMode="numeric"
            min={Math.max(2, memberCount)}
            max={MAX_PARTY_SIZE}
            value={maxMembers}
            readOnly={readOnly}
            onChange={(e) => setMaxMembers(e.target.value)}
            hint={`${memberCount} in the party now. Can’t go below that.`}
          />
          <TextField
            label="Timezone"
            value={timezone}
            readOnly={readOnly}
            onChange={(e) => setTimezone(e.target.value)}
            hint="A change applies from next week."
          />
        </div>
        <p className="rounded-xl border border-line bg-surface-raised px-3 py-2 text-sm text-muted">
          Days run midnight to midnight in{' '}
          <span className="font-semibold text-ink">{party.settings.timezone}</span>; ratings lock Sunday 11:59
          pm.
        </p>

        <div className="divide-y divide-line border-y border-line">
          <Toggle
            label="Show who shared each song during the week"
            description="Off: songs stay anonymous until the results (recommended)."
            checked={party.settings.revealRecommenderDuringVoting}
            disabled={readOnly || update.isPending}
            onChange={(value) => save({ revealRecommenderDuringVoting: value })}
          />
          <Toggle
            label="Show who rated what in the results"
            description="Off: results show only anonymous rating spreads."
            checked={party.settings.showWhoRatedWhat}
            disabled={readOnly || update.isPending}
            onChange={(value) => save({ showWhoRatedWhat: value })}
          />
        </div>

        {update.error && <Alert>{errorMessage(update.error)}</Alert>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {isHost && (
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            )}
            <Saved show={saved && !update.isPending} />
          </div>
          {isHost && (
            <Button
              variant="secondary"
              disabled={update.isPending}
              onClick={() => save({ paused: !party.settings.paused })}
            >
              <Icon name="pause" className="size-4" />
              {party.settings.paused ? 'Resume the party' : 'Pause the party'}
            </Button>
          )}
        </div>
        {party.settings.paused && (
          <p className="text-sm text-gold">
            Paused: no new weeks start until the host resumes. Past results and stats stay available.
          </p>
        )}
      </form>
    </Card>
  );
}

function InviteCard({ party, isHost }: { party: Party; isHost: boolean }) {
  const regenerate = useRegenerateInvite(party.partyId);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const link = inviteLink(party.inviteCode);

  return (
    <Card>
      <h2 className="text-lg font-bold">Invite people</h2>
      <p className="mt-1 text-sm text-muted">Anyone with this link or code can join while there’s room.</p>
      <p className="mt-3 rounded-xl border border-line bg-surface-raised px-3 py-2.5 font-mono text-sm break-all">
        {link}
      </p>
      <p className="mt-2 text-sm text-muted">
        Code: <span className="font-mono font-semibold text-ink">{party.inviteCode}</span>
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
          <Icon name="copy" className="size-4" /> {copied ? 'Copied!' : 'Copy link'}
        </Button>
        {isHost && (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            Make a new link
          </Button>
        )}
      </div>
      {regenerate.error && (
        <div className="mt-3">
          <Alert>{errorMessage(regenerate.error)}</Alert>
        </div>
      )}
      <Modal open={confirming} title="Make a new invite link?" onClose={() => setConfirming(false)}>
        <p className="text-muted">
          The current link and code stop working straight away. People already in stay in.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            disabled={regenerate.isPending}
            onClick={() => regenerate.mutate(undefined, { onSettled: () => setConfirming(false) })}
          >
            {regenerate.isPending ? 'Making…' : 'Make a new link'}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

function MembersCard({ party, members, isHost }: { party: Party; members: PartyMember[]; isHost: boolean }) {
  const me = useMe();
  const myId = me.data?.user.userId;
  const remove = useRemoveMember(party.partyId);
  const regenerate = useRegenerateInvite(party.partyId);
  const { parties, select } = useCurrentParty();
  const navigate = useNavigate();
  const [target, setTarget] = useState<PartyMember | null>(null);
  const [askNewLink, setAskNewLink] = useState(false);
  const leaving = target !== null && target.userId === myId;

  function confirm() {
    if (target === null) return;
    remove.mutate(target.userId, {
      onSuccess: () => {
        setTarget(null);
        if (leaving) {
          const next = parties.find((p) => p.partyId !== party.partyId);
          if (next) select(next.partyId);
          void navigate('/', { replace: true });
        } else {
          setAskNewLink(true); // D17: so the removed person can't rejoin with the old link
        }
      },
    });
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">
        Members{' '}
        <span className="text-muted">
          ({members.length} of {party.settings.maxMembers})
        </span>
      </h2>
      <ul className="mt-3 flex flex-col">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
            <Avatar name={m.displayName} color={m.avatarColor} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {m.displayName}
                {m.userId === myId && <span className="text-muted"> (you)</span>}
              </span>
              <span className="block text-xs text-muted">{m.role === 'host' ? 'Host' : 'Member'}</span>
            </span>
            {m.role !== 'host' && m.userId === myId && (
              <Button variant="ghost" className="px-3 py-1 text-red-300" onClick={() => setTarget(m)}>
                Leave
              </Button>
            )}
            {isHost && m.role !== 'host' && m.userId !== myId && (
              <Button
                variant="ghost"
                className="px-3 py-1"
                onClick={() => setTarget(m)}
                aria-label={`Remove ${m.displayName}`}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      {isHost && <p className="mt-3 text-xs text-muted">The host can’t leave or be removed.</p>}

      <Modal
        open={target !== null}
        title={leaving ? 'Leave this party?' : `Remove ${target?.displayName ?? ''}?`}
        onClose={() => setTarget(null)}
      >
        <p className="text-muted">
          {leaving
            ? 'Your past songs and ratings stay in the party’s history. You can rejoin later with an invite link.'
            : 'Their past songs and ratings stay in the party’s history.'}
        </p>
        {remove.error && (
          <div className="mt-3">
            <Alert>{errorMessage(remove.error)}</Alert>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setTarget(null)}>
            Cancel
          </Button>
          <Button disabled={remove.isPending} onClick={confirm}>
            {remove.isPending ? 'Working…' : leaving ? 'Leave party' : 'Remove'}
          </Button>
        </div>
      </Modal>

      <Modal open={askNewLink} title="Make a new invite link?" onClose={() => setAskNewLink(false)}>
        <p className="text-muted">
          They could rejoin with the current link. Making a new one stops the old link and code working.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAskNewLink(false)}>
            Keep the current link
          </Button>
          <Button
            disabled={regenerate.isPending}
            onClick={() => regenerate.mutate(undefined, { onSettled: () => setAskNewLink(false) })}
          >
            Make a new link
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// /profile (P8.11)
// ---------------------------------------------------------------------------

export function ProfileScreen() {
  const me = useMe();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Your profile" description="How you appear to your parties." />
      <QueryBoundary isPending={me.isPending} error={me.error} onRetry={() => void me.refetch()}>
        {() => (me.data ? <ProfileForm user={me.data.user} /> : null)}
      </QueryBoundary>
    </div>
  );
}

export function ProfileForm({
  user,
  compact = false,
}: {
  user: { displayName: string; avatarColor: string; preferredProvider: MusicProviderId | null };
  /** Onboarding's short version: just the name. */
  compact?: boolean;
}) {
  const update = useUpdateProfile();
  const [name, setName] = useState(user.displayName === DEFAULT_DISPLAY_NAME ? '' : user.displayName);
  const [color, setColor] = useState(user.avatarColor);
  const [preferred, setPreferred] = useState<MusicProviderId | ''>(user.preferredProvider ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please enter a name.');
      return;
    }
    setError(null);
    setSaved(false);
    update.mutate(
      compact
        ? { displayName: parsed.data }
        : {
            displayName: parsed.data,
            avatarColor: color,
            preferredProvider: preferred === '' ? null : preferred,
          },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <div className="flex items-center gap-4">
          <Avatar name={name.trim() || '?'} color={color} size="lg" />
          <div className="min-w-0 flex-1">
            <TextField
              label="Display name"
              placeholder="What your friends call you"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={error ?? undefined}
            />
          </div>
        </div>
        {!compact && (
          <>
            <fieldset>
              <legend className="text-sm font-medium">Avatar color</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {AVATAR_COLORS.map((c) => (
                  <label key={c} className="cursor-pointer">
                    <input
                      type="radio"
                      name="avatar-color"
                      value={c}
                      checked={color.toLowerCase() === c.toLowerCase()}
                      onChange={() => setColor(c)}
                      className="peer sr-only"
                      aria-label={`Color ${c}`}
                    />
                    <span
                      className="block size-9 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:ring-2 peer-focus-visible:ring-blue"
                      style={{ backgroundColor: c }}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="preferred-app" className="text-sm font-medium">
                Preferred music app
              </label>
              <select
                id="preferred-app"
                value={preferred}
                onChange={(e) => setPreferred(e.target.value as MusicProviderId | '')}
                className="rounded-xl border border-line bg-surface-raised px-3.5 py-2.5 text-ink focus:border-blue focus:outline-none"
              >
                <option value="">No preference</option>
                {MUSIC_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {PROVIDER_NAMES[p]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted">Its “Listen” link shows first on every song.</p>
            </div>
          </>
        )}
        {update.error && <Alert>{errorMessage(update.error)}</Alert>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Saved show={saved && !update.isPending} />
        </div>
      </form>
    </Card>
  );
}
