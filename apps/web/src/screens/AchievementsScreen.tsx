// Achievements (spec v2 §17, roadmap P13.9, D28): a grid of badges, a detail dialog, and a quiet "Achievement
// unlocked" banner shown on Home and Results only, never while rating (§17: don't interrupt voting). No animation, so
// reduced-motion settings are respected by default.

import type { Achievement, AchievementGroup } from '@dropabop/shared';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAchievements, useMarkAchievementsSeen } from '../api/hooks';
import { Modal } from '../components/Modal';
import { PageHeader, QueryBoundary } from '../components/Page';
import { EmptyState } from '../components/States';
import { Button, Card, ProgressBar } from '../components/ui';
import { useCurrentParty } from '../party/CurrentParty';
import { NoPartyCard } from './ResultsScreens';
import { StatsTabs } from './StatsScreens';

const GROUPS: { group: AchievementGroup; title: string }[] = [
  { group: 'participation', title: 'Taking part' },
  { group: 'discovery', title: 'Discovery' },
  { group: 'rating', title: 'Rating' },
  { group: 'songSuccess', title: 'Song success' },
  { group: 'social', title: 'Together' },
  { group: 'consistency', title: 'Week after week' },
];

/** "Unlocked Oct 4, 2026": the day ratings locked, in the party's timezone (worked out by the server). */
function unlockedText(a: Achievement): string {
  if (a.unlockedDay === null) return 'Unlocked'; // another member's rating-based badge: no date (D11)
  const [y = 1970, m = 1, d = 1] = a.unlockedDay.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `Unlocked ${day}`;
}

export function AchievementsScreen() {
  const { partyId, status, retry, current } = useCurrentParty();
  const achievements = useAchievements(partyId);
  const seen = useMarkAchievementsSeen(partyId);
  const [open, setOpen] = useState<Achievement | null>(null);

  // Looking at this page counts as seeing any new ones (clears the banner elsewhere). Once per visit.
  const markedOnce = useRef(false);
  const hasNew = (achievements.data?.newlyUnlocked.length ?? 0) > 0 || achievements.data?.seenAt === null;
  useEffect(() => {
    if (!hasNew || markedOnce.current) return;
    markedOnce.current = true;
    seen.mutate();
  }, [hasNew, seen]);

  if (status === 'ready' && partyId === null) return <NoPartyCard />;

  return (
    <div>
      <PageHeader title="Achievements" description={current ? `In ${current.partyName}` : undefined} />
      <StatsTabs />
      <QueryBoundary
        isPending={status === 'loading' || achievements.isPending}
        error={status === 'error' ? true : achievements.error}
        onRetry={() => {
          retry();
          void achievements.refetch();
        }}
        loadingLabel="Loading achievements…"
      >
        {() => {
          const data = achievements.data;
          if (data === undefined) return null;
          return (
            <div className="flex flex-col gap-6">
              <p className="text-lg font-semibold">
                {data.unlockedCount} / {data.achievements.length} unlocked
              </p>
              {data.unlockedCount === 0 && (
                <Card>
                  <EmptyState
                    title="Your achievement shelf is empty."
                    message="Take part in a week to start unlocking them. They count once a week’s ratings lock."
                  />
                </Card>
              )}
              {GROUPS.map(({ group, title }) => {
                const inGroup = data.achievements.filter((a) => a.group === group);
                if (inGroup.length === 0) return null;
                return (
                  <section key={group} aria-labelledby={`group-${group}`}>
                    <h2
                      id={`group-${group}`}
                      className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase"
                    >
                      {title}
                    </h2>
                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {inGroup.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => setOpen(a)}
                            aria-label={`${a.title}: ${!a.unlocked ? a.progress.label : 'unlocked'}`}
                            className={`flex h-full w-full flex-col items-center gap-1 rounded-[var(--radius-card)] border p-3 text-center transition hover:bg-surface-raised ${
                              !a.unlocked ? 'border-line bg-surface' : 'card-glow border-gold/50 bg-surface'
                            }`}
                          >
                            <span
                              className={`text-3xl ${!a.unlocked ? 'opacity-50 grayscale' : ''}`}
                              aria-hidden="true"
                            >
                              {a.emoji}
                            </span>
                            <span className="font-semibold">{a.title}</span>
                            {!a.unlocked ? (
                              <span className="w-full">
                                <ProgressBar
                                  value={a.progress.current}
                                  max={a.progress.target}
                                  label={`${a.title} progress`}
                                />
                              </span>
                            ) : (
                              <span className="text-xs text-gold">{unlockedText(a)}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          );
        }}
      </QueryBoundary>

      <Modal open={open !== null} title={open?.title ?? ''} onClose={() => setOpen(null)}>
        {open && (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className={`text-5xl ${!open.unlocked ? 'grayscale' : ''}`} aria-hidden="true">
              {open.emoji}
            </span>
            <p>{open.description}</p>
            {!open.unlocked ? (
              <div className="w-full">
                <ProgressBar
                  value={open.progress.current}
                  max={open.progress.target}
                  label={`${open.title} progress`}
                />
                <p className="mt-2 text-sm text-muted">{open.progress.label}</p>
              </div>
            ) : (
              <p className="font-semibold text-gold">{unlockedText(open)}</p>
            )}
            <p className="text-xs text-muted">Counted from weeks whose ratings have locked.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/**
 * "Achievement unlocked" (spec §17): a calm banner, not a pop-up, on Home and Results only. The first time someone
 * opens the app there's no `seenAt` yet, so nothing old is announced: that visit just records "seen".
 */
export function AchievementBanner({ partyId }: { partyId: string }) {
  const achievements = useAchievements(partyId);
  const seen = useMarkAchievementsSeen(partyId);
  const data = achievements.data;
  const startedBaseline = useRef(false);

  useEffect(() => {
    if (data?.seenAt !== null || startedBaseline.current) return;
    startedBaseline.current = true;
    seen.mutate();
  }, [data?.seenAt, seen]);

  if (data === undefined || data.newlyUnlocked.length === 0 || seen.isSuccess) return null;
  const first = data.achievements.find((a) => a.id === data.newlyUnlocked[0]);
  if (first === undefined) return null;
  const more = data.newlyUnlocked.length - 1;

  return (
    <section
      role="status"
      aria-label="Achievement unlocked"
      className="card-glow mb-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-gold/50 bg-surface p-4"
    >
      <span className="text-3xl" aria-hidden="true">
        {first.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gold">Achievement unlocked</p>
        <p className="font-bold">
          {first.title}
          {more > 0 && <span className="font-normal text-muted"> and {more} more</span>}
        </p>
      </div>
      <div className="flex gap-2">
        <Link
          to="/achievements"
          className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-ink"
        >
          View
        </Link>
        <Button variant="ghost" onClick={() => seen.mutate()} disabled={seen.isPending}>
          Dismiss
        </Button>
      </div>
    </section>
  );
}
