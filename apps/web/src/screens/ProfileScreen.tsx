// /profile as a stats page (spec §18; P13.11). Editing your name and picture lives in Settings → Account (D27).
// Only numbers backed by real data are shown; below a minimum, "Not enough data yet" (docs/STATISTICS.md).

import type { Achievement, FavoriteArtist, FavoriteGenre, Stat } from '@dropabop/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAchievements, useMe, usePersonalStats } from '../api/hooks';
import { SignOutButton } from '../components/AppShell';
import { Icon } from '../components/Icon';
import { PageHeader, QueryBoundary } from '../components/Page';
import { SongTitleLink } from '../components/SongRow';
import { StatCard, StatHeading } from '../components/Stats';
import { Avatar, Card, buttonClassName } from '../components/ui';
import { formatAverage } from '../lib/format';
import { useCurrentParty } from '../party/CurrentParty';
import { songDetailsPath } from './SongDetailsScreen';

/** How many unlocked badges the profile shows before "See all". */
const BADGES_SHOWN = 8;

export function ProfileScreen() {
  const me = useMe();
  const { partyId, current } = useCurrentParty();
  const user = me.data?.user;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Your profile"
        description={current ? `Your stats in ${current.partyName}` : undefined}
      />
      <QueryBoundary isPending={me.isPending} error={me.error} onRetry={() => void me.refetch()}>
        {() =>
          user === undefined ? null : (
            <Card className="mb-4 flex flex-wrap items-center gap-4">
              <Avatar name={user.displayName} color={user.avatarColor} image={user.avatarImage} size="lg" />
              <div className="min-w-[10rem] flex-1">
                <p className="truncate text-2xl font-bold">{user.displayName}</p>
                {current && <p className="truncate text-sm text-muted">{current.partyName}</p>}
              </div>
              <Link to="/settings/account" className={buttonClassName('secondary')}>
                <Icon name="settings" className="size-4" /> Edit profile
              </Link>
            </Card>
          )
        }
      </QueryBoundary>

      {partyId !== null && <ProfileStats partyId={partyId} />}

      <div className="mt-6 flex flex-col items-center gap-2">
        <SignOutButton />
        <Link to="/privacy" className="text-sm text-muted hover:text-ink hover:underline">
          Privacy policy and terms
        </Link>
      </div>
    </div>
  );
}

function ProfileStats({ partyId }: { partyId: string }) {
  const stats = usePersonalStats(partyId);
  const achievements = useAchievements(partyId);

  return (
    <QueryBoundary
      isPending={stats.isPending}
      error={stats.error}
      onRetry={() => void stats.refetch()}
      loadingLabel="Calculating your stats…"
    >
      {() => {
        const s = stats.data;
        if (s === undefined) return null;
        return (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Average received"
                stat={s.averageScoreReceived}
                unit="rated songs"
                definition="The mean of the averages your shared songs received."
              />
              <StatCard
                label="Average given"
                stat={s.averageRatingGiven}
                unit="ratings"
                definition="The mean of every rating you’ve given."
              />
              <StatCard
                label="Songs shared"
                stat={{ status: 'ok', value: s.songsRecommended, sampleSize: s.songsRecommended }}
                unit="songs"
                definition="Songs you’ve shared in finished weeks."
                format={(v) => String(v)}
              />
              <StatCard
                label="Ratings given"
                stat={{ status: 'ok', value: s.ratingsGiven, sampleSize: s.ratingsGiven }}
                unit="ratings"
                definition="Ratings you’ve given in finished weeks."
                format={(v) => String(v)}
              />
            </div>

            <Card>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-bold">Achievements</h2>
                <Link to="/achievements" className="text-sm font-semibold text-blue hover:underline">
                  See all
                </Link>
              </div>
              {achievements.data === undefined ? (
                <p className="mt-2 text-sm text-muted">
                  {achievements.error ? 'Achievements couldn’t load.' : 'Loading achievements…'}
                </p>
              ) : (
                <Badges achievements={achievements.data.achievements} />
              )}
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              <TopList
                title="Favorite artists"
                definition="Artists you rate highest on average (at least 2 of their songs rated by you)."
                stat={s.favoriteArtists}
                unit="songs by one artist"
                label={(a: FavoriteArtist) => a.artist}
              />
              <TopList
                title="Favorite genres"
                definition="Genres you rate highest on average (at least 2 songs). Only songs shared since genres were added have one."
                stat={s.favoriteGenres}
                unit="songs in one genre"
                label={(g: FavoriteGenre) => g.genre}
              />
            </div>

            <Link
              to="/saved"
              className="card-glow flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-5 transition hover:bg-surface-raised"
            >
              <Icon name="heart" className="size-5 text-pink-300" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">Saved songs</span>
                <span className="block text-xs text-muted">
                  Songs you saved from your parties (only you see them)
                </span>
              </span>
              <Icon name="chevronDown" className="size-4 -rotate-90 text-muted" />
            </Link>

            <Card>
              <h2 className="font-bold">Recent bops</h2>
              <p className="mt-0.5 text-xs text-muted">Your latest songs from finished weeks.</p>
              {s.recentSongs.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">
                  Your songs appear here once their week ends.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {s.recentSongs.map((song) => (
                    <li key={song.recommendationId} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">
                          <SongTitleLink
                            to={songDetailsPath(song.roundId, song.recommendationId)}
                            title={song.title}
                          />
                        </span>
                        <span className="block truncate text-sm text-muted">{song.artist}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-bold">
                          {song.average === null ? 'Not rated' : formatAverage(song.average)}
                        </span>
                        <span className="block text-[11px] text-muted">
                          {song.ratingCount} rating{song.ratingCount === 1 ? '' : 's'}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        );
      }}
    </QueryBoundary>
  );
}

function Badges({ achievements }: { achievements: Achievement[] }) {
  const unlocked = achievements
    .filter((a) => a.unlocked)
    .sort((a, b) => (b.unlockedOn ?? '').localeCompare(a.unlockedOn ?? ''));
  if (unlocked.length === 0) {
    return <p className="mt-2 text-sm text-muted">None yet. Share and rate songs to start your shelf.</p>;
  }
  return (
    <>
      <p className="mt-1 text-sm text-muted">
        {unlocked.length} of {achievements.length} unlocked
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {unlocked.slice(0, BADGES_SHOWN).map((a) => (
          <li
            key={a.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 px-3 py-1 text-sm"
          >
            <span aria-hidden="true">{a.emoji}</span>
            {a.title}
          </li>
        ))}
      </ul>
    </>
  );
}

function TopList<T extends { averageRating: number; songCount: number }>({
  title,
  definition,
  stat,
  unit,
  label,
}: {
  title: string;
  definition: string;
  stat: Stat<T[]>;
  unit: string;
  label: (item: T) => ReactNode;
}) {
  return (
    <Card>
      <StatHeading heading label={title} definition={definition} />
      {stat.status === 'not-enough-data' ? (
        <div className="mt-2">
          <p className="font-semibold text-muted">Not enough data yet</p>
          <p className="mt-1 text-xs text-muted">
            Needs {stat.required} {unit}
          </p>
        </div>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {stat.value.map((item, i) => (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                <span className="mr-2 font-bold text-muted">{i + 1}</span>
                {label(item)}
              </span>
              <span className="shrink-0 text-right">
                <span className="font-bold">{formatAverage(item.averageRating)}</span>
                <span className="block text-[11px] text-muted">{item.songCount} songs</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
