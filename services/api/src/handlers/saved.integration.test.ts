import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Party, Recommendation, Round, SavedSongsResponse } from '@dropabop/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { apiEvent, bodyOf } from '../../test/events';
import { aRecommendation, aRound, newId } from '../../test/fixtures';
import { testDeps } from '../../test/handler-deps';
import { keys } from '../data/keys';
import { putRecommendation } from '../data/recommendations';
import { createRoundIfMissing } from '../data/rounds';
import { runHandler, type HandlerFn } from '../http/handler';
import { joinPartyFn, removeMemberFn } from './membership';
import { createPartyHandlerFn } from './parties';
import { listSavedSongsFn, saveSongFn, unsaveSongFn } from './saved';

const deps = testDeps();
afterAll(() => deps.data.db.destroy());
vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

const NOW = '2026-10-07T17:00:00.000Z'; // Wednesday; the week of Oct 5 is open until Oct 12 05:00Z
const people = { host: newId(), sharer: newId(), outsider: newId(), racer: newId() };
let party: Party;
let round: Round;
const songs: Recommendation[] = [];
let trackSeq = 900000;

const call = async (fn: HandlerFn, userId: string, opts: Parameters<typeof apiEvent>[0] = {}) => {
  const result = await runHandler(fn, apiEvent({ userId, ...opts }), deps);
  return { status: result.statusCode, body: bodyOf(result) as Record<string, unknown> };
};
const save = (userId: string, rec: Recommendation) =>
  call(saveSongFn, userId, { body: { roundId: rec.roundId, recommendationId: rec.recommendationId } });
const list = async (userId: string) =>
  (await call(listSavedSongsFn, userId)).body as unknown as SavedSongsResponse;

/** A song shared in the party with its own Apple Music id, optionally with a YouTube video (expiring item). */
async function share(by: string, video?: string): Promise<Recommendation> {
  const base = aRecommendation(round, by, '2026-10-07');
  const trackId = String(trackSeq++);
  const rec: Recommendation = {
    ...base,
    song: {
      ...base.song,
      title: `Song ${trackId}`,
      providers: [
        {
          provider: 'appleMusic',
          providerSongId: trackId,
          externalUrl: `https://music.apple.com/us/song/s/${trackId}`,
        },
        ...(video === undefined
          ? []
          : [
              {
                provider: 'youtube' as const,
                providerSongId: video,
                externalUrl: `https://www.youtube.com/watch?v=${video}`,
              },
            ]),
      ],
    },
  };
  await putRecommendation(
    deps.data,
    rec,
    video === undefined ? undefined : { videoId: video, source: 'pasted' },
    new Date(NOW),
  );
  songs.push(rec);
  return rec;
}

beforeAll(async () => {
  deps.setNow(NOW);
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
  party = await create(people.host, 'Saved party');
  await create(people.outsider, 'Elsewhere');
  for (const userId of [people.sharer, people.racer]) {
    await runHandler(
      joinPartyFn,
      apiEvent({
        userId,
        pathParameters: { partyId: party.partyId },
        body: { inviteCode: party.inviteCode },
      }),
      deps,
    );
  }
  round = aRound(party.partyId, '2026-10-05', { endsAt: '2026-10-12T05:00:00.000Z' });
  await createRoundIfMissing(deps.data, round);
});

describe('saving (D34)', () => {
  it('saves a song shared in your party, once; saving it again changes nothing', async () => {
    const rec = await share(people.sharer, 'dX3k_QDnzHE'); // the one song with a known sharer
    const first = await save(people.host, rec);
    expect(first).toEqual({
      status: 201,
      body: { trackId: rec.song.providers[0]?.providerSongId, alreadySaved: false },
    });
    const again = await save(people.host, rec);
    expect(again).toMatchObject({ status: 200, body: { alreadySaved: true } });
    expect((await list(people.host)).total).toBe(1);
  });

  it('never stores YouTube data in the saved copy (ADR-0011/0012)', async () => {
    const rec = songs[0] as Recommendation;
    const trackId = rec.song.providers[0]?.providerSongId as string;
    const { Item } = await deps.data.db.send(
      new GetCommand({ TableName: deps.data.tableName, Key: keys.savedSong(people.host, trackId) }),
    );
    expect(Item).toBeDefined();
    expect(JSON.stringify(Item)).not.toContain('dX3k_QDnzHE');
    expect(JSON.stringify(Item)).not.toContain('youtube');
  });

  it('refuses songs from parties you’re not in, unknown songs, and bad requests', async () => {
    const rec = songs[0] as Recommendation;
    expect((await save(people.outsider, rec)).body).toMatchObject({ error: { code: 'NOT_A_MEMBER' } });
    const unknown = await call(saveSongFn, people.host, {
      body: { roundId: rec.roundId, recommendationId: newId() },
    });
    expect(unknown.status).toBe(404);
    const bad = await call(saveSongFn, people.host, {
      body: { roundId: 'nope', recommendationId: 'x', userId: 'y' },
    });
    expect(bad.status).toBe(400);
  });
});

describe('the list', () => {
  it('while the week is open: party and date, a live video, but not who shared it (D10)', async () => {
    const view = (await list(people.host)).songs[0];
    expect(view?.from).toMatchObject({
      partyName: 'Saved party',
      isMember: true,
      isMine: false,
      submittedOn: '2026-10-07',
    });
    expect(view?.from).not.toHaveProperty('sharedBy');
    expect(JSON.stringify(view)).not.toContain(people.sharer);
    expect(
      view?.song.providers.some((p) => p.provider === 'youtube' && p.providerSongId === 'dX3k_QDnzHE'),
    ).toBe(true);
  });

  it('after the week ends: who shared it', async () => {
    deps.setNow('2026-10-12T06:00:00.000Z');
    const view = (await list(people.host)).songs[0];
    expect(view?.from.sharedBy).toMatchObject({ userId: people.sharer });
    deps.setNow(NOW);
  });

  it('is private: each person sees only their own list', async () => {
    expect((await list(people.outsider)).songs).toEqual([]);
    expect((await list(people.sharer)).total).toBe(0);
  });

  it('marks your own picks', async () => {
    const mine = await share(people.host);
    await save(people.host, mine);
    const view = (await list(people.host)).songs.find(
      (s) => s.from.recommendationId === mine.recommendationId,
    );
    expect(view?.from.isMine).toBe(true);
  });
});

describe('the 500 limit (D34)', () => {
  it('refuses a save past the limit, and two saves at once can’t both pass it', async () => {
    const counter = (count: number) =>
      deps.data.db.send(
        new PutCommand({
          TableName: deps.data.tableName,
          Item: { ...keys.savedCount(people.racer), entity: 'SavedCount', count },
        }),
      );
    await counter(500);
    const full = await save(people.racer, await share(newId()));
    expect(full).toMatchObject({ status: 409, body: { error: { code: 'SAVED_LIMIT' } } });

    await counter(499);
    const [a, b] = await Promise.all([share(newId()), share(newId())]);
    const results = await Promise.all([save(people.racer, a), save(people.racer, b)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });
});

describe('removing', () => {
  it('removes a song (and removing it again is fine); the slot is free again', async () => {
    const rec = songs[0] as Recommendation;
    const trackId = rec.song.providers[0]?.providerSongId as string;
    const before = (await list(people.host)).total;
    expect((await call(unsaveSongFn, people.host, { pathParameters: { trackId } })).status).toBe(204);
    expect((await call(unsaveSongFn, people.host, { pathParameters: { trackId } })).status).toBe(204);
    expect((await list(people.host)).total).toBe(before - 1);
    expect((await save(people.host, rec)).status).toBe(201);
  });

  it('rejects a path that isn’t a track id', async () => {
    expect((await call(unsaveSongFn, people.host, { pathParameters: { trackId: 'abc' } })).status).toBe(404);
  });
});

describe('after leaving the party', () => {
  it('keeps the songs and the party name from when they were saved, but drops the sharer and the video', async () => {
    const known = songs[0] as Recommendation; // shared by a member, with a live video
    await deps.data.db.send(
      new PutCommand({
        TableName: deps.data.tableName,
        Item: { ...keys.savedCount(people.racer), entity: 'SavedCount', count: 2 }, // the limit test filled it up
      }),
    );
    expect((await save(people.racer, known)).status).toBe(201);
    deps.setNow('2026-10-13T00:00:00.000Z'); // the week has ended; the video is still within its 29 days

    // A current member at the same moment sees both, so their absence below is down to leaving.
    const hostView = (await list(people.host)).songs.find(
      (s) => s.from.recommendationId === known.recommendationId,
    );
    expect(hostView?.from.sharedBy).toMatchObject({ userId: people.sharer });
    expect(hostView?.song.providers.some((p) => p.provider === 'youtube')).toBe(true);

    await runHandler(
      removeMemberFn,
      apiEvent({ userId: people.racer, pathParameters: { partyId: party.partyId, memberId: people.racer } }),
      deps,
    );
    const { songs: kept } = await list(people.racer);
    const view = kept.find((s) => s.from.recommendationId === known.recommendationId);
    expect(view?.from).toMatchObject({ partyName: 'Saved party', isMember: false });
    expect(view?.from).not.toHaveProperty('sharedBy');
    expect(view?.song.providers.some((p) => p.provider === 'youtube')).toBe(false);
    deps.setNow(NOW);
  });

  it('a removal still works if the counter was edited by hand to 0', async () => {
    const rec = songs[0] as Recommendation;
    const trackId = rec.song.providers[0]?.providerSongId as string;
    await deps.data.db.send(
      new PutCommand({
        TableName: deps.data.tableName,
        Item: { ...keys.savedCount(people.racer), entity: 'SavedCount', count: 0 },
      }),
    );
    expect((await call(unsaveSongFn, people.racer, { pathParameters: { trackId } })).status).toBe(204);
    expect((await list(people.racer)).songs.some((s) => s.trackId === trackId)).toBe(false);
  });
});
