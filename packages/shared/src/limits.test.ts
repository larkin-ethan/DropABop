import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_PARTY_SIZE,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_PATTERN,
  MAX_PARTY_SIZE,
  MIN_PARTY_SIZE,
  DEFAULT_SHARE_DAYS,
  TIME_OF_DAY_PATTERN,
  WEEKDAYS,
} from './limits';

describe('limits', () => {
  it('defaults party size to 20, within the allowed range (spec §8, D14)', () => {
    expect(DEFAULT_MAX_PARTY_SIZE).toBe(20);
    expect(DEFAULT_MAX_PARTY_SIZE).toBeGreaterThanOrEqual(MIN_PARTY_SIZE);
    expect(DEFAULT_MAX_PARTY_SIZE).toBeLessThanOrEqual(MAX_PARTY_SIZE);
  });

  it('new parties share Monday to Friday (D1), out of a Monday-first week', () => {
    expect(DEFAULT_SHARE_DAYS).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI']);
    expect(WEEKDAYS).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
  });

  it('times of day are 24-hour HH:MM', () => {
    for (const ok of ['00:00', '09:30', '23:59']) expect(TIME_OF_DAY_PATTERN.test(ok)).toBe(true);
    for (const bad of ['24:00', '9:30', '12:60', '12:00 pm', ''])
      expect(TIME_OF_DAY_PATTERN.test(bad)).toBe(false);
  });

  it('invite alphabet has no look-alike characters (D16)', () => {
    for (const ambiguous of ['0', 'O', '1', 'I', 'L']) {
      expect(INVITE_CODE_ALPHABET).not.toContain(ambiguous);
    }
    expect(new Set(INVITE_CODE_ALPHABET).size).toBe(INVITE_CODE_ALPHABET.length);
  });

  it('invite pattern accepts every alphabet character and nothing else', () => {
    for (const char of INVITE_CODE_ALPHABET) {
      expect(INVITE_CODE_PATTERN.test(`SONG-${char.repeat(4)}`)).toBe(true);
    }
    for (const char of ['0', 'O', '1', 'I', 'L', 'a', '-']) {
      expect(INVITE_CODE_PATTERN.test(`SONG-${char.repeat(4)}`)).toBe(false);
    }
  });
});
