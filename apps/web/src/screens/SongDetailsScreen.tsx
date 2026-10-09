// Song Details (spec v2 §21, roadmap P13.5): one shared song with everything about it. While the week is open you see
// only your own rating and the sharer stays hidden unless the party shows them (D9, D10); after ratings lock the
// group's result appears. Built from the same data as the Rate and Results screens; no extra API.

import type { OpenWeekSongView, Round } from '@dropabop/shared';
import { Link, useParams } from 'react-router';
import { useMe, useParty, useResults, useWeekComments, useWeekSongs } from '../api/hooks';
import { Icon } from '../components/Icon';
import { PageHeader, QueryBoundary } from '../components/Page';
import { SongComments } from '../components/SongComments';
import { MyPickBadge, RatingBadge, ListenLinks } from '../components/SongRow';
import { EmptyState } from '../components/States';
import { RatingDistribution } from '../components/Stats';
import { AlbumArt, Avatar, Card, buttonClassName } from '../components/ui';
import { errorCode, errorMessage } from '../lib/errors';
import { DAY_NAMES, formatAverage, formatLockTime, formatShortDate, hueFor } from '../lib/format';
import { nameLookup, type NameLookup } from '../lib/members';
import { useNow } from '../lib/useNow';
import { PlayVideoButton } from '../player/PlayVideoButton';

/** Where a song's details live. Used by every song card. */
export function songDetailsPath(roundId: string, recommendationId: string): string {
  return `/songs/${encodeURIComponent(roundId)}/${encodeURIComponent(recommendationId)}`;
}

export function SongDetailsScreen() {
  const { roundId = '', recommendationId = '' } = useParams();
  const week = useWeekSongs(roundId);
  return (
    <div className="mx-auto max-w-2xl">
      <QueryBoundary
        isPending={week.isPending}
        error={week.error}
        onRetry={() => void week.refetch()}
        loadingLabel="Loading the song…"
      >
        {() => {
          const data = week.data;
          if (data === undefined) return null;
          const item = data.songs.find((s) => s.recommendationId === recommendationId);
          if (item === undefined) return <SongNotFound />;
          return <SongDetails item={item} round={data.round} />;
        }}
      </QueryBoundary>
    </div>
  );
}

function SongNotFound() {
  return (
    <>
      <PageHeader title="Song not found" />
      <Card>
        <EmptyState
          title="We couldn’t find that song"
          message="It may be from a party you’re not in, or the link is wrong."
          action={
            <Link to="/history" className={buttonClassName('secondary')}>
              Browse past weeks
            </Link>
          }
        />
      </Card>
    </>
  );
}

function SongDetails({ item, round }: { item: OpenWeekSongView; round: Round }) {
  const me = useMe();
  const now = useNow();
  const party = useParty(round.partyId);
  const comments = useWeekComments(round.roundId, { poll: false });
  const preferred = me.data?.user.preferredProvider ?? null;
  const names = nameLookup(party.data?.members ?? [], me.data?.user.userId);
  // Same rule as the Rate screen: the server decides, this only chooses what to show.
  const weekOpen = new Date(round.endsAt).getTime() > now.getTime();
  const { song } = item;
  const year = song.releaseDate?.slice(0, 4) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <Link
        to={weekOpen ? '/rate' : `/results/${encodeURIComponent(round.roundId)}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-blue hover:underline"
      >
        <Icon name="arrowLeft" className="size-4" />
        {weekOpen ? 'Back to this week’s songs' : 'Back to the week’s results'}
      </Link>

      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <AlbumArt url={song.albumArtUrl} hue={hueFor(item.recommendationId)} size="xl" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold break-words sm:text-3xl">{song.title}</h1>
            <p className="mt-1 text-lg text-muted">{song.artist}</p>
            {(song.album !== null || year !== null) && (
              <p className="mt-1 text-sm text-muted">{[song.album, year].filter(Boolean).join(' · ')}</p>
            )}
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
              Shared {DAY_NAMES[item.weekday]}, {formatShortDate(item.submittedOn)}
              {item.isMine ? (
                <MyPickBadge />
              ) : item.recommendedBy !== undefined ? (
                // Only present when the week has ended or the party shows sharers (D10).
                <span className="inline-flex items-center gap-1.5">
                  · by
                  <Avatar
                    name={names.name(item.recommendedBy)}
                    color={names.color(item.recommendedBy)}
                    image={names.image(item.recommendedBy)}
                    size="sm"
                  />
                  {names.name(item.recommendedBy)}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-col items-start gap-2">
          <ListenLinks song={song} preferred={preferred} />
          <PlayVideoButton
            songKey={item.recommendationId}
            song={song}
            submittedOn={item.submittedOn}
            preferred={preferred}
          />
        </div>
      </Card>

      {weekOpen ? (
        <OpenWeekRating item={item} round={round} />
      ) : (
        <ClosedWeekResult roundId={round.roundId} recommendationId={item.recommendationId} />
      )}

      <Card>
        <h2 className="mb-2 text-lg font-bold">Comments</h2>
        <SongComments
          roundId={round.roundId}
          recommendationId={item.recommendationId}
          songTitle={song.title}
          comments={(comments.data?.comments ?? []).filter(
            (c) => c.recommendationId === item.recommendationId,
          )}
          weekOpen={weekOpen}
          isHost={party.data?.isHost ?? false}
          myUserId={me.data?.user.userId}
          names={names}
        />
      </Card>
    </div>
  );
}

/** D9: while the week is open, only your own rating, never anyone else's. */
function OpenWeekRating({ item, round }: { item: OpenWeekSongView; round: Round }) {
  return (
    <Card>
      <h2 className="text-lg font-bold">Ratings</h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {item.isMine ? (
          <p className="text-muted">This is your song, so you can’t rate it.</p>
        ) : item.myRating !== null ? (
          <>
            <RatingBadge rating={item.myRating} />
            <Link
              to={`/rate#${item.recommendationId}`}
              className="text-sm font-medium text-blue hover:underline"
            >
              Change it
            </Link>
          </>
        ) : (
          <Link to={`/rate#${item.recommendationId}`} className={buttonClassName('primary')}>
            <Icon name="star" className="size-4" /> Rate this song
          </Link>
        )}
      </div>
      <p className="mt-3 text-sm text-muted">
        The group’s average and ranking appear when ratings lock {formatLockTime(round.endsAt)}.
      </p>
    </Card>
  );
}

function ClosedWeekResult({ roundId, recommendationId }: { roundId: string; recommendationId: string }) {
  const results = useResults(roundId);
  const me = useMe();
  if (results.isPending) {
    return (
      <Card>
        <p role="status" className="text-muted">
          Loading the result…
        </p>
      </Card>
    );
  }
  if (results.error) {
    return (
      <Card>
        <EmptyState
          title="No results for this week"
          message={
            errorCode(results.error) === 'RESULTS_NOT_READY'
              ? errorMessage(results.error)
              : 'We couldn’t load the result. Please try again.'
          }
        />
      </Card>
    );
  }
  const { songs } = results.data.results;
  const result = songs.find((s) => s.recommendationId === recommendationId);
  if (result === undefined) return null;
  const names: NameLookup = nameLookup(results.data.members, me.data?.user.userId);

  return (
    <Card>
      <h2 className="text-lg font-bold">Week result</h2>
      <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="text-4xl font-bold text-primary">
            {result.averageRating === null ? '–' : formatAverage(result.averageRating)}
            {result.averageRating !== null && <span className="text-lg text-muted"> / 10</span>}
          </p>
          <p className="text-sm text-muted">
            {result.ratingCount === 0
              ? 'No ratings'
              : `Average of ${result.ratingCount} rating${result.ratingCount === 1 ? '' : 's'}`}
          </p>
        </div>
        <div>
          <p className="text-2xl font-bold">
            #{result.rank} <span className="text-base font-medium text-muted">of {songs.length}</span>
          </p>
          <p className="text-sm text-muted">in the week</p>
        </div>
        {result.myRating !== null && (
          <div>
            <RatingBadge rating={result.myRating} />
            <p className="mt-1 text-sm text-muted">your rating</p>
          </div>
        )}
      </div>
      {result.ratingCount > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-muted">How people rated it</h3>
          <RatingDistribution counts={result.distribution} />
        </div>
      )}
      {result.ratings !== undefined && result.ratings.length > 0 && (
        // D11: names only when the party shows who rated what.
        <ul className="mt-5 flex flex-col gap-2" aria-label="Who rated it">
          {result.ratings.map((r) => (
            <li key={r.userId} className="flex items-center gap-2 text-sm">
              <Avatar
                name={names.name(r.userId)}
                color={names.color(r.userId)}
                image={names.image(r.userId)}
                size="sm"
              />
              <span className="flex-1">{names.name(r.userId)}</span>
              <span className="font-semibold">{r.rating}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
