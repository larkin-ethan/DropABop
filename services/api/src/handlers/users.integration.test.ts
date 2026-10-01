import { afterAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { aMember, aParty, newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { createParty } from '../data/parties';
import { DEFAULT_DISPLAY_NAME } from '../domain/profile';
import { runHandler } from '../http/handler';
import { getMe, updateMe } from './users';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true); // keep test output quiet

describe('GET /users/me', () => {
  it('creates the profile on first call and returns it with the user’s parties', async () => {
    const userId = newId();
    const party = aParty({ hostUserId: userId });
    await createParty(deps.data, party, aMember(party.partyId, { userId, role: 'host' }));

    const result = await runHandler(getMe, apiEvent({ userId }), deps);

    expect(result.statusCode).toBe(200);
    const body = bodyOf(result) as {
      user: { userId: string; displayName: string };
      parties: { partyId: string }[];
    };
    expect(body.user).toMatchObject({ userId, displayName: DEFAULT_DISPLAY_NAME });
    expect(body.parties.map((p) => p.partyId)).toEqual([party.partyId]);
  });

  it('returns the same profile on later calls', async () => {
    const userId = newId();
    const first = bodyOf(await runHandler(getMe, apiEvent({ userId }), deps));
    const second = bodyOf(await runHandler(getMe, apiEvent({ userId }), deps));
    expect(second).toEqual(first);
  });

  it('requires sign-in', async () => {
    const result = await runHandler(getMe, apiEvent(), deps);
    expect(result.statusCode).toBe(401);
  });
});

describe('PATCH /users/me', () => {
  it('updates allowed fields', async () => {
    const userId = newId();
    const result = await runHandler(
      updateMe,
      apiEvent({ userId, body: { displayName: '  Ethan  ', preferredProvider: 'spotify' } }),
      deps,
    );
    expect(result.statusCode).toBe(200);
    expect(bodyOf(result)).toMatchObject({
      user: { userId, displayName: 'Ethan', preferredProvider: 'spotify' },
    });

    const after = bodyOf(await runHandler(getMe, apiEvent({ userId }), deps)) as {
      user: { displayName: string };
    };
    expect(after.user.displayName).toBe('Ethan');
  });

  it('cannot change someone else’s profile: a userId in the body is rejected', async () => {
    const userId = newId();
    const victim = newId();
    const result = await runHandler(
      updateMe,
      apiEvent({ userId, body: { userId: victim, displayName: 'Hacked' } }),
      deps,
    );
    expect(result.statusCode).toBe(400);
    expect(bodyOf(result)).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  });

  it('rejects invalid values with the friendly message', async () => {
    const result = await runHandler(updateMe, apiEvent({ userId: newId(), body: { displayName: '' } }), deps);
    expect(result.statusCode).toBe(400);
    expect(bodyOf(result)).toEqual({
      error: { code: 'VALIDATION_FAILED', message: 'Please enter a display name.' },
    });
  });

  it('rejects an empty update', async () => {
    const result = await runHandler(updateMe, apiEvent({ userId: newId(), body: {} }), deps);
    expect(result.statusCode).toBe(400);
  });
});
