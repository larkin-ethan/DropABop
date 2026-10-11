// Every API call the screens make, as TanStack Query hooks (docs/API.md). Keeping them in one place means one cache
// key per resource, so a change made on one screen (e.g. rating a song) refreshes the others.

import type {
  AddCommentRequest,
  CastVoteRequest,
  CommentResponse,
  CommentsResponse,
  CreatePartyRequest,
  CurrentWeekResponse,
  GroupStatsResponse,
  InviteCodeResponse,
  InvitePreviewResponse,
  LeaderboardPeriod,
  PartySearchResponse,
  PartySearchType,
  LeaderboardResponse,
  MeResponse,
  PartyResponse,
  PersonalStatsResponse,
  ResolveSongResponse,
  ResultsResponse,
  RoundsResponse,
  ShareSongResponse,
  SongSearchResponse,
  SubmitRecommendationRequest,
  UpdatePartySettingsRequest,
  UpdateProfileRequest,
  VoteResponse,
  WeekSongsResponse,
  YouTubeSuggestionsResponse,
  HistoryResponse,
  AchievementsResponse,
  NotificationsResponse,
} from '@dropabop/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from './ApiContext';

/** How often the current week and its songs refresh while the page is visible (roadmap Phase 8: 30–60 s). */
export const WEEK_POLL_MS = 45_000;

const enc = encodeURIComponent;

export const keys = {
  me: ['me'] as const,
  party: (partyId: string) => ['party', partyId] as const,
  currentWeek: (partyId: string) => ['currentWeek', partyId] as const,
  weekSongs: (roundId: string) => ['weekSongs', roundId] as const,
  weekComments: (roundId: string) => ['weekComments', roundId] as const,
  rounds: (partyId: string) => ['rounds', partyId] as const,
  results: (roundId: string) => ['results', roundId] as const,
  invite: (code: string) => ['invite', code] as const,
  personalStats: (partyId: string) => ['personalStats', partyId] as const,
  groupStats: (partyId: string) => ['groupStats', partyId] as const,
  leaderboard: (partyId: string, period?: LeaderboardPeriod) =>
    period === undefined ? (['leaderboard', partyId] as const) : (['leaderboard', partyId, period] as const),
  search: (q: string) => ['search', q] as const,
  partySearch: (partyId: string, q: string, type: PartySearchType) =>
    ['partySearch', partyId, q, type] as const,
};

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export function useMe(options: { enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api.get<MeResponse>('/users/me'),
    enabled: options.enabled ?? true,
  });
}

export function useParty(partyId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: keys.party(partyId ?? ''),
    queryFn: () => api.get<PartyResponse>(`/parties/${enc(partyId ?? '')}`),
    enabled: partyId !== null,
  });
}

/** The home screen's main call. Polls while the tab is visible (TanStack pauses intervals for hidden tabs). */
export function useCurrentWeek(partyId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: keys.currentWeek(partyId ?? ''),
    queryFn: () => api.get<CurrentWeekResponse>(`/parties/${enc(partyId ?? '')}/rounds/current`),
    enabled: partyId !== null,
    refetchInterval: WEEK_POLL_MS,
  });
}

export function useWeekSongs(roundId: string | null, options: { poll?: boolean } = {}) {
  const api = useApi();
  return useQuery({
    queryKey: keys.weekSongs(roundId ?? ''),
    queryFn: () => api.get<WeekSongsResponse>(`/rounds/${enc(roundId ?? '')}/recommendations`),
    enabled: roundId !== null,
    refetchInterval: options.poll ? WEEK_POLL_MS : false,
  });
}

/** D25: every comment in a week (one request; the screens group them by song). Polls while the week is open. */
export function useWeekComments(roundId: string | null, options: { poll?: boolean } = {}) {
  const api = useApi();
  return useQuery({
    queryKey: keys.weekComments(roundId ?? ''),
    queryFn: () => api.get<CommentsResponse>(`/rounds/${enc(roundId ?? '')}/comments`),
    enabled: roundId !== null,
    refetchInterval: options.poll ? WEEK_POLL_MS : false,
  });
}

export function useRounds(partyId: string | null) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: keys.rounds(partyId ?? ''),
    queryFn: ({ pageParam }) =>
      api.get<RoundsResponse>(
        `/parties/${enc(partyId ?? '')}/rounds?limit=20${pageParam ? `&cursor=${enc(pageParam)}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: partyId !== null,
  });
}

/** Results never change once a week has closed, so they're cached for the session. */
export function useResults(roundId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: keys.results(roundId ?? ''),
    queryFn: () => api.get<ResultsResponse>(`/rounds/${enc(roundId ?? '')}/results`),
    enabled: roundId !== null,
    staleTime: Infinity,
    retry: false, // RESULTS_NOT_READY is an answer, not a glitch
  });
}

export function useInvitePreview(code: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: keys.invite(code ?? ''),
    queryFn: () => api.get<InvitePreviewResponse>(`/invites/${enc(code ?? '')}`),
    enabled: code !== null,
    retry: false,
  });
}

/** Stats only change when a week closes (docs/API.md), so a few minutes of caching is plenty. */
const STATS_STALE_MS = 5 * 60_000;

export function usePersonalStats(partyId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: keys.personalStats(partyId ?? ''),
    queryFn: () => api.get<PersonalStatsResponse>(`/users/me/stats?partyId=${enc(partyId ?? '')}`),
    enabled: partyId !== null,
    staleTime: STATS_STALE_MS,
  });
}

export function useGroupStats(partyId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: keys.groupStats(partyId ?? ''),
    queryFn: () => api.get<GroupStatsResponse>(`/parties/${enc(partyId ?? '')}/stats`),
    enabled: partyId !== null,
    staleTime: STATS_STALE_MS,
  });
}

export function useLeaderboard(partyId: string | null, period: LeaderboardPeriod = 'all') {
  const api = useApi();
  return useQuery({
    queryKey: keys.leaderboard(partyId ?? '', period),
    queryFn: () =>
      api.get<LeaderboardResponse>(`/parties/${enc(partyId ?? '')}/leaderboard?period=${period}`),
    enabled: partyId !== null,
    staleTime: STATS_STALE_MS,
  });
}

/** Song search (iTunes, ADR-0007). Only runs for 2+ characters; results are kept for a few minutes. */
export function useSongSearch(q: string) {
  const api = useApi();
  const query = q.trim();
  return useQuery({
    queryKey: keys.search(query),
    queryFn: () => api.get<SongSearchResponse>(`/songs/search?q=${enc(query)}`),
    enabled: query.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/**
 * Party search (P13.12, D33). Runs for 2+ characters. Pages (for one category) load with "Show more"; results are
 * kept for a minute so switching tabs back and forth doesn't ask again.
 */
export function usePartySearch(partyId: string | null, q: string, type: PartySearchType) {
  const api = useApi();
  const query = q.trim();
  return useInfiniteQuery({
    queryKey: keys.partySearch(partyId ?? '', query, type),
    queryFn: ({ pageParam }) =>
      api.get<PartySearchResponse>(
        `/parties/${enc(partyId ?? '')}/search?q=${enc(query)}&type=${type}${pageParam ? `&cursor=${enc(pageParam)}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: partyId !== null && query.length >= 2,
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * In-app notifications (P13.10, D29). Checked when you come back to the app and at most every 5 minutes while it's
 * open (no real-time connection). The server reads only this week and last week, so this stays cheap.
 */
export function useNotifications(partyId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['notifications', partyId ?? ''] as const,
    queryFn: () => api.get<NotificationsResponse>(`/parties/${enc(partyId ?? '')}/notifications`),
    enabled: partyId !== null,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

/** "I've read my notifications" in this party: the server records the time. */
export function useMarkNotificationsSeen(partyId: string | null) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ seenAt: string }>(`/parties/${enc(partyId ?? '')}/notifications/seen`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', partyId ?? ''] }),
  });
}

/** Achievements in a party (P13.9): yours, or another member's. They only change when a week closes. */
export function useAchievements(partyId: string | null, memberId?: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['achievements', partyId ?? '', memberId ?? 'me'] as const,
    queryFn: () =>
      api.get<AchievementsResponse>(
        `/parties/${enc(partyId ?? '')}/achievements${memberId === undefined ? '' : `?memberId=${enc(memberId)}`}`,
      ),
    enabled: partyId !== null,
    staleTime: 5 * 60_000,
  });
}

/** "I've seen my achievements": clears the unlock banner. */
export function useMarkAchievementsSeen(partyId: string | null) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ seenAt: string }>(`/parties/${enc(partyId ?? '')}/achievements/seen`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['achievements', partyId ?? ''] }),
  });
}

/** One month of the history calendar (P13.8). Past months don't change, so they're kept for a while. */
export function useHistory(partyId: string | null, month: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['history', partyId ?? '', month] as const,
    queryFn: () => api.get<HistoryResponse>(`/parties/${enc(partyId ?? '')}/history?month=${enc(month)}`),
    enabled: partyId !== null,
    // Months before this one only change when a week closes, so they're kept longer (ADR-0006: computed on read).
    staleTime: month < new Date().toISOString().slice(0, 7) ? 10 * 60_000 : 60_000,
  });
}

/**
 * YouTube videos for the song being shared (ADR-0012). One search per chosen song, so it's kept for an hour and
 * never retried automatically (YouTube allows the whole app 100 searches a day).
 */
export function useYouTubeSuggestions(providerSongId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['youtubeSuggestions', providerSongId ?? ''] as const,
    queryFn: () =>
      api.get<YouTubeSuggestionsResponse>(`/songs/youtube?providerSongId=${enc(providerSongId ?? '')}`),
    enabled: providerSongId !== null,
    staleTime: 60 * 60_000,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export function useUpdateProfile() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: UpdateProfileRequest) => api.patch<Pick<MeResponse, 'user'>>('/users/me', changes),
    onSuccess: () => queryClient.invalidateQueries(), // names and colours appear on many screens
  });
}

export function useCreateParty() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePartyRequest) => api.post<PartyResponse>('/parties', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useJoinParty() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ partyId, inviteCode }: { partyId: string; inviteCode: string }) =>
      api.post<PartyResponse>(`/parties/${enc(partyId)}/join`, { inviteCode }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useUpdateSettings(partyId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: UpdatePartySettingsRequest) =>
      api.patch<PartyResponse>(`/parties/${enc(partyId)}/settings`, changes),
    onSuccess: (data) => {
      queryClient.setQueryData(keys.party(partyId), data);
      void queryClient.invalidateQueries({ queryKey: keys.me }); // the party name shows in the switcher
      void queryClient.invalidateQueries({ queryKey: keys.currentWeek(partyId) }); // paused / resumed
    },
  });
}

export function useRegenerateInvite(partyId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<InviteCodeResponse>(`/parties/${enc(partyId)}/invite-code`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.party(partyId) }),
  });
}

/** Leave (memberId = yourself) or, as host, remove someone. */
export function useRemoveMember(partyId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api.delete<void>(`/parties/${enc(partyId)}/members/${enc(memberId)}`),
    // Refresh in the background (not awaited): the screen's own "after leaving, go home" step must run first, before
    // the refreshed data removes the screen that holds it.
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });
}

export function useShareSong(roundId: string, partyId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SubmitRecommendationRequest) =>
      api.post<ShareSongResponse>(`/rounds/${enc(roundId)}/recommendations`, body),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.currentWeek(partyId) });
      void queryClient.invalidateQueries({ queryKey: keys.weekSongs(roundId) });
    },
  });
}

export function useResolveSong() {
  const api = useApi();
  return useMutation({
    mutationFn: (url: string) => api.post<ResolveSongResponse>('/songs/resolve', { url }),
  });
}

/** Saves a rating and shows it straight away; if the save fails, that song's old rating comes back. */
export function useCastVote(roundId: string, partyId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recommendationId, rating }: { recommendationId: string } & CastVoteRequest) =>
      api.put<VoteResponse>(`/rounds/${enc(roundId)}/votes/${enc(recommendationId)}`, { rating }),
    onMutate: async ({ recommendationId, rating }) => {
      await queryClient.cancelQueries({ queryKey: keys.weekSongs(roundId) });
      const previous = queryClient.getQueryData<WeekSongsResponse>(keys.weekSongs(roundId));
      if (previous) {
        queryClient.setQueryData<WeekSongsResponse>(keys.weekSongs(roundId), {
          ...previous,
          songs: previous.songs.map((s) =>
            s.recommendationId === recommendationId ? { ...s, myRating: rating } : s,
          ),
        });
      }
      const before = previous?.songs.find((s) => s.recommendationId === recommendationId)?.myRating ?? null;
      return { before };
    },
    onError: (_error, { recommendationId }, context) => {
      // Put back only this song's rating, so other ratings saved meanwhile aren't undone.
      queryClient.setQueryData<WeekSongsResponse>(keys.weekSongs(roundId), (current) =>
        current === undefined
          ? current
          : {
              ...current,
              songs: current.songs.map((s) =>
                s.recommendationId === recommendationId ? { ...s, myRating: context?.before ?? null } : s,
              ),
            },
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.weekSongs(roundId) });
      void queryClient.invalidateQueries({ queryKey: keys.currentWeek(partyId) });
    },
  });
}

/** D25: posts a comment on one song, then refreshes the week's comments. */
export function useAddComment(roundId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ recommendationId, text }: { recommendationId: string } & AddCommentRequest) =>
      api.post<CommentResponse>(`/rounds/${enc(roundId)}/recommendations/${enc(recommendationId)}/comments`, {
        text,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.weekComments(roundId) }),
  });
}

/** D25: deletes a comment (your own while the week is open; the host's moderation any time). */
export function useDeleteComment(roundId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api.delete(`/rounds/${enc(roundId)}/comments/${enc(commentId)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.weekComments(roundId) }),
  });
}
