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
import {
  useAchievements,
  useCurrentWeek,
  useMe,
  useParty,
  usePersonalStats,
  useWeekSongs,
} from '../api/hooks';
import { Icon } from '../components/Icon';
import { PageHeader, QueryBoundary } from '../components/Page';
import { MyPickBadge, RatingBadge, SongRow } from '../components/SongRow';
import { AchievementBanner } from './AchievementsScreen';
import { songDetailsPath } from './SongDetailsScreen';
import { EmptyState } from '../components/States';
import { Avatar, Card, ProgressBar, buttonClassName } from '../components/ui';
import { homeAction, type HomeAction } from '../lib/home-action';
import {
  DAY_NAMES,
  formatAverage,
  formatDayList,
  formatLockTime,
  formatTimeLeft,
  nextWeekSharingText,
} from '../lib/format';
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
          {partyId !== null && <AchievementBanner partyId={partyId} />}
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
          action={week.lastRoundId ? <MainAction action={homeAction(true, week)} /> : undefined}
        />
      </Card>
      <div className="mt-6">
        <HomeHighlights partyId={partyId} />
      </div>
    </div>
  );
}

function DropCount({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-3xl font-bold">{value}</dd>
    </div>
  );
}

const ACTION_ICON = { join: 'link', share: 'plus', rate: 'star', results: 'trophy' } as const;

/** The one main button (spec §26), or a calm message when there's nothing to do right now. */
function MainAction({ action }: { action: HomeAction }) {
  if (action.to === null) {
    return (
      <p className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-line px-4 py-2.5 text-sm font-semibold text-muted">
        <Icon name="check" className="size-4" /> {action.label}
      </p>
    );
  }
  return (
    <Link to={action.to} className={buttonClassName('primary', 'w-full')}>
      <Icon name={ACTION_ICON[action.kind]} className="size-4" />
      {action.label}
    </Link>
  );
}

/**
 * Your averages, latest achievement and last week's rank (spec §26). Secondary to this week's songs, so it stays
 * out of the way while loading or if it fails (the Stats pages show the full story and their own errors).
 */
function HomeHighlights({ partyId }: { partyId: string }) {
  const stats = usePersonalStats(partyId);
  const achievements = useAchievements(partyId);
  const s = stats.data;
  if (s === undefined) return null;
  const latest = (achievements.data?.achievements ?? [])
    .filter((a) => a.unlocked)
    .sort((a, b) => (b.unlockedOn ?? '').localeCompare(a.unlockedOn ?? ''))[0];
  const average = (stat: typeof s.averageRatingGiven) =>
    stat.status === 'ok' ? formatAverage(stat.value) : '–';

  return (
    <section aria-label="Your highlights" className="grid gap-4 sm:grid-cols-3">
      <Card>
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Your stats</h2>
        <dl className="mt-3 grid grid-cols-2 gap-2">
          <div className="flex flex-col-reverse">
            <dt className="text-xs text-muted">Average given</dt>
            <dd className="text-2xl font-bold">{average(s.averageRatingGiven)}</dd>
          </div>
          <div className="flex flex-col-reverse">
            <dt className="text-xs text-muted">Average received</dt>
            <dd className="text-2xl font-bold">{average(s.averageScoreReceived)}</dd>
          </div>
        </dl>
        {(s.averageRatingGiven.status !== 'ok' || s.averageScoreReceived.status !== 'ok') && (
          <p className="mt-2 text-xs text-muted">– = not enough finished weeks yet</p>
        )}
      </Card>
      <Card>
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Recent achievement</h2>
        {latest === undefined ? (
          <p className="mt-3 text-sm text-muted">None yet. They unlock as weeks finish.</p>
        ) : (
          <Link to="/achievements" className="mt-3 flex items-center gap-2 hover:underline">
            <span className="text-2xl" aria-hidden="true">
              {latest.emoji}
            </span>
            <span className="font-bold">{latest.title}</span>
          </Link>
        )}
      </Card>
      <Card>
        <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Last finished week</h2>
        {s.lastWeekRank === null ? (
          <p className="mt-3 text-sm text-muted">
            {s.weeksPlayed === 0
              ? 'No finished week yet.'
              : 'No ranking: none of your songs were rated that week.'}
          </p>
        ) : (
          <p className="mt-3">
            <span className="text-2xl font-bold">#{s.lastWeekRank.position}</span>
            <span className="text-muted"> of {s.lastWeekRank.of} sharers</span>
          </p>
        )}
        <Link to="/stats" className="mt-2 inline-block text-sm font-semibold text-blue hover:underline">
          View stats
        </Link>
      </Card>
    </section>
  );
}

function OpenWeekHome({ partyId, week }: { partyId: string; week: OpenWeek }) {
  const now = useNow();
  const songs = useWeekSongs(week.round.roundId, { poll: true });
  const party = useParty(partyId);
  const me = useMe();
  const preferred = me.data?.user.preferredProvider ?? null;
  const { today, progress } = week;
  const unrated = progress.ratableCount - progress.ratedCount; // the main button below says what to do about it
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

        <Card className="order-first flex flex-col lg:order-none lg:col-span-2">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Today’s drop</h2>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <DropCount label="Songs this week" value={progress.songCount} />
            <DropCount label="Rated" value={progress.ratedCount} />
            <DropCount label="Left to rate" value={Math.max(0, unrated)} />
          </dl>
          <div className="mt-4">
            <ProgressBar
              value={progress.ratedCount}
              max={progress.ratableCount}
              label="Songs rated this week"
            />
          </div>
          <div className="mt-auto pt-5">
            <MainAction action={homeAction(true, week)} />
          </div>
        </Card>
      </div>

      <HomeHighlights partyId={partyId} />

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
              roundId={week.round.roundId}
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
      <div className="mt-4">
        <p className="text-lg">
          Today isn’t a sharing day (this week: {formatDayList(shareDaysOf(week.round))}). Catch up on this
          week’s songs before ratings lock {formatLockTime(week.round.endsAt)}.
        </p>
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
    <div className="mt-4">
      <p className="text-lg">You haven’t shared a song today.</p>
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
  roundId,
  songs,
  today,
  preferred,
  sharedBy,
}: {
  roundId: string;
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
                  href={songDetailsPath(roundId, s.recommendationId)}
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
