import type { Party } from '@dropabop/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { getParty, setScoringKeyIfUnset } from '../data/parties';
import { runHandler } from '../http/handler';
import { joinPartyFn } from './membership';
import { createPartyHandlerFn } from './parties';
import { updateSettingsFn } from './settings';
import { getMe } from './users';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

async function newParty(hostId: string): Promise<Party> {
  const result = await runHandler(
    createPartyHandlerFn,
    apiEvent({ userId: hostId, body: { name: 'Original', timezone: 'America/Chicago' } }),
    deps,
  );
  return (bodyOf(result) as { party: Party }).party;
}

const update = (userId: string, party: Party, body: unknown) =>
  runHandler(updateSettingsFn, apiEvent({ userId, pathParameters: { partyId: party.partyId }, body }), deps);

describe('PATCH /parties/{partyId}/settings', () => {
  it('lets the host change settings and the name', async () => {
    const hostId = newId();
    const party = await newParty(hostId);
    const result = await update(hostId, party, {
      name: 'Renamed',
      paused: true,
      timezone: 'Europe/London',
      showWhoRatedWhat: true,
    });
    expect(result.statusCode).toBe(200);
    const updated = (bodyOf(result) as { party: Party }).party;
    expect(updated.name).toBe('Renamed');
    expect(updated.settings).toEqual({
      ...party.settings,
      paused: true,
      timezone: 'Europe/London',
      showWhoRatedWhat: true,
    });

    const me = bodyOf(await runHandler(getMe, apiEvent({ userId: hostId }), deps)) as {
      parties: { partyName: string }[];
    };
    expect(me.parties[0]?.partyName).toBe('Renamed');
  });

  it('refuses members who aren’t the host, and outsiders', async () => {
    const hostId = newId();
    const party = await newParty(hostId);
    const member = newId();
    await runHandler(
      joinPartyFn,
      apiEvent({
        userId: member,
        pathParameters: { partyId: party.partyId },
        body: { inviteCode: party.inviteCode },
      }),
      deps,
    );
    expect((await update(member, party, { paused: true })).statusCode).toBe(403);
    expect((await update(newId(), party, { paused: true })).statusCode).toBe(403);
  });

  it('rejects a size limit below the current member count', async () => {
    const hostId = newId();
    const party = await newParty(hostId);
    for (let i = 0; i < 2; i++) {
      await runHandler(
        joinPartyFn,
        apiEvent({
          userId: newId(),
          pathParameters: { partyId: party.partyId },
          body: { inviteCode: party.inviteCode },
        }),
        deps,
      );
    }
    const result = await update(hostId, party, { maxMembers: 2 });
    expect(result.statusCode).toBe(400);
    expect(bodyOf(result)).toEqual({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'This party already has 3 members, so the limit can’t be lower than 3.',
      },
    });
  });

  it('lets the host set the sharing days and lock time, but never a lock before the last sharing day', async () => {
    const hostId = newId();
    const party = await newParty(hostId);
    expect(party.settings).toMatchObject({
      shareDays: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      ratingCloseDay: 'SUN',
      ratingCloseTime: '23:59',
    });

    const result = await update(hostId, party, {
      shareDays: ['SAT', 'TUE'],
      ratingCloseDay: 'SUN',
      ratingCloseTime: '20:30',
    });
    expect(result.statusCode).toBe(200);
    expect((bodyOf(result) as { party: Party }).party.settings).toMatchObject({
      shareDays: ['TUE', 'SAT'], // stored in week order
      ratingCloseDay: 'SUN',
      ratingCloseTime: '20:30',
    });

    // Each part is checked against the rest of the stored schedule.
    expect((await update(hostId, party, { ratingCloseDay: 'FRI' })).statusCode).toBe(400);
    // On the last sharing day itself, only 11:59 pm: SAT at 20:30 (the stored time) is too early.
    expect((await update(hostId, party, { ratingCloseDay: 'SAT' })).statusCode).toBe(400);
    expect(
      (await update(hostId, party, { ratingCloseDay: 'SAT', ratingCloseTime: '23:59' })).statusCode,
    ).toBe(200);
    expect((await update(hostId, party, { shareDays: ['SUN'] })).statusCode).toBe(400);
    expect((await update(hostId, party, { shareDays: [] })).statusCode).toBe(400);
    expect((await update(hostId, party, { ratingCloseTime: '8pm' })).statusCode).toBe(400);
  });

  it('rejects invalid or unknown settings, and an empty update', async () => {
    const hostId = newId();
    const party = await newParty(hostId);
    expect((await update(hostId, party, { timezone: 'Nowhere/Land' })).statusCode).toBe(400);
    expect((await update(hostId, party, { hostUserId: newId() })).statusCode).toBe(400);
    expect((await update(hostId, party, { inviteCode: 'SONG-AAAA' })).statusCode).toBe(400);
    expect((await update(hostId, party, {})).statusCode).toBe(400);
  });
});

describe('scoring key (D37)', () => {
  const key = Array.from({ length: 11 }, (_, score) => `Score ${score} means this`);

  it('starts unset (the default applies), and only the host can change it; it shows at once', async () => {
    const hostId = newId();
    const party = await newParty(hostId);
    expect(party.settings.scoringKey).toBeUndefined();
    const member = newId();
    await runHandler(
      joinPartyFn,
      apiEvent({
        userId: member,
        pathParameters: { partyId: party.partyId },
        body: { inviteCode: party.inviteCode },
      }),
      deps,
    );
    expect((await update(member, party, { scoringKey: key })).statusCode).toBe(403);
    const result = await update(hostId, party, { scoringKey: key.map((line) => `  ${line}  `) });
    expect(result.statusCode).toBe(200);
    expect((bodyOf(result) as { party: Party }).party.settings.scoringKey).toEqual(key); // trimmed
  });

  it('needs exactly 11 short, plain lines', async () => {
    const hostId = newId();
    const party = await newParty(hostId);
    for (const bad of [
      key.slice(0, 10),
      [...key, 'extra'],
      key.map((line, i) => (i === 3 ? '' : line)),
      key.map((line, i) => (i === 3 ? 'x'.repeat(121) : line)),
      key.map((line, i) => (i === 3 ? 'a‮b' : line)),
    ]) {
      expect((await update(hostId, party, { scoringKey: bad })).statusCode).toBe(400);
    }
  });
});

describe('setScoringKeyIfUnset (D38)', () => {
  it('sets the key only while the host hasn’t written one', async () => {
    const hostId = newId();
    const party = await newParty(hostId);
    const first = Array.from({ length: 11 }, (_, s) => `First ${s}`);
    const second = Array.from({ length: 11 }, (_, s) => `Second ${s}`);
    expect(await setScoringKeyIfUnset(deps.data, party.partyId, first)).toBe(true);
    expect(await setScoringKeyIfUnset(deps.data, party.partyId, second)).toBe(false);
    expect((await getParty(deps.data, party.partyId))?.settings.scoringKey).toEqual(first);
    expect(await setScoringKeyIfUnset(deps.data, newId(), first)).toBe(false); // no such party: nothing created
  });
});
