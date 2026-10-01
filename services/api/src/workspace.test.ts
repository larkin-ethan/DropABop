// Smoke test: proves the API workspace can import the shared package.
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_PARTY_SIZE } from '@sotd/shared';

describe('api workspace', () => {
  it('imports @sotd/shared', () => {
    expect(DEFAULT_MAX_PARTY_SIZE).toBeGreaterThan(0);
  });
});
