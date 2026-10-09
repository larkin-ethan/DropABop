import type { Party, PartySearchResponse } from '@dropabop/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { aRecommendation, aRound, newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { listRecentPartyRecommendations, putRecommendation } from '../data/recommendations';
import { createRoundIfMissing } from '../data/rounds';
import { runHandler } from '../http/handler';
import { joinPartyFn } from './membership';
import { createPartyHandlerFn } from './parties';
import { searchPartyFn } from './search';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

let party: Party;
let otherParty: Party;
const people = { a: newId(), b: newId(), outsider: newId() };

beforeAll(async () => {
  deps.setNow('2026-09-28T17:00:00.000Z');
  const create = async (userId: string, name: string) =>
    (
      bodyOf(
        await runHandler(
          createPartyHandlerFn,
          apiEvent({ userId, body: { name, timezone: 'America/Chicago' } }),
          deps,
        ),
      ) as { party: Party }
    ).party;
  party = await create(people.a, 'Search party');
  otherParty = await create(people.outsider, 'Other party');
  await runHandler(
    joinPartyFn,
    apiEvent({
      userId: people.b,
      pathParameters: { partyId: party.partyId },
      body: { inviteCode: party.inviteCode },
    }),
    deps,
  );

  // A closed week (Sep 28) and the open week (Oct 5), both with a Robyn song shared by B.
  const closed = aRound(party.partyId, '2026-09-28', { endsAt: '2026-10-05T05:00:00.000Z' });
  const open = aRound(party.partyId, '2026-10-05', { endsAt: '2026-10-12T05:00:00.000Z' });
  for (const round of [closed, open]) {
    await createRoundIfMissing(deps.data, round);
    const rec = aRecommendation(round, people.b, round.weekStart);
    await putRecommendation(deps.data, {
      ...rec,
      song: { ...rec.song, title: `Robyn ${round.weekStart}`, artist: 'Robyn' },
    });
  }
  // A song in another party must never show up.
  const elsewhere = aRound(otherParty.partyId, '2026-09-28');
  await createRoundIfMissing(deps.data, elsewhere);
  const secret = aRecommendation(elsewhere, people.outsider, '2026-09-28');
  await putRecommendation(deps.data, {
    ...secret,
    song: { ...secret.song, title: 'Robyn secret', artist: 'Robyn' },
  });

  deps.setNow('2026-10-07T17:00:00.000Z');
});

const search = async (userId: string, query: Record<string, string>, partyId = party.partyId) => {
  const result = await runHandler(
    searchPartyFn,
    apiEvent({ userId, pathParameters: { partyId }, queryStringParameters: query }),
    deps,
  );
  return { status: result.statusCode, body: bodyOf(result) as PartySearchResponse };
};

describe('GET /parties/{partyId}/search', () => {
  it('finds the party’s songs, artists and members, and nothing from other parties', async () => {
    const { status, body } = await search(people.a, { q: 'robyn' });
    expect(status).toBe(200);
    expect(body.songs.map((s) => s.title).sort()).toEqual(['Robyn 2026-09-28', 'Robyn 2026-10-05']);
    expect(body.artists).toEqual([{ artist: 'Robyn', songCount: 2 }]);
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  it('hides who shared an open week’s song (D10), but not a closed week’s', async () => {
    const { body } = await search(people.a, { q: 'robyn', type: 'songs' });
    const closedHit = body.songs.find((s) => !s.weekOpen);
    const openHit = body.songs.find((s) => s.weekOpen);
    expect(closedHit?.recommendedBy).toBe(people.b);
    expect(openHit).toBeDefined();
    expect(openHit).not.toHaveProperty('recommendedBy');
    expect(JSON.stringify(openHit)).not.toContain(people.b);
    // The sharer still sees their own song as theirs.
    const own = await search(people.b, { q: 'robyn', type: 'songs' });
    expect(own.body.songs.find((s) => s.weekOpen)).toMatchObject({ isMine: true, recommendedBy: people.b });
  });

  it('finds weeks by date with their status from the server clock', async () => {
    const { body } = await search(people.a, { q: 'october 5' });
    expect(body.weeks).toEqual([
      expect.objectContaining({ weekStart: '2026-10-05', status: 'OPEN', songCount: 1 }),
    ]);
  });

  it('refuses non-members before looking at the query, and checks the query', async () => {
    expect((await search(people.outsider, { q: 'robyn' })).status).toBe(403);
    expect((await search(people.outsider, { q: 'x' })).status).toBe(403);
    expect((await search(people.a, { q: 'x' })).status).toBe(400);
    expect((await search(people.a, { q: 'robyn', type: 'everything' })).status).toBe(400);
    expect((await search(people.a, { q: 'robyn', cursor: 'abc' })).status).toBe(400);
  });

  it('reads at most the cap, newest weeks first, and says when it stopped early', async () => {
    const capped = await listRecentPartyRecommendations(deps.data, party.partyId, 1);
    expect(capped.recommendations.map((r) => r.submittedOn)).toEqual(['2026-10-05']);
    expect(capped.truncated).toBe(true);
    const all = await listRecentPartyRecommendations(deps.data, party.partyId, 10);
    expect(all.recommendations).toHaveLength(2);
    expect(all.truncated).toBe(false);
  });
});
