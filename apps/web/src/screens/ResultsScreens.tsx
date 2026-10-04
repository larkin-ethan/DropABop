// Weekly Results and History (roadmap P8.6, P8.7; spec §16, §19 screens 6 and 11; mockup screens 16, 17, 22, 23).
// Results unlock when a week ends (D9). They show every song ranked, each day's Bop of the Day (D12), averages and
// anonymous rating spreads; who rated what only when the party allows it (D11).

import type { MusicProviderId, ResultsResponse, Round, SongResult } from '@dropabop/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMe, useResults, useRounds } from '../api/hooks';
import { Icon } from '../components/Icon';
import { PageHeader, QueryBoundary } from '../components/Page';
import { ListenLinks } from '../components/SongRow';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { RatingDistribution } from '../components/Stats';
import { AlbumArt, Avatar, Button, Card, buttonClassName } from '../components/ui';
import { errorCode, errorMessage } from '../lib/errors';
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

// ---------------------------------------------------------------------------
// /results: the most recent finished week
// ---------------------------------------------------------------------------

export function LatestResultsScreen() {
  const { partyId, status, retry } = useCurrentParty();
  const rounds = useRounds(partyId);

  if (status === 'ready' && partyId === null) {
    return <NoPartyCard />;
  }
  return (
    <QueryBoundary
      isPending={status === 'loading' || rounds.isPending}
      error={status === 'error' ? true : rounds.error}
      onRetry={() => {
        retry();
        void rounds.refetch();
      }}
      loadingLabel="Finding the latest results…"
    >
      {() => {
        const all = rounds.data?.pages.flatMap((p) => p.rounds) ?? [];
        const latest = all.find((r) => r.status === 'CLOSED');
        const thisWeek = all.find((r) => r.status === 'OPEN');
        if (latest === undefined) {
          return (
            <div>
              <PageHeader title="Weekly results" />
              <Card>
                <EmptyState
                  title="No results yet"
                  message={
                    thisWeek
                      ? `Results unlock when ratings lock ${formatLockTime(thisWeek.endsAt)}. Keep rating!`
                      : 'Results appear here after your party’s first week ends.'
                  }
                  action={
                    thisWeek ? (
                      <Link to="/rate" className={buttonClassName('primary')}>
                        Rate this week’s songs
                      </Link>
                    ) : undefined
                  }
                />
              </Card>
            </div>
          );
        }
        return <WeekResults roundId={latest.roundId} openWeekLocksAt={thisWeek?.endsAt ?? null} />;
      }}
    </QueryBoundary>
  );
}

// ---------------------------------------------------------------------------
// /results/:roundId
// ---------------------------------------------------------------------------

export function ResultsScreen() {
  const { roundId = '' } = useParams();
  return <WeekResults roundId={roundId} openWeekLocksAt={null} />;
}

function WeekResults({ roundId, openWeekLocksAt }: { roundId: string; openWeekLocksAt: string | null }) {
  const results = useResults(roundId);
  const me = useMe();

  if (results.isPending) return <LoadingState label="Loading the results…" rows={5} />;
  if (results.error) {
    // "Not ready" is an expected answer (the week is still open, or had too few songs), not a failure.
    if (errorCode(results.error) === 'RESULTS_NOT_READY') {
      return (
        <div>
          <PageHeader title="Weekly results" />
          <Card>
            <EmptyState title="Not ready yet" message={errorMessage(results.error)} />
          </Card>
        </div>
      );
    }
    return <ErrorState message={errorMessage(results.error)} onRetry={() => void results.refetch()} />;
  }
  const data = results.data;
  const names = nameLookup(data.members, me.data?.user.userId);
  return (
    <ResultsView
      data={data}
      names={names}
      preferred={me.data?.user.preferredProvider ?? null}
      openWeekLocksAt={openWeekLocksAt}
    />
  );
}

function ResultsView({
  data,
  names,
  preferred,
  openWeekLocksAt,
}: {
  data: ResultsResponse;
  names: NameLookup;
  preferred: MusicProviderId | null;
  /** When this (still open) week's ratings lock, if the results shown are last week's. */
  openWeekLocksAt: string | null;
}) {
  const [view, setView] = useState<'overall' | 'days'>('overall');
  const { results, round } = data;
  const byId = new Map(results.songs.map((s) => [s.recommendationId, s]));
  const rated = results.songs.filter((s) => s.ratingCount > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={formatWeekLabel(round.weekStart)}
        title="Week complete!"
        description={`${results.songs.length} songs, ${results.totalRatings} ratings.`}
        actions={
          <Link to="/history" className={buttonClassName('ghost')}>
            <Icon name="history" className="size-4" /> All weeks
          </Link>
        }
      />
      {openWeekLocksAt !== null && (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          These are last week’s results. This week’s unlock {formatLockTime(openWeekLocksAt)}.{' '}
          <Link to="/rate" className="font-semibold text-blue hover:underline">
            Keep rating
          </Link>
        </p>
      )}

      {/* Bop of the Day for each sharing day (D12) */}
      <section aria-labelledby="bop-of-the-day">
        <h2 id="bop-of-the-day" className="mb-3 flex items-center gap-2 text-lg font-bold">
          <Icon name="crown" className="size-5 text-gold" /> Bop of the Day
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {results.days.map((day) => {
            const winners = day.winnerIds.map((id) => byId.get(id)).filter((s) => s !== undefined);
            return (
              <Card key={day.weekday} className="p-4">
                <p className="text-xs font-semibold tracking-wider text-blue uppercase">
                  {DAY_NAMES[day.weekday]}
                </p>
                {winners.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    {day.songIds.length === 0 ? 'No songs shared' : 'No ratings'}
                  </p>
                ) : (
                  winners.map((w) => (
                    <div key={w.recommendationId} className="mt-2">
                      <p className="truncate font-semibold">{w.song.title}</p>
                      <p className="truncate text-sm text-muted">{w.song.artist}</p>
                      <p className="mt-1 text-sm">
                        <span className="font-bold text-gold">
                          {w.averageRating === null ? '–' : formatAverage(w.averageRating)}
                        </span>{' '}
                        <span className="text-muted">· {names.name(w.recommendedBy)}</span>
                      </p>
                    </div>
                  ))
                )}
                {winners.length > 1 && <p className="mt-1 text-xs text-muted">Tied</p>}
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-label="All songs">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">All songs</h2>
          <div
            className="flex gap-1 rounded-full border border-line p-1"
            role="group"
            aria-label="How to group songs"
          >
            {(
              [
                ['overall', 'Overall ranking'],
                ['days', 'By day'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  view === value ? 'bg-active text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {view === 'overall' ? (
          <ol className="flex flex-col gap-3">
            {results.songs.map((s) => (
              <ResultCard key={s.recommendationId} result={s} names={names} preferred={preferred} />
            ))}
          </ol>
        ) : (
          <div className="flex flex-col gap-5">
            {results.days
              .filter((d) => d.songIds.length > 0)
              .map((day) => (
                <div key={day.weekday}>
                  <h3 className="mb-2 text-xs font-semibold tracking-wider text-blue uppercase">
                    {DAY_NAMES[day.weekday]}
                  </h3>
                  <ol className="flex flex-col gap-3">
                    {day.songIds
                      .map((id) => byId.get(id))
                      .filter((s) => s !== undefined)
                      .map((s) => (
                        <ResultCard
                          key={s.recommendationId}
                          result={s}
                          names={names}
                          preferred={preferred}
                          dayWinner={day.winnerIds.includes(s.recommendationId)}
                        />
                      ))}
                  </ol>
                </div>
              ))}
          </div>
        )}
        {rated < results.songs.length && (
          <p className="mt-3 text-xs text-muted">Songs with no ratings are listed last.</p>
        )}
      </section>
    </div>
  );
}

function ResultCard({
  result,
  names,
  preferred,
  dayWinner = false,
}: {
  result: SongResult;
  names: NameLookup;
  preferred: MusicProviderId | null;
  dayWinner?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="card-glow rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex items-start gap-3 sm:items-center">
        <span
          className={`w-7 shrink-0 text-center text-lg font-bold ${result.rank === 1 ? 'text-gold' : 'text-muted'}`}
          aria-label={`Rank ${result.rank}`}
        >
          {result.rank}
        </span>
        <AlbumArt url={result.song.albumArtUrl} hue={hueFor(result.recommendationId)} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {result.song.title}
            {dayWinner && (
              <span className="ml-2 align-middle text-xs font-semibold text-gold">
                <Icon name="crown" className="inline size-3.5" /> Bop of the Day
              </span>
            )}
          </p>
          <p className="truncate text-sm text-muted">{result.song.artist}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <Avatar
              name={names.name(result.recommendedBy)}
              color={names.color(result.recommendedBy)}
              image={names.image(result.recommendedBy)}
              size="sm"
            />
            Shared by {names.name(result.recommendedBy)} · {formatShortDate(result.submittedOn)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold text-primary">
            {result.averageRating === null ? '–' : formatAverage(result.averageRating)}
          </p>
          <p className="text-xs text-muted">
            {result.ratingCount === 0
              ? 'No ratings'
              : `${result.ratingCount} rating${result.ratingCount === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <ListenLinks song={result.song} preferred={preferred} />
        <div className="flex items-center gap-3 text-sm">
          {result.myRating !== null && (
            <span className="text-muted">
              You gave <span className="font-semibold text-ink">{result.myRating}</span>
            </span>
          )}
          {result.ratingCount > 0 && (
            <Button
              variant="ghost"
              className="px-3 py-1"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? 'Hide details' : 'Details'}
            </Button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-3 grid gap-4 border-t border-line pt-3 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold text-muted uppercase">How it was rated</p>
            <RatingDistribution counts={result.distribution} />
          </div>
          {result.ratings && (
            <div>
              <p className="mb-2 text-xs font-semibold text-muted uppercase">Who rated what</p>
              <ul className="flex flex-col gap-1.5 text-sm">
                {result.ratings.map((r) => (
                  <li key={r.userId} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Avatar
                        name={names.name(r.userId)}
                        color={names.color(r.userId)}
                        image={names.image(r.userId)}
                        size="sm"
                      />
                      {names.name(r.userId)}
                    </span>
                    <span className="font-semibold">{r.rating}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// /history (P8.7)
// ---------------------------------------------------------------------------

export function HistoryScreen() {
  const { partyId, status, retry } = useCurrentParty();
  const rounds = useRounds(partyId);

  if (status === 'ready' && partyId === null) return <NoPartyCard />;

  return (
    <div>
      <PageHeader title="History" description="Every week your party has played, newest first." />
      <QueryBoundary
        isPending={status === 'loading' || rounds.isPending}
        error={status === 'error' ? true : rounds.error}
        onRetry={() => {
          retry();
          void rounds.refetch();
        }}
        loadingLabel="Loading past weeks…"
      >
        {() => {
          const all = rounds.data?.pages.flatMap((p) => p.rounds) ?? [];
          if (all.length === 0) {
            return (
              <Card>
                <EmptyState title="No weeks yet" message="Your party’s weeks will be listed here." />
              </Card>
            );
          }
          return (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-3">
                {all.map((r) => (
                  <HistoryRow key={r.roundId} round={r} />
                ))}
              </ul>
              {rounds.hasNextPage && (
                <Button
                  variant="secondary"
                  className="self-center"
                  disabled={rounds.isFetchingNextPage}
                  onClick={() => void rounds.fetchNextPage()}
                >
                  {rounds.isFetchingNextPage ? 'Loading…' : 'Show older weeks'}
                </Button>
              )}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}

function HistoryRow({ round }: { round: Round }) {
  const content = (
    <>
      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-active text-blue">
        <Icon name={round.status === 'CLOSED' ? 'trophy' : round.status === 'OPEN' ? 'clock' : 'history'} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{formatWeekLabel(round.weekStart)}</span>
        <span className="block text-sm text-muted">
          {round.status === 'OPEN'
            ? 'This week · in progress'
            : round.status === 'CLOSED'
              ? 'Results ready'
              : 'Not enough songs were shared for results'}
        </span>
      </span>
      {round.status !== 'NOT_ENOUGH_SONGS' && (
        <Icon name="chevronDown" className="size-4 -rotate-90 text-muted" />
      )}
    </>
  );
  const className =
    'card-glow flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4';
  if (round.status === 'NOT_ENOUGH_SONGS') {
    return <li className={className}>{content}</li>;
  }
  return (
    <li>
      <Link
        to={round.status === 'OPEN' ? '/' : `/results/${encodeURIComponent(round.roundId)}`}
        className={`${className} transition hover:border-blue/60`}
      >
        {content}
      </Link>
    </li>
  );
}

export function NoPartyCard() {
  return (
    <Card>
      <EmptyState
        title="Join a party first"
        message="Results, history, and stats belong to a party."
        action={
          <Link to="/join" className={buttonClassName('primary')}>
            Join with a code
          </Link>
        }
      />
    </Card>
  );
}
