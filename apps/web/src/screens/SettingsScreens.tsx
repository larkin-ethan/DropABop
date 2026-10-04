// Party settings and Profile (roadmap P8.10, P8.11; spec §19 screens 10 and 12; mockup screens 24, 25, 27).
// The server enforces who may change what; this screen just shows hosts the controls and everyone else a read-only
// view (D16, D17).

import {
  AVATAR_COLORS,
  DEFAULT_DISPLAY_NAME,
  MAX_PARTY_SIZE,
  MUSIC_PROVIDERS,
  WEEKDAYS,
  checkSchedule,
  displayNameSchema,
  sortWeekdays,
  type MusicProviderId,
  type Party,
  type PartyMember,
  type UpdatePartySettingsRequest,
  type Weekday,
} from '@dropabop/shared';
import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  useMe,
  useParty,
  useRegenerateInvite,
  useRemoveMember,
  useUpdateProfile,
  useUpdateSettings,
} from '../api/hooks';
import { SignOutButton } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { PageHeader, QueryBoundary } from '../components/Page';
import { TextField } from '../components/TextField';
import { Avatar, Button, Card } from '../components/ui';
import { AvatarImageError, toAvatarDataUrl } from '../lib/avatar-image';
import { errorMessage } from '../lib/errors';
import { DAY_NAMES, formatDayList, formatTimeOfDay } from '../lib/format';
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
      <span className="relative mt-1 inline-flex shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        {/* The visible switch: track turns teal and the knob slides right when on. */}
        <span
          aria-hidden="true"
          className="h-6 w-11 rounded-full border border-line bg-surface-raised transition peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-blue"
        />
        <span
          aria-hidden="true"
          className="absolute top-1 left-1 size-4 rounded-full bg-muted transition peer-checked:translate-x-5 peer-checked:bg-primary-ink"
        />
      </span>
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
      {isHost ? (
        // Keyed by party, so switching parties starts the form from that party's values. Saving a toggle doesn't
        // reset the form, so unsaved edits elsewhere in it are kept.
        <SettingsForm key={party.partyId} party={party} isHost={isHost} memberCount={members.length} />
      ) : (
        <SettingsSummary party={party} memberCount={members.length} />
      )}
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
  const [shareDays, setShareDays] = useState<Weekday[]>(party.settings.shareDays);
  const [closeDay, setCloseDay] = useState<Weekday>(party.settings.ratingCloseDay);
  const [closeTime, setCloseTime] = useState(party.settings.ratingCloseTime);
  const [saved, setSaved] = useState(false);
  const [confirmingPause, setConfirmingPause] = useState(false);

  // The same rule the API enforces, shown before saving: ratings lock at 11:59 pm on the last sharing day at the earliest.
  const scheduleProblem = checkSchedule({ shareDays, ratingCloseDay: closeDay, ratingCloseTime: closeTime });

  function toggleShareDay(day: Weekday, on: boolean) {
    setShareDays(sortWeekdays(on ? [...shareDays, day] : shareDays.filter((d) => d !== day)));
  }

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
    if (shareDays.join() !== party.settings.shareDays.join()) changes.shareDays = shareDays;
    if (closeDay !== party.settings.ratingCloseDay) changes.ratingCloseDay = closeDay;
    if (closeTime !== party.settings.ratingCloseTime) changes.ratingCloseTime = closeTime;
    if (scheduleProblem !== null) return; // shown under the schedule; nothing to send yet
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

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Sharing days</legend>
          <p className="text-xs text-muted">Everyone shares one song on each of these days.</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <label key={day} className={readOnly ? '' : 'cursor-pointer'}>
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={shareDays.includes(day)}
                  disabled={readOnly}
                  onChange={(e) => toggleShareDay(day, e.target.checked)}
                  aria-label={DAY_NAMES[day]}
                />
                <span
                  aria-hidden="true"
                  className="inline-block min-w-12 rounded-full border border-line bg-surface-raised px-3 py-1.5 text-center text-sm text-muted peer-checked:border-primary peer-checked:bg-primary peer-checked:font-semibold peer-checked:text-primary-ink peer-focus-visible:ring-2 peer-focus-visible:ring-blue"
                >
                  {DAY_NAMES[day].slice(0, 3)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="rating-close-day" className="text-sm font-medium">
              Ratings lock on
            </label>
            <select
              id="rating-close-day"
              value={closeDay}
              disabled={readOnly}
              onChange={(e) => setCloseDay(e.target.value as Weekday)}
              className="rounded-xl border border-line bg-surface-raised px-3.5 py-2.5 text-ink focus:border-blue focus:outline-none"
            >
              {WEEKDAYS.map((day) => (
                <option key={day} value={day}>
                  {DAY_NAMES[day]}
                </option>
              ))}
            </select>
          </div>
          <TextField
            label="At"
            type="time"
            value={closeTime}
            readOnly={readOnly}
            required
            onChange={(e) => setCloseTime(e.target.value)}
            hint="Ratings lock at the end of this minute; then the results come out."
          />
        </div>
        {scheduleProblem !== null && <Alert>{scheduleProblem}</Alert>}

        <p className="rounded-xl border border-line bg-surface-raised px-3 py-2 text-sm text-muted">
          Weeks start Monday, and days run midnight to midnight in{' '}
          <span className="font-semibold text-ink">{party.settings.timezone}</span>. Changes to the timezone,
          sharing days, or lock time apply from next week; this week keeps the rules it started with.
        </p>

        <div className="divide-y divide-line border-y border-line">
          <Toggle
            label="Show who shared each song during the week"
            description="Off: songs stay anonymous until the results (recommended). A change applies from next week."
            checked={party.settings.revealRecommenderDuringVoting}
            disabled={readOnly || update.isPending}
            onChange={(value) => save({ revealRecommenderDuringVoting: value })}
          />
          <Toggle
            label="Show who rated what in the results"
            description="Off: results show only anonymous rating spreads. A change applies from next week’s results."
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
              // Pausing affects everyone, so it asks first; resuming is harmless and happens straight away.
              onClick={() => (party.settings.paused ? save({ paused: false }) : setConfirmingPause(true))}
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
      <Modal open={confirmingPause} title="Pause the party?" onClose={() => setConfirmingPause(false)}>
        <p className="text-muted">
          No new weeks start until you resume, for everyone in the party. A week that’s already running
          finishes normally. Good for holidays.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmingPause(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setConfirmingPause(false);
              save({ paused: true });
            }}
          >
            Pause the party
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

/** What members see: the party's settings as plain text (only the host can change them, D13). */
function SettingsSummary({ party, memberCount }: { party: Party; memberCount: number }) {
  const s = party.settings;
  const rows: [string, string][] = [
    ['Party name', party.name],
    ['Members', `${memberCount} of up to ${s.maxMembers}`],
    ['Timezone', s.timezone],
    ['Sharing days', formatDayList(s.shareDays)],
    ['Ratings lock', `${DAY_NAMES[s.ratingCloseDay]} at ${formatTimeOfDay(s.ratingCloseTime)}`],
    [
      'Who shared each song',
      s.revealRecommenderDuringVoting ? 'Shown during the week' : 'Hidden until the results',
    ],
    ['Who rated what', s.showWhoRatedWhat ? 'Shown in the results' : 'Not shown (anonymous spreads)'],
  ];
  return (
    <Card>
      <dl className="grid gap-3 sm:grid-cols-[auto_1fr] sm:gap-x-6">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mb-2 font-medium break-words sm:mb-0">{value}</dd>
          </div>
        ))}
      </dl>
      {s.paused && (
        <p className="mt-4 text-sm text-gold">
          Paused: no new weeks start until the host resumes. Past results and stats stay available.
        </p>
      )}
    </Card>
  );
}

/** A ready-to-send invitation (text, chat, email) with the party's schedule, the link, and the guide. */
export function inviteMessage(party: Party, link: string): string {
  const { shareDays, ratingCloseDay, ratingCloseTime } = party.settings;
  return [
    `Join my Drop a Bop party “${party.name}”! 🎵`,
    `On ${formatDayList(shareDays)} we each share a song we love, then rate each other’s picks from 1 to 10. ` +
      `Ratings lock ${DAY_NAMES[ratingCloseDay]} at ${formatTimeOfDay(ratingCloseTime)}, and then we see the results.`,
    `Join here: ${link} (or use code ${party.inviteCode})`,
    `How it works: ${window.location.origin}/how-it-works`,
  ].join('\n\n');
}

function InviteCard({ party, isHost }: { party: Party; isHost: boolean }) {
  const regenerate = useRegenerateInvite(party.partyId);
  const [copied, setCopied] = useState<'link' | 'message' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const link = inviteLink(party.inviteCode);

  function copy(text: string, what: 'link' | 'message') {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(what))
      .catch(() => setCopied(null));
  }

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
        <Button onClick={() => copy(link, 'link')}>
          <Icon name="copy" className="size-4" /> {copied === 'link' ? 'Copied!' : 'Copy link'}
        </Button>
        <Button variant="secondary" onClick={() => copy(inviteMessage(party, link), 'message')}>
          <Icon name="copy" className="size-4" /> {copied === 'message' ? 'Copied!' : 'Copy invite message'}
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
            <Avatar name={m.displayName} color={m.avatarColor} image={m.avatarImage} />
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
      <div className="mt-6 flex justify-center">
        <SignOutButton />
      </div>
    </div>
  );
}

export function ProfileForm({
  user,
  compact = false,
}: {
  user: {
    displayName: string;
    avatarColor: string;
    avatarImage?: string | null;
    preferredProvider: MusicProviderId | null;
  };
  /** Onboarding's short version: just the name. */
  compact?: boolean;
}) {
  const update = useUpdateProfile();
  const [name, setName] = useState(user.displayName === DEFAULT_DISPLAY_NAME ? '' : user.displayName);
  const [color, setColor] = useState(user.avatarColor);
  const [image, setImage] = useState<string | null>(user.avatarImage ?? null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so choosing the same file again still triggers a change
    if (file === undefined) return;
    setImageError(null);
    try {
      setImage(await toAvatarDataUrl(file));
      setSaved(false);
    } catch (error) {
      setImageError(
        error instanceof AvatarImageError
          ? error.message
          : 'That photo couldn’t be used. Please try another.',
      );
    }
  }
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
            avatarImage: image,
            preferredProvider: preferred === '' ? null : preferred,
          },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <div className="flex items-center gap-4">
          <Avatar name={name.trim() || '?'} color={color} image={compact ? null : image} size="lg" />
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
            <div>
              <p className="text-sm font-medium">Profile picture</p>
              <p className="text-xs text-muted">
                Optional. Shown to your party members instead of your initials.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  aria-label="Choose a profile picture"
                  onChange={(e) => void handlePhoto(e)}
                />
                <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                  {image ? 'Change picture' : 'Upload a picture'}
                </Button>
                {image && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setImage(null);
                      setSaved(false);
                    }}
                  >
                    Remove picture
                  </Button>
                )}
              </div>
              {imageError && (
                <p role="alert" className="mt-2 text-sm text-red-300">
                  {imageError}
                </p>
              )}
            </div>
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
                {/* Plain YouTube is offered as YouTube Music (the app the links open), unless already chosen. */}
                {MUSIC_PROVIDERS.filter((p) => p !== 'youtube' || preferred === 'youtube').map((p) => (
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
