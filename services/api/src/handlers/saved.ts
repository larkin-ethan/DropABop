// POST /users/me/saved, GET /users/me/saved, DELETE /users/me/saved/{trackId} (docs/API.md → Saved songs; D34).
// Your own private list: only you can read or change it. Saving needs membership of the song's party; reading and
// removing never do, so songs stay in the list after you leave a party.

import type { MemberName, SaveSongResponse, SavedSongsResponse } from '@dropabop/shared';
import {
  SAVED_SONGS_LIMIT,
  saveSongRequestSchema,
  savedSongsQuerySchema,
  savedTrackIdSchema,
} from '@dropabop/shared';
import { parseRoundId } from '../data/keys';
import { listMembers, listUserParties } from '../data/parties';
import { getRecommendation } from '../data/recommendations';
import { getRound } from '../data/rounds';
import { getLiveVideos, listSavedSongs, saveSong, unsaveSong } from '../data/saved-songs';
import { MESSAGES } from '../domain/messages';
import { needsVideoLookup, pageOfSaved, toSavedSongView, toStoredSavedSong } from '../domain/saved';
import { fail } from '../http/errors';
import { created, noContent, ok, createHandler, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseBody, parseQuery, pathParam } from '../http/request';
import { loadPartyForMember } from './parties';

const SONG_NOT_FOUND = 'We couldn’t find that song.';

/** Save a song shared in one of your parties. Saving it again changes nothing (`alreadySaved: true`). */
export const saveSongFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const { roundId, recommendationId } = parseBody(event, saveSongRequestSchema);
  const week = parseRoundId(roundId);
  if (week === null) fail('NOT_FOUND', SONG_NOT_FOUND);
  const { party } = await loadPartyForMember(data, week.partyId, userId); // only songs from your own parties

  const [recommendation, round] = await Promise.all([
    getRecommendation(data, roundId, recommendationId),
    getRound(data, roundId),
  ]);
  if (recommendation === null || round === null) fail('NOT_FOUND', SONG_NOT_FOUND);
  const stored = toStoredSavedSong({
    recommendation,
    partyName: party.name,
    weekEndsAt: round.endsAt,
    now: now(),
  });
  if (stored === null) fail('NOT_FOUND', SONG_NOT_FOUND);

  const outcome = await saveSong(data, userId, stored);
  if (outcome === 'limitReached') fail('SAVED_LIMIT', MESSAGES.SAVED_LIMIT);
  const body: SaveSongResponse = { trackId: stored.trackId, alreadySaved: outcome === 'alreadySaved' };
  return outcome === 'saved' ? created(body) : ok(body);
};

/** Your saved songs, newest first, a page at a time. */
export const listSavedSongsFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const { cursor } = parseQuery(event, savedSongsQuerySchema);
  const current = now();
  const [all, links] = await Promise.all([listSavedSongs(data, userId), listUserParties(data, userId)]);
  const { page, nextCursor } = pageOfSaved(all, cursor === undefined ? 0 : Number(cursor));

  const memberOf = new Map(links.map((l) => [l.partyId, l.partyName]));
  // Names only for parties you're in and that appear on this page (at most 5 parties, D15).
  const partyIds = [...new Set(page.map((s) => s.partyId).filter((id) => memberOf.has(id)))];
  const [memberLists, videos] = await Promise.all([
    Promise.all(partyIds.map((id) => listMembers(data, id))),
    getLiveVideos(
      data,
      page.filter((s) => needsVideoLookup(s, memberOf, current)),
      current,
    ),
  ]);
  const membersByParty = new Map<string, Map<string, MemberName>>(
    partyIds.map((id, i) => [
      id,
      new Map(
        (memberLists[i] ?? []).map((m) => [
          m.userId,
          {
            userId: m.userId,
            displayName: m.displayName,
            avatarColor: m.avatarColor,
            avatarImage: m.avatarImage ?? null,
          },
        ]),
      ),
    ]),
  );

  return ok({
    songs: page.map((s) =>
      toSavedSongView(s, { viewerId: userId, now: current, memberOf, membersByParty, videos }),
    ),
    total: all.length,
    limit: SAVED_SONGS_LIMIT,
    nextCursor,
  } satisfies SavedSongsResponse);
};

/** Remove a song from your list. Removing one that isn't there is fine too. */
export const unsaveSongFn: HandlerFn = async (event, { data }) => {
  const { userId } = getAuthenticatedUser(event);
  const parsed = savedTrackIdSchema.safeParse(pathParam(event, 'trackId'));
  if (!parsed.success) fail('NOT_FOUND', SONG_NOT_FOUND);
  await unsaveSong(data, userId, parsed.data);
  return noContent();
};

export const saveSongHandler = createHandler(saveSongFn);
export const listSavedSongsHandler = createHandler(listSavedSongsFn);
export const unsaveSongHandler = createHandler(unsaveSongFn);
