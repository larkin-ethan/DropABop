// No repeat songs in a party (D35): sharing, search and pasted links, against DynamoDB Local.

import type { AlreadyShared, Party, ResolveSongResponse, Round, SongSearchResponse } from '@dropabop/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { aRecommendation, aRound, newId } from '../../test/fixtures';
import { fakeSong, testDeps } from '../../test/handler-deps';
import { putRecommendation } from '../data/recommendations';
import { createRoundIfMissing } from '../data/rounds';
import { indexSharedSongs } from '../data/shared-songs';
import { runHandler } from '../http/handler';
import { joinPartyFn } from './membership';
import { createPartyHandlerFn } from './parties';
import { submitRecommendationFn } from './recommendations';
import { resolveSongFn, searchSongsFn } from './songs';
import { getCurrentWeekFn } from './weeks';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

const WEDNESDAY = '2026-10-07T17:00:00.000Z';
const THURSDAY = '2026-10-08T17:00:00.000Z';

async function setup(): Promise<{ party: Party; round: Round; hostId: string; memberId: string }> {
  deps.setNow(WEDNESDAY);
  const hostId = newId();
  const memberId = newId();
  const party = (
    bodyOf(
      await runHandler(
        createPartyHandlerFn,
        apiEvent({ userId: hostId, body: { name: 'P', timezone: 'America/Chicago' } }),
        deps,
      ),
    ) as { party: Party }
  ).party;
  await runHandler(
    joinPartyFn,
    apiEvent({
      userId: memberId,
      pathParameters: { partyId: party.partyId },
      body: { inviteCode: party.inviteCode },
    }),
    deps,
  );
  const current = bodyOf(
    await runHandler(
      getCurrentWeekFn,
      apiEvent({ userId: hostId, pathParameters: { partyId: party.partyId } }),
      deps,
    ),
  ) as { round: Round };
  return { party, round: current.round, hostId, memberId };
}

const share = (userId: string, roundId: string, providerSongId: string) =>
  runHandler(
    submitRecommendationFn,
    apiEvent({ userId, pathParameters: { roundId }, body: { provider: 'appleMusic', providerSongId } }),
    deps,
  );

const errorOf = (result: { body?: string }) =>
  (bodyOf(result) as { error: { code: string; message: string } }).error;

const search = (userId: string, partyId?: string) =>
  runHandler(
    searchSongsFn,
    apiEvent({ userId, queryStringParameters: { q: 'song', ...(partyId ? { partyId } : {}) } }),
    deps,
  );

const resolve = async (userId: string, partyId: string, trackId: string) => {
  const result = await runHandler(
    resolveSongFn,
    apiEvent({ userId, body: { url: `https://music.apple.com/us/song/x/${trackId}`, partyId } }),
    deps,
  );
  return { status: result.statusCode, body: bodyOf(result) as ResolveSongResponse };
};

/** Songs from before this rule: written without markers, the way they are in the table today. */
async function seedOlderWeek(partyId: string, songs: [day: string, trackId: string][]) {
  const round = aRound(partyId, '2026-09-28', { endsAt: '2026-10-05T05:00:00.000Z', status: 'CLOSED' });
  await createRoundIfMissing(deps.data, round);
  for (const [day, trackId] of songs) {
    // One per person per day, so each older song gets its own (made-up) sharer.
    const rec = aRecommendation(round, newId(), day);
    await putRecommendation(deps.data, { ...rec, song: fakeSong('appleMusic', trackId) });
  }
}

describe('sharing a song the party already has (D35)', () => {
  it('blocks the same recording, giving the date and never who shared it', async () => {
    const { round, hostId, memberId } = await setup();
    expect((await share(hostId, round.roundId, '100')).statusCode).toBe(201);

    const again = await share(memberId, round.roundId, '100');
    expect(again.statusCode).toBe(409);
    expect(errorOf(again)).toEqual({
      code: 'ALREADY_SHARED',
      message: 'That song was already shared in this party on Oct 7. Pick a different one.',
    });
    expect(again.body).not.toContain(hostId);

    // Being refused costs nothing: the member can still share another song today.
    expect((await share(memberId, round.roundId, '200')).statusCode).toBe(201);

    // The sharer can't share it again on another day either.
    deps.setNow(THURSDAY);
    expect(errorOf(await share(hostId, round.roundId, '100')).code).toBe('ALREADY_SHARED');
  });

  it('refuses it the same way when the share also carries a YouTube video', async () => {
    const { round, hostId, memberId } = await setup();
    expect((await share(hostId, round.roundId, '100')).statusCode).toBe(201);
    const withVideo = await runHandler(
      submitRecommendationFn,
      apiEvent({
        userId: memberId,
        pathParameters: { roundId: round.roundId },
        body: {
          provider: 'appleMusic',
          providerSongId: '100',
          links: { youtube: 'https://youtu.be/dX3k_QDnzHE' },
        },
      }),
      deps,
    );
    expect(withVideo.statusCode).toBe(409);
    expect(errorOf(withVideo).code).toBe('ALREADY_SHARED');
  });

  it('allows the same song in another party', async () => {
    const first = await setup();
    expect((await share(first.hostId, first.round.roundId, '100')).statusCode).toBe(201);
    const second = await setup();
    expect((await share(second.hostId, second.round.roundId, '100')).statusCode).toBe(201);
  });

  it('lets only one of two people choosing the same song at the same moment through', async () => {
    const { round, hostId, memberId } = await setup();
    const results = await Promise.all([
      share(hostId, round.roundId, '800'),
      share(memberId, round.roundId, '800'),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    const refused = results.find((r) => r.statusCode === 409);
    expect(refused && errorOf(refused).code).toBe('ALREADY_SHARED');
  });

  it('counts songs shared before the rule, including one already shared twice', async () => {
    const { party, round, hostId } = await setup();
    await seedOlderWeek(party.partyId, [
      ['2026-09-29', '500'],
      ['2026-09-30', '500'], // shared twice before the rule: left as it is, the first date counts
      ['2026-10-01', '600'],
    ]);

    const blocked = await share(hostId, round.roundId, '500');
    expect(errorOf(blocked)).toEqual({
      code: 'ALREADY_SHARED',
      message: 'That song was already shared in this party on Sep 29. Pick a different one.',
    });
    expect(errorOf(await share(hostId, round.roundId, '600')).code).toBe('ALREADY_SHARED');
    expect((await share(hostId, round.roundId, '650')).statusCode).toBe(201);

    // Running the markers again changes nothing and doesn't fail.
    await indexSharedSongs(deps.data, party.partyId);
    await indexSharedSongs(deps.data, party.partyId);
    expect((await resolve(hostId, party.partyId, '500')).body.alreadyShared).toEqual({
      sameRecording: true,
      sharedOn: '2026-09-29',
    } satisfies AlreadyShared);
  });

  it('only warns about a different version of a shared song', async () => {
    const { party, round, hostId, memberId } = await setup();
    expect((await share(hostId, round.roundId, '100')).statusCode).toBe(201);

    // "Song 100 (Live)" is another recording of "Song 100".
    expect((await resolve(memberId, party.partyId, '7100')).body.alreadyShared).toEqual({
      sameRecording: false,
      sharedOn: '2026-10-07',
    });
    expect((await share(memberId, round.roundId, '7100')).statusCode).toBe(201);
    // Now that recording is taken too.
    expect((await resolve(memberId, party.partyId, '7100')).body.alreadyShared).toMatchObject({
      sameRecording: true,
    });
  });
});

describe('past weeks added after the party was marked (D38)', () => {
  it('moves the date earlier to the first time it was really shared', async () => {
    const { party, round, hostId } = await setup();
    expect((await share(hostId, round.roundId, '100')).statusCode).toBe(201); // marks the party, Oct 7
    await seedOlderWeek(party.partyId, [['2026-09-29', '100']]);
    await indexSharedSongs(deps.data, party.partyId);
    expect((await resolve(hostId, party.partyId, '100')).body.alreadyShared).toEqual({
      sameRecording: true,
      sharedOn: '2026-09-29',
    });
  });
});

describe('search and pasted links say what the party already has (D35)', () => {
  it('marks shared songs in search results, by song id, with the date only', async () => {
    const { party, round, hostId, memberId } = await setup();
    expect((await share(hostId, round.roundId, '100')).statusCode).toBe(201);

    const result = await search(memberId, party.partyId);
    expect(result.statusCode).toBe(200);
    const body = bodyOf(result) as SongSearchResponse;
    expect(body.songs.map((s) => s.songId)).toEqual(['appleMusic:100', 'appleMusic:200']);
    expect(body.alreadyShared).toEqual({
      'appleMusic:100': { sameRecording: true, sharedOn: '2026-10-07' },
    });
    expect(result.body).not.toContain(hostId);
  });

  it('says nothing without a party, and refuses a party you’re not in', async () => {
    const { party, round, hostId } = await setup();
    await share(hostId, round.roundId, '100');

    const plain = bodyOf(await search(newId())) as SongSearchResponse;
    expect(plain.alreadyShared).toBeUndefined();

    // Membership is checked before the catalog is asked, so a non-member costs no iTunes call.
    const searchSongs = vi.spyOn(deps.music, 'searchSongs');
    const getSong = vi.spyOn(deps.music, 'getSong');
    expect((await search(newId(), party.partyId)).statusCode).toBe(403);
    expect((await resolve(newId(), party.partyId, '100')).status).toBe(403);
    expect((await search(hostId, newId())).statusCode).toBe(404);
    expect((await search(hostId, 'not a party!')).statusCode).toBe(400);
    expect(searchSongs).not.toHaveBeenCalled();
    expect(getSong).not.toHaveBeenCalled();
    searchSongs.mockRestore();
    getSong.mockRestore();
  });

  it('answers null for a pasted link the party never shared', async () => {
    const { party, hostId } = await setup();
    const result = await resolve(hostId, party.partyId, '300');
    expect(result.status).toBe(200);
    expect(result.body.alreadyShared).toBeNull();
  });
});
