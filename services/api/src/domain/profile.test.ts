import { describe, expect, it } from 'vitest';
import { AVATAR_COLORS, DEFAULT_DISPLAY_NAME, buildNewUser, defaultAvatarColor } from './profile';

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
