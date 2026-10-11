// Personal stats, group stats, and leaderboards (roadmap P8.8, P8.9; spec §17, §18; mockup screens 17–21).
// Every number shows what it's based on, or "Not enough data yet" with how much is needed (docs/STATISTICS.md).
// Each stat carries its definition (spec §18: definitions must be transparent).

import type {
  ActivityPoint,
  LeaderboardPeriod,
  LeaderboardResponse,
  PersonBoard,
  SongSummary,
  SongSuperlative,
  Stat,
  Superlative,
  Winner,
} from '@dropabop/shared';
import type { ReactNode } from 'react';
import { Link, NavLink, useSearchParams } from 'react-router';
import { useGroupStats, useLeaderboard, useMe, usePersonalStats } from '../api/hooks';
import { Icon } from '../components/Icon';
import { PageHeader, QueryBoundary } from '../components/Page';
import { EmptyState } from '../components/States';
import { Leaderboard, ProvisionalList, RatingDistribution, StatCard, StatHeading } from '../components/Stats';
import { Avatar, Card, buttonClassName } from '../components/ui';
import { formatAverage } from '../lib/format';
import { nameLookup, type NameLookup } from '../lib/members';
import { useCurrentParty } from '../party/CurrentParty';
import { NoPartyCard } from './ResultsScreens';

/** A stat winner; song-based stats include a summary of the song. */
type WinnerWithSong = Winner & { song?: SongSummary | null };

const signed = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

export function StatsTabs() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-4 py-1.5 text-sm font-semibold ${isActive ? 'bg-active text-ink' : 'text-muted hover:text-ink'}`;
  return (
    <nav
      aria-label="Stats"
      className="mb-6 flex flex-wrap gap-1 rounded-full border border-line p-1 sm:w-fit"
    >
      <NavLink to="/stats" end className={tab}>
        You
      </NavLink>
      <NavLink to="/stats/group" className={tab}>
        Group
      </NavLink>
      <NavLink to="/leaderboard" className={tab}>
        Leaderboard
      </NavLink>
      <NavLink to="/achievements" className={tab}>
        Achievements
      </NavLink>
    </nav>
  );
}

/** A card for a "most …" stat: the winner(s) with their value, or "Not enough data yet". */
function SuperlativeCard({
  label,
  definition,
  stat,
  render,
  unit,
}: {
  label: string;
  definition: string;
  stat: Superlative | SongSuperlative;
  render: (winner: WinnerWithSong) => ReactNode;
  unit: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-4">
      <StatHeading label={label} definition={definition} />
      {stat.status === 'ok' ? (
        <ul className="mt-2 flex flex-col gap-2">
          {stat.value.map((winner) => (
            <li key={winner.id}>
              {render(winner)}
              <p className="text-xs text-muted">
                Based on {winner.sampleSize} {unit} · calculated
              </p>
            </li>
          ))}
          {stat.value.length > 1 && <li className="text-xs text-muted">Tied</li>}
        </ul>
      ) : (
        <>
          <p className="mt-2 font-semibold text-muted">Not enough data yet</p>
          <p className="mt-1 text-xs text-muted">
            Needs {stat.required} {unit}
          </p>
        </>
      )}
    </div>
  );
}

function songLine(winner: WinnerWithSong, names: NameLookup, valueLabel: (v: number) => string) {
  const song = winner.song ?? null;
  return (
    <div>
      <p className="line-clamp-2 font-semibold break-words">{song?.title ?? 'A song'}</p>
      <p className="truncate text-sm text-muted">
        {song?.artist}
        {song ? ` · shared by ${names.name(song.recommendedBy)}` : ''}
      </p>
      <p className="mt-1 text-xl font-bold text-primary">{valueLabel(winner.value)}</p>
    </div>
  );
}

function personLine(winner: WinnerWithSong, names: NameLookup, valueLabel: (v: number) => string) {
  return (
    <div className="flex items-center gap-2">
      <Avatar
        name={names.name(winner.id)}
        color={names.color(winner.id)}
        image={names.image(winner.id)}
        size="sm"
      />
      <span className="min-w-0 flex-1 truncate font-semibold">{names.name(winner.id)}</span>
      <span className="text-xl font-bold text-primary">{valueLabel(winner.value)}</span>
    </div>
  );
}

function WeeksNote({ weeksPlayed }: { weeksPlayed: number }) {
  return (
    <p className="mb-4 text-sm text-muted">
      {weeksPlayed === 0
        ? 'Stats appear once your party’s first week ends.'
        : `From ${weeksPlayed} finished week${weeksPlayed === 1 ? '' : 's'}. Open weeks don’t count until they end.`}
    </p>
  );
}

// ---------------------------------------------------------------------------
// /stats: personal (P8.8)
// ---------------------------------------------------------------------------

export function PersonalStatsScreen() {
  const { partyId, status, retry, current } = useCurrentParty();
  const stats = usePersonalStats(partyId);
  const me = useMe();
  if (status === 'ready' && partyId === null) return <NoPartyCard />;

  return (
    <div>
      <PageHeader title="Your stats" description={current ? `In ${current.partyName}` : undefined} />
      <StatsTabs />
      <QueryBoundary
        isPending={status === 'loading' || stats.isPending}
        error={status === 'error' ? true : stats.error}
        onRetry={() => {
          retry();
          void stats.refetch();
        }}
        loadingLabel="Calculating your stats…"
      >
        {() => {
          const s = stats.data;
          if (s === undefined) return null;
          const names = nameLookup(s.members, me.data?.user.userId);
          return (
            <>
              <WeeksNote weeksPlayed={s.weeksPlayed} />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                  label="Average rating given"
                  stat={s.averageRatingGiven}
                  unit="ratings"
                  definition="The mean of every rating you’ve given."
                />
                <StatCard
                  label="Average score received"
                  stat={s.averageScoreReceived}
                  unit="rated songs"
                  definition="The mean of the averages your shared songs received."
                />
                <StatCard
                  label="Songs shared"
                  stat={{ status: 'ok', value: s.songsRecommended, sampleSize: s.songsRecommended }}
                  unit="songs"
                  definition="How many songs you’ve shared in finished weeks."
                  format={(v) => String(v)}
                />
                <StatCard
                  label="Generosity"
                  stat={s.generosity}
                  unit="ratings"
                  definition="Your average rating minus the party’s average rating. +1.2 means you rate 1.2 points above the group."
                  format={signed}
                />
                <SuperlativeCard
                  label="Your highest-rated pick"
                  definition="Your song with the highest average rating."
                  stat={s.highestRatedRecommendation}
                  unit="ratings"
                  render={(w) => songLine(w, names, formatAverage)}
                />
                <SuperlativeCard
                  label="Your lowest-rated pick"
                  definition="Your song with the lowest average rating."
                  stat={s.lowestRatedRecommendation}
                  unit="ratings"
                  render={(w) => songLine(w, names, formatAverage)}
                />
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                <Card>
                  <div className="mb-3">
                    <StatHeading
                      heading
                      label="Ratings you give"
                      definition="How many of each rating, 1 to 10, you’ve given."
                    />
                  </div>
                  <StatBody stat={s.ratingDistribution} unit="ratings">
                    {(counts) => <RatingDistribution counts={counts} />}
                  </StatBody>
                </Card>
                <Card>
                  <div className="mb-3">
                    <StatHeading
                      heading
                      label="Favorite artists"
                      definition="Artists you rate highest on average (at least 2 of their songs rated by you). Top 3."
                    />
                  </div>
                  <StatBody stat={s.favoriteArtists} unit="songs by one artist">
                    {(artists) => (
                      <ol className="flex flex-col gap-2">
                        {artists.map((a, i) => (
                          <li key={a.artist} className="flex items-center justify-between gap-2">
                            <span className="truncate">
                              <span className="mr-2 font-bold text-muted">{i + 1}</span>
                              {a.artist}
                            </span>
                            <span className="text-right">
                              <span className="font-bold">{formatAverage(a.averageRating)}</span>
                              <span className="block text-[11px] text-muted">{a.songCount} songs</span>
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </StatBody>
                </Card>
                <Card>
                  <div className="mb-3">
                    <StatHeading
                      heading
                      label="Musical twin"
                      definition="The member whose ratings differ least from yours, on at least 5 songs you both rated. The number is the average gap between your ratings (0 = identical)."
                    />
                  </div>
                  <StatBody stat={s.musicalTwin} unit="songs you both rated">
                    {(twins) => (
                      <ul className="flex flex-col gap-2">
                        {twins.map((t) => (
                          <li key={t.userId} className="flex items-center gap-2">
                            <Avatar
                              name={names.name(t.userId)}
                              color={names.color(t.userId)}
                              image={names.image(t.userId)}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">{names.name(t.userId)}</span>
                              <span className="block text-xs text-muted">
                                {t.meanAbsoluteDifference.toFixed(1)} points apart on average ·{' '}
                                {t.sharedSongs} songs
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </StatBody>
                </Card>
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}

function StatBody<T>({
  stat,
  unit,
  children,
}: {
  stat: Stat<T>;
  unit: string;
  children: (value: T) => ReactNode;
}) {
  if (stat.status === 'not-enough-data') {
    return (
      <div>
        <p className="font-semibold text-muted">Not enough data yet</p>
        <p className="mt-1 text-xs text-muted">
          Needs {stat.required} {unit}
        </p>
      </div>
    );
  }
  return (
    <div>
      {children(stat.value)}
      <p className="mt-3 text-xs text-muted">Based on {stat.sampleSize} · calculated</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// /stats/group (P8.9)
// ---------------------------------------------------------------------------

export function GroupStatsScreen() {
  const { partyId, status, retry, current } = useCurrentParty();
  const stats = useGroupStats(partyId);
  const me = useMe();
  if (status === 'ready' && partyId === null) return <NoPartyCard />;

  return (
    <div>
      <PageHeader title="Group stats" description={current ? `In ${current.partyName}` : undefined} />
      <StatsTabs />
      <QueryBoundary
        isPending={status === 'loading' || stats.isPending}
        error={status === 'error' ? true : stats.error}
        onRetry={() => {
          retry();
          void stats.refetch();
        }}
        loadingLabel="Calculating group stats…"
      >
        {() => {
          const s = stats.data;
          if (s === undefined) return null;
          const names = nameLookup(s.members, me.data?.user.userId);
          const avg = (v: number) => formatAverage(v);
          return (
            <>
              <WeeksNote weeksPlayed={s.weeksPlayed} />
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CountCard label="Members" value={String(s.memberCount)} />
                <CountCard label="Songs shared" value={String(s.songsShared)} />
                <CountCard label="Ratings given" value={String(s.ratingsGiven)} />
                <CountCard
                  label="Group average"
                  value={s.groupAverage.status === 'ok' ? formatAverage(s.groupAverage.value) : '–'}
                  note={
                    s.groupAverage.status === 'ok'
                      ? `Based on ${s.groupAverage.sampleSize} ratings · calculated`
                      : 'Not enough data yet'
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <SuperlativeCard
                  label="Highest-rated song"
                  definition="The song with the highest average rating (at least 3 ratings)."
                  stat={s.highestRatedSong}
                  unit="ratings"
                  render={(w) => songLine(w, names, avg)}
                />
                <SuperlativeCard
                  label="Crowd favorite"
                  definition="Highest average among songs rated by at least 75% of that week’s raters (not counting whoever shared it)."
                  stat={s.crowdFavorite}
                  unit="ratings"
                  render={(w) => songLine(w, names, avg)}
                />
                <SuperlativeCard
                  label="Most divisive"
                  definition="The song whose ratings were most spread out (largest standard deviation)."
                  stat={s.mostDivisive}
                  unit="ratings"
                  render={(w) => songLine(w, names, (v) => `spread ${v.toFixed(1)}`)}
                />
                <SuperlativeCard
                  label="Most controversial"
                  definition="Love it or hate it: the most even split between low (1–3) and high (8–10) ratings. 1.0 = perfectly split."
                  stat={s.mostControversial}
                  unit="ratings"
                  render={(w) => songLine(w, names, (v) => v.toFixed(2))}
                />
                <SuperlativeCard
                  label="Everyone agreed"
                  definition="The song whose ratings were closest together (smallest standard deviation)."
                  stat={s.everyoneAgreed}
                  unit="ratings"
                  render={(w) => songLine(w, names, (v) => `spread ${v.toFixed(1)}`)}
                />
                <SuperlativeCard
                  label="Dark horse"
                  definition="The song that beat its sharer’s average from their earlier songs by the most."
                  stat={s.darkHorse}
                  unit="ratings"
                  render={(w) => songLine(w, names, (v) => `${signed(v)} vs. usual`)}
                />
                <SuperlativeCard
                  label="Most generous voter"
                  definition="Who rates highest compared with the group (generosity, at least 10 ratings)."
                  stat={s.mostGenerousVoter}
                  unit="ratings"
                  render={(w) => personLine(w, names, signed)}
                />
                <SuperlativeCard
                  label="Toughest critic"
                  definition="Who rates lowest compared with the group (generosity, at least 10 ratings)."
                  stat={s.toughestCritic}
                  unit="ratings"
                  render={(w) => personLine(w, names, signed)}
                />
                <SuperlativeCard
                  label="Most consistent"
                  definition="Smallest spread between the averages of a person’s songs (at least 3 rated songs)."
                  stat={s.mostConsistent}
                  unit="rated songs"
                  render={(w) => personLine(w, names, (v) => `spread ${v.toFixed(1)}`)}
                />
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <Card>
                  <div className="mb-3">
                    <StatHeading
                      heading
                      label="Top artists"
                      definition="The artists your party shared most (spelling doesn’t matter). Top 3; ties are all shown."
                    />
                  </div>
                  <StatBody stat={s.topArtists} unit="song">
                    {(artists) => (
                      <ol className="flex flex-col gap-2">
                        {artists.map((a) => (
                          <li key={a.artist} className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate">{a.artist}</span>
                            <span className="shrink-0 text-sm text-muted">
                              {a.songCount} song{a.songCount === 1 ? '' : 's'}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </StatBody>
                </Card>
                <Card>
                  <div className="mb-3">
                    <StatHeading
                      heading
                      label="Ratings the group gives"
                      definition="How many of each rating, 1 to 10, everyone has given."
                    />
                  </div>
                  <StatBody stat={s.ratingDistribution} unit="rating">
                    {(counts) => <RatingDistribution counts={counts} />}
                  </StatBody>
                </Card>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
                <ActivityTable
                  title="Weekly activity"
                  caption="Songs and ratings in each finished week (latest 12), newest first."
                  periodLabel="Week of"
                  points={s.weeklyActivity}
                  formatPeriod={formatWeekOf}
                />
                <ActivityTable
                  title="Monthly activity"
                  caption="Finished weeks grouped by the month their ratings locked (latest 12), newest first."
                  periodLabel="Month"
                  points={s.monthlyActivity}
                  formatPeriod={formatMonth}
                />
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}

function CountCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {note !== undefined && <p className="mt-1 text-xs text-muted">{note}</p>}
    </Card>
  );
}

const formatWeekOf = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
const formatMonth = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** A plain table (spec §37: charts need a text version; this is the text version). */
function ActivityTable({
  title,
  caption,
  periodLabel,
  points,
  formatPeriod,
}: {
  title: string;
  caption: string;
  periodLabel: string;
  points: ActivityPoint[];
  formatPeriod: (period: string) => string;
}) {
  return (
    <Card>
      <h3 className="font-bold">{title}</h3>
      {points.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nothing yet: weeks appear here once they end.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="mb-2 text-left text-xs text-muted">{caption}</caption>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="py-1 pr-2 font-medium">
                  {periodLabel}
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  Songs
                </th>
                <th scope="col" className="py-1 pr-2 text-right font-medium">
                  Ratings
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  Average
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.period} className="border-t border-line">
                  <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                    {formatPeriod(p.period)}
                  </th>
                  <td className="py-1.5 pr-2 text-right">{p.songs}</td>
                  <td className="py-1.5 pr-2 text-right">{p.ratings}</td>
                  <td className="py-1.5 text-right font-semibold">
                    {p.average === null ? '–' : formatAverage(p.average)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// /leaderboard (P8.9; periods and provisional lists P13.11, D30)
// ---------------------------------------------------------------------------

const PERIODS: { id: LeaderboardPeriod; label: string; empty: string }[] = [
  { id: 'week', label: 'This week', empty: 'No week has finished yet.' },
  { id: 'month', label: 'This month', empty: 'No week has finished this month yet.' },
  { id: 'all', label: 'All time', empty: 'Leaderboards fill in once your party’s first week ends.' },
];

function isPeriod(value: string | null): value is LeaderboardPeriod {
  return PERIODS.some((p) => p.id === value);
}

function PeriodNote({ period, weeksPlayed }: { period: LeaderboardPeriod; weeksPlayed: number }) {
  const weeks = `${weeksPlayed} finished week${weeksPlayed === 1 ? '' : 's'}`;
  const text =
    period === 'week'
      ? 'The most recent finished week.'
      : period === 'month'
        ? `Weeks whose ratings locked this month (${weeks}).`
        : `From ${weeks}.`;
  return (
    <p className="mb-4 text-sm text-muted">
      {text} Open weeks don’t count until they end. People without enough data yet are listed as
      “Provisional”, never ranked.
    </p>
  );
}

type SongEntry = LeaderboardResponse['highestAverageSongRating'][number];

function SongBoard({
  title,
  definition,
  entries,
  names,
}: {
  title: string;
  definition: string;
  entries: SongEntry[];
  names: NameLookup;
}) {
  return (
    <div>
      <h3 className="font-bold">{title}</h3>
      <p className="mt-0.5 text-xs text-muted">{definition}</p>
      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No song has enough ratings yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-1">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-raised">
              <span
                className={`w-6 text-center font-bold ${e.rank === 1 ? 'text-gold' : 'text-muted'}`}
                aria-label={`Rank ${e.rank}`}
              >
                {e.rank}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{e.song?.title ?? 'A song'}</span>
                <span className="block truncate text-xs text-muted">
                  {e.song ? `${e.song.artist} · ${names.name(e.song.recommendedBy)}` : ''}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-bold">{formatAverage(e.value)}</span>
                <span className="block text-[11px] text-muted">Based on {e.sampleSize} ratings</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PersonBoardCard({
  title,
  definition,
  board,
  names,
  unit,
  format,
}: {
  title: string;
  definition: string;
  board: PersonBoard;
  names: NameLookup;
  /** What the sample counts, e.g. "rated songs". */
  unit: string;
  format: (value: number) => string;
}) {
  return (
    <Card>
      <Leaderboard
        title={title}
        definition={definition}
        rows={board.ranked.map((e) => ({
          ...e,
          name: names.name(e.id),
          avatarColor: names.color(e.id),
          avatarImage: names.image(e.id),
        }))}
        unit={unit}
        format={format}
      />
      <ProvisionalList
        rows={board.provisional.map((p) => ({ ...p, name: names.name(p.id) }))}
        required={board.required}
        unit={unit}
      />
    </Card>
  );
}

export function LeaderboardScreen() {
  const { partyId, status, retry, current } = useCurrentParty();
  const [params, setParams] = useSearchParams();
  const requested = params.get('period');
  const period: LeaderboardPeriod = isPeriod(requested) ? requested : 'all';
  const board = useLeaderboard(partyId, period);
  const me = useMe();
  if (status === 'ready' && partyId === null) return <NoPartyCard />;

  return (
    <div>
      <PageHeader title="Leaderboard" description={current ? `In ${current.partyName}` : undefined} />
      <StatsTabs />
      <div role="group" aria-label="Period" className="mb-4 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={period === p.id}
            onClick={() => setParams(p.id === 'all' ? {} : { period: p.id }, { replace: true })}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
              period === p.id
                ? 'border-primary bg-primary/15 text-ink'
                : 'border-line text-muted hover:text-ink'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <QueryBoundary
        isPending={status === 'loading' || board.isPending}
        error={status === 'error' ? true : board.error}
        onRetry={() => {
          retry();
          void board.refetch();
        }}
        loadingLabel="Ranking everyone…"
      >
        {() => {
          const b = board.data;
          if (b === undefined) return null;
          const names = nameLookup(b.members, me.data?.user.userId);
          if (b.weeksPlayed === 0) {
            return (
              <Card>
                <EmptyState
                  title="No rankings yet"
                  message={PERIODS.find((p) => p.id === period)?.empty ?? ''}
                  action={
                    <Link to="/rate" className={buttonClassName('secondary')}>
                      <Icon name="star" className="size-4" /> Rate this week’s songs
                    </Link>
                  }
                />
              </Card>
            );
          }
          const count = (v: number) => String(v);
          return (
            <>
              <PeriodNote period={period} weeksPlayed={b.weeksPlayed} />
              <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
                <PersonBoardCard
                  title="Highest average received"
                  definition="The average rating received by each person’s shared songs."
                  board={b.highestAverageReceived}
                  names={names}
                  unit="rated songs"
                  format={formatAverage}
                />
                <PersonBoardCard
                  title="Highest average given"
                  definition="The mean of every rating a person gave."
                  board={b.highestAverageGiven}
                  names={names}
                  unit="ratings"
                  format={formatAverage}
                />
                <PersonBoardCard
                  title="Most bops"
                  definition="How many songs a person shared."
                  board={b.mostBops}
                  names={names}
                  unit="songs"
                  format={count}
                />
                <PersonBoardCard
                  title="Most ratings"
                  definition="How many ratings a person gave."
                  board={b.mostRatings}
                  names={names}
                  unit="ratings"
                  format={count}
                />
                <Card>
                  <SongBoard
                    title="Crowd favorites"
                    definition="Songs rated by at least 75% of that week’s raters, by average (at least 3 ratings)."
                    entries={b.crowdFavorites}
                    names={names}
                  />
                </Card>
                <Card>
                  <SongBoard
                    title="Highest average song rating"
                    definition="Songs ranked by average rating (at least 3 ratings)."
                    entries={b.highestAverageSongRating}
                    names={names}
                  />
                </Card>
                <PersonBoardCard
                  title="Most generous"
                  definition="Who rates highest compared with the group: their average minus the party’s."
                  board={b.mostGenerous}
                  names={names}
                  unit="ratings"
                  format={signed}
                />
                <PersonBoardCard
                  title="Toughest critic"
                  definition="Who rates lowest compared with the group: their average minus the party’s."
                  board={b.toughestCritic}
                  names={names}
                  unit="ratings"
                  format={signed}
                />
                <PersonBoardCard
                  title="Most consistent"
                  definition="Smallest spread between the averages of a person’s songs: reliably good picks."
                  board={b.mostConsistent}
                  names={names}
                  unit="rated songs"
                  format={(v) => `spread ${v.toFixed(1)}`}
                />
                <PersonBoardCard
                  title="Most popular"
                  definition="How many ratings of 8 or higher a person’s songs received."
                  board={b.mostPopular}
                  names={names}
                  unit="songs shared"
                  format={count}
                />
                <PersonBoardCard
                  title="Most surprising"
                  definition="How many of a person’s songs beat their own earlier average by 1 point or more."
                  board={b.mostSurprising}
                  names={names}
                  unit="surprising songs"
                  format={count}
                />
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
