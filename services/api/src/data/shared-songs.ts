// No repeat songs in a party (D35; docs/DATABASE.md patterns 30–32). Two kinds of marker per party:
// - `SHAREDSONG#<trackId>`: written once, in the same transaction as the song, with `attribute_not_exists`, so the
//   same recording can't be shared twice even when two people choose it at the same moment.
// - `SHAREDVERSION#<versionKey>`: the first date a song with that title + artist was shared, for the "a version of
//   this was shared" warning. Never blocks.
// Markers hold the date only, never who shared it (D10).
//
// Songs shared before markers existed (or added by the past-weeks tool, D38) get theirs the first time the party
// needs them: `ensureSharedSongsIndexed` reads the party's songs once (one key query) and writes their markers.

import type { DataContext } from './context';
import type { AlreadyShared, Recommendation, Song } from '@dropabop/shared';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { trackIdOf } from '../domain/saved';
import { versionKey } from '../domain/repeats';
import { queryByPrefix, withoutKeys } from './context';
import { isConditionalCheckFailed } from './errors';
import { keys, partitionKeys, prefixes } from './keys';

/** Bumped if the markers ever need rebuilding. */
const INDEX_VERSION = 1;
/** Marker writes in flight at once while indexing (each is one small conditional write). */
const INDEX_PARALLEL_WRITES = 25;

interface SongMarker {
  sharedOn: string;
}

interface VersionMarker {
  sharedOn: string;
  trackId: string;
}

/** The marker for this recording, written with the song: fails its condition if the party already has it. */
export function sharedSongPut(ctx: DataContext, recommendation: Recommendation, trackId: string) {
  return {
    TableName: ctx.tableName,
    Item: {
      ...keys.sharedSong(recommendation.partyId, trackId),
      entity: 'SharedSong',
      sharedOn: recommendation.submittedOn,
      roundId: recommendation.roundId,
      recommendationId: recommendation.recommendationId,
    },
    ConditionExpression: 'attribute_not_exists(PK)',
  };
}

/** The version marker: keeps the first date (and track) it was set with, so it never fails. Null without a key. */
export function sharedVersionUpdate(ctx: DataContext, recommendation: Recommendation, trackId: string) {
  const key = versionKey(recommendation.song);
  if (key === '') return null;
  return {
    TableName: ctx.tableName,
    Key: keys.sharedVersion(recommendation.partyId, key),
    UpdateExpression:
      'SET entity = :entity, sharedOn = if_not_exists(sharedOn, :sharedOn), trackId = if_not_exists(trackId, :trackId)',
    ExpressionAttributeValues: {
      ':entity': 'SharedVersion',
      ':sharedOn': recommendation.submittedOn,
      ':trackId': trackId,
    },
  };
}

/** When this recording was shared in the party, or null if it hasn't been. */
export async function getSharedSongDate(
  ctx: DataContext,
  partyId: string,
  trackId: string,
): Promise<string | null> {
  const { Item } = await ctx.db.send(
    new GetCommand({
      TableName: ctx.tableName,
      Key: keys.sharedSong(partyId, trackId),
      ConsistentRead: true,
    }),
  );
  return Item === undefined ? null : (Item as unknown as SongMarker).sharedOn;
}

/**
 * A marker write for indexing: creates the marker, or moves its date earlier when this song is older (weeks added by
 * the past-weeks tool after the party was indexed, D38). Never moves a date later, so it's safe to repeat.
 */
async function writeEarliest(
  ctx: DataContext,
  key: { PK: string; SK: string },
  entity: string,
  values: Record<string, string>,
): Promise<void> {
  const names = Object.keys(values);
  try {
    await ctx.db.send(
      new UpdateCommand({
        TableName: ctx.tableName,
        Key: key,
        UpdateExpression: `SET entity = :entity, ${names.map((n) => `${n} = :${n}`).join(', ')}`,
        ConditionExpression: 'attribute_not_exists(PK) OR sharedOn > :sharedOn',
        ExpressionAttributeValues: {
          ':entity': entity,
          ...Object.fromEntries(names.map((n) => [`:${n}`, values[n]])),
        },
      }),
    );
  } catch (error) {
    if (!isConditionalCheckFailed(error)) throw error; // already there with an earlier (or the same) date: fine
  }
}

/**
 * Writes markers for every song the party has, each with the first date it was shared. Safe to run again and
 * alongside new shares (dates only ever move earlier). A track already shared more than once (before this rule, or in
 * imported weeks) just keeps its first date.
 */
export async function indexSharedSongs(ctx: DataContext, partyId: string): Promise<void> {
  // The same read as listPartyRecommendations (not imported: recommendations.ts imports this file).
  const items = await queryByPrefix(ctx, partitionKeys.party(partyId), prefixes.allRecommendations());
  const songs = items
    .map((item) => withoutKeys<Recommendation>(item))
    .sort((a, b) => a.submittedOn.localeCompare(b.submittedOn) || a.createdAt.localeCompare(b.createdAt));
  // One write per marker: the first song wins for each track and each version.
  const writes = new Map<string, () => Promise<unknown>>();
  for (const song of songs) {
    const trackId = trackIdOf(song.song);
    if (trackId === null) continue;
    const trackKey = `track:${trackId}`;
    if (!writes.has(trackKey)) {
      writes.set(trackKey, () =>
        writeEarliest(ctx, keys.sharedSong(partyId, trackId), 'SharedSong', {
          sharedOn: song.submittedOn,
          roundId: song.roundId,
          recommendationId: song.recommendationId,
        }),
      );
    }
    const version = versionKey(song.song);
    const versionWriteKey = `version:${version}`;
    if (version !== '' && !writes.has(versionWriteKey)) {
      writes.set(versionWriteKey, () =>
        writeEarliest(ctx, keys.sharedVersion(partyId, version), 'SharedVersion', {
          sharedOn: song.submittedOn,
          trackId,
        }),
      );
    }
  }
  const pending = [...writes.values()];
  for (let start = 0; start < pending.length; start += INDEX_PARALLEL_WRITES) {
    await Promise.all(pending.slice(start, start + INDEX_PARALLEL_WRITES).map((write) => write()));
  }
  await ctx.db.send(
    new PutCommand({
      TableName: ctx.tableName,
      Item: {
        ...keys.sharedSongsIndexed(partyId),
        entity: 'SharedSongsIndexed',
        version: INDEX_VERSION,
        songs: songs.length,
      },
    }),
  );
}

/** Makes sure the party's older songs have markers (a quick read after the first time). */
export async function ensureSharedSongsIndexed(ctx: DataContext, partyId: string): Promise<void> {
  const { Item } = await ctx.db.send(
    new GetCommand({ TableName: ctx.tableName, Key: keys.sharedSongsIndexed(partyId) }),
  );
  if (Item !== undefined && Item.version === INDEX_VERSION) return;
  await indexSharedSongs(ctx, partyId);
}

/**
 * Which of these songs the party already has (D35), by songId: the same recording, or else another version. Songs
 * never shared are left out. Reads only their markers.
 */
export async function lookUpAlreadyShared(
  ctx: DataContext,
  partyId: string,
  songs: Pick<Song, 'songId' | 'title' | 'artist' | 'providers'>[],
): Promise<Record<string, AlreadyShared>> {
  const wanted = new Map<string, { PK: string; SK: string }>();
  const perSong = songs.map((song) => {
    const trackId = trackIdOf(song);
    const version = versionKey(song);
    const trackKey = trackId === null ? null : keys.sharedSong(partyId, trackId);
    const versionItemKey = version === '' ? null : keys.sharedVersion(partyId, version);
    for (const key of [trackKey, versionItemKey]) {
      if (key !== null) wanted.set(key.SK, key);
    }
    return { song, trackKey, versionItemKey };
  });

  // At most 20 small reads (10 search results × 2 markers), all at once.
  const found = new Map<string, Record<string, unknown>>();
  await Promise.all(
    [...wanted.values()].map(async (key) => {
      const { Item } = await ctx.db.send(new GetCommand({ TableName: ctx.tableName, Key: key }));
      if (Item !== undefined) found.set(key.SK, Item);
    }),
  );

  const answer: Record<string, AlreadyShared> = {};
  for (const { song, trackKey, versionItemKey } of perSong) {
    const sameRecording = trackKey === null ? undefined : found.get(trackKey.SK);
    if (sameRecording !== undefined) {
      answer[song.songId] = {
        sameRecording: true,
        sharedOn: (sameRecording as unknown as SongMarker).sharedOn,
      };
      continue;
    }
    const version = versionItemKey === null ? undefined : found.get(versionItemKey.SK);
    if (version !== undefined) {
      answer[song.songId] = {
        sameRecording: false,
        sharedOn: (version as unknown as VersionMarker).sharedOn,
      };
    }
  }
  return answer;
}
