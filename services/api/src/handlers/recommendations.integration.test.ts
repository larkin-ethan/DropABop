import type { Party, Round } from '@dropabop/shared';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { newId, setWeekPrivacy } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { runHandler } from '../http/handler';
import { joinPartyFn } from './membership';
import { createPartyHandlerFn } from './parties';
import { listRecommendationsFn, submitRecommendationFn } from './recommendations';
import { updateSettingsFn } from './settings';
import { castVoteFn } from './votes';
import { getCurrentWeekFn } from './weeks';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

const WEDNESDAY = '2026-10-07T17:00:00.000Z';
const THURSDAY = '2026-10-08T17:00:00.000Z';
const SATURDAY = '2026-10-10T17:00:00.000Z';
const NEXT_MONDAY = '2026-10-12T15:00:00.000Z';

interface SongView {
  recommendationId: string;
  weekday: string;
  submittedOn: string;
  isMine: boolean;
  recommendedBy?: string;
  myRating: number | null;
  song: { title: string };
}

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

const share = (
  userId: string,
  roundId: string,
  body: unknown = { provider: 'appleMusic', providerSongId: '100' },
) => runHandler(submitRecommendationFn, apiEvent({ userId, pathParameters: { roundId }, body }), deps);

const list = async (userId: string, roundId: string) => {
  const result = await runHandler(
    listRecommendationsFn,
    apiEvent({ userId, pathParameters: { roundId } }),
    deps,
  );
  return { status: result.statusCode, body: bodyOf(result) as { songs: SongView[] } };
};

const code = (result: { body?: string }) =>
  (bodyOf(result) as { error: { code: string; message: string } }).error;

describe('POST /rounds/{roundId}/recommendations', () => {
  it('shares today’s song with the server-decided day and looked-up details', async () => {
    const { round, hostId } = await setup();
    const result = await share(hostId, round.roundId);
    expect(result.statusCode).toBe(201);
    expect(bodyOf(result)).toMatchObject({
      song: {
        weekday: 'WED',
        submittedOn: '2026-10-07',
        isMine: true,
        recommendedBy: hostId,
        song: { title: 'Song 100' },
      },
    });
  });

  it('stores the sharer’s pasted Spotify/YouTube links as clean URLs (ADR-0007)', async () => {
    const { round, hostId } = await setup();
    const result = await share(hostId, round.roundId, {
      provider: 'appleMusic',
      providerSongId: '100',
      links: {
        spotify: 'https://open.spotify.com/track/1eyzqe2QqGZUmfcPZtrIyt?si=tracking123',
        youtube: 'https://youtu.be/dX3k_QDnzHE',
      },
    });
    expect(result.statusCode).toBe(201);
    const providers = (
      bodyOf(result) as { song: { song: { providers: { provider: string; externalUrl: string }[] } } }
    ).song.song.providers;
    expect(providers.map((p) => [p.provider, p.externalUrl])).toEqual([
      ['appleMusic', 'https://music.apple.com/us/song/test/100'],
      ['spotify', 'https://open.spotify.com/track/1eyzqe2QqGZUmfcPZtrIyt'],
      ['youtube', 'https://www.youtube.com/watch?v=dX3k_QDnzHE'],
    ]);
  });

  it('rejects a pasted link that isn’t really Spotify', async () => {
    const { round, hostId } = await setup();
    const result = await share(hostId, round.roundId, {
      provider: 'appleMusic',
      providerSongId: '100',
      links: { spotify: 'https://open.spotify.com.evil.example/track/1eyzqe2QqGZUmfcPZtrIyt' },
    });
    expect(result.statusCode).toBe(400);
  });

  it('allows one song per day: a second today fails, tomorrow works', async () => {
    const { round, hostId } = await setup();
    expect((await share(hostId, round.roundId)).statusCode).toBe(201);

    const again = await share(hostId, round.roundId, { provider: 'appleMusic', providerSongId: '200' });
    expect(again.statusCode).toBe(409);
    expect(code(again)).toEqual({
      code: 'ALREADY_SUBMITTED_TODAY',
      message: 'You’ve already shared your song for today.',
    });

    deps.setNow(THURSDAY);
    expect((await share(hostId, round.roundId)).statusCode).toBe(201);
  });

  it('only one of two simultaneous shares gets through', async () => {
    const { round, hostId } = await setup();
    const results = await Promise.all([share(hostId, round.roundId), share(hostId, round.roundId)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
  });

  it('rejects weekends, ended weeks, paused parties with no week, and other weeks', async () => {
    const { party, round, hostId } = await setup();

    deps.setNow(SATURDAY);
    expect(code(await share(hostId, round.roundId)).code).toBe('WEEKEND');

    deps.setNow(NEXT_MONDAY); // a new week has started; the old roundId is no longer this week
    expect(code(await share(hostId, round.roundId)).code).toBe('WEEK_CLOSED');

    await runHandler(
      updateSettingsFn,
      apiEvent({ userId: hostId, pathParameters: { partyId: party.partyId }, body: { paused: true } }),
      deps,
    );
    const nextWeek = `${party.partyId}.2026-10-19`;
    deps.setNow('2026-10-19T15:00:00.000Z');
    expect(code(await share(hostId, nextWeek)).code).toBe('PARTY_PAUSED');
  });

  it('rejects non-members, unknown songs, client-sent song details, and malformed rounds', async () => {
    const { round, hostId } = await setup();
    expect((await share(newId(), round.roundId)).statusCode).toBe(403);
    expect(
      code(await share(hostId, round.roundId, { provider: 'appleMusic', providerSongId: '999001' })).code,
    ).toBe('VALIDATION_FAILED');
    expect(
      (await share(hostId, round.roundId, { provider: 'appleMusic', providerSongId: '100', title: 'Forged' }))
        .statusCode,
    ).toBe(400);
    expect((await share(hostId, 'not-a-round')).statusCode).toBe(404);
  });
});

describe('GET /rounds/{roundId}/recommendations', () => {
  it('hides who shared each song during the week, and shows only your own ratings', async () => {
    const { party, round, hostId, memberId } = await setup();
    await share(hostId, round.roundId);
    await share(memberId, round.roundId, { provider: 'appleMusic', providerSongId: '300' });
    // A third member rates the host's song; that rating must never appear for anyone else (D9).
    const thirdId = newId();
    await runHandler(
      joinPartyFn,
      apiEvent({
        userId: thirdId,
        pathParameters: { partyId: party.partyId },
        body: { inviteCode: party.inviteCode },
      }),
      deps,
    );
    const hostSongId = (await list(thirdId, round.roundId)).body.songs.find(
      (s) => !s.isMine && s.song.title === 'Song 100',
    )?.recommendationId as string;
    await runHandler(
      castVoteFn,
      apiEvent({
        userId: thirdId,
        pathParameters: { roundId: round.roundId, recommendationId: hostSongId },
        body: { rating: 9 },
      }),
      deps,
    );

    const { status, body } = await list(memberId, round.roundId);
    expect(status).toBe(200);
    expect(body.songs).toHaveLength(2);
    const hostSong = body.songs.find((s) => !s.isMine);
    const mySong = body.songs.find((s) => s.isMine);
    expect(hostSong).not.toHaveProperty('recommendedBy');
    expect(hostSong).not.toHaveProperty('averageRating');
    expect(hostSong?.myRating).toBeNull(); // the third member's 9 is not shown as the viewer's rating
    expect(mySong?.recommendedBy).toBe(memberId);
  });

  it('shows recommenders in a week that started with reveal on, and in every week once it ends', async () => {
    const { party, round, hostId, memberId } = await setup();
    await share(hostId, round.roundId);

    // Turning reveal on mid-week doesn't un-hide songs already shared this week (D10).
    await runHandler(
      updateSettingsFn,
      apiEvent({
        userId: hostId,
        pathParameters: { partyId: party.partyId },
        body: { revealRecommenderDuringVoting: true },
      }),
      deps,
    );
    expect((await list(memberId, round.roundId)).body.songs[0]).not.toHaveProperty('recommendedBy');

    // A week that started with it on shows who shared each song.
    await setWeekPrivacy(deps.data, round, { revealRecommenderDuringVoting: true });
    expect((await list(memberId, round.roundId)).body.songs[0]?.recommendedBy).toBe(hostId);

    // Once the week is over, everyone's revealed whatever the switch was.
    await setWeekPrivacy(deps.data, round, { revealRecommenderDuringVoting: false });
    deps.setNow(NEXT_MONDAY);
    expect((await list(memberId, round.roundId)).body.songs[0]?.recommendedBy).toBe(hostId);
  });

  it('refuses non-members and treats a round from another party as forbidden', async () => {
    const { round } = await setup();
    const other = await setup();
    expect((await list(newId(), round.roundId)).status).toBe(403);
    // A member of party B can't read party A's week by passing its roundId.
    expect((await list(other.hostId, round.roundId)).status).toBe(403);
  });
});
