// Rate this week's songs (roadmap P8.5; spec §19 screen 5; mockup screen 12).
// All of the week's songs grouped by day, anonymous while the week is open (D10). Ratings save as you tap and can be
// changed until the week's ratings lock (D8). You can't rate your own songs (D6).

import type { CurrentWeekResponse, MusicProviderId, OpenWeekSongView } from '@dropabop/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { safeDecode } from '../lib/pending-invite';
import { useCastVote, useCurrentWeek, useMe, useWeekSongs } from '../api/hooks';
import { Icon } from '../components/Icon';
import { PageHeader, QueryBoundary } from '../components/Page';
import { RatingControl } from '../components/RatingControl';
import { ListenLinks, MyPickBadge } from '../components/SongRow';
import { EmptyState } from '../components/States';
import { AlbumArt, Card, ProgressBar, buttonClassName } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { DAY_NAMES, formatLockTime, formatTimeLeft, hueFor } from '../lib/format';
import { WEEKDAYS } from '@dropabop/shared';
import { useNow } from '../lib/useNow';
import { useCurrentParty } from '../party/CurrentParty';
import { useSharerNames } from '../party/useSharerNames';

type OpenWeek = Extract<CurrentWeekResponse, { reason: null }>;

/** How long after the last tap or key press a rating is saved. */
export const SAVE_DELAY_MS = 400;

export function RateScreen() {
  const { partyId, status, retry } = useCurrentParty();
  const week = useCurrentWeek(partyId);

  if (status === 'ready' && partyId === null) {
    return (
      <Card>
        <EmptyState
          title="Join a party first"
          message="You rate the songs shared in your party."
          action={
            <Link to="/join" className={buttonClassName('primary')}>
              Join with a code
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <QueryBoundary
      isPending={status === 'loading' || week.isPending}
      error={status === 'error' ? true : week.error}
      onRetry={() => {
        retry();
        void week.refetch();
      }}
      loadingLabel="Loading this week…"
    >
      {() => {
        const data = week.data;
        if (data === undefined || partyId === null) return null;
        if (data.reason !== null) {
          return (
            <div>
              <PageHeader title="Rate this week’s songs" />
              <Card>
                <EmptyState
                  title={data.reason === 'paused' ? 'This party is paused' : 'No week is running right now'}
                  message="There’s nothing to rate until the next week starts."
                  action={
                    data.lastRoundId ? (
                      <Link
                        to={`/results/${encodeURIComponent(data.lastRoundId)}`}
                        className={buttonClassName('secondary')}
                      >
                        See last week’s results
                      </Link>
                    ) : undefined
                  }
                />
              </Card>
            </div>
          );
        }
        return <RateWeek week={data} partyId={partyId} />;
      }}
    </QueryBoundary>
  );
}

function RateWeek({ week, partyId }: { week: OpenWeek; partyId: string }) {
  const now = useNow();
  const songs = useWeekSongs(week.round.roundId, { poll: true });
  const me = useMe();
  const vote = useCastVote(week.round.roundId, partyId);
  const [params, setParams] = useSearchParams();
  const onlyUnrated = params.get('show') === 'unrated';
  const location = useLocation();
  const locked = new Date(week.round.endsAt).getTime() <= now.getTime();
  const sharers = useSharerNames(partyId);

  const all = songs.data?.songs ?? [];
  const ratable = all.filter((s) => !s.isMine);
  const rated = ratable.filter((s) => s.myRating !== null).length;
  const visible = onlyUnrated ? all.filter((s) => !s.isMine && s.myRating === null) : all;

  // Arriving from Home's "Rate" button on one song (#recommendationId): scroll it into view.
  useEffect(() => {
    if (location.hash === '' || songs.data === undefined) return;
    document.getElementById(safeDecode(location.hash.slice(1)))?.scrollIntoView({ block: 'center' });
  }, [location.hash, songs.data]);

  return (
    <div>
      <PageHeader
        title="Rate this week’s songs"
        description={
          sharers.reveal
            ? 'Rate everyone else’s songs from 1 to 10. Your ratings are private until the week’s results.'
            : 'Rate everyone else’s songs from 1 to 10. Ratings, and who shared what, stay private until the week’s results.'
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
        <Icon name="clock" className="size-5 shrink-0" />
        <p>
          {locked ? (
            'Ratings are locked. Results will be ready in a moment.'
          ) : (
            <>
              Ratings lock <span className="font-semibold">{formatLockTime(week.round.endsAt)}</span> (
              {formatTimeLeft(week.round.endsAt, now).replace(' left', '')} from now). You can change a rating
              until then.
            </>
          )}
        </p>
      </div>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold">
            {rated} of {ratable.length} rated
          </p>
          <div
            className="flex gap-1 rounded-full border border-line p-1"
            role="group"
            aria-label="Which songs to show"
          >
            {[
              ['all', 'All songs'],
              ['unrated', `Unrated (${ratable.length - rated})`],
            ].map(([value, label]) => {
              const active = (value === 'unrated') === onlyUnrated;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setParams(value === 'unrated' ? { show: 'unrated' } : {}, { replace: true })}
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    active ? 'bg-active text-ink' : 'text-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-3">
          <ProgressBar value={rated} max={ratable.length} label="Songs rated this week" />
        </div>
      </Card>

      {vote.error && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200"
        >
          {errorMessage(vote.error)}
        </p>
      )}

      <QueryBoundary
        isPending={songs.isPending}
        error={songs.error}
        onRetry={() => void songs.refetch()}
        loadingLabel="Loading this week’s songs…"
      >
        {() =>
          all.length === 0 ? (
            <Card>
              <EmptyState
                title="No songs yet"
                message="Songs appear here as people share them during the week."
              />
            </Card>
          ) : visible.length === 0 ? (
            <Card>
              <EmptyState
                title="All caught up"
                message="You’ve rated every song so far. New songs show up here as they’re shared."
              />
            </Card>
          ) : (
            <div className="flex flex-col gap-5">
              {WEEKDAYS.filter((d) => visible.some((s) => s.weekday === d)).map((day) => (
                <section key={day} aria-label={`${DAY_NAMES[day]}’s songs`}>
                  <h2 className="mb-2 text-xs font-semibold tracking-wider text-blue uppercase">
                    {DAY_NAMES[day]}
                  </h2>
                  <ul className="flex flex-col gap-3">
                    {visible
                      .filter((s) => s.weekday === day)
                      .map((s) => (
                        <RateCard
                          key={s.recommendationId}
                          item={s}
                          preferred={me.data?.user.preferredProvider ?? null}
                          disabled={locked}
                          sharedBy={sharers.sharedBy(s)}
                          onRate={(rating) => vote.mutate({ recommendationId: s.recommendationId, rating })}
                        />
                      ))}
                  </ul>
                </section>
              ))}
            </div>
          )
        }
      </QueryBoundary>
    </div>
  );
}

function RateCard({
  item,
  preferred,
  disabled,
  onRate,
  sharedBy,
}: {
  sharedBy: string | null;
  item: OpenWeekSongView;
  preferred: MusicProviderId | null;
  disabled: boolean;
  onRate: (rating: number) => void;
}) {
  // Local copy so the control moves instantly; the saved rating comes back from the server.
  const [value, setValue] = useState<number | null>(item.myRating);
  useEffect(() => setValue(item.myRating), [item.myRating]);

  // Save once the person pauses: arrow keys move one step per press, and saving every step could let an older
  // request land last.
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<number | null>(null);
  const save = useRef(onRate);
  save.current = onRate;
  function flush() {
    window.clearTimeout(timer.current);
    if (pending.current !== null) {
      save.current(pending.current);
      pending.current = null;
    }
  }
  // Leaving the page (or switching filters) mid-pause still saves the rating the control is showing.
  useEffect(() => flush, []);
  function scheduleSave(rating: number) {
    window.clearTimeout(timer.current);
    pending.current = rating;
    timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
  }

  return (
    <li
      id={item.recommendationId}
      className="card-glow flex flex-col gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4"
    >
      <div className="flex items-start gap-3 sm:items-center">
        <AlbumArt url={item.song.albumArtUrl} hue={hueFor(item.recommendationId)} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{item.song.title}</p>
          <p className="truncate text-sm text-muted">{item.song.artist}</p>
          {sharedBy && <p className="mt-0.5 text-xs text-muted">{sharedBy}</p>}
          <div className="mt-1.5">
            <ListenLinks song={item.song} preferred={preferred} />
          </div>
        </div>
        {item.isMine && <MyPickBadge />}
      </div>
      {item.isMine ? (
        <p className="text-sm text-muted">This is your song, so you can’t rate it.</p>
      ) : (
        <RatingControl
          label={`Rate ${item.song.title} by ${item.song.artist}`}
          value={value}
          disabled={disabled}
          onChange={(rating) => {
            setValue(rating);
            scheduleSave(rating);
          }}
        />
      )}
    </li>
  );
}
