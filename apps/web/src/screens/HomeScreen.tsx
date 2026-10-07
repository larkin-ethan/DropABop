// Home / Today (roadmap P8.3; mockup screens 8–9 adapted for the weekly model, docs/design/README.md).
// The current week from GET /parties/{id}/rounds/current (polled) and its songs from GET /rounds/{id}/recommendations.

import {
  DEFAULT_DISPLAY_NAME,
  type CurrentWeekResponse,
  type OpenWeekSongView,
  type PartyMember,
  type Weekday,
} from '@dropabop/shared';
import { Link } from 'react-router';
import { useCurrentWeek, useMe, useParty, useWeekSongs } from '../api/hooks';
import { Icon } from '../components/Icon';
import { PageHeader, QueryBoundary } from '../components/Page';
import { MyPickBadge, RatingBadge, SongRow } from '../components/SongRow';
import { EmptyState } from '../components/States';
import { Avatar, Card, ProgressBar, buttonClassName } from '../components/ui';
import { DAY_NAMES, formatDayList, formatLockTime, formatTimeLeft, nextWeekSharingText } from '../lib/format';
import { WEEKDAYS, shareDaysOf } from '@dropabop/shared';
import { useNow } from '../lib/useNow';
import { useCurrentParty } from '../party/CurrentParty';
import { OnboardingSteps } from './OnboardingScreens';
import { useSharerNames } from '../party/useSharerNames';
import { ProfileForm } from './SettingsScreens';

type OpenWeek = Extract<CurrentWeekResponse, { reason: null }>;
type NoWeek = Exclude<CurrentWeekResponse, { reason: null }>;

export function HomeScreen() {
  const { partyId, status, retry } = useCurrentParty();

  return (
    <QueryBoundary isPending={status === 'loading'} error={status === 'error' ? true : null} onRetry={retry}>
      {() => (
        <>
          <NamePrompt />
          {partyId === null ? <NoPartyYet /> : <PartyHome partyId={partyId} />}
        </>
      )}
    </QueryBoundary>
  );
}

/** New accounts start as "New member" (D18): ask for a real name first, so the party knows who's who. */
function NamePrompt() {
  const me = useMe();
  const user = me.data?.user;
  if (user === undefined || user.displayName !== DEFAULT_DISPLAY_NAME) return null;
  return (
    <section className="mb-6" aria-labelledby="name-prompt">
      <h2 id="name-prompt" className="mb-2 text-lg font-bold">
        Welcome! What should your party call you?
      </h2>
      <ProfileForm user={user} compact />
    </section>
  );
}

/** First visit: not in any party yet (spec §27 onboarding). */
function NoPartyYet() {
  return (
    <div>
      <PageHeader
        eyebrow="Welcome"
        title="Let’s get you into a party"
        description="Drop a Bop happens inside a private party: a small group sharing and rating songs together."
      />
      <Card>
        <EmptyState
          title="You’re not in a party yet"
          message="Got an invite link or code from a friend? Join their party. Or start your own and invite people."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/join" className={buttonClassName('primary')}>
                <Icon name="link" className="size-4" /> Join with a code
              </Link>
              <Link to="/parties/new" className={buttonClassName('secondary')}>
                <Icon name="plus" className="size-4" /> Create a party
              </Link>
            </div>
          }
        />
      </Card>
      <OnboardingSteps />
    </div>
  );
}

function PartyHome({ partyId }: { partyId: string }) {
  const week = useCurrentWeek(partyId);
  return (
    <QueryBoundary
      isPending={week.isPending}
      error={week.error}
      onRetry={() => void week.refetch()}
      loadingLabel="Loading this week…"
    >
      {() => {
        const data = week.data;
        if (data === undefined) return null;
        return data.reason === null ? (
          <OpenWeekHome partyId={partyId} week={data} />
        ) : (
          <NoWeekHome partyId={partyId} week={data} />
        );
      }}
    </QueryBoundary>
  );
}

/** Paused party, or the gap between weeks. */
function NoWeekHome({ partyId, week }: { partyId: string; week: NoWeek }) {
  const paused = week.reason === 'paused';
  const party = useParty(partyId);
  return (
    <div>
      <PageHeader
        eyebrow={paused ? 'Paused' : 'Between weeks'}
        title={paused ? 'This party is paused' : 'A new week starts soon'}
      />
      <Card>
        <EmptyState
          title={paused ? 'No new weeks while the party is paused' : 'The next week starts Monday'}
          message={
            paused
              ? 'The host can resume it any time in Party settings. Past results and stats are still here.'
              : nextWeekSharingText(party.data?.party.settings.shareDays)
          }
          action={
            week.lastRoundId ? (
              <Link
                to={`/results/${encodeURIComponent(week.lastRoundId)}`}
                className={buttonClassName('secondary')}
              >
                <Icon name="trophy" className="size-4" /> See last week’s results
              </Link>
            ) : undefined
          }
        />
      </Card>
    </div>
  );
}

function OpenWeekHome({ partyId, week }: { partyId: string; week: OpenWeek }) {
  const now = useNow();
  const songs = useWeekSongs(week.round.roundId, { poll: true });
  const party = useParty(partyId);
  const me = useMe();
  const preferred = me.data?.user.preferredProvider ?? null;
  const { today, progress } = week;
  const unrated = progress.ratableCount - progress.ratedCount;
  const members = party.data?.members ?? [];
  const sharers = useSharerNames(partyId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          today
            ? `${DAY_NAMES[today.weekday]} · Day ${today.dayNumber} of ${today.dayCount}`
            : 'No sharing today · catch-up time'
        }
        title="This week’s songs"
        actions={
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-muted">
            <Icon name="clock" className="size-4 text-gold" />
            <span>
              Ratings lock {formatLockTime(week.round.endsAt)}
              <span className="text-ink"> · {formatTimeLeft(week.round.endsAt, now)}</span>
            </span>
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Today’s song</h2>
          <TodayStatus week={week} songs={songs.data?.songs ?? []} />
          <MembersToday week={week} members={members} />
        </Card>

        <Card className="flex flex-col lg:col-span-2">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Your ratings</h2>
          <p className="mt-4 text-4xl font-bold">
            {progress.ratedCount}
            <span className="text-xl font-medium text-muted"> / {progress.ratableCount}</span>
          </p>
          <p className="mt-1 text-sm text-muted">songs rated this week</p>
          <div className="mt-4">
            <ProgressBar
              value={progress.ratedCount}
              max={progress.ratableCount}
              label="Songs rated this week"
            />
          </div>
          <div className="mt-auto pt-5">
            <Link
              to={unrated > 0 ? '/rate?show=unrated' : '/rate'}
              className={buttonClassName(unrated > 0 ? 'primary' : 'secondary', 'w-full')}
            >
              <Icon name="star" className="size-4" />
              {unrated > 0
                ? `Rate ${unrated} more`
                : progress.ratableCount === 0
                  ? 'Nothing to rate yet'
                  : 'All caught up'}
            </Link>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Songs so far</h2>
          <p className="text-sm text-muted">
            {sharers.reveal
              ? 'This party shows who shared each song'
              : 'Who shared what is revealed with the results'}
          </p>
        </div>
        <QueryBoundary
          isPending={songs.isPending}
          error={songs.error}
          onRetry={() => void songs.refetch()}
          loadingLabel="Loading this week’s songs…"
        >
          {() => (
            <SongsByDay
              sharedBy={sharers.sharedBy}
              songs={songs.data?.songs ?? []}
              today={today?.weekday ?? null}
              preferred={preferred}
            />
          )}
        </QueryBoundary>
      </Card>
    </div>
  );
}

function TodayStatus({ week, songs }: { week: OpenWeek; songs: OpenWeekSongView[] }) {
  const { today } = week;
  if (today === null) {
    return (
      <div className="mt-4 flex flex-col items-start gap-3">
        <p className="text-lg">
          Today isn’t a sharing day (this week: {formatDayList(shareDaysOf(week.round))}). Catch up on this
          week’s songs before ratings lock {formatLockTime(week.round.endsAt)}.
        </p>
        <Link to="/rate" className={buttonClassName('secondary')}>
          <Icon name="star" className="size-4" /> Catch up on this week’s songs
        </Link>
      </div>
    );
  }
  const myToday = songs.find((s) => s.isMine && s.submittedOn === today.date);
  if (week.sharedToday) {
    return (
      <div className="mt-4 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          {myToday && (
            <>
              <p className="truncate text-xl font-bold">{myToday.song.title}</p>
              <p className="truncate text-muted">{myToday.song.artist}</p>
            </>
          )}
          <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <Icon name="check" className="size-4" /> You’ve shared today’s song
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4 flex flex-col items-start gap-3">
      <p className="text-lg">You haven’t shared a song today.</p>
      <Link to="/share" className={buttonClassName('primary')}>
        <Icon name="plus" className="size-4" /> Share today’s song
      </Link>
    </div>
  );
}

/**
 * Who's in the party and how many have shared today. Per-person ✓ marks appear only when the party reveals
 * recommenders (D10): otherwise names next to a song list would give away whose song is whose.
 */
function MembersToday({ week, members }: { week: OpenWeek; members: PartyMember[] }) {
  const sharedIds = week.sharedTodayUserIds;
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
      <ul className="flex flex-wrap gap-2" aria-label="Party members">
        {members.map((m) => {
          const shared = sharedIds?.includes(m.userId);
          return (
            <li key={m.userId} className="relative" title={m.displayName}>
              <Avatar name={m.displayName} color={m.avatarColor} image={m.avatarImage} size="sm" />
              {shared && (
                <span
                  className="absolute -right-1 -bottom-1 inline-flex size-4 items-center justify-center rounded-full bg-success text-bg"
                  aria-label={`${m.displayName} has shared today`}
                >
                  <Icon name="check" className="size-3" />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {week.today && (
        <p className="text-sm text-muted">
          <span className="font-semibold text-ink">{week.sharedTodayCount}</span> of {members.length || '…'}{' '}
          shared today
        </p>
      )}
    </div>
  );
}

/** Today's songs first, then the rest of the week in day order (roadmap P8.3). */
function SongsByDay({
  songs,
  today,
  preferred,
  sharedBy,
}: {
  sharedBy: (song: OpenWeekSongView) => string | null;
  songs: OpenWeekSongView[];
  today: Weekday | null;
  preferred: Parameters<typeof SongRow>[0]['preferred'];
}) {
  if (songs.length === 0) {
    return (
      <EmptyState
        title="No songs yet"
        message={
          today
            ? 'Be the first person to share one today.'
            : 'Songs appear here as people share them on sharing days.'
        }
        action={
          today ? (
            <Link to="/share" className={buttonClassName('primary')}>
              Share today’s song
            </Link>
          ) : undefined
        }
      />
    );
  }
  const order = today === null ? WEEKDAYS : [today, ...WEEKDAYS.filter((d) => d !== today)];
  const days = order.filter((d) => songs.some((s) => s.weekday === d));
  return (
    <div className="mt-4 flex flex-col gap-5">
      {days.map((day) => (
        <section key={day} aria-label={`${DAY_NAMES[day]}’s songs`}>
          <h3 className="mb-1 text-xs font-semibold tracking-wider text-blue uppercase">
            {day === today ? `Today · ${DAY_NAMES[day]}` : DAY_NAMES[day]}
          </h3>
          <ul className="flex flex-col">
            {songs
              .filter((s) => s.weekday === day)
              .map((s) => (
                <SongRow
                  key={s.recommendationId}
                  id={s.recommendationId}
                  song={s.song}
                  preferred={preferred}
                  detail={sharedBy(s) ?? undefined}
                  right={
                    s.isMine ? (
                      <MyPickBadge />
                    ) : s.myRating !== null ? (
                      <RatingBadge rating={s.myRating} />
                    ) : (
                      <Link
                        to={`/rate#${encodeURIComponent(s.recommendationId)}`}
                        className="rounded-full border border-blue/60 px-3.5 py-1 text-sm font-semibold text-blue hover:bg-blue/10"
                        aria-label={`Rate ${s.song.title}`}
                      >
                        Rate
                      </Link>
                    )
                  }
                />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
