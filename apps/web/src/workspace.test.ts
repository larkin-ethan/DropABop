// Placeholder until P7.1 creates the Vite app. Proves the web workspace can import the shared package.
import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_PARTY_SIZE } from '@sotd/shared';

describe('web workspace', () => {
  it('imports @sotd/shared', () => {
    expect(DEFAULT_MAX_PARTY_SIZE).toBeGreaterThan(0);
  });
});
