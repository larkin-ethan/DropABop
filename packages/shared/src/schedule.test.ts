import { describe, expect, it } from 'vitest';
import { checkSchedule, shareDaysOf, sortWeekdays, withScheduleDefaults } from './schedule';
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

  it('ratings may lock on the last sharing day or later, never before', () => {
    expect(checkSchedule({ shareDays: ['MON', 'FRI'], ratingCloseDay: 'FRI' })).toBeNull();
    expect(checkSchedule({ shareDays: ['MON', 'FRI'], ratingCloseDay: 'SUN' })).toBeNull();
    expect(checkSchedule({ shareDays: ['MON', 'FRI'], ratingCloseDay: 'THU' })).toMatch(/can’t lock before/);
    expect(checkSchedule({ shareDays: [], ratingCloseDay: 'SUN' })).toMatch(/at least one/);
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
