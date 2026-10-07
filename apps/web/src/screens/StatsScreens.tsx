// Personal stats, group stats, and leaderboards (roadmap P8.8, P8.9; spec §17, §18; mockup screens 17–21).
// Every number shows what it's based on, or "Not enough data yet" with how much is needed (docs/STATISTICS.md).
// Each stat carries its definition (spec §18: definitions must be transparent).

import type { SongSummary, SongSuperlative, Stat, Superlative, Winner } from '@dropabop/shared';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import { useGroupStats, useLeaderboard, useMe, usePersonalStats } from '../api/hooks';
import { Icon } from '../components/Icon';
import { PageHeader, QueryBoundary } from '../components/Page';
import { EmptyState } from '../components/States';
import { Leaderboard, RatingDistribution, StatCard, StatHeading } from '../components/Stats';
import { Avatar, Card, buttonClassName } from '../components/ui';
import { formatAverage } from '../lib/format';
import { nameLookup, type NameLookup } from '../lib/members';
import { useCurrentParty } from '../party/CurrentParty';
import { NoPartyCard } from './ResultsScreens';

/** A stat winner; song-based stats include a summary of the song. */
type WinnerWithSong = Winner & { song?: SongSummary | null };

const signed = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

function StatsTabs() {
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
              <div className="mb-4 grid grid-cols-2 gap-3">
                <Card className="p-4">
                  <p className="text-sm text-muted">Songs shared</p>
                  <p className="mt-1 text-3xl font-bold">{s.songsShared}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-muted">Ratings given</p>
                  <p className="mt-1 text-3xl font-bold">{s.ratingsGiven}</p>
                </Card>
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
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}

// ---------------------------------------------------------------------------
// /leaderboard (P8.9)
// ---------------------------------------------------------------------------

export function LeaderboardScreen() {
  const { partyId, status, retry, current } = useCurrentParty();
  const board = useLeaderboard(partyId);
  const me = useMe();
  if (status === 'ready' && partyId === null) return <NoPartyCard />;

  return (
    <div>
      <PageHeader title="Leaderboard" description={current ? `In ${current.partyName}` : undefined} />
      <StatsTabs />
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
          const people = (entries: typeof b.mostConsistent) =>
            entries.map((e) => ({
              ...e,
              name: names.name(e.id),
              avatarColor: names.color(e.id),
              avatarImage: names.image(e.id),
            }));
          if (b.weeksPlayed === 0) {
            return (
              <Card>
                <EmptyState
                  title="No rankings yet"
                  message="Leaderboards fill in once your party’s first week ends."
                  action={
                    <Link to="/rate" className={buttonClassName('secondary')}>
                      <Icon name="star" className="size-4" /> Rate this week’s songs
                    </Link>
                  }
                />
              </Card>
            );
          }
          return (
            <>
              <WeeksNote weeksPlayed={b.weeksPlayed} />
              <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
                <Card>
                  <h3 className="font-bold">Highest average song rating</h3>
                  <p className="mt-0.5 text-xs text-muted">
                    Songs ranked by average rating (at least 3 ratings).
                  </p>
                  {b.highestAverageSongRating.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted">No song has enough ratings yet.</p>
                  ) : (
                    <ol className="mt-3 flex flex-col gap-1">
                      {b.highestAverageSongRating.map((e) => (
                        <li
                          key={e.id}
                          className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-raised"
                        >
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
                            <span className="block text-[11px] text-muted">
                              Based on {e.sampleSize} ratings
                            </span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Card>
                <Card>
                  <Leaderboard
                    title="Highest average recommendation score"
                    definition="The average rating received by each person’s shared songs (at least 3 rated songs)."
                    rows={people(b.highestAverageRecommendationScore)}
                    unit="songs"
                    format={formatAverage}
                  />
                </Card>
                <Card>
                  <Leaderboard
                    title="Most consistent"
                    definition="Smallest spread between the averages of a person’s songs: reliably good picks (at least 3 rated songs)."
                    rows={people(b.mostConsistent)}
                    unit="songs"
                    format={(v) => `spread ${v.toFixed(1)}`}
                  />
                </Card>
                <Card>
                  <Leaderboard
                    title="Most surprising"
                    definition="How many of a person’s songs beat their own earlier average by 1 point or more."
                    rows={people(b.mostSurprising)}
                    unit="songs"
                    format={(v) => String(v)}
                  />
                </Card>
                <Card>
                  <Leaderboard
                    title="Most popular"
                    definition="How many ratings of 8 or higher a person’s songs received (at least 3 songs shared)."
                    rows={people(b.mostPopular)}
                    unit="songs"
                    format={(v) => String(v)}
                  />
                </Card>
              </div>
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
