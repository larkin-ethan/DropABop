// New-user defaults (D18, D19).

import { AVATAR_COLORS, DEFAULT_DISPLAY_NAME, type User } from '@dropabop/shared';

// DEFAULT_DISPLAY_NAME and AVATAR_COLORS live in @dropabop/shared so the Profile screen offers the same colors.
export { AVATAR_COLORS, DEFAULT_DISPLAY_NAME };

/** Same user → same color, every time, without storing anything extra. */
export function defaultAvatarColor(userId: string): string {
  let hash = 0;
  for (const char of userId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? '#3B82F6';
}

export function buildNewUser(userId: string, now: Date): User {
  return {
    userId,
    displayName: DEFAULT_DISPLAY_NAME,
    avatarColor: defaultAvatarColor(userId),
    preferredProvider: null,
    createdAt: now.toISOString(),
  };
}
