// POST and GET /rounds/{roundId}/recommendations (docs/API.md → Songs).

import type { ShareSongResponse, WeekSongsResponse } from '@dropabop/shared';
import type { Recommendation, SongProvider, SubmitRecommendationRequest } from '@dropabop/shared';
import {
  canonicalLinks,
  parseSpotifyTrackUrl,
  parseYouTubeUrl,
  songSchema,
  submitRecommendationRequestSchema,
} from '@dropabop/shared';
import { parseRoundId } from '../data/keys';
import { listMySubmissionDates, listWeekRecommendations, putRecommendation } from '../data/recommendations';
import { listMyWeekVotes } from '../data/votes';
import { toOpenWeekSongView } from '../domain/results';
import { canSubmitRecommendation } from '../domain/rules';
import { isWeekOpen } from '../domain/week';
import { assertAllowed, fail } from '../http/errors';
import { created, createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, parseBody, pathParam } from '../http/request';
import { loadPartyForMember } from './parties';
import { loadRoundForMember, resolveCurrentWeek } from './weeks';

/** Turns pasted links into SongProvider entries. The schema already checked they're real Spotify/YouTube links. */
function pastedLinks(links: SubmitRecommendationRequest['links']): SongProvider[] {
  const result: SongProvider[] = [];
  const spotifyId = links?.spotify === undefined ? null : parseSpotifyTrackUrl(links.spotify);
  if (spotifyId !== null) {
    result.push({
      provider: 'spotify',
      providerSongId: spotifyId,
      externalUrl: canonicalLinks.spotify(spotifyId),
    });
  }
  const youtubeId = links?.youtube === undefined ? null : parseYouTubeUrl(links.youtube);
  if (youtubeId !== null) {
    result.push({
      provider: 'youtube',
      providerSongId: youtubeId,
      externalUrl: canonicalLinks.youtube(youtubeId),
    });
  }
  return result;
}

/**
 * Share today's song (spec §14, D1). The server decides today's date, looks the song up with the music service
 * itself, and stores it. One per person per weekday; the database enforces that even for simultaneous requests.
 */
export const submitRecommendationFn: HandlerFn = async (event, { data, now, newId, music }) => {
  const { userId } = getAuthenticatedUser(event);
  // Not loadRoundForMember: on the first request of a week the round may not exist yet; resolveCurrentWeek creates it.
  const roundId = pathParam(event, 'roundId');
  const parts = parseRoundId(roundId);
  if (parts === null) {
    fail('NOT_FOUND', 'We couldn’t find that week.');
  }
  const request = parseBody(event, submitRecommendationRequestSchema);
  const { party, membership } = await loadPartyForMember(data, parts.partyId, userId);

  const current = now();
  const week = await resolveCurrentWeek(data, party, current);
  const { day } = assertAllowed(
    canSubmitRecommendation({
      membership,
      partyPaused: party.settings.paused,
      currentRound: week.round,
      requestedRoundId: roundId,
      mySubmissionDatesThisWeek: await listMySubmissionDates(data, roundId, userId),
      now: current,
    }),
  );

  const found = await music.getSong(request.provider, request.providerSongId);
  // Add the sharer's pasted Spotify/YouTube links (ADR-0007): stored as clean canonical URLs, nothing fetched.
  const extraProviders = found === null ? [] : pastedLinks(request.links);
  const song =
    found === null
      ? null
      : songSchema.safeParse({ ...found, providers: [...found.providers, ...extraProviders] });
  if (song === null || !song.success) {
    fail('VALIDATION_FAILED', 'We couldn’t find that song. Try searching again.');
  }

  const recommendation: Recommendation = {
    recommendationId: newId(), // random, so it never reveals who shared it (D10)
    roundId,
    partyId: party.partyId,
    userId,
    submittedOn: day.date,
    weekday: day.weekday,
    song: song.data,
    createdAt: now().toISOString(),
  };
  await putRecommendation(data, recommendation);
  return created({
    song: toOpenWeekSongView(recommendation, userId, undefined, party.settings),
  } satisfies ShareSongResponse);
};

/**
 * The week's songs so far, oldest first, with your own ratings. While the week is open, who shared each song is
 * hidden (unless the party reveals it) and nobody's ratings but yours are included (D9, D10). Results (averages,
 * ranks) come from the results endpoint once the week ends.
 */
export const listRecommendationsFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const { round, party } = await loadRoundForMember(event, data, userId);

  const [songs, myVotes] = await Promise.all([
    listWeekRecommendations(data, round.roundId),
    listMyWeekVotes(data, round.roundId, userId),
  ]);
  const voteBySong = new Map(myVotes.map((v) => [v.recommendationId, v]));
  // Once the week is over, recommenders are revealed (D10); ratings still come only from the results endpoint.
  const reveal = !isWeekOpen(round, now()) || party.settings.revealRecommenderDuringVoting;

  return ok({
    round,
    songs: songs.map((song) =>
      toOpenWeekSongView(song, userId, voteBySong.get(song.recommendationId), {
        revealRecommenderDuringVoting: reveal,
      }),
    ),
  } satisfies WeekSongsResponse);
};

export const submitRecommendationHandler = createHandler(submitRecommendationFn);
export const listRecommendationsHandler = createHandler(listRecommendationsFn);
