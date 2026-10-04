import { describe, expect, it } from 'vitest';
import type { Round, Weekday } from '@dropabop/shared';
import {
  getEffectiveWeekStatus,
  getPendingStatusChange,
  getRoundId,
  getSubmissionDay,
  getWeekWindow,
  isWeekOpen,
  planCurrentWeek,
} from './week';

const CHICAGO = 'America/Chicago';
const HOURS = 60 * 60 * 1000;

/** Shorthand: an instant in UTC. */
const utc = (iso: string) => new Date(iso);

/** A round for the week of Mon 2026-10-05 in Chicago (CDT, UTC-5). */
function chicagoRound(overrides: Partial<Round> = {}): Round {
  return {
    roundId: 'p1.2026-10-05',
    partyId: 'p1',
    weekStart: '2026-10-05',
    timezone: CHICAGO,
    startsAt: '2026-10-05T05:00:00.000Z',
    endsAt: '2026-10-12T05:00:00.000Z',
    shareDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
    revealRecommenderDuringVoting: false,
    showWhoRatedWhat: false,
    status: 'OPEN',
    ...overrides,
  };
}

type TestSettings = Parameters<typeof planCurrentWeek>[0]['settings'];

function party(settings: Partial<TestSettings> = {}) {
  return {
    partyId: 'p1',
    settings: {
      timezone: CHICAGO,
      paused: false,
      shareDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      ratingCloseDay: 'SUN',
      ratingCloseTime: '23:59',
      revealRecommenderDuringVoting: false,
      showWhoRatedWhat: false,
      ...settings,
    } satisfies TestSettings,
  };
}

/** The default schedule (ratings lock Sunday 11:59 pm) in a timezone. */
function schedule(timezone: string, ratingCloseDay: Weekday = 'SUN', ratingCloseTime = '23:59') {
  return { timezone, ratingCloseDay, ratingCloseTime };
}

/** A week in a timezone with the default sharing days (no `shareDays` stored, like weeks from before they were editable). */
function roundIn(timezone: string, shareDays?: Weekday[]) {
  return { timezone, shareDays };
}

describe('getWeekWindow', () => {
  it('finds Monday 00:00 to next Monday 00:00 in the party timezone', () => {
    // Wednesday 2026-10-07 12:00 in Chicago (17:00 UTC).
    expect(getWeekWindow(schedule(CHICAGO), utc('2026-10-07T17:00:00Z'))).toEqual({
      weekStart: '2026-10-05',
      startsAt: '2026-10-05T05:00:00.000Z',
      endsAt: '2026-10-12T05:00:00.000Z',
      nextStartsAt: '2026-10-12T05:00:00.000Z',
    });
  });

  it('treats Monday 00:00 exactly as the start of the new week', () => {
    expect(getWeekWindow(schedule(CHICAGO), utc('2026-10-12T05:00:00.000Z')).weekStart).toBe('2026-10-12');
  });

  it('treats Sunday 23:59:59.999 as the end of the old week', () => {
    expect(getWeekWindow(schedule(CHICAGO), utc('2026-10-12T04:59:59.999Z')).weekStart).toBe('2026-10-05');
  });

  it('uses the party timezone, not UTC: Sunday evening in UTC is already Monday in Kolkata', () => {
    // 19:00 UTC Sunday Oct 4 = 00:30 Monday Oct 5 in Kolkata (UTC+5:30).
    const window = getWeekWindow(schedule('Asia/Kolkata'), utc('2026-10-04T19:00:00Z'));
    expect(window.weekStart).toBe('2026-10-05');
    expect(window.startsAt).toBe('2026-10-04T18:30:00.000Z');
  });

  it('handles timezones far ahead of UTC (Auckland, NZDT UTC+13)', () => {
    const window = getWeekWindow(schedule('Pacific/Auckland'), utc('2026-10-04T12:00:00Z'));
    expect(window.weekStart).toBe('2026-10-05');
    expect(window.startsAt).toBe('2026-10-04T11:00:00.000Z');
  });

  it('a daylight-saving "fall back" week is 169 hours long (US, Nov 1 2026)', () => {
    const window = getWeekWindow(schedule(CHICAGO), utc('2026-10-28T12:00:00Z'));
    expect(window.weekStart).toBe('2026-10-26');
    expect(window.startsAt).toBe('2026-10-26T05:00:00.000Z'); // CDT
    expect(window.endsAt).toBe('2026-11-02T06:00:00.000Z'); // CST
    expect(new Date(window.endsAt).getTime() - new Date(window.startsAt).getTime()).toBe(169 * HOURS);
  });

  it('a daylight-saving "spring forward" week is 167 hours long (US, Mar 8 2026)', () => {
    const window = getWeekWindow(schedule(CHICAGO), utc('2026-03-04T12:00:00Z'));
    expect(window.weekStart).toBe('2026-03-02');
    expect(window.startsAt).toBe('2026-03-02T06:00:00.000Z'); // CST
    expect(window.endsAt).toBe('2026-03-09T05:00:00.000Z'); // CDT
    expect(new Date(window.endsAt).getTime() - new Date(window.startsAt).getTime()).toBe(167 * HOURS);
  });

  it('consecutive weeks touch exactly, with no gap and no overlap', () => {
    let instant = utc('2026-01-05T12:00:00Z');
    for (let week = 0; week < 60; week++) {
      const current = getWeekWindow(schedule(CHICAGO), instant);
      const next = getWeekWindow(schedule(CHICAGO), new Date(current.endsAt));
      expect(next.startsAt).toBe(current.endsAt);
      expect(next.weekStart > current.weekStart).toBe(true);
      instant = new Date(current.endsAt);
    }
  });

  it('throws on an invalid timezone (input validation should have caught it earlier)', () => {
    expect(() => getWeekWindow(schedule('Mars/Olympus'), utc('2026-10-07T17:00:00Z'))).toThrow(
      'Invalid timezone',
    );
  });
});

describe('getRoundId', () => {
  it('is deterministic and URL-safe', () => {
    expect(getRoundId('p1', '2026-10-05')).toBe('p1.2026-10-05');
    expect(getRoundId('p1', '2026-10-05')).not.toMatch(/[#/?]/);
  });
});

describe('getSubmissionDay (D1)', () => {
  it.each([
    ['2026-10-05T17:00:00Z', 'MON', '2026-10-05', 1],
    ['2026-10-06T17:00:00Z', 'TUE', '2026-10-06', 2],
    ['2026-10-07T17:00:00Z', 'WED', '2026-10-07', 3],
    ['2026-10-08T17:00:00Z', 'THU', '2026-10-08', 4],
    ['2026-10-09T17:00:00Z', 'FRI', '2026-10-09', 5],
  ])('%s in Chicago is %s', (instant, weekday, date, dayNumber) => {
    expect(getSubmissionDay(roundIn(CHICAGO), utc(instant))).toEqual({
      weekday,
      date,
      dayNumber,
      dayCount: 5,
    });
  });

  it.each(['2026-10-10T17:00:00Z', '2026-10-11T17:00:00Z'])('returns null on the weekend (%s)', (instant) => {
    expect(getSubmissionDay(roundIn(CHICAGO), utc(instant))).toBeNull();
  });

  it('Friday 23:59:59.999 is still Friday; Saturday 00:00 is the weekend', () => {
    expect(getSubmissionDay(roundIn(CHICAGO), utc('2026-10-10T04:59:59.999Z'))?.weekday).toBe('FRI');
    expect(getSubmissionDay(roundIn(CHICAGO), utc('2026-10-10T05:00:00.000Z'))).toBeNull();
  });

  it('uses the given timezone: the same instant can be Friday in Chicago and Saturday in Tokyo', () => {
    const instant = utc('2026-10-09T20:00:00Z'); // Fri 15:00 Chicago, Sat 05:00 Tokyo
    expect(getSubmissionDay(roundIn(CHICAGO), instant)?.weekday).toBe('FRI');
    expect(getSubmissionDay(roundIn('Asia/Tokyo'), instant)).toBeNull();
  });
});

describe('isWeekOpen and getEffectiveWeekStatus (D2, D8, ADR-0003)', () => {
  const round = chicagoRound();

  it('is open right up to the last millisecond of Sunday', () => {
    expect(isWeekOpen(round, utc('2026-10-12T04:59:59.999Z'))).toBe(true);
    expect(getEffectiveWeekStatus(round, utc('2026-10-12T04:59:59.999Z'), 0)).toBe('OPEN');
  });

  it('closes exactly at Monday 00:00 even though the stored status still says OPEN', () => {
    expect(isWeekOpen(round, utc('2026-10-12T05:00:00.000Z'))).toBe(false);
    expect(getEffectiveWeekStatus(round, utc('2026-10-12T05:00:00.000Z'), 5)).toBe('CLOSED');
  });

  it('a week that ends with fewer than 2 songs has no results', () => {
    const afterEnd = utc('2026-10-13T00:00:00Z');
    expect(getEffectiveWeekStatus(round, afterEnd, 0)).toBe('NOT_ENOUGH_SONGS');
    expect(getEffectiveWeekStatus(round, afterEnd, 1)).toBe('NOT_ENOUGH_SONGS');
    expect(getEffectiveWeekStatus(round, afterEnd, 2)).toBe('CLOSED');
  });

  it('a recorded close is final', () => {
    const closed = chicagoRound({ status: 'NOT_ENOUGH_SONGS' });
    expect(getEffectiveWeekStatus(closed, utc('2026-10-13T00:00:00Z'), 10)).toBe('NOT_ENOUGH_SONGS');
  });
});

describe('getPendingStatusChange', () => {
  it('returns nothing while open, the close once ended, and nothing once recorded', () => {
    expect(getPendingStatusChange(chicagoRound(), utc('2026-10-08T00:00:00Z'), 3)).toBeNull();
    expect(getPendingStatusChange(chicagoRound(), utc('2026-10-13T00:00:00Z'), 3)).toBe('CLOSED');
    expect(
      getPendingStatusChange(chicagoRound({ status: 'CLOSED' }), utc('2026-10-13T00:00:00Z'), 3),
    ).toBeNull();
  });
});

describe('planCurrentWeek (D2–D4, ADR-0003)', () => {
  it("creates the first week for a new party, even if it's created mid-week", () => {
    const plan = planCurrentWeek(party(), null, utc('2026-10-07T17:00:00Z')); // Wednesday
    expect(plan).toEqual({
      action: 'create',
      round: chicagoRound(),
    });
  });

  it('uses the existing round while it is open', () => {
    const round = chicagoRound();
    expect(planCurrentWeek(party(), round, utc('2026-10-11T23:00:00Z'))).toEqual({ action: 'use', round });
  });

  it("creates next week's round once the previous week has ended", () => {
    const plan = planCurrentWeek(party(), chicagoRound(), utc('2026-10-12T05:00:00.000Z'));
    expect(plan.action).toBe('create');
    if (plan.action === 'create') {
      expect(plan.round.roundId).toBe('p1.2026-10-12');
      expect(plan.round.startsAt).toBe('2026-10-12T05:00:00.000Z');
    }
  });

  it('starts no new week while paused, but an open week keeps running', () => {
    const round = chicagoRound();
    expect(planCurrentWeek(party({ paused: true }), round, utc('2026-10-08T00:00:00Z'))).toEqual({
      action: 'use',
      round,
    });
    expect(planCurrentWeek(party({ paused: true }), round, utc('2026-10-13T00:00:00Z'))).toEqual({
      action: 'none',
      reason: 'paused',
      lastRound: round,
    });
    expect(planCurrentWeek(party({ paused: true }), null, utc('2026-10-13T00:00:00Z'))).toEqual({
      action: 'none',
      reason: 'paused',
      lastRound: null,
    });
  });

  it('skips weeks with no activity without trying to backfill them', () => {
    // Last round was weeks ago; the new round is simply this week.
    const plan = planCurrentWeek(party(), chicagoRound(), utc('2026-11-04T18:00:00Z'));
    expect(plan.action).toBe('create');
    if (plan.action === 'create') {
      expect(plan.round.weekStart).toBe('2026-11-02');
    }
  });

  describe('timezone change mid-week applies from the next week', () => {
    it('keeps using the open round (and its timezone) after the host changes timezone', () => {
      const round = chicagoRound();
      const plan = planCurrentWeek(party({ timezone: 'Asia/Tokyo' }), round, utc('2026-10-11T20:00:00Z'));
      // Sun 20:00 UTC is already Monday in Tokyo, but the Chicago week is still open.
      expect(plan).toEqual({ action: 'use', round });
    });

    it('moving east: the new week starts when the old one ended, so they never overlap', () => {
      // Chicago week ended Mon 05:00 UTC. Tokyo's Monday 00:00 was Sun 15:00 UTC, earlier than that.
      const plan = planCurrentWeek(
        party({ timezone: 'Asia/Tokyo' }),
        chicagoRound(),
        utc('2026-10-12T06:00:00Z'),
      );
      expect(plan.action).toBe('create');
      if (plan.action === 'create') {
        expect(plan.round.weekStart).toBe('2026-10-12');
        expect(plan.round.timezone).toBe('Asia/Tokyo');
        expect(plan.round.startsAt).toBe('2026-10-12T05:00:00.000Z'); // previous endsAt, not Tokyo midnight
        expect(plan.round.endsAt).toBe('2026-10-18T15:00:00.000Z'); // next Monday 00:00 Tokyo
      }
    });

    it('moving west: never reopens the Monday that just ended; waits for the next one', () => {
      const tokyoRound: Round = {
        roundId: 'p1.2026-10-05',
        partyId: 'p1',
        weekStart: '2026-10-05',
        timezone: 'Asia/Tokyo',
        startsAt: '2026-10-04T15:00:00.000Z',
        endsAt: '2026-10-11T15:00:00.000Z',
        status: 'OPEN',
      };
      // Sun Oct 11 16:00 UTC: Tokyo week is over, but in Chicago it's still Sunday of the Oct 5 week.
      const between = planCurrentWeek(party(), tokyoRound, utc('2026-10-11T16:00:00Z'));
      expect(between).toEqual({ action: 'none', reason: 'between-weeks', lastRound: tokyoRound });

      // Mon Oct 12 00:00 in Chicago: the next week starts normally.
      const next = planCurrentWeek(party(), tokyoRound, utc('2026-10-12T05:00:00.000Z'));
      expect(next.action).toBe('create');
      if (next.action === 'create') {
        expect(next.round.roundId).toBe('p1.2026-10-12');
        expect(next.round.startsAt).toBe('2026-10-12T05:00:00.000Z');
      }
    });
  });
});

describe('host-chosen schedule (D1, D2)', () => {
  it('ratings lock at the end of the chosen minute, in the party timezone', () => {
    // Week of Mon 2026-10-05 in Chicago (CDT, UTC-5); lock Friday 21:00 → open until 21:01 local = 02:01 UTC Sat.
    const window = getWeekWindow(schedule(CHICAGO, 'FRI', '21:00'), utc('2026-10-07T17:00:00Z'));
    expect(window.endsAt).toBe('2026-10-10T02:01:00.000Z');
    expect(window.nextStartsAt).toBe('2026-10-12T05:00:00.000Z');
  });

  it('keeps the wall-clock lock time across a daylight-saving change', () => {
    // US clocks fall back Sun Nov 1 2026 at 02:00. A Sunday 09:00 lock is 15:00 UTC (CST), not 14:00.
    const window = getWeekWindow(schedule(CHICAGO, 'SUN', '09:00'), utc('2026-10-28T12:00:00Z'));
    expect(window.endsAt).toBe('2026-11-01T15:01:00.000Z');
  });

  it('a lock time that doesn’t exist (clocks spring forward) moves to the same minute after the jump', () => {
    // New York skips 02:00–03:00 on Sun Mar 8 2026. A "Sunday 02:30" lock becomes 03:30 EDT (07:30 UTC), so ratings
    // lock at 03:31.
    const window = getWeekWindow(schedule('America/New_York', 'SUN', '02:30'), utc('2026-03-04T12:00:00Z'));
    expect(window.endsAt).toBe('2026-03-08T07:31:00.000Z');
  });

  it('after an early lock the party is between weeks until Monday, then a new week starts', () => {
    const friday9pm = party({ ratingCloseDay: 'FRI', ratingCloseTime: '21:00' });
    const created = planCurrentWeek(friday9pm, null, utc('2026-10-07T17:00:00Z'));
    expect(created.action).toBe('create');
    if (created.action !== 'create') return;
    expect(created.round.endsAt).toBe('2026-10-10T02:01:00.000Z');

    // Saturday: this week's ratings have locked.
    expect(planCurrentWeek(friday9pm, created.round, utc('2026-10-10T17:00:00Z'))).toEqual({
      action: 'none',
      reason: 'between-weeks',
      lastRound: created.round,
    });
    // Monday: the next week.
    const next = planCurrentWeek(friday9pm, created.round, utc('2026-10-12T05:00:00Z'));
    expect(next.action === 'create' && next.round.weekStart).toBe('2026-10-12');
  });

  it('a party first used after this week’s lock time waits for Monday instead of opening a closed week', () => {
    const plan = planCurrentWeek(
      party({ ratingCloseDay: 'FRI', ratingCloseTime: '21:00' }),
      null,
      utc('2026-10-10T17:00:00Z'),
    );
    expect(plan).toEqual({ action: 'none', reason: 'between-weeks', lastRound: null });
  });

  it('a new week records the party’s sharing days; a later change waits for the next week', () => {
    const weekend = party({ shareDays: ['SAT', 'SUN'] });
    const created = planCurrentWeek(weekend, null, utc('2026-10-07T17:00:00Z'));
    expect(created.action === 'create' && created.round.shareDays).toEqual(['SAT', 'SUN']);

    // The host switches to weekdays mid-week: the open week keeps its weekend days.
    const round = chicagoRound({ shareDays: ['SAT', 'SUN'] });
    expect(planCurrentWeek(party(), round, utc('2026-10-08T17:00:00Z'))).toEqual({ action: 'use', round });
    expect(getSubmissionDay(round, utc('2026-10-08T17:00:00Z'))).toBeNull(); // Thursday
    expect(getSubmissionDay(round, utc('2026-10-10T17:00:00Z'))).toEqual({
      weekday: 'SAT',
      date: '2026-10-10',
      dayNumber: 1,
      dayCount: 2,
    });
  });

  it('a lock time moved later after an early close doesn’t reopen the closed week', () => {
    const closedFriday = chicagoRound({ endsAt: '2026-10-10T02:01:00.000Z', status: 'CLOSED' });
    expect(planCurrentWeek(party(), closedFriday, utc('2026-10-10T17:00:00Z'))).toEqual({
      action: 'none',
      reason: 'between-weeks',
      lastRound: closedFriday,
    });
  });

  it('numbers custom sharing days in week order', () => {
    expect(getSubmissionDay(roundIn(CHICAGO, ['MON', 'WED', 'FRI']), utc('2026-10-09T17:00:00Z'))).toEqual({
      weekday: 'FRI',
      date: '2026-10-09',
      dayNumber: 3,
      dayCount: 3,
    });
    expect(getSubmissionDay(roundIn(CHICAGO, ['MON', 'WED', 'FRI']), utc('2026-10-06T17:00:00Z'))).toBeNull();
  });
});

describe('privacy switches are fixed per week (D10, D11)', () => {
  it('a new week records the party’s switches; turning them on later doesn’t change running or past weeks', () => {
    const created = planCurrentWeek(
      party({ revealRecommenderDuringVoting: true, showWhoRatedWhat: false }),
      null,
      utc('2026-10-07T17:00:00Z'),
    );
    expect(created.action === 'create' && created.round).toMatchObject({
      revealRecommenderDuringVoting: true,
      showWhoRatedWhat: false,
    });

    // The host turns "who rated what" on mid-week: the open week is used as it is.
    const round = chicagoRound();
    expect(planCurrentWeek(party({ showWhoRatedWhat: true }), round, utc('2026-10-08T17:00:00Z'))).toEqual({
      action: 'use',
      round,
    });
  });
});
