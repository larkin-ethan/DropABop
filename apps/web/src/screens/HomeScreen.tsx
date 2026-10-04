// Home / Today (roadmap P8.3; mockup screens 8–9 adapted for the weekly model, docs/design/README.md).
// Currently rendered with sample data; P8.3 connects it to GET /parties/{id}/rounds/current and the songs list.

import type { Weekday } from '@dropabop/shared';
import { Icon } from '../components/Icon';
import { SongCard } from '../components/SongCard';
import { AlbumArt, Avatar, Button, Card, ProgressBar } from '../components/ui';
import type { MemberView, SongView } from '../preview/sample-data';

const DAY_NAMES: Record<Weekday, string> = {
  MON: 'Monday',
  TUE: 'Tuesday',
  WED: 'Wednesday',
  THU: 'Thursday',
  FRI: 'Friday',
};

export interface HomeScreenProps {
  partyName: string;
  today: { weekday: Weekday; dayNumber: number } | null;
  sharedToday: boolean;
  sharedTodayCount: number;
  memberCount: number;
  progress: { ratableCount: number; ratedCount: number };
  /** Shown as "Ratings lock Sunday 11:59 pm". */
  lockLabel: string;
  songs: SongView[];
  members: MemberView[];
}

export function HomeScreen(props: HomeScreenProps) {
  const { today, songs, progress } = props;
  const todaysPick = today === null ? undefined : songs.find((s) => s.isMine && s.weekday === today.weekday);
  const days = (['MON', 'TUE', 'WED', 'THU', 'FRI'] as Weekday[]).filter((d) =>
    songs.some((s) => s.weekday === d),
  );
  const unrated = progress.ratableCount - progress.ratedCount;

  return (
    <div className="flex flex-col gap-6">
      {/* Heading */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-blue">
            {today ? `${DAY_NAMES[today.weekday]} · Day ${today.dayNumber} of 5` : 'Weekend · catch-up time'}
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">This week’s songs</h1>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-muted">
          <Icon name="clock" className="size-4 text-gold" />
          {props.lockLabel}
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Today's song */}
        <Card className="lg:col-span-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted uppercase">Today’s song</h2>
          {todaysPick ? (
            <div className="mt-4 flex items-center gap-4">
              <AlbumArt url={todaysPick.song.albumArtUrl} hue={todaysPick.hue} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-bold">{todaysPick.song.title}</p>
                <p className="truncate text-muted">{todaysPick.song.artist}</p>
                <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-success">
                  <Icon name="check" className="size-4" /> You’ve shared today’s song
                </p>
              </div>
            </div>
          ) : today ? (
            <div className="mt-4 flex flex-col items-start gap-3">
              <p className="text-lg">You haven’t shared a song today.</p>
              <Button>
                <Icon name="plus" className="size-4" /> Share today’s song
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-lg">Sharing opens again Monday. Catch up on this week’s songs.</p>
          )}
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4">
            <div className="flex -space-x-2">
              {props.members.slice(0, 6).map((m) => (
                <Avatar key={m.userId} name={m.displayName} color={m.avatarColor} size="sm" />
              ))}
            </div>
            <p className="text-sm text-muted">
              <span className="font-semibold text-ink">{props.sharedTodayCount}</span> of {props.memberCount}{' '}
              shared today
            </p>
          </div>
        </Card>

        {/* Rating progress */}
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
            <Button className="w-full" variant={unrated > 0 ? 'primary' : 'secondary'}>
              <Icon name="star" className="size-4" />
              {unrated > 0 ? `Rate ${unrated} more` : 'All caught up'}
            </Button>
          </div>
        </Card>
      </div>

      {/* Songs by day */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Songs so far</h2>
          <p className="text-sm text-muted">Who shared what is revealed with the results</p>
        </div>
        {songs.length === 0 ? (
          <p className="py-8 text-center text-muted">No songs yet. Be the first to share one today.</p>
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            {days.map((day) => (
              <div key={day}>
                <h3 className="mb-1 text-xs font-semibold tracking-wider text-blue uppercase">
                  {DAY_NAMES[day]}
                </h3>
                <ul className="flex flex-col">
                  {songs
                    .filter((s) => s.weekday === day)
                    .map((s) => (
                      <SongCard key={s.recommendationId} item={s} />
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
