// History calendar, Day view and Week view (spec v2 §16, §23; roadmap P13.8; D31). One API call per month
// (GET /parties/{partyId}/history). Ratings only for weeks whose ratings have locked (D9); open weeks show counts.

import type { HistoryDay, HistoryResponse, HistorySong, HistoryWeek } from '@dropabop/shared';
import type { ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useAchievements, useHistory } from '../api/hooks';
import { Icon } from '../components/Icon';
import { PageHeader, QueryBoundary } from '../components/Page';
import { EmptyState } from '../components/States';
import { RatingDistribution } from '../components/Stats';
import { AlbumArt, Card, buttonClassName } from '../components/ui';
import {
  DAY_NAMES,
  formatAverage,
  formatLockTime,
  formatShortDate,
  formatWeekLabel,
  hueFor,
} from '../lib/format';
import { nameLookup, type NameLookup } from '../lib/members';
import { useCurrentParty } from '../party/CurrentParty';
import { HistoryScreen } from './ResultsScreens';
import { NoPartyCard } from './ResultsScreens';
import { songDetailsPath } from './SongDetailsScreen';

// ---------------------------------------------------------------------------------------------------------------
// Dates (YYYY-MM-DD strings). Calendar maths uses UTC so dates never shift; "today" is the viewer's own day.
// ---------------------------------------------------------------------------------------------------------------

/** A moment as a YYYY-MM-DD date on the viewer's own calendar. */
function localDate(moment: Date): string {
  return `${moment.getFullYear()}-${String(moment.getMonth() + 1).padStart(2, '0')}-${String(moment.getDate()).padStart(2, '0')}`;
}

function todayIso(): string {
  return localDate(new Date());
}

function shiftDays(iso: string, days: number): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function shiftMonth(month: string, by: number): string {
  const [y = 1970, m = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

function monthTitle(month: string): string {
  const [y = 1970, m = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function longDate(iso: string): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** A real YYYY-MM-DD date (so a typo in a link shows "not found" rather than an error that retrying can't fix). */
function isValidDate(iso: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(iso) && shiftDays(iso, 0) === iso;
}

/** The month's calendar grid: weeks of 7 dates, Sunday first, padded with the neighbouring months' dates. */
function calendarGrid(month: string): string[][] {
  const first = `${month}-01`;
  const [y = 1970, m = 1] = month.split('-').map(Number);
  const startOffset = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sunday
  let cursor = shiftDays(first, -startOffset);
  const weeks: string[][] = [];
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = shiftDays(cursor, 1);
    }
    weeks.push(week);
  } while (cursor.slice(0, 7) === month);
  return weeks;
}

/** Loads one month for the current party, with the shared loading / error / no-party states. */
function MonthData({ month, children }: { month: string; children: (data: HistoryResponse) => ReactNode }) {
  const { partyId, status, retry } = useCurrentParty();
  const history = useHistory(partyId, month);
  if (status === 'ready' && partyId === null) return <NoPartyCard />;
  return (
    <QueryBoundary
      isPending={status === 'loading' || history.isPending}
      error={status === 'error' ? true : history.error}
      onRetry={() => {
        retry();
        void history.refetch();
      }}
      loadingLabel="Loading your history…"
    >
      {() => (history.data ? children(history.data) : null)}
    </QueryBoundary>
  );
}

function BackToCalendar({ month }: { month: string }) {
  return (
    <Link
      to={`/history?month=${month}`}
      className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue hover:underline"
    >
      <Icon name="arrowLeft" className="size-4" /> Back to calendar
    </Link>
  );
}

function Figure({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-primary">{value}</p>
    </div>
  );
}

const shown = (value: number | null) => (value === null ? '–' : formatAverage(value));

// ---------------------------------------------------------------------------------------------------------------
// Calendar (/history)
// ---------------------------------------------------------------------------------------------------------------

export function HistoryCalendarScreen() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'list' ? 'list' : 'calendar';
  const requested = params.get('month') ?? '';
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : todayIso().slice(0, 7);

  const toggle = (
    <div role="group" aria-label="History view" className="inline-flex rounded-full border border-line p-1">
      {(['calendar', 'list'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => setParams(v === 'list' ? { view: 'list' } : { month })}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${view === v ? 'bg-primary text-primary-ink' : 'text-muted'}`}
        >
          {v === 'calendar' ? 'Calendar' : 'List'}
        </button>
      ))}
    </div>
  );

  if (view === 'list') {
    return (
      <div>
        <div className="mb-4 flex justify-end">{toggle}</div>
        <HistoryScreen />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="History" description="Your party’s weeks, day by day." actions={toggle} />
      <Card>
        <div className="mb-4 flex items-center justify-between gap-2">
          <Link
            to={`/history?month=${shiftMonth(month, -1)}`}
            aria-label="Previous month"
            className={buttonClassName('ghost', 'px-3')}
          >
            <Icon name="arrowLeft" className="size-4" />
          </Link>
          <h2 className="text-lg font-bold">{monthTitle(month)}</h2>
          <div className="flex items-center gap-1">
            <Link to="/history" className={buttonClassName('ghost', 'px-3 text-sm')}>
              Today
            </Link>
            <Link
              to={`/history?month=${shiftMonth(month, 1)}`}
              aria-label="Next month"
              className={buttonClassName('ghost', 'px-3')}
            >
              <Icon name="arrowLeft" className="size-4 rotate-180" />
            </Link>
          </div>
        </div>
        <MonthData month={month}>{(data) => <Calendar month={month} data={data} />}</MonthData>
      </Card>
    </div>
  );
}

function Calendar({ month, data }: { month: string; data: HistoryResponse }) {
  const days = new Map<string, HistoryDay>();
  for (const week of data.weeks) for (const day of week.days) days.set(day.date, day);
  const today = todayIso();
  const weeksInMonth = data.weeks;
  // D31: a 🏆 on the day ratings locked for a week that unlocked one of your achievements.
  const { partyId } = useCurrentParty();
  const achievements = useAchievements(partyId);
  const unlockDays = new Set(
    (achievements.data?.achievements ?? []).flatMap((a) => (a.unlockedDay === null ? [] : [a.unlockedDay])),
  );

  return (
    <div>
      <table className="w-full table-fixed border-separate border-spacing-1 text-center">
        <caption className="sr-only">{monthTitle(month)}: days with songs are links</caption>
        <thead>
          <tr className="text-xs text-muted">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <th key={d} scope="col" className="py-1 font-medium">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calendarGrid(month).map((week) => (
            <tr key={week[0]}>
              {week.map((date) => (
                <td key={date} className="p-0">
                  <CalendarDay
                    date={date}
                    inMonth={date.slice(0, 7) === month}
                    day={days.get(date)}
                    today={today}
                    unlocked={unlockDays.has(date)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-blue" aria-hidden="true" /> Songs shared
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-primary" aria-hidden="true" /> You shared
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="star" className="size-3 text-gold" /> Your best song yet
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true">🏆</span> Achievement unlocked
        </span>
      </p>

      <h3 className="mt-6 mb-2 text-sm font-semibold text-muted">Weeks</h3>
      {weeksInMonth.length === 0 ? (
        <EmptyState title="No weeks this month" message="Weeks your party plays will show up here." />
      ) : (
        <ul className="flex flex-col gap-2">
          {weeksInMonth.map((week) => (
            <li key={week.roundId}>
              <Link
                to={`/history/week/${week.weekStart}`}
                className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 transition hover:bg-surface-raised"
              >
                <Icon name={week.status === 'OPEN' ? 'clock' : 'trophy'} className="size-4 text-blue" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{formatWeekLabel(week.weekStart)}</span>
                  <span className="block text-xs text-muted">
                    {week.days.reduce((n, d) => n + d.songCount, 0)} songs ·{' '}
                    {week.status === 'OPEN'
                      ? 'ratings open'
                      : week.status === 'CLOSED'
                        ? `average ${shown(week.summary?.averageRating ?? null)}`
                        : 'no results'}
                  </span>
                </span>
                <Icon name="chevronDown" className="size-4 -rotate-90 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CalendarDay({
  date,
  inMonth,
  day,
  today,
  unlocked,
}: {
  date: string;
  inMonth: boolean;
  day: HistoryDay | undefined;
  today: string;
  /** One of your achievements was unlocked when ratings locked that day. */
  unlocked: boolean;
}) {
  const number = Number(date.slice(8));
  const isToday = date === today;
  const hasSongs = day !== undefined && day.songCount > 0;
  const label = [
    longDate(date),
    hasSongs ? `${day.songCount} song${day.songCount === 1 ? '' : 's'}` : 'no songs',
    day?.iShared ? 'you shared' : null,
    day?.personalBest ? 'your best song yet' : null,
    unlocked ? 'achievement unlocked' : null,
  ]
    .filter(Boolean)
    .join(', ');
  const inner = (
    <span
      className={`flex aspect-square flex-col items-center justify-center rounded-lg text-sm ${
        inMonth ? '' : 'opacity-40'
      } ${isToday ? 'bg-primary font-bold text-primary-ink' : hasSongs ? 'bg-surface-raised' : ''}`}
    >
      <span>{number}</span>
      <span className="flex h-2 items-center gap-0.5" aria-hidden="true">
        {hasSongs && <span className={`size-1.5 rounded-full ${day.iShared ? 'bg-primary' : 'bg-blue'}`} />}
        {day?.personalBest && <Icon name="star" className="size-2.5 text-gold" />}
        {unlocked && <span className="text-[8px] leading-none">🏆</span>}
      </span>
    </span>
  );
  if (!hasSongs) {
    return inner; // no songs: the visible date number is enough
  }
  return (
    <Link to={`/history/day/${date}`} aria-label={label} className="block hover:brightness-125">
      {inner}
    </Link>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Day view (/history/day/:date)
// ---------------------------------------------------------------------------------------------------------------

export function HistoryDayScreen() {
  const { date = '' } = useParams();
  const valid = isValidDate(date);
  const month = valid ? date.slice(0, 7) : todayIso().slice(0, 7);
  return (
    <div className="mx-auto max-w-3xl">
      <BackToCalendar month={month} />
      <PageHeader title={valid ? longDate(date) : 'Day not found'} />
      {!valid ? (
        <Card>
          <EmptyState title="That isn’t a date" message="Pick a day on the calendar." />
        </Card>
      ) : (
        <MonthData month={month}>
          {(data) => {
            const week = data.weeks.find((w) => w.days.some((d) => d.date === date));
            const day = week?.days.find((d) => d.date === date);
            if (week === undefined || day === undefined) {
              return (
                <Card>
                  <EmptyState title="No sharing that day" message="Pick a day with a dot on the calendar." />
                </Card>
              );
            }
            return <DayView week={week} day={day} names={nameLookup(data.members)} />;
          }}
        </MonthData>
      )}
    </div>
  );
}

function DayView({ week, day, names }: { week: HistoryWeek; day: HistoryDay; names: NameLookup }) {
  const stats = day.stats;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted">
        {DAY_NAMES[day.weekday]} of the{' '}
        <Link to={`/history/week/${week.weekStart}`} className="text-blue hover:underline">
          {formatWeekLabel(week.weekStart).toLowerCase()}
        </Link>{' '}
        · {day.songCount} song{day.songCount === 1 ? '' : 's'}
      </p>
      {stats === null ? (
        <Card>
          <EmptyState
            title={week.status === 'OPEN' ? 'Results after ratings lock' : 'No results for this week'}
            message={
              week.status === 'OPEN'
                ? `Ratings stay private until ${formatLockTime(week.endsAt)}. Then this day’s numbers appear.`
                : 'This week ended with too few songs for results.'
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label="Songs" value={stats.songs.length} />
            <Figure label="Ratings" value={stats.ratingCount} />
            <Figure label="Songs you rated" value={stats.myRatingCount} />
            <Figure label="Your average given" value={shown(stats.myAverageGiven)} />
            <Figure label="Your average received" value={shown(stats.myAverageReceived)} />
          </div>
          {stats.bopOfTheDay.length > 0 && (
            <Card>
              <h2 className="mb-2 inline-flex items-center gap-1.5 font-bold text-gold">
                <Icon name="crown" className="size-4" /> Bop of the Day
              </h2>
              <SongList
                songs={stats.songs.filter((s) => stats.bopOfTheDay.includes(s.recommendationId))}
                roundId={week.roundId}
                names={names}
              />
            </Card>
          )}
          {stats.lowestRated.length > 0 && (
            <Card>
              <h2 className="mb-2 font-bold">Lowest rated</h2>
              <SongList
                songs={stats.songs.filter((s) => stats.lowestRated.includes(s.recommendationId))}
                roundId={week.roundId}
                names={names}
              />
            </Card>
          )}
          <Card>
            <h2 className="mb-2 font-bold">The day’s songs</h2>
            <SongList songs={stats.songs} roundId={week.roundId} names={names} />
            <p className="mt-3 text-sm text-muted">
              Group average {shown(stats.groupAverage)}
              {stats.favoriteArtists.length > 0 &&
                ` · Favourite artists: ${stats.favoriteArtists.join(', ')}`}
            </p>
          </Card>
          {stats.ratingCount > 0 && (
            <Card>
              <h2 className="mb-3 font-bold">Rating distribution</h2>
              <RatingDistribution counts={stats.distribution} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function SongList({ songs, roundId, names }: { songs: HistorySong[]; roundId: string; names: NameLookup }) {
  return (
    <ul className="flex flex-col gap-1">
      {songs.map((song) => (
        <li key={song.recommendationId}>
          <Link
            to={songDetailsPath(roundId, song.recommendationId)}
            className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-surface-raised"
          >
            <AlbumArt url={song.albumArtUrl} hue={hueFor(song.recommendationId)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{song.title}</span>
              <span className="block truncate text-sm text-muted">
                {song.artist} · {song.isMine ? 'your pick' : `shared by ${names.name(song.recommendedBy)}`}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-lg font-bold text-primary">{shown(song.average)}</span>
              <span className="block text-xs text-muted">
                #{song.rank}
                {song.myRating !== null && ` · you ${song.myRating}`}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Week view (/history/week/:weekStart) with "Your week" (spec §23)
// ---------------------------------------------------------------------------------------------------------------

export function HistoryWeekScreen() {
  const { weekStart = '' } = useParams();
  const valid = isValidDate(weekStart);
  const month = valid ? weekStart.slice(0, 7) : todayIso().slice(0, 7);
  return (
    <div className="mx-auto max-w-3xl">
      <BackToCalendar month={month} />
      <PageHeader
        title={valid ? formatWeekLabel(weekStart) : 'Week not found'}
        actions={
          valid && (
            <div className="flex gap-1">
              <Link
                to={`/history/week/${shiftDays(weekStart, -7)}`}
                className={buttonClassName('ghost', 'px-3 text-sm')}
              >
                Previous week
              </Link>
              <Link
                to={`/history/week/${shiftDays(weekStart, 7)}`}
                className={buttonClassName('ghost', 'px-3 text-sm')}
              >
                Next week
              </Link>
            </div>
          )
        }
      />
      {!valid ? (
        <Card>
          <EmptyState title="That isn’t a week" message="Pick a week on the calendar." />
        </Card>
      ) : (
        <MonthData month={month}>
          {(data) => {
            const week = data.weeks.find((w) => w.weekStart === weekStart);
            if (week === undefined) {
              return (
                <Card>
                  <EmptyState title="No week here" message="Your party didn’t play that week." />
                </Card>
              );
            }
            return <WeekView week={week} names={nameLookup(data.members)} />;
          }}
        </MonthData>
      )}
    </div>
  );
}

function WeekView({ week, names }: { week: HistoryWeek; names: NameLookup }) {
  const { summary, yourWeek } = week;
  const songsById = new Map(
    week.days.flatMap((d) => d.stats?.songs ?? []).map((s) => [s.recommendationId, s]),
  );
  const songCount = week.days.reduce((n, d) => n + d.songCount, 0);

  const breakdown = (
    <Card>
      <h2 className="mb-2 font-bold">Day by day</h2>
      <ul className="flex flex-col">
        {week.days.map((day) => (
          <li key={day.date} className="border-b border-line last:border-b-0">
            <Link
              to={`/history/day/${day.date}`}
              className="flex items-center justify-between gap-3 py-2.5 hover:text-blue"
            >
              <span>
                {DAY_NAMES[day.weekday]} · {formatShortDate(day.date)}
              </span>
              <span className="text-sm text-muted">
                {day.songCount} song{day.songCount === 1 ? '' : 's'}
                {day.stats !== null && ` · ${shown(day.stats.groupAverage)}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );

  if (summary === null || yourWeek === null) {
    return (
      <div className="flex flex-col gap-5">
        <Card>
          <EmptyState
            title={week.status === 'OPEN' ? 'Results after ratings lock' : 'No results for this week'}
            message={
              week.status === 'OPEN'
                ? `${songCount} songs so far. The numbers appear when ratings lock ${formatLockTime(week.endsAt)}.`
                : 'This week ended with too few songs for results.'
            }
          />
        </Card>
        {breakdown}
      </div>
    );
  }

  const song = (id: string | null) => (id === null ? undefined : songsById.get(id));
  const topSong = song(yourWeek.topSong);
  const titles = (ids: string[]) =>
    ids
      .map((id) => song(id))
      .filter((s): s is HistorySong => s !== undefined)
      .map((s) => `${s.title} (${s.artist})`)
      .join(', ');
  const agreeableDays = week.days.filter((d) => summary.mostAgreeableDays.includes(d.date));
  const best = song(summary.bestSongs[0] ?? null);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Songs" value={summary.songCount} />
        <Figure label="Ratings" value={summary.ratingCount} />
        <Figure label="Average rating" value={shown(summary.averageRating)} />
        <Figure label="Best average" value={shown(best?.average ?? null)} />
      </div>

      <Card>
        <h2 className="mb-3 font-bold">Your week</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure label="Songs you rated" value={yourWeek.songsRated} />
          <Figure label="Average given" value={shown(yourWeek.averageGiven)} />
          <Figure label="Average received" value={shown(yourWeek.averageReceived)} />
          <Figure
            label="Your rank"
            value={yourWeek.rank === null ? '–' : `#${yourWeek.rank.position} of ${yourWeek.rank.of}`}
          />
        </div>
        {topSong !== undefined && (
          <>
            <h3 className="mt-4 mb-1 text-sm font-semibold text-muted">Your top song</h3>
            <SongList songs={[topSong]} roundId={week.roundId} names={names} />
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-bold">Top songs</h2>
        <SongList
          songs={[...songsById.values()].sort((a, b) => a.rank - b.rank).slice(0, 5)}
          roundId={week.roundId}
          names={names}
        />
      </Card>

      <div className="grid gap-5 sm:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-bold">Top artists</h2>
          <ol className="flex flex-col gap-1 text-sm">
            {summary.topArtists.map((a, i) => (
              <li key={a.artist} className="flex justify-between gap-2">
                <span>
                  {i + 1}. {a.artist}
                </span>
                <span className="text-muted">
                  {a.songs} song{a.songs === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">Highlights</h2>
          <p className="text-sm">
            <span className="text-muted">Best song: </span>
            {summary.bestSongs.length === 0 ? 'no ratings' : titles(summary.bestSongs)}
          </p>
          <p className="mt-1 text-sm">
            <span className="text-muted">Most agreeable day: </span>
            {agreeableDays.length === 0
              ? 'not enough ratings'
              : agreeableDays.map((d) => DAY_NAMES[d.weekday]).join(', ')}
          </p>
          <p className="mt-1 text-sm">
            <span className="text-muted">Most divisive: </span>
            {summary.mostDivisive.length === 0 ? 'not enough ratings' : titles(summary.mostDivisive)}
          </p>
        </Card>
      </div>

      {summary.ratingCount > 0 && (
        <Card>
          <h2 className="mb-3 font-bold">Rating distribution</h2>
          <RatingDistribution counts={summary.distribution} />
        </Card>
      )}

      {breakdown}
    </div>
  );
}
