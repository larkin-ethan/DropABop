import type { Party } from '@sotd/shared';
import { MAX_PARTIES_PER_USER } from '@sotd/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { runHandler } from '../http/handler';
import { getMe, updateMe } from './users';
import { createPartyHandlerFn, getPartyHandlerFn, listPartiesHandlerFn } from './parties';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

async function createPartyAs(userId: string, body: Record<string, unknown> = {}) {
  return runHandler(
    createPartyHandlerFn,
    apiEvent({ userId, body: { name: 'Ethan’s Music Party', timezone: 'America/Chicago', ...body } }),
    deps,
  );
}

describe('POST /parties', () => {
  it('creates a party with the caller as host, default settings, and an invite code', async () => {
    const userId = newId();
    await runHandler(updateMe, apiEvent({ userId, body: { displayName: 'Ethan' } }), deps);

    const result = await createPartyAs(userId);

    expect(result.statusCode).toBe(201);
    const body = bodyOf(result) as {
      party: Party;
      members: { userId: string; role: string; displayName: string }[];
    };
    expect(body.party).toMatchObject({
      name: 'Ethan’s Music Party',
      hostUserId: userId,
      memberCount: 1,
      settings: {
        maxMembers: 20,
        timezone: 'America/Chicago',
        paused: false,
        revealRecommenderDuringVoting: false,
        showWhoRatedWhat: false,
      },
    });
    expect(body.party.inviteCode).toMatch(/^SONG-[A-Z0-9]{4}$/);
    expect(body.members).toEqual([expect.objectContaining({ userId, role: 'host', displayName: 'Ethan' })]);
  });

  it('accepts a custom size and rejects invalid input with a friendly message', async () => {
    const ok = await createPartyAs(newId(), { maxMembers: 12 });
    expect((bodyOf(ok) as { party: Party }).party.settings.maxMembers).toBe(12);

    const bad = await createPartyAs(newId(), { timezone: 'Mars/Olympus' });
    expect(bad.statusCode).toBe(400);
    expect(bodyOf(bad)).toEqual({
      error: { code: 'VALIDATION_FAILED', message: 'Please choose a valid timezone.' },
    });
  });

  it('ignores attempts to set the host or the id', async () => {
    const result = await createPartyAs(newId(), { hostUserId: newId() });
    expect(result.statusCode).toBe(400);
  });

  it('limits how many parties one person can be in (spec §32)', async () => {
    const userId = newId();
    for (let i = 0; i < MAX_PARTIES_PER_USER; i++) {
      expect((await createPartyAs(userId)).statusCode).toBe(201);
    }
    const tooMany = await createPartyAs(userId);
    expect(tooMany.statusCode).toBe(400);
    expect((bodyOf(tooMany) as { error: { message: string } }).error.message).toContain(
      'maximum number of parties',
    );
  });
});

describe('GET /parties and GET /parties/{partyId}', () => {
  it('lists my parties, and shows a party with members to its members', async () => {
    const userId = newId();
    const party = (bodyOf(await createPartyAs(userId)) as { party: Party }).party;

    const list = bodyOf(await runHandler(listPartiesHandlerFn, apiEvent({ userId }), deps)) as {
      parties: { partyId: string }[];
    };
    expect(list.parties.map((p) => p.partyId)).toEqual([party.partyId]);

    const detail = await runHandler(
      getPartyHandlerFn,
      apiEvent({ userId, pathParameters: { partyId: party.partyId } }),
      deps,
    );
    expect(detail.statusCode).toBe(200);
    expect(bodyOf(detail)).toMatchObject({ party: { partyId: party.partyId }, isHost: true });

    const me = bodyOf(await runHandler(getMe, apiEvent({ userId }), deps)) as { parties: unknown[] };
    expect(me.parties).toHaveLength(1);
  });

  it('refuses non-members (403) and unknown parties (404)', async () => {
    const party = (bodyOf(await createPartyAs(newId())) as { party: Party }).party;

    const outsider = await runHandler(
      getPartyHandlerFn,
      apiEvent({ userId: newId(), pathParameters: { partyId: party.partyId } }),
      deps,
    );
    expect(outsider.statusCode).toBe(403);
    expect(bodyOf(outsider)).toMatchObject({ error: { code: 'NOT_A_MEMBER' } });

    const missing = await runHandler(
      getPartyHandlerFn,
      apiEvent({ userId: newId(), pathParameters: { partyId: newId() } }),
      deps,
    );
    expect(missing.statusCode).toBe(404);
  });

  it('treats a malformed party id as not found', async () => {
    const result = await runHandler(
      getPartyHandlerFn,
      apiEvent({ userId: newId(), pathParameters: { partyId: 'PARTY#x' } }),
      deps,
    );
    expect(result.statusCode).toBe(404);
  });
});
