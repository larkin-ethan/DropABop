// A pretend API for the sample-data preview (dev builds without AWS settings) and for screen tests.
// It answers the same routes as the real API (docs/API.md) from in-memory sample data, and applies the main rules
// (one song a day, no rating your own song, results only for closed weeks) so the screens behave realistically.
// It is NOT a security boundary: the real API enforces every rule on the server.

import type {
  Comment,
  CommentResponse,
  CommentsResponse,
  CurrentWeekResponse,
  GroupStatsResponse,
  InvitePreviewResponse,
  LeaderboardResponse,
  MeResponse,
  Party,
  PartyMember,
  PartyResponse,
  PersonalStatsResponse,
  ResultsResponse,
  Round,
  RoundsResponse,
  Song,
  SongResult,
  User,
  Weekday,
  WeekSongsResponse,
  HistoryDay,
  HistoryResponse,
  HistorySong,
  HistoryWeek,
  Achievement,
  AchievementsResponse,
} from '@dropabop/shared';
import {
  DEFAULT_SHARE_DAYS,
  PRIVACY_POLICY_VERSION,
  addCommentRequestSchema,
  checkSchedule,
  shareDaysOf,
  sortWeekdays,
  weekPrivacyOf,
} from '@dropabop/shared';
import { ApiError, type ApiClient } from '../api/client';
import { sampleMembers, sampleSongs, type SongView } from './sample-data';

const ME = 'me';

export interface PreviewState {
  user: User;
  parties: Party[];
  members: PartyMember[];
  round: Round;
  today: { weekday: Weekday; date: string; dayNumber: number; dayCount: number } | null;
  songs: SongView[];
  pastRound: Round;
  pastResults: SongResult[];
  /** When "you" last looked at your achievements (sample world; P13.9). */
  achievementsSeenAt: string | null;
  /** A party you're not in yet, joinable with its code (for trying the invite flow). */
  otherParty: Party;
  /** Set by closeWeek(): the current week has ended (ratings locked, results out). */
  weekClosed: boolean;
  catalog: Song[];
  /** D25: comments on songs (this week and last week). */
  comments: Comment[];
}

function catalogSong(id: string, title: string, artist: string, album: string): Song {
  return {
    songId: `appleMusic:${id}`,
    title,
    artist,
    album,
    albumArtUrl: null,
    durationMs: 215_000,
    releaseDate: null,
    providers: [
      { provider: 'appleMusic', providerSongId: id, externalUrl: `https://music.apple.com/us/song/${id}` },
    ],
  };
}

/** Monday 00:00 (local) after the week whose ratings lock at `endsAt`: when the next week starts, like the real API. */
function nextMondayAfter(endsAt: string): string {
  const monday = new Date(new Date(endsAt).getTime() - 60_000); // the lock minute itself
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
  return monday.toISOString();
}

/** A fresh copy of the sample world. Tests can change it before rendering (e.g. make it the weekend). */
export function createPreviewState(now: Date = new Date()): PreviewState {
  const party: Party = {
    partyId: 'p1',
    name: 'Ethan’s Music Party',
    hostUserId: ME,
    inviteCode: 'SONG-7K4P',
    memberCount: sampleMembers.length,
    settings: {
      maxMembers: 20,
      timezone: 'America/Chicago',
      paused: false,
      revealRecommenderDuringVoting: false,
      showWhoRatedWhat: false,
      shareDays: [...DEFAULT_SHARE_DAYS],
      ratingCloseDay: 'SUN',
      ratingCloseTime: '23:59',
    },
    createdAt: '2026-09-01T12:00:00.000Z',
  };
  // Next Monday 00:00 local time, so the preview shows "Ratings lock Sunday 11:59 pm" like the real app.
  const nextMonday = new Date(now);
  nextMonday.setHours(0, 0, 0, 0);
  nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
  const endsAt = nextMonday.toISOString();
  const pastSongs = sampleSongs.slice(0, 8).map((s, index): SongResult => {
    const ratings = [9, 8, 8, 7, 6, 5, 4, 3][index] ?? 5;
    const distribution = Array.from({ length: 10 }, (_, i) =>
      i === ratings - 1 ? 3 : i === ratings ? 1 : 0,
    );
    return {
      recommendationId: `past-${s.recommendationId}`,
      rank: index + 1,
      weekday: (['MON', 'MON', 'TUE', 'WED', 'WED', 'THU', 'FRI', 'FRI'] as Weekday[])[index] ?? 'MON',
      submittedOn: '2026-09-28',
      song: s.song,
      recommendedBy: sampleMembers[index % sampleMembers.length]?.userId ?? ME,
      averageRating: ratings + 0.3,
      ratingCount: 4,
      distribution,
      myRating: index % 3 === 0 ? null : ratings,
    };
  });
  return {
    user: {
      userId: ME,
      displayName: 'Ethan Larkin',
      avatarColor: '#3B82F6',
      preferredProvider: null,
      privacyAcceptedAt: '2026-10-09T12:00:00.000Z',
      privacyVersion: PRIVACY_POLICY_VERSION,
      createdAt: '2026-09-01T12:00:00.000Z',
    },
    parties: [party],
    members: sampleMembers.map((m, i) => ({
      partyId: party.partyId,
      userId: m.userId,
      displayName: m.displayName,
      avatarColor: m.avatarColor,
      role: i === 0 ? 'host' : 'member',
      joinedAt: '2026-09-01T12:00:00.000Z',
    })),
    round: {
      roundId: 'p1.2026-10-05',
      partyId: party.partyId,
      weekStart: '2026-10-05',
      timezone: 'America/Chicago',
      startsAt: '2026-10-05T05:00:00.000Z',
      endsAt,
      shareDays: [...DEFAULT_SHARE_DAYS],
      revealRecommenderDuringVoting: false,
      showWhoRatedWhat: false,
      status: 'OPEN',
    },
    today: { weekday: 'WED', date: '2026-10-07', dayNumber: 3, dayCount: 5 },
    songs: sampleSongs.map((s) => ({ ...s })),
    pastRound: {
      roundId: 'p1.2026-09-28',
      partyId: party.partyId,
      weekStart: '2026-09-28',
      timezone: 'America/Chicago',
      startsAt: '2026-09-28T05:00:00.000Z',
      endsAt: '2026-10-05T05:00:00.000Z',
      status: 'CLOSED',
    },
    pastResults: pastSongs,
    achievementsSeenAt: '2026-10-01T00:00:00.000Z',
    weekClosed: false,
    comments: [
      {
        commentId: 'c1',
        roundId: 'p1.2026-10-05',
        recommendationId: 'r10',
        userId: 'u2',
        text: 'This one has been stuck in my head all week',
        createdAt: '2026-10-07T15:10:00.000Z',
      },
      {
        commentId: 'c2',
        roundId: 'p1.2026-10-05',
        recommendationId: 'r10',
        userId: 'u4',
        text: 'Perfect road trip song',
        createdAt: '2026-10-07T16:02:00.000Z',
      },
    ],
    otherParty: {
      ...party,
      partyId: 'p2',
      name: 'Road Trip Crew',
      hostUserId: 'u3',
      inviteCode: 'SONG-2ABC',
      memberCount: 3,
    },
    catalog: [
      catalogSong('1001', 'Midnight City', 'M83', 'Hurry Up, We’re Dreaming'),
      catalogSong('1002', 'Mr. Blue Sky', 'Electric Light Orchestra', 'Out of the Blue'),
      catalogSong('1003', 'Dancing Queen', 'ABBA', 'Arrival'),
      catalogSong('1004', 'Here Comes the Sun', 'The Beatles', 'Abbey Road'),
      catalogSong('1005', 'Motion Sickness', 'Phoebe Bridgers', 'Stranger in the Alps'),
    ],
  };
}

/**
 * Sample mode's "jump to after Sunday night" (end-to-end tests): the current week ends, ratings lock, and its
 * results are worked out from the songs and your ratings (the only ratings the sample world knows).
 */
export function closeWeek(state: PreviewState): void {
  state.weekClosed = true;
}

function weekResults(state: PreviewState): ResultsResponse {
  const others = state.members.filter((m) => m.userId !== ME);
  const scored = state.songs.map((song, index) => ({
    song,
    average: song.isMine ? null : song.myRating,
    recommendedBy: song.isMine ? ME : (others[index % others.length]?.userId ?? ME),
  }));
  scored.sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  const songs: SongResult[] = scored.map(({ song, average, recommendedBy }, index) => ({
    recommendationId: song.recommendationId,
    rank: index + 1,
    weekday: song.weekday,
    submittedOn: song.submittedOn,
    song: song.song,
    recommendedBy,
    averageRating: average,
    ratingCount: average === null ? 0 : 1,
    distribution: Array.from({ length: 10 }, (_, i) => (average !== null && i === average - 1 ? 1 : 0)),
    myRating: song.myRating,
  }));
  const days = shareDaysOf(state.round).map((weekday) => {
    const ofDay = songs.filter((r) => r.weekday === weekday);
    const rated = ofDay.filter((r) => r.averageRating !== null);
    return {
      weekday,
      songIds: ofDay.map((r) => r.recommendationId),
      winnerIds: rated.slice(0, 1).map((r) => r.recommendationId),
    };
  });
  return {
    round: { ...state.round, status: 'CLOSED' },
    results: {
      roundId: state.round.roundId,
      songs,
      days,
      totalRatings: songs.filter((r) => r.ratingCount > 0).length,
    },
    members: state.members.map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      avatarColor: m.avatarColor,
      avatarImage: m.avatarImage ?? null,
    })),
  };
}

function notFound(): never {
  throw new ApiError(404, 'NOT_FOUND', 'We couldn’t find that.');
}

function memberNames(state: PreviewState) {
  return state.members.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    avatarColor: m.avatarColor,
    avatarImage: m.avatarImage ?? null,
  }));
}

const notEnough = (sampleSize: number, required: number) =>
  ({ status: 'not-enough-data', sampleSize, required }) as const;

/**
 * The world the sample-data preview opens with: like the test world, but you haven't shared today's song yet, so the
 * whole Share flow can be tried (search → choose → confirm → shared). Your Wednesday pick becomes someone else's.
 */
export function createDemoState(now: Date = new Date()): PreviewState {
  const state = createPreviewState(now);
  state.songs = state.songs.map((song) =>
    song.recommendationId === 'r9' ? { ...song, isMine: false, recommendedBy: undefined } : song,
  );
  return state;
}

export function createPreviewApi(state: PreviewState = createPreviewState()): ApiClient {
  const party = () => state.parties[0] ?? notFound();

  function partyResponse(): PartyResponse {
    const p = party();
    return {
      party: { ...p, memberCount: state.members.length },
      members: state.members,
      isHost: p.hostUserId === ME,
    };
  }

  function currentWeek(): CurrentWeekResponse {
    const p = party();
    if (state.weekClosed) {
      return {
        round: null,
        reason: 'between-weeks',
        nextWeekStartsAt: nextMondayAfter(state.round.endsAt),
        lastRoundId: state.round.roundId,
      };
    }
    if (p.settings.paused) {
      return { round: null, reason: 'paused', nextWeekStartsAt: null, lastRoundId: state.pastRound.roundId };
    }
    const ratable = state.songs.filter((s) => !s.isMine);
    const mine = state.songs.filter((s) => s.isMine);
    const today = state.today;
    return {
      round: state.round,
      status: 'OPEN',
      reason: null,
      today,
      sharedToday: today !== null && mine.some((s) => s.weekday === today.weekday),
      mySubmissionDates: mine.map((s) => s.submittedOn),
      sharedTodayCount: today === null ? 0 : state.songs.filter((s) => s.weekday === today.weekday).length,
      // Like the real API: who has shared today only when this week reveals recommenders (D10).
      ...(weekPrivacyOf(state.round).revealRecommenderDuringVoting && today !== null
        ? { sharedTodayUserIds: mine.some((s) => s.weekday === today.weekday) ? [ME] : [] }
        : {}),
      progress: {
        songCount: state.songs.length,
        ratableCount: ratable.length,
        ratedCount: ratable.filter((s) => s.myRating !== null).length,
      },
    };
  }

  function route(method: string, path: string, body: unknown): unknown {
    const [pathname = '', query = ''] = path.split('?');
    const params = new URLSearchParams(query);
    const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const is = (m: string, ...pattern: string[]) =>
      method === m &&
      parts.length === pattern.length &&
      pattern.every((segment, i) => segment.startsWith(':') || segment === parts[i]);

    if (is('GET', 'users', 'me')) {
      const response: MeResponse = {
        user: state.user,
        parties: state.parties.map((p) => ({
          partyId: p.partyId,
          partyName: p.name,
          role: p.hostUserId === ME ? 'host' : 'member',
          joinedAt: p.createdAt,
        })),
      };
      return response;
    }
    if (is('PATCH', 'users', 'me')) {
      // Like the real API: `acceptPrivacy` becomes the time and current version (ADR-0011).
      const { acceptPrivacy, ...changes } = body as Partial<User> & { acceptPrivacy?: true };
      state.user = { ...state.user, ...changes };
      if (acceptPrivacy === true) {
        state.user = {
          ...state.user,
          privacyAcceptedAt: new Date().toISOString(),
          privacyVersion: PRIVACY_POLICY_VERSION,
        };
      }
      state.members = state.members.map((m) =>
        m.userId === ME
          ? {
              ...m,
              displayName: state.user.displayName,
              avatarColor: state.user.avatarColor,
              avatarImage: state.user.avatarImage ?? null,
            }
          : m,
      );
      return { user: state.user };
    }
    if (is('GET', 'users', 'me', 'stats')) {
      const response: PersonalStatsResponse = {
        weeksPlayed: 1,
        averageRatingGiven: { status: 'ok', value: 7.4, sampleSize: 12 },
        averageScoreReceived: { status: 'ok', value: 8.1, sampleSize: 3 },
        songsRecommended: 5,
        highestRatedRecommendation: notEnough(2, 3),
        lowestRatedRecommendation: notEnough(2, 3),
        generosity: { status: 'ok', value: 0.4, sampleSize: 12 },
        ratingDistribution: { status: 'ok', value: [0, 0, 1, 1, 1, 2, 3, 2, 1, 1], sampleSize: 12 },
        favoriteArtists: notEnough(0, 2),
        musicalTwin: notEnough(3, 5),
        members: memberNames(state),
      };
      return response;
    }
    if (is('POST', 'parties')) {
      const request = body as { name: string; timezone: string; maxMembers?: number };
      const created: Party = {
        ...party(),
        partyId: `p${state.parties.length + 1}`,
        name: request.name,
        inviteCode: 'SONG-NEW2',
        settings: { ...party().settings, timezone: request.timezone, maxMembers: request.maxMembers ?? 20 },
      };
      state.parties = [created, ...state.parties];
      return { party: created, members: [state.members[0]], isHost: true };
    }
    if (is('GET', 'parties', ':id')) return partyResponse();
    if (is('PATCH', 'parties', ':id', 'settings')) {
      const { name, ...settings } = body as { name?: string } & Partial<Party['settings']>;
      const p = party();
      // Same schedule rule as the API (D1, D2). Like the API, a change applies from next week: the sample week keeps
      // its own days.
      if (settings.shareDays !== undefined) settings.shareDays = sortWeekdays(settings.shareDays);
      const problem = checkSchedule({ ...p.settings, ...settings });
      if (problem !== null) throw new ApiError(400, 'VALIDATION_FAILED', problem);
      state.parties[0] = { ...p, name: name ?? p.name, settings: { ...p.settings, ...settings } };
      return partyResponse();
    }
    if (is('POST', 'parties', ':id', 'invite-code')) {
      state.parties[0] = { ...party(), inviteCode: 'SONG-9QX3' };
      return { inviteCode: 'SONG-9QX3' };
    }
    if (is('DELETE', 'parties', ':id', 'members', ':member')) {
      if (parts[3] === party().hostUserId) {
        throw new ApiError(403, 'FORBIDDEN', 'The host can’t leave the party.');
      }
      state.members = state.members.filter((m) => m.userId !== parts[3]);
      if (parts[3] === ME) state.parties = state.parties.filter((p) => p.partyId !== parts[1]);
      return undefined;
    }
    if (is('GET', 'invites', ':code')) {
      const code = parts[1]?.toUpperCase();
      const target = [...state.parties, state.otherParty].find((p) => p.inviteCode === code);
      if (target === undefined) {
        throw new ApiError(
          400,
          'INVALID_INVITE',
          'That invite code isn’t valid. Ask the host for a new link.',
        );
      }
      const joined = state.parties.some((p) => p.partyId === target.partyId);
      const response: InvitePreviewResponse = {
        partyId: target.partyId,
        partyName: target.name,
        memberCount: joined ? state.members.length : target.memberCount,
        maxMembers: target.settings.maxMembers,
        isFull: false,
        alreadyMember: joined,
      };
      return response;
    }
    if (is('POST', 'parties', ':id', 'join')) {
      if (state.parties.some((p) => p.partyId === parts[1])) {
        throw new ApiError(409, 'ALREADY_MEMBER', 'You’re already in this party.');
      }
      if (parts[1] !== state.otherParty.partyId) notFound();
      state.parties = [...state.parties, state.otherParty];
      return { party: state.otherParty, members: state.members.slice(0, 1), isHost: false };
    }
    if (is('GET', 'parties', ':id', 'rounds', 'current')) return currentWeek();
    if (is('GET', 'parties', ':id', 'rounds')) {
      const response: RoundsResponse = { rounds: [state.round, state.pastRound], nextCursor: null };
      if (state.weekClosed) response.rounds[0] = { ...state.round, status: 'CLOSED' };
      return params.get('cursor') ? { rounds: [], nextCursor: null } : response;
    }
    if (is('GET', 'parties', ':id', 'stats')) {
      const top = state.pastResults[0];
      const response: GroupStatsResponse = {
        weeksPlayed: 1,
        songsShared: state.pastResults.length,
        ratingsGiven: 32,
        highestRatedSong:
          top === undefined
            ? notEnough(0, 3)
            : {
                status: 'ok',
                sampleSize: state.pastResults.length,
                value: [
                  {
                    id: top.recommendationId,
                    value: top.averageRating ?? 0,
                    sampleSize: top.ratingCount,
                    song: {
                      title: top.song.title,
                      artist: top.song.artist,
                      albumArtUrl: top.song.albumArtUrl,
                      recommendedBy: top.recommendedBy,
                      submittedOn: top.submittedOn,
                    },
                  },
                ],
              },
        crowdFavorite: notEnough(1, 3),
        mostDivisive: notEnough(2, 4),
        mostControversial: notEnough(2, 4),
        everyoneAgreed: notEnough(2, 4),
        darkHorse: notEnough(0, 3),
        mostGenerousVoter: { status: 'ok', value: [{ id: 'u2', value: 0.8, sampleSize: 11 }], sampleSize: 4 },
        toughestCritic: { status: 'ok', value: [{ id: 'u4', value: -0.9, sampleSize: 10 }], sampleSize: 4 },
        members: memberNames(state),
      };
      return response;
    }
    if (is('GET', 'parties', ':id', 'leaderboard')) {
      const response: LeaderboardResponse = {
        weeksPlayed: 1,
        highestAverageSongRating: state.pastResults.slice(0, 5).map((r, i) => ({
          id: r.recommendationId,
          rank: i + 1,
          value: r.averageRating ?? 0,
          sampleSize: r.ratingCount,
          song: {
            title: r.song.title,
            artist: r.song.artist,
            albumArtUrl: r.song.albumArtUrl,
            recommendedBy: r.recommendedBy,
            submittedOn: r.submittedOn,
          },
        })),
        highestAverageRecommendationScore: [
          { id: 'u3', rank: 1, value: 8.4, sampleSize: 5 },
          { id: ME, rank: 2, value: 8.1, sampleSize: 5 },
          { id: 'u2', rank: 3, value: 7.2, sampleSize: 4 },
        ],
        mostConsistent: [{ id: 'u2', rank: 1, value: 0.6, sampleSize: 4 }],
        mostSurprising: [],
        mostPopular: [{ id: 'u3', rank: 1, value: 0.8, sampleSize: 5 }],
        members: memberNames(state),
      };
      return response;
    }
    if (is('GET', 'rounds', ':id', 'recommendations')) {
      // Last week's songs (closed: sharers revealed, D10), for Song Details from the results (P13.5).
      if (parts[1] === state.pastRound.roundId) {
        const response: WeekSongsResponse = {
          round: state.pastRound,
          songs: state.pastResults.map((r) => ({
            recommendationId: r.recommendationId,
            weekday: r.weekday,
            submittedOn: r.submittedOn,
            song: r.song,
            isMine: r.recommendedBy === ME,
            recommendedBy: r.recommendedBy,
            myRating: r.myRating,
          })),
        };
        return response;
      }
      if (parts[1] !== state.round.roundId) notFound();
      // Like the real API (D10): who shared each song only for your own songs, or when this week reveals them.
      const reveal = weekPrivacyOf(state.round).revealRecommenderDuringVoting;
      const others = state.members.filter((m) => m.userId !== ME);
      const songs = state.songs.map((song, index) => {
        if (song.isMine) return { ...song, recommendedBy: ME };
        const { recommendedBy: _hidden, ...anonymous } = song;
        return reveal
          ? { ...anonymous, recommendedBy: others[index % others.length]?.userId ?? ME }
          : anonymous;
      });
      const response: WeekSongsResponse = { round: state.round, songs };
      return response;
    }
    if (is('POST', 'rounds', ':id', 'recommendations')) {
      const today = state.today;
      if (today === null)
        throw new ApiError(
          409,
          'WEEKEND',
          'Today isn’t a sharing day. You can still rate this week’s songs.',
        );
      if (state.songs.some((s) => s.isMine && s.weekday === today.weekday)) {
        throw new ApiError(409, 'ALREADY_SUBMITTED_TODAY', 'You’ve already shared your song for today.');
      }
      const request = body as { providerSongId: string };
      const song = state.catalog.find((s) => s.providers[0]?.providerSongId === request.providerSongId);
      if (song === undefined) throw new ApiError(400, 'VALIDATION_FAILED', 'We couldn’t find that song.');
      const view: SongView = {
        recommendationId: `new-${state.songs.length + 1}`,
        weekday: today.weekday,
        submittedOn: today.date,
        song,
        isMine: true,
        recommendedBy: ME,
        myRating: null,
      };
      state.songs = [...state.songs, view];
      return { song: view };
    }
    if (is('PUT', 'rounds', ':id', 'votes', ':rec')) {
      if (state.weekClosed)
        throw new ApiError(409, 'WEEK_CLOSED', 'This week has ended, so ratings are locked.');
      const target = state.songs.find((s) => s.recommendationId === parts[3]) ?? notFound();
      if (target.isMine) throw new ApiError(403, 'OWN_SONG', 'You can’t rate your own song.');
      const rating = (body as { rating: number }).rating;
      state.songs = state.songs.map((s) => (s === target ? { ...s, myRating: rating } : s));
      return {
        vote: { recommendationId: target.recommendationId, rating, updatedAt: new Date().toISOString() },
      };
    }
    // Comments (D25), with the same rules as the API: members only (everyone here is), open weeks only for writing.
    if (is('GET', 'rounds', ':id', 'comments')) {
      const response: CommentsResponse = { comments: state.comments.filter((c) => c.roundId === parts[1]) };
      return response;
    }
    if (is('POST', 'rounds', ':id', 'recommendations', ':rec', 'comments')) {
      if (parts[1] !== state.round.roundId || state.weekClosed) {
        throw new ApiError(409, 'WEEK_CLOSED', 'This week has ended, so comments are closed.');
      }
      if (!state.songs.some((s) => s.recommendationId === parts[3])) notFound();
      const parsed = addCommentRequestSchema.safeParse(body);
      if (!parsed.success) {
        throw new ApiError(400, 'VALIDATION_FAILED', parsed.error.issues[0]?.message ?? 'Check the comment.');
      }
      const comment: Comment = {
        commentId: `c${state.comments.length + 1}-${Date.now()}`,
        roundId: state.round.roundId,
        recommendationId: parts[3] ?? '',
        userId: ME,
        text: parsed.data.text,
        createdAt: new Date().toISOString(),
      };
      state.comments = [...state.comments, comment];
      const response: CommentResponse = { comment };
      return response;
    }
    if (is('DELETE', 'rounds', ':id', 'comments', ':comment')) {
      const target = state.comments.find((c) => c.commentId === parts[3]) ?? notFound();
      const host = party().hostUserId === ME;
      if (!host && target.userId !== ME) {
        throw new ApiError(403, 'FORBIDDEN', 'You can only delete your own comments.');
      }
      if (!host && (target.roundId !== state.round.roundId || state.weekClosed)) {
        throw new ApiError(409, 'WEEK_CLOSED', 'This week has ended, so comments are closed.');
      }
      state.comments = state.comments.filter((c) => c !== target);
      return undefined;
    }
    if (is('GET', 'rounds', ':id', 'votes', 'me')) {
      return {
        votes: state.songs
          .filter((s) => s.myRating !== null)
          .map((s) => ({ recommendationId: s.recommendationId, rating: s.myRating, updatedAt: '' })),
      };
    }
    if (is('GET', 'rounds', ':id', 'results')) {
      if (parts[1] === state.round.roundId) {
        if (!state.weekClosed) {
          throw new ApiError(403, 'RESULTS_NOT_READY', 'Results unlock when this week’s ratings lock.');
        }
        return weekResults(state);
      }
      if (parts[1] !== state.pastRound.roundId) notFound();
      const days = shareDaysOf(state.pastRound).map((weekday) => {
        const songIds = state.pastResults.filter((r) => r.weekday === weekday).map((r) => r.recommendationId);
        return { weekday, songIds, winnerIds: songIds.slice(0, 1) };
      });
      const response: ResultsResponse = {
        round: state.pastRound,
        results: { roundId: state.pastRound.roundId, songs: state.pastResults, days, totalRatings: 32 },
        members: memberNames(state),
      };
      return response;
    }
    if (is('GET', 'songs', 'search')) {
      const q = (params.get('q') ?? '').toLowerCase();
      return {
        songs: state.catalog.filter((s) => `${s.title} ${s.artist}`.toLowerCase().includes(q)),
      };
    }
    if (is('GET', 'parties', ':id', 'achievements')) {
      return sampleAchievements(state);
    }
    if (is('POST', 'parties', ':id', 'achievements', 'seen')) {
      state.achievementsSeenAt = new Date().toISOString();
      return { seenAt: state.achievementsSeenAt };
    }
    if (is('GET', 'parties', ':id', 'history')) {
      return sampleHistory(state, params.get('month') ?? '');
    }
    if (is('GET', 'songs', 'youtube')) {
      // Sample YouTube suggestions (ADR-0012). M7lc1UVf-VE is the sample video in YouTube's IFrame API reference.
      return {
        videos: [
          {
            videoId: 'M7lc1UVf-VE',
            title: 'Automatic embedded web player',
            channelTitle: 'Sample video',
          },
          { videoId: 'zzzzzzzzzzz', title: 'A video that doesn’t exist', channelTitle: 'Nobody' },
        ],
        unavailable: null,
      };
    }
    if (is('POST', 'songs', 'resolve')) {
      const song = state.catalog[0];
      if (song === undefined) notFound();
      return { song };
    }
    notFound();
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await Promise.resolve(); // behave like a network call: answer on a later tick
    return structuredClone(route(method, path, body)) as T;
  }

  return {
    get: (path) => request('GET', path),
    post: (path, body) => request('POST', path, body),
    put: (path, body) => request('PUT', path, body),
    patch: (path, body) => request('PATCH', path, body),
    delete: (path) => request('DELETE', path),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Sample history (P13.8): last week closed (from the sample results), this week open (counts only, D9).
// ---------------------------------------------------------------------------------------------------------------

const WEEK_ORDER: Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function dayDate(weekStart: string, weekday: Weekday): string {
  const [y = 1970, m = 1, d = 1] = weekStart.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + WEEK_ORDER.indexOf(weekday))).toISOString().slice(0, 10);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

function ratingsFrom(distribution: number[]): number[] {
  return distribution.flatMap((count, i) => new Array<number>(count).fill(i + 1));
}

function sampleHistory(state: PreviewState, month: string): HistoryResponse {
  const members = state.members.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    avatarColor: m.avatarColor,
    avatarImage: m.avatarImage ?? null,
  }));
  if (month !== '2026-10' && month !== '2026-09') return { month, weeks: [], members };

  const past = state.pastRound;
  const pastSongs: HistorySong[] = state.pastResults.map((r) => ({
    recommendationId: r.recommendationId,
    title: r.song.title,
    artist: r.song.artist,
    albumArtUrl: r.song.albumArtUrl,
    average: r.averageRating,
    ratingCount: r.ratingCount,
    rank: r.rank,
    myRating: r.myRating,
    recommendedBy: r.recommendedBy,
    isMine: r.recommendedBy === ME,
  }));
  const allPastRatings = state.pastResults.flatMap((r) => ratingsFrom(r.distribution));
  const pastDays: HistoryDay[] = DEFAULT_SHARE_DAYS.map((weekday) => {
    const results = state.pastResults.filter((r) => r.weekday === weekday);
    const songs = pastSongs.filter((s) => results.some((r) => r.recommendationId === s.recommendationId));
    const ratings = results.flatMap((r) => ratingsFrom(r.distribution));
    const distribution = new Array<number>(10).fill(0);
    for (const r of ratings) distribution[r - 1] = (distribution[r - 1] ?? 0) + 1;
    const top = songs[0]?.average ?? null;
    return {
      date: dayDate(past.weekStart, weekday),
      weekday,
      songCount: songs.length,
      iShared: songs.some((s) => s.isMine),
      personalBest: songs.some((s) => s.isMine && s.rank === 1),
      stats: {
        songs,
        ratingCount: ratings.length,
        groupAverage: average(ratings),
        myAverageGiven: average(songs.flatMap((s) => (s.myRating === null ? [] : [s.myRating]))),
        myAverageReceived: average(
          songs.filter((s) => s.isMine && s.average !== null).map((s) => s.average ?? 0),
        ),
        bopOfTheDay:
          top === null ? [] : songs.filter((s) => s.average === top).map((s) => s.recommendationId),
        lowestRated: songs.length > 1 ? [songs.at(-1)?.recommendationId ?? ''] : [],
        myRatingCount: songs.filter((s) => s.myRating !== null).length,
        distribution,
        favoriteArtists: [],
      },
    };
  });
  const pastDistribution = new Array<number>(10).fill(0);
  for (const r of allPastRatings) pastDistribution[r - 1] = (pastDistribution[r - 1] ?? 0) + 1;
  const pastWeek: HistoryWeek = {
    roundId: past.roundId,
    weekStart: past.weekStart,
    endsAt: past.endsAt,
    status: 'CLOSED',
    days: pastDays,
    summary: {
      songCount: pastSongs.length,
      ratingCount: allPastRatings.length,
      averageRating: average(allPastRatings),
      bestSongs: pastSongs.filter((s) => s.rank === 1).map((s) => s.recommendationId),
      topArtists: pastSongs.slice(0, 3).map((s) => ({ artist: s.artist, songs: 1 })),
      mostAgreeableDays: pastDays[1] === undefined ? [] : [pastDays[1].date],
      mostDivisive: pastSongs.length > 0 ? [pastSongs.at(-1)?.recommendationId ?? ''] : [],
      distribution: pastDistribution,
    },
    yourWeek: {
      songsRated: pastSongs.filter((s) => s.myRating !== null).length,
      averageGiven: average(pastSongs.flatMap((s) => (s.myRating === null ? [] : [s.myRating]))),
      averageReceived: average(
        pastSongs.filter((s) => s.isMine && s.average !== null).map((s) => s.average ?? 0),
      ),
      topSong: pastSongs.find((s) => s.isMine)?.recommendationId ?? null,
      rank: { position: 1, of: members.length },
    },
  };

  const current = state.round;
  const openWeek: HistoryWeek = {
    roundId: current.roundId,
    weekStart: current.weekStart,
    endsAt: current.endsAt,
    status: state.weekClosed ? 'CLOSED' : 'OPEN',
    days: shareDaysOf(current).map((weekday) => {
      const songs = state.songs.filter((s) => s.weekday === weekday);
      return {
        date: dayDate(current.weekStart, weekday),
        weekday,
        songCount: songs.length,
        iShared: songs.some((s) => s.isMine),
        personalBest: false,
        stats: null,
      };
    }),
    summary: null,
    yourWeek: null,
  };
  return { month, weeks: month === '2026-09' ? [pastWeek] : [pastWeek, openWeek], members };
}

// ---------------------------------------------------------------------------------------------------------------
// Sample achievements (P13.9): a few unlocked when last week closed, the rest with progress.
// ---------------------------------------------------------------------------------------------------------------

function sampleAchievements(state: PreviewState): AchievementsResponse {
  const at = state.pastRound.endsAt;
  const made = (
    id: string,
    group: Achievement['group'],
    emoji: string,
    title: string,
    description: string,
    unlocked: boolean,
    current = 0,
    target = 1,
    label = 'Not yet',
  ): Achievement => ({
    id,
    group,
    emoji,
    title,
    description,
    unlocked,
    unlockedOn: unlocked ? at : null,
    unlockedDay: unlocked ? '2026-10-04' : null, // last week locked Sunday night, party time
    progress: unlocked ? { current: target, target, label: 'Unlocked' } : { current, target, label },
  });
  const achievements: Achievement[] = [
    made('first-drop', 'participation', '🎵', 'First Drop', 'Share your first song.', true),
    made('first-rating', 'participation', '⭐', 'First Rating', 'Rate your first song.', true),
    made(
      'weeks-10',
      'participation',
      '📅',
      '10 Weeks',
      'Take part in 10 weeks.',
      false,
      2,
      10,
      '2 of 10 weeks',
    ),
    made(
      'artists-10',
      'discovery',
      '🧭',
      '10 Artists',
      'Share songs by 10 different artists.',
      false,
      6,
      10,
      '6 of 10 artists',
    ),
    made('first-10', 'rating', '🔟', 'First 10', 'Give a song a 10.', true),
    made(
      'generous-voter',
      'rating',
      '💝',
      'Generous Voter',
      'Rate at least 1 point above the group on average (10 ratings or more).',
      false,
      0.4,
      1,
      '+0.4 compared with the group (needs +1.0)',
    ),
    made('top-bop', 'songSuccess', '🏆', 'Top Bop', 'Have the #1 song of a week.', true),
    made(
      'crowd-favorite',
      'songSuccess',
      '🙌',
      'Crowd Favorite',
      'Have a week’s crowd favorite: the best average among songs most people rated.',
      false,
    ),
    made(
      'musical-twin',
      'social',
      '👯',
      'Musical Twin',
      'Rate within 1.0 point of someone on 5 songs you both rated.',
      false,
      3,
      5,
      '3 of 5 songs rated in common with someone',
    ),
    made(
      'monthly-regular',
      'consistency',
      '🔥',
      'Monthly Regular',
      'Take part in 4 weeks in a row.',
      false,
      2,
      4,
      '2 of 4 weeks in a row',
    ),
  ];
  const seenAt = state.achievementsSeenAt;
  return {
    memberId: ME,
    achievements,
    unlockedCount: achievements.filter((a) => a.unlocked).length,
    newlyUnlocked:
      seenAt === null
        ? []
        : achievements.filter((a) => a.unlockedOn !== null && a.unlockedOn > seenAt).map((a) => a.id),
    seenAt,
  };
}
