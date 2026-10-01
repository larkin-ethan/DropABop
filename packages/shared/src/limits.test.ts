import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_PARTY_SIZE,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_PATTERN,
  MAX_PARTY_SIZE,
  MIN_PARTY_SIZE,
  SUBMISSION_WEEKDAYS,
} from './limits';

describe('limits', () => {
  it('defaults party size to 20, within the allowed range (spec §8, D14)', () => {
    expect(DEFAULT_MAX_PARTY_SIZE).toBe(20);
    expect(DEFAULT_MAX_PARTY_SIZE).toBeGreaterThanOrEqual(MIN_PARTY_SIZE);
    expect(DEFAULT_MAX_PARTY_SIZE).toBeLessThanOrEqual(MAX_PARTY_SIZE);
  });

  it('only allows submissions Monday to Friday (D1)', () => {
    expect(SUBMISSION_WEEKDAYS).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI']);
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
