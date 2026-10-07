// Item keys for the single table (docs/DATABASE.md → "Keys"). Every key in the app is built here.
//
// Ids are validated before they go into a key. Our ids are UUIDs (Cognito `sub`, crypto.randomUUID()), so they
// never contain "#"; rejecting anything else means a crafted id can't produce a key that points at a different item.
//
// Handlers validate input with the shared zod schemas first, so users get a 400; these checks are a last line of
// defence and throw plain Errors (which become a generic 500).

import { INVITE_CODE_PATTERN } from '@dropabop/shared';

const SAFE_ID = /^[A-Za-z0-9-]{1,64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const INVITE_CODE = INVITE_CODE_PATTERN; // excludes look-alike characters (D16)

export interface ItemKey {
  PK: string;
  SK: string;
}

function id(value: string, label: string): string {
  if (!SAFE_ID.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function date(value: string, label: string): string {
  if (!ISO_DATE.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

export function isSafeId(value: string): boolean {
  return SAFE_ID.test(value);
}

const userPk = (userId: string) => `USER#${id(userId, 'userId')}`;
const partyPk = (partyId: string) => `PARTY#${id(partyId, 'partyId')}`;

export const keys = {
  userProfile: (userId: string): ItemKey => ({ PK: userPk(userId), SK: 'PROFILE' }),
  userParty: (userId: string, partyId: string): ItemKey => ({
    PK: userPk(userId),
    SK: `PARTY#${id(partyId, 'partyId')}`,
  }),
  partyMeta: (partyId: string): ItemKey => ({ PK: partyPk(partyId), SK: 'META' }),
  member: (partyId: string, userId: string): ItemKey => ({
    PK: partyPk(partyId),
    SK: `MEMBER#${id(userId, 'userId')}`,
  }),
  round: (partyId: string, weekStart: string): ItemKey => ({
    PK: partyPk(partyId),
    SK: `ROUND#${date(weekStart, 'weekStart')}`,
  }),
  recommendation: (partyId: string, weekStart: string, recommendationId: string): ItemKey => ({
    PK: partyPk(partyId),
    SK: `REC#${date(weekStart, 'weekStart')}#${id(recommendationId, 'recommendationId')}`,
  }),
  submittedMarker: (partyId: string, weekStart: string, userId: string, day: string): ItemKey => ({
    PK: partyPk(partyId),
    SK: `SUBMITTED#${date(weekStart, 'weekStart')}#${id(userId, 'userId')}#${date(day, 'date')}`,
  }),
  vote: (partyId: string, weekStart: string, userId: string, recommendationId: string): ItemKey => ({
    PK: partyPk(partyId),
    SK: `VOTE#${date(weekStart, 'weekStart')}#${id(userId, 'userId')}#${id(recommendationId, 'recommendationId')}`,
  }),
  /** D25: sorted by time within the week, so one query returns a week's comments oldest first. */
  comment: (partyId: string, weekStart: string, createdAt: string, commentId: string): ItemKey => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt)) {
      throw new Error('Invalid createdAt');
    }
    return {
      PK: partyPk(partyId),
      SK: `COMMENT#${date(weekStart, 'weekStart')}#${createdAt}#${id(commentId, 'commentId')}`,
    };
  },
  /** Wrong invite codes one person tried in one UTC hour ("2026-10-04T15"); expires on its own (TTL). */
  inviteFailures: (userId: string, hour: string): ItemKey => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hour)) {
      throw new Error('Invalid hour');
    }
    return { PK: userPk(userId), SK: `INVITEFAIL#${hour}` };
  },
  invite: (code: string): ItemKey => {
    if (!INVITE_CODE.test(code)) {
      throw new Error('Invalid invite code');
    }
    return { PK: `INVITE#${code}`, SK: 'INVITE' };
  },
};

/** Sort-key prefixes for queries (`begins_with`). */
export const prefixes = {
  userParties: () => 'PARTY#',
  members: () => 'MEMBER#',
  rounds: () => 'ROUND#',
  allRecommendations: () => 'REC#',
  weekRecommendations: (weekStart: string) => `REC#${date(weekStart, 'weekStart')}#`,
  weekSubmissions: (weekStart: string) => `SUBMITTED#${date(weekStart, 'weekStart')}#`,
  mySubmissions: (weekStart: string, userId: string) =>
    `SUBMITTED#${date(weekStart, 'weekStart')}#${id(userId, 'userId')}#`,
  weekComments: (weekStart: string) => `COMMENT#${date(weekStart, 'weekStart')}#`,
  allVotes: () => 'VOTE#',
  weekVotes: (weekStart: string) => `VOTE#${date(weekStart, 'weekStart')}#`,
  myWeekVotes: (weekStart: string, userId: string) =>
    `VOTE#${date(weekStart, 'weekStart')}#${id(userId, 'userId')}#`,
};

export const partitionKeys = { user: userPk, party: partyPk };

/** Splits a public roundId (`<partyId>.<weekStart>`, see getRoundId) back into its parts, or null if malformed. */
export function parseRoundId(roundId: string): { partyId: string; weekStart: string } | null {
  const match = /^([A-Za-z0-9-]{1,64})\.(\d{4}-\d{2}-\d{2})$/.exec(roundId);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null;
  }
  return { partyId: match[1], weekStart: match[2] };
}
