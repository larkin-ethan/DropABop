import { describe, expect, it } from 'vitest';
import { PRIVACY_POLICY_VERSION } from '@dropabop/shared';
import {
  AVATAR_COLORS,
  DEFAULT_DISPLAY_NAME,
  buildNewUser,
  defaultAvatarColor,
  privacyAgreement,
} from './profile';

describe('new-user defaults (D18, D19)', () => {
  it('builds a profile with only the data we keep', () => {
    const user = buildNewUser('user-1', new Date('2026-10-01T12:00:00Z'));
    expect(user).toEqual({
      userId: 'user-1',
      displayName: DEFAULT_DISPLAY_NAME,
      avatarColor: defaultAvatarColor('user-1'),
      preferredProvider: null,
      createdAt: '2026-10-01T12:00:00.000Z',
    });
    expect(Object.keys(user)).not.toContain('email');
  });

  it('gives the same user the same color, from the palette, and spreads users across colors', () => {
    expect(defaultAvatarColor('abc')).toBe(defaultAvatarColor('abc'));
    const colors = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const color = defaultAvatarColor(`user-${i}`);
      expect(AVATAR_COLORS).toContain(color);
      colors.add(color);
    }
    expect(colors.size).toBe(AVATAR_COLORS.length);
  });
});

describe('privacyAgreement (ADR-0011)', () => {
  it('uses the given server time and the current policy version', () => {
    expect(privacyAgreement(new Date('2026-10-09T15:30:00Z'))).toEqual({
      privacyAcceptedAt: '2026-10-09T15:30:00.000Z',
      privacyVersion: PRIVACY_POLICY_VERSION,
    });
  });
});
