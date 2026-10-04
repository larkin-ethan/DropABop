// Names for user ids in results and stats. Someone not in the members list has left the party (docs/API.md).

import type { MemberName } from '@dropabop/shared';

export interface NameLookup {
  name: (userId: string) => string;
  color: (userId: string) => string;
}

export function nameLookup(members: MemberName[], myUserId?: string): NameLookup {
  const byId = new Map(members.map((m) => [m.userId, m]));
  return {
    name: (userId) => (userId === myUserId ? 'You' : (byId.get(userId)?.displayName ?? 'A former member')),
    color: (userId) => byId.get(userId)?.avatarColor ?? '#64748B',
  };
}
