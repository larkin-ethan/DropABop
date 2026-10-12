import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORING_KEY } from './limits';
import {
  checkSchedule,
  scoringKeyOf,
  shareDaysOf,
  sortWeekdays,
  weekPrivacyOf,
  withScheduleDefaults,
} from './schedule';
import { updatePartySettingsRequestSchema } from './schemas';

describe('party schedule (D1, D2)', () => {
  it('puts days in week order and drops duplicates', () => {
    expect(sortWeekdays(['FRI', 'MON', 'FRI', 'SUN'])).toEqual(['MON', 'FRI', 'SUN']);
  });

  it('fills in the original schedule for parties and weeks from before it was editable', () => {
    expect(withScheduleDefaults({ timezone: 'America/Chicago' })).toEqual({
      timezone: 'America/Chicago',
      shareDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      ratingCloseDay: 'SUN',
      ratingCloseTime: '23:59',
    });
    expect(shareDaysOf({})).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI']);
    expect(shareDaysOf({ shareDays: ['SAT'] })).toEqual(['SAT']);
  });

  it('ratings lock at 11:59 pm on the last sharing day at the earliest', () => {
    const days = { shareDays: ['MON', 'FRI'] as const };
    const check = (ratingCloseDay: 'THU' | 'FRI' | 'SAT', ratingCloseTime: string) =>
      checkSchedule({ shareDays: [...days.shareDays], ratingCloseDay, ratingCloseTime });
    expect(check('FRI', '23:59')).toBeNull();
    expect(check('SAT', '00:00')).toBeNull(); // any time on a later day
    expect(check('FRI', '23:58')).toMatch(/11:59 pm on the last sharing day/);
    expect(check('FRI', '00:00')).toMatch(/11:59 pm on the last sharing day/);
    expect(check('THU', '23:59')).toMatch(/11:59 pm on the last sharing day/);
    expect(checkSchedule({ shareDays: [], ratingCloseDay: 'SUN', ratingCloseTime: '23:59' })).toMatch(
      /at least one/,
    );
  });

  it('validates schedule settings in requests', () => {
    const parse = (body: unknown) => updatePartySettingsRequestSchema.safeParse(body).success;
    expect(parse({ shareDays: ['SAT', 'SUN'], ratingCloseDay: 'SUN', ratingCloseTime: '20:30' })).toBe(true);
    expect(parse({ shareDays: [] })).toBe(false);
    expect(parse({ shareDays: ['MON', 'MON'] })).toBe(false);
    expect(parse({ shareDays: ['FUNDAY'] })).toBe(false);
    expect(parse({ ratingCloseDay: 'sunday' })).toBe(false);
    expect(parse({ ratingCloseTime: '24:00' })).toBe(false);
  });
});

describe('weekPrivacyOf (D10, D11)', () => {
  it('uses the week’s own switches, and treats weeks from before they were recorded as private', () => {
    expect(weekPrivacyOf({ revealRecommenderDuringVoting: true, showWhoRatedWhat: true })).toEqual({
      revealRecommenderDuringVoting: true,
      showWhoRatedWhat: true,
    });
    expect(weekPrivacyOf({})).toEqual({ revealRecommenderDuringVoting: false, showWhoRatedWhat: false });
  });
});

describe('scoring key (D37)', () => {
  const own = Array.from({ length: 11 }, (_, score) => `means ${score}`);

  it('uses the party’s own key, or the default (one line per score 0–10)', () => {
    expect(DEFAULT_SCORING_KEY).toHaveLength(11);
    expect(scoringKeyOf({ scoringKey: own })).toEqual(own);
    expect(scoringKeyOf({})).toBe(DEFAULT_SCORING_KEY);
    expect(scoringKeyOf(undefined)).toBe(DEFAULT_SCORING_KEY);
    expect(scoringKeyOf({ scoringKey: own.slice(0, 10) })).toBe(DEFAULT_SCORING_KEY); // malformed: never half a key
  });

  it('can be sent on its own in a settings update', () => {
    expect(updatePartySettingsRequestSchema.safeParse({ scoringKey: own }).success).toBe(true);
    expect(updatePartySettingsRequestSchema.safeParse({ scoringKey: own.slice(1) }).success).toBe(false);
    const withLine = (line: string) => own.map((l, i) => (i === 9 ? line : l));
    expect(
      updatePartySettingsRequestSchema.safeParse({ scoringKey: withLine('x'.repeat(120)) }).success,
    ).toBe(true);
    expect(
      updatePartySettingsRequestSchema.safeParse({ scoringKey: withLine('x'.repeat(121)) }).success,
    ).toBe(false);
  });
});
