// P5.11 — Authorization sweep (spec §24). Every route, called as every kind of caller.
//
// Callers: anonymous (no token), an ID token instead of an access token, an outsider, a member who has left,
// a regular member, and the host. Expected outcomes are listed per route; the test fails if any route lets the
// wrong person through or blocks the right one.

import type { Party, Round } from '@dropabop/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf, type EventOptions } from '../../test/events';
import { newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { runHandler, type HandlerFn } from '../http/handler';
import { joinPartyFn, previewInviteFn, regenerateInviteFn, removeMemberFn } from './membership';
import { createPartyHandlerFn, getPartyHandlerFn, listPartiesHandlerFn } from './parties';
import { listRecommendationsFn, submitRecommendationFn } from './recommendations';
import { getResultsFn } from './results';
import { updateSettingsFn } from './settings';
import { groupStatsFn, leaderboardFn, personalStatsFn } from './stats';
import { resolveSongFn, searchSongsFn } from './songs';
import { getMe, updateMe } from './users';
import { castVoteFn, listMyVotesFn } from './votes';
import { getCurrentWeekFn, listWeeksFn } from './weeks';

const deps = testDeps('2026-10-07T17:00:00.000Z'); // Wednesday, week open
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

// The "outsider" is a member of a *different* party, so every route also checks cross-party access.
const ids = { host: newId(), member: newId(), left: newId(), outsider: newId(), extra: newId() };
let party: Party;
let round: Round;
let hostSongId: string;

const call = (fn: HandlerFn, options: EventOptions) => runHandler(fn, apiEvent(options), deps);

beforeAll(async () => {
  await call(createPartyHandlerFn, { userId: ids.outsider, body: { name: 'Other party', timezone: 'UTC' } });
  party = (
    bodyOf(
      await call(createPartyHandlerFn, {
        userId: ids.host,
        body: { name: 'Sweep', timezone: 'America/Chicago' },
      }),
    ) as { party: Party }
  ).party;
  for (const userId of [ids.member, ids.left, ids.extra]) {
    await call(joinPartyFn, {
      userId,
      pathParameters: { partyId: party.partyId },
      body: { inviteCode: party.inviteCode },
    });
  }
  await call(removeMemberFn, {
    userId: ids.left,
    pathParameters: { partyId: party.partyId, memberId: ids.left },
  });
  round = (
    bodyOf(
      await call(getCurrentWeekFn, { userId: ids.host, pathParameters: { partyId: party.partyId } }),
    ) as {
      round: Round;
    }
  ).round;
  hostSongId = (
    bodyOf(
      await call(submitRecommendationFn, {
        userId: ids.host,
        pathParameters: { roundId: round.roundId },
        body: { provider: 'appleMusic', providerSongId: '1001' },
      }),
    ) as { song: { recommendationId: string } }
  ).song.recommendationId;
});

type Caller = 'outsider' | 'left' | 'member' | 'host';
/** Expected status or error code per caller. A number means "this status"; a string means "this error code". */
type Expectations = Record<Caller, number | string>;

interface RouteCase {
  name: string;
  fn: HandlerFn;
  request: () => Omit<EventOptions, 'userId' | 'claims'>;
  expect: Expectations;
}

const member = (status: number): Expectations => ({
  outsider: 'NOT_A_MEMBER',
  left: 'NOT_A_MEMBER',
  member: status,
  host: status,
});
const hostOnly = (status: number): Expectations => ({
  outsider: 'NOT_A_MEMBER',
  left: 'NOT_A_MEMBER',
  member: 'NOT_HOST',
  host: status,
});
const anyone = (status: number): Expectations => ({
  outsider: status,
  left: status,
  member: status,
  host: status,
});

const routes: RouteCase[] = [
  { name: 'GET /users/me', fn: getMe, request: () => ({}), expect: anyone(200) },
  {
    name: 'PATCH /users/me',
    fn: updateMe,
    request: () => ({ body: { avatarColor: '#14B8A6' } }),
    expect: anyone(200),
  },
  { name: 'GET /parties', fn: listPartiesHandlerFn, request: () => ({}), expect: anyone(200) },
  {
    name: 'GET /songs/search',
    fn: searchSongsFn,
    request: () => ({ queryStringParameters: { q: 'midnight city' } }),
    expect: anyone(200),
  },
  {
    name: 'POST /songs/resolve',
    fn: resolveSongFn,
    request: () => ({ body: { url: 'https://music.apple.com/us/song/midnight-city/828259377' } }),
    expect: anyone(200),
  },
  {
    name: 'GET /invites/{code}',
    fn: previewInviteFn,
    request: () => ({ pathParameters: { code: party.inviteCode } }),
    expect: anyone(200),
  },
  {
    name: 'GET /parties/{partyId}',
    fn: getPartyHandlerFn,
    request: () => ({ pathParameters: { partyId: party.partyId } }),
    expect: member(200),
  },
  {
    name: 'PATCH /parties/{partyId}/settings',
    fn: updateSettingsFn,
    request: () => ({ pathParameters: { partyId: party.partyId }, body: { showWhoRatedWhat: false } }),
    expect: hostOnly(200),
  },
  {
    name: 'DELETE /parties/{partyId}/members/{memberId} (someone else)',
    fn: removeMemberFn,
    request: () => ({ pathParameters: { partyId: party.partyId, memberId: ids.extra } }),
    // The host succeeds only the first time; that's covered by running the host case last.
    expect: hostOnly(204),
  },
  {
    name: 'GET /parties/{partyId}/rounds/current',
    fn: getCurrentWeekFn,
    request: () => ({ pathParameters: { partyId: party.partyId } }),
    expect: member(200),
  },
  {
    name: 'GET /parties/{partyId}/rounds',
    fn: listWeeksFn,
    request: () => ({ pathParameters: { partyId: party.partyId } }),
    expect: member(200),
  },
  {
    name: 'GET /rounds/{roundId}/recommendations',
    fn: listRecommendationsFn,
    request: () => ({ pathParameters: { roundId: round.roundId } }),
    expect: member(200),
  },
  {
    name: 'POST /rounds/{roundId}/recommendations',
    fn: submitRecommendationFn,
    request: () => ({
      pathParameters: { roundId: round.roundId },
      body: { provider: 'appleMusic', providerSongId: String(Math.floor(Math.random() * 1e9)) },
    }),
    // The host already shared today, so the host gets the one-per-day answer, which proves they were let in.
    expect: { ...member(201), host: 'ALREADY_SUBMITTED_TODAY' },
  },
  {
    name: 'PUT /rounds/{roundId}/votes/{recommendationId}',
    fn: castVoteFn,
    request: () => ({
      pathParameters: { roundId: round.roundId, recommendationId: hostSongId },
      body: { rating: 7 },
    }),
    expect: { ...member(200), host: 'OWN_SONG' },
  },
  {
    name: 'GET /rounds/{roundId}/votes/me',
    fn: listMyVotesFn,
    request: () => ({ pathParameters: { roundId: round.roundId } }),
    expect: member(200),
  },
  {
    name: 'GET /rounds/{roundId}/results',
    fn: getResultsFn,
    request: () => ({ pathParameters: { roundId: round.roundId } }),
    // Members get past the membership check and are told results aren't ready yet.
    expect: {
      outsider: 'NOT_A_MEMBER',
      left: 'NOT_A_MEMBER',
      member: 'RESULTS_NOT_READY',
      host: 'RESULTS_NOT_READY',
    },
  },
  {
    name: 'GET /users/me/stats',
    fn: personalStatsFn,
    request: () => ({ queryStringParameters: { partyId: party.partyId } }),
    expect: member(200),
  },
  {
    name: 'GET /parties/{partyId}/stats',
    fn: groupStatsFn,
    request: () => ({ pathParameters: { partyId: party.partyId } }),
    expect: member(200),
  },
  {
    name: 'GET /parties/{partyId}/leaderboard',
    fn: leaderboardFn,
    request: () => ({ pathParameters: { partyId: party.partyId } }),
    expect: member(200),
  },
  {
    name: 'POST /parties',
    fn: createPartyHandlerFn,
    request: () => ({ body: { name: 'Another', timezone: 'UTC' } }),
    expect: anyone(201),
  },
  {
    name: 'POST /parties/{partyId}/join',
    fn: joinPartyFn,
    request: () => ({ pathParameters: { partyId: party.partyId }, body: { inviteCode: 'SONG-ZZZZ' } }),
    // With a wrong code everyone is refused for the same reason; a correct code is covered in membership tests.
    expect: {
      outsider: 'INVALID_INVITE',
      left: 'INVALID_INVITE',
      member: 'INVALID_INVITE',
      host: 'INVALID_INVITE',
    },
  },
  {
    name: 'POST /parties/{partyId}/invite-code',
    fn: regenerateInviteFn,
    // Last in the list: the host's call replaces the invite code, which earlier cases rely on.
    request: () => ({ pathParameters: { partyId: party.partyId } }),
    expect: hostOnly(200),
  },
];

function check(result: { statusCode?: number; body?: string }, expected: number | string) {
  if (typeof expected === 'number') {
    expect(result.statusCode, result.body).toBe(expected);
  } else {
    expect((bodyOf(result) as { error?: { code: string } }).error?.code, result.body).toBe(expected);
  }
}

describe('every route rejects unauthenticated callers', () => {
  it.each(routes.map((r) => [r.name, r] as const))('%s → 401 without a token', async (_name, route) => {
    const result = await call(route.fn, route.request());
    expect(result.statusCode).toBe(401);
  });

  it.each(routes.map((r) => [r.name, r] as const))('%s → 401 with an ID token', async (_name, route) => {
    const result = await call(route.fn, {
      ...route.request(),
      userId: ids.member,
      claims: { token_use: 'id' },
    });
    expect(result.statusCode).toBe(401);
  });
});

describe('every route enforces membership and host rules', () => {
  // Order matters only for the two state-changing host actions, so callers run outsider → left → member → host.
  const callers: Caller[] = ['outsider', 'left', 'member', 'host'];
  const actorId: Record<Caller, () => string> = {
    outsider: () => ids.outsider,
    left: () => ids.left,
    member: () => ids.member,
    host: () => ids.host,
  };

  it.each(routes.map((r) => [r.name, r] as const))('%s', async (_name, route) => {
    for (const caller of callers) {
      const result = await call(route.fn, { ...route.request(), userId: actorId[caller]() });
      check(result, route.expect[caller]);
    }
  });
});

describe('identity can’t be supplied by the client', () => {
  it('a userId in a body is rejected, not used', async () => {
    const result = await call(updateMe, {
      userId: ids.member,
      body: { userId: ids.host, displayName: 'Hijack' },
    });
    expect(result.statusCode).toBe(400);
  });

  it('a userId in the query or path is ignored: you always get your own data', async () => {
    const result = await call(getMe, {
      userId: ids.member,
      queryStringParameters: { userId: ids.host },
      pathParameters: { userId: ids.host },
    });
    expect((bodyOf(result) as { user: { userId: string } }).user.userId).toBe(ids.member);
  });

  it('strict query schemas reject unexpected parameters', async () => {
    const result = await call(personalStatsFn, {
      userId: ids.member,
      queryStringParameters: { partyId: party.partyId, userId: ids.host },
    });
    expect(result.statusCode).toBe(400);
  });
});
