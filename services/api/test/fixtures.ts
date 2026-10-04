// Test data builders shared by integration tests. Every builder uses fresh random ids so tests never collide.

import { randomUUID } from 'node:crypto';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Party, PartyMember, Recommendation, Round, User, Vote } from '@dropabop/shared';
import { createDataContext, type DataContext } from '../src/data/context';
import { keys } from '../src/data/keys';
import { generateInviteCode } from '../src/domain/party';

export const newId = () => randomUUID();

export function testContext(): DataContext {
  return createDataContext();
}

/** A random valid invite code, from the same generator the app uses. */
export function newInviteCode(): string {
  return generateInviteCode();
}

export function aUser(overrides: Partial<User> = {}): User {
  return {
    userId: newId(),
    displayName: 'Test User',
    avatarColor: '#3B82F6',
    preferredProvider: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

export function aParty(overrides: Partial<Party> = {}): Party {
  return {
    partyId: newId(),
    name: 'Test Party',
    hostUserId: newId(),
    inviteCode: newInviteCode(),
    memberCount: 1,
    settings: {
      maxMembers: 20,
      timezone: 'America/Chicago',
      paused: false,
      revealRecommenderDuringVoting: false,
      showWhoRatedWhat: false,
      shareDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      ratingCloseDay: 'SUN',
      ratingCloseTime: '23:59',
    },
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

export function aMember(partyId: string, overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    partyId,
    userId: newId(),
    displayName: 'Member',
    avatarColor: '#14B8A6',
    role: 'member',
    joinedAt: '2026-10-02T00:00:00.000Z',
    ...overrides,
  };
}

export function aRound(partyId: string, weekStart = '2026-10-05', overrides: Partial<Round> = {}): Round {
  return {
    roundId: `${partyId}.${weekStart}`,
    partyId,
    weekStart,
    timezone: 'America/Chicago',
    startsAt: `${weekStart}T05:00:00.000Z`,
    endsAt: '2099-01-01T00:00:00.000Z',
    status: 'OPEN',
    ...overrides,
  };
}

export function aRecommendation(
  round: Round,
  userId: string,
  day: string,
  overrides: Partial<Recommendation> = {},
): Recommendation {
  const recommendationId = newId();
  return {
    recommendationId,
    roundId: round.roundId,
    partyId: round.partyId,
    userId,
    submittedOn: day,
    weekday: 'MON',
    song: {
      songId: recommendationId,
      title: 'Midnight City',
      artist: 'M83',
      album: null,
      albumArtUrl: null,
      durationMs: 243000,
      releaseDate: null,
      providers: [
        { provider: 'spotify', providerSongId: 'abc', externalUrl: 'https://open.example.com/abc' },
      ],
    },
    createdAt: `${day}T15:00:00.000Z`,
    ...overrides,
  };
}

export function aVote(rec: Recommendation, userId: string, rating: number): Vote {
  return {
    roundId: rec.roundId,
    recommendationId: rec.recommendationId,
    userId,
    rating,
    updatedAt: '2026-10-08T00:00:00.000Z',
  };
}

/** Runs all promises and reports how many succeeded and the errors from the rest. */
export async function settle<T>(promises: Promise<T>[]): Promise<{ ok: number; errors: unknown[] }> {
  const results = await Promise.allSettled(promises);
  return {
    ok: results.filter((r) => r.status === 'fulfilled').length,
    errors: results.flatMap((r) => (r.status === 'rejected' ? [r.reason as unknown] : [])),
  };
}

/**
 * Stands in for "this week started while the host had these privacy switches on" (D10, D11). In the app a week records
 * the switches only when it's created, so a test that needs a week run with a switch on sets it directly.
 */
export async function setWeekPrivacy(
  data: DataContext,
  round: Pick<Round, 'partyId' | 'weekStart'>,
  privacy: Pick<Round, 'revealRecommenderDuringVoting' | 'showWhoRatedWhat'>,
): Promise<void> {
  await data.db.send(
    new UpdateCommand({
      TableName: data.tableName,
      Key: keys.round(round.partyId, round.weekStart),
      UpdateExpression: 'SET revealRecommenderDuringVoting = :reveal, showWhoRatedWhat = :who',
      ExpressionAttributeValues: {
        ':reveal': privacy.revealRecommenderDuringVoting ?? false,
        ':who': privacy.showWhoRatedWhat ?? false,
      },
    }),
  );
}
