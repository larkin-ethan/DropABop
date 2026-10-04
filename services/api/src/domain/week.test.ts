import { describe, expect, it } from 'vitest';
import type { Round } from '@dropabop/shared';
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
    status: 'OPEN',
    ...overrides,
  };
}

function party(settings: Partial<{ timezone: string; paused: boolean }> = {}) {
  return { partyId: 'p1', settings: { timezone: CHICAGO, paused: false, ...settings } };
}

describe('getWeekWindow', () => {
  it('finds Monday 00:00 to next Monday 00:00 in the party timezone', () => {
    // Wednesday 2026-10-07 12:00 in Chicago (17:00 UTC).
    expect(getWeekWindow(CHICAGO, utc('2026-10-07T17:00:00Z'))).toEqual({
      weekStart: '2026-10-05',
      startsAt: '2026-10-05T05:00:00.000Z',
      endsAt: '2026-10-12T05:00:00.000Z',
    });
  });

  it('treats Monday 00:00 exactly as the start of the new week', () => {
    expect(getWeekWindow(CHICAGO, utc('2026-10-12T05:00:00.000Z')).weekStart).toBe('2026-10-12');
  });

  it('treats Sunday 23:59:59.999 as the end of the old week', () => {
    expect(getWeekWindow(CHICAGO, utc('2026-10-12T04:59:59.999Z')).weekStart).toBe('2026-10-05');
  });

  it('uses the party timezone, not UTC: Sunday evening in UTC is already Monday in Kolkata', () => {
    // 19:00 UTC Sunday Oct 4 = 00:30 Monday Oct 5 in Kolkata (UTC+5:30).
    const window = getWeekWindow('Asia/Kolkata', utc('2026-10-04T19:00:00Z'));
    expect(window.weekStart).toBe('2026-10-05');
    expect(window.startsAt).toBe('2026-10-04T18:30:00.000Z');
  });

  it('handles timezones far ahead of UTC (Auckland, NZDT UTC+13)', () => {
    const window = getWeekWindow('Pacific/Auckland', utc('2026-10-04T12:00:00Z'));
    expect(window.weekStart).toBe('2026-10-05');
    expect(window.startsAt).toBe('2026-10-04T11:00:00.000Z');
  });

  it('a daylight-saving "fall back" week is 169 hours long (US, Nov 1 2026)', () => {
    const window = getWeekWindow(CHICAGO, utc('2026-10-28T12:00:00Z'));
    expect(window.weekStart).toBe('2026-10-26');
    expect(window.startsAt).toBe('2026-10-26T05:00:00.000Z'); // CDT
    expect(window.endsAt).toBe('2026-11-02T06:00:00.000Z'); // CST
    expect(new Date(window.endsAt).getTime() - new Date(window.startsAt).getTime()).toBe(169 * HOURS);
  });

  it('a daylight-saving "spring forward" week is 167 hours long (US, Mar 8 2026)', () => {
    const window = getWeekWindow(CHICAGO, utc('2026-03-04T12:00:00Z'));
    expect(window.weekStart).toBe('2026-03-02');
    expect(window.startsAt).toBe('2026-03-02T06:00:00.000Z'); // CST
    expect(window.endsAt).toBe('2026-03-09T05:00:00.000Z'); // CDT
    expect(new Date(window.endsAt).getTime() - new Date(window.startsAt).getTime()).toBe(167 * HOURS);
  });

  it('consecutive weeks touch exactly, with no gap and no overlap', () => {
    let instant = utc('2026-01-05T12:00:00Z');
    for (let week = 0; week < 60; week++) {
      const current = getWeekWindow(CHICAGO, instant);
      const next = getWeekWindow(CHICAGO, new Date(current.endsAt));
      expect(next.startsAt).toBe(current.endsAt);
      expect(next.weekStart > current.weekStart).toBe(true);
      instant = new Date(current.endsAt);
    }
  });

  it('throws on an invalid timezone (input validation should have caught it earlier)', () => {
    expect(() => getWeekWindow('Mars/Olympus', utc('2026-10-07T17:00:00Z'))).toThrow('Invalid timezone');
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
    expect(getSubmissionDay(CHICAGO, utc(instant))).toEqual({ weekday, date, dayNumber });
  });

  it.each(['2026-10-10T17:00:00Z', '2026-10-11T17:00:00Z'])('returns null on the weekend (%s)', (instant) => {
    expect(getSubmissionDay(CHICAGO, utc(instant))).toBeNull();
  });

  it('Friday 23:59:59.999 is still Friday; Saturday 00:00 is the weekend', () => {
    expect(getSubmissionDay(CHICAGO, utc('2026-10-10T04:59:59.999Z'))?.weekday).toBe('FRI');
    expect(getSubmissionDay(CHICAGO, utc('2026-10-10T05:00:00.000Z'))).toBeNull();
  });

  it('uses the given timezone: the same instant can be Friday in Chicago and Saturday in Tokyo', () => {
    const instant = utc('2026-10-09T20:00:00Z'); // Fri 15:00 Chicago, Sat 05:00 Tokyo
    expect(getSubmissionDay(CHICAGO, instant)?.weekday).toBe('FRI');
    expect(getSubmissionDay('Asia/Tokyo', instant)).toBeNull();
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
