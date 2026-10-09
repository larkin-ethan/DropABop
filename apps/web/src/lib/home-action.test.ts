import type { CurrentWeekResponse, Round } from '@dropabop/shared';
import { describe, expect, it } from 'vitest';
import { homeAction } from './home-action';

const open = (
  overrides: Partial<Extract<CurrentWeekResponse, { reason: null }>> = {},
): CurrentWeekResponse => ({
  round: { roundId: 'p1.2026-10-05' } as Round,
  status: 'OPEN',
  reason: null,
  today: { weekday: 'WED', date: '2026-10-07', dayNumber: 3, dayCount: 5 },
  sharedToday: true,
  mySubmissionDates: [],
  sharedTodayCount: 1,
  progress: { songCount: 6, ratableCount: 5, ratedCount: 5 },
  ...overrides,
});

describe('homeAction (spec §26)', () => {
  it('no party → join one', () => {
    expect(homeAction(false, undefined)).toMatchObject({ kind: 'join', to: '/join' });
  });

  it('a sharing day you haven’t shared on → share', () => {
    expect(homeAction(true, open({ sharedToday: false }))).toMatchObject({ kind: 'share', to: '/share' });
  });

  it('shared, songs left to rate → continue rating with the count', () => {
    const action = homeAction(true, open({ progress: { songCount: 8, ratableCount: 7, ratedCount: 3 } }));
    expect(action).toEqual({ kind: 'rate', label: 'Rate 4 more', to: '/rate?show=unrated' });
  });

  it('not a sharing day → rating, never sharing', () => {
    const action = homeAction(
      true,
      open({ today: null, sharedToday: false, progress: { songCount: 3, ratableCount: 3, ratedCount: 1 } }),
    );
    expect(action.kind).toBe('rate');
  });

  it('everything done → a message, not a button', () => {
    expect(homeAction(true, open())).toEqual({ kind: 'wait', label: 'All caught up', to: null });
    expect(homeAction(true, open({ progress: { songCount: 1, ratableCount: 0, ratedCount: 0 } })).label).toBe(
      'Nothing to rate yet',
    );
  });

  it('between weeks or paused → last results if there are any, otherwise wait', () => {
    expect(
      homeAction(true, { round: null, reason: 'between-weeks', nextWeekStartsAt: null, lastRoundId: 'p1.w' }),
    ).toEqual({ kind: 'results', label: 'See last week’s results', to: '/results/p1.w' });
    expect(
      homeAction(true, { round: null, reason: 'paused', nextWeekStartsAt: null, lastRoundId: null }),
    ).toMatchObject({ kind: 'wait', label: 'The party is paused' });
    expect(
      homeAction(true, { round: null, reason: 'between-weeks', nextWeekStartsAt: null, lastRoundId: null }),
    ).toMatchObject({ kind: 'wait', label: 'Waiting for the next week' });
  });

  it('while the week is still loading → no button', () => {
    expect(homeAction(true, undefined).to).toBeNull();
  });
});
