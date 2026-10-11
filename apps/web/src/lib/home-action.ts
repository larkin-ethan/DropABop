// Home's one main button (spec §26, P13.11): it follows the real state of the party and this week, so it never
// offers something that can't be done right now (sharing on a non-sharing day, rating with nothing left, …).

import type { CurrentWeekResponse } from '@dropabop/shared';

export type HomeAction =
  | { kind: 'join'; label: string; to: string }
  | { kind: 'share'; label: string; to: string }
  | { kind: 'rate'; label: string; to: string }
  | { kind: 'results'; label: string; to: string }
  /** Nothing to do yet: shown as a message, not a button. */
  | { kind: 'wait'; label: string; to: null };

export function homeAction(hasParty: boolean, week: CurrentWeekResponse | undefined): HomeAction {
  if (!hasParty) return { kind: 'join', label: 'Join a party', to: '/join' };
  if (week === undefined) return { kind: 'wait', label: 'Loading this week…', to: null };

  if (week.reason !== null) {
    if (week.lastRoundId !== null) {
      return {
        kind: 'results',
        label: 'See last week’s results',
        to: `/results/${encodeURIComponent(week.lastRoundId)}`,
      };
    }
    return {
      kind: 'wait',
      label: week.reason === 'paused' ? 'The party is paused' : 'Waiting for the next week',
      to: null,
    };
  }

  // Sharing first: it's only possible today, while rating stays open all week.
  if (week.today !== null && !week.sharedToday) {
    return { kind: 'share', label: 'Share today’s song', to: '/share' };
  }
  const unrated = week.progress.ratableCount - week.progress.ratedCount;
  if (unrated > 0) return { kind: 'rate', label: `Rate ${unrated} more`, to: '/rate?show=unrated' };
  return {
    kind: 'wait',
    label: week.progress.ratableCount === 0 ? 'Nothing to rate yet' : 'All caught up',
    to: null,
  };
}

/**
 * Where "Drop" (D32) opens: the tab that matches what you can do now, so the hub never lands on an empty screen.
 * Share before rating (sharing is only possible today); with nothing left to do, Rate during the week and the
 * latest Results between weeks.
 */
export function dropPath(hasParty: boolean, week: CurrentWeekResponse | undefined): string {
  const action = homeAction(hasParty, week);
  if (action.kind === 'share') return '/share';
  if (action.kind === 'results') return '/results';
  if (action.kind === 'join') return '/join';
  return week !== undefined && week.reason !== null ? '/results' : '/rate';
}
