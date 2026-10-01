import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_PARTY_SIZE } from './limits';

describe('limits', () => {
  it('defaults party size to 20 (spec §8)', () => {
    expect(DEFAULT_MAX_PARTY_SIZE).toBe(20);
  });
});
