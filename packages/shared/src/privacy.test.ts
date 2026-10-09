import { describe, expect, it } from 'vitest';
import { PRIVACY_POLICY_VERSION } from './limits';
import { hasAcceptedCurrentPrivacy, wantsInAppVideos } from './privacy';

describe('hasAcceptedCurrentPrivacy (ADR-0011)', () => {
  it('is true only for an agreement to the current version', () => {
    const at = '2026-10-09T12:00:00.000Z';
    expect(hasAcceptedCurrentPrivacy({ privacyAcceptedAt: at, privacyVersion: PRIVACY_POLICY_VERSION })).toBe(
      true,
    );
    expect(hasAcceptedCurrentPrivacy({ privacyAcceptedAt: at, privacyVersion: '2000-01-01' })).toBe(false);
    expect(
      hasAcceptedCurrentPrivacy({ privacyAcceptedAt: null, privacyVersion: PRIVACY_POLICY_VERSION }),
    ).toBe(false);
    expect(hasAcceptedCurrentPrivacy({})).toBe(false);
  });
});

describe('wantsInAppVideos (D27)', () => {
  it('is on unless switched off', () => {
    expect(wantsInAppVideos({})).toBe(true);
    expect(wantsInAppVideos({ playInApp: true })).toBe(true);
    expect(wantsInAppVideos({ playInApp: false })).toBe(false);
  });
});
