// New-user defaults (D18, D19).

import type { User } from '@dropabop/shared';

/** Shown until the person picks a name during onboarding (P8.2). */
export const DEFAULT_DISPLAY_NAME = 'New member';

/** Avatar background colors from the design palette (docs/design). Chosen per user so initials avatars differ. */
export const AVATAR_COLORS = [
  '#3B82F6',
  '#14B8A6',
  '#8B5CF6',
  '#06B6D4',
  '#6366F1',
  '#22C55E',
  '#EC4899',
  '#F59E0B',
];

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
