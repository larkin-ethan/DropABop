// Shapes of API responses (docs/API.md), shared so the website and the API can't drift apart.
// The API's domain code builds these objects; the website reads them. Privacy rules (D9–D11) decide which optional
// fields are present: a field a viewer may not see is left out entirely, never set to null.

import type {
  Comment,
  IsoDate,
  IsoDateTime,
  MemberRole,
  NotificationType,
  Party,
  PartyMember,
  Round,
  RoundStatus,
  Song,
  User,
  Weekday,
} from './types';

// ---------------------------------------------------------------------------
// Songs during the week (D9, D10)
// ---------------------------------------------------------------------------

/** A song as shown while the week is open. Never includes other people's ratings or averages (D9). */
export interface OpenWeekSongView {
  recommendationId: string;
  weekday: Weekday;
  submittedOn: string;
  song: Song;
  /** True if the viewer shared this song (so the UI can say "Your pick" and hide the rating control). */
  isMine: boolean;
  /** Only present when the party reveals recommenders during the week (D10), for your own song, or after the week. */
  recommendedBy?: string;
  /** The viewer's own rating, if they've given one. */
  myRating: number | null;
}

// ---------------------------------------------------------------------------
// Results (D11, D12)
// ---------------------------------------------------------------------------

export interface SongResult {
  recommendationId: string;
  /** 1 = best. Songs with equal displayed averages share a rank (1, 1, 3). Unrated songs share last place. */
  rank: number;
  weekday: Weekday;
  submittedOn: string;
  song: Song;
  /** Revealed with the results (D10). */
  recommendedBy: string;
  /** Average rounded to 1 decimal place (D12), or null if nobody rated it. */
  averageRating: number | null;
  ratingCount: number;
  /** Count of each rating: index 0 = number of 1s … index 9 = number of 10s. Anonymous. */
  distribution: number[];
  myRating: number | null;
  /** Who gave which rating. Only present when the party setting `showWhoRatedWhat` is on (D11). */
  ratings?: { userId: string; rating: number }[];
}

export interface DayResult {
  weekday: Weekday;
  /** recommendationIds for that day, best first. Empty if nobody shared a song that day. */
  songIds: string[];
  /** The day's "Bop of the Day": highest average among rated songs. Several if tied; empty if none rated. */
  winnerIds: string[];
}

export interface WeekResults {
  roundId: string;
  /** Every song from the week, best first. */
  songs: SongResult[];
  /** The week's sharing days (all of them, even ones with no songs), in week order. */
  days: DayResult[];
  totalRatings: number;
}

// ---------------------------------------------------------------------------
// Stats (docs/STATISTICS.md)
// ---------------------------------------------------------------------------

export type Stat<T> =
  | { status: 'ok'; value: T; sampleSize: number }
  | { status: 'not-enough-data'; sampleSize: number; required: number };

/** One winner of a "most …" stat. `id` is a recommendationId or a userId depending on the stat. */
export interface Winner {
  id: string;
  value: number;
  /** How much data this winner's value is based on (ratings, songs, …). */
  sampleSize: number;
}

/** "Most …" stats return every tied winner. */
export type Superlative = Stat<Winner[]>;

export interface FavoriteArtist {
  artist: string;
  averageRating: number;
  songCount: number;
}

/** A genre the user rated highest on average (P13.11; genres exist only on songs shared since P13.7). */
export interface FavoriteGenre {
  genre: string;
  averageRating: number;
  songCount: number;
}

/** An artist the party shared most, with how many songs (spelling-insensitive). */
export interface ArtistCount {
  artist: string;
  songCount: number;
}

export interface MusicalTwin {
  userId: string;
  /** Average gap between your rating and theirs on songs you both rated (0 = identical taste). */
  meanAbsoluteDifference: number;
  sharedSongs: number;
}

export interface LeaderboardEntry {
  id: string;
  /** Ties share a rank (1, 1, 3). */
  rank: number;
  value: number;
  /** Shown as "Based on N …" next to every row. */
  sampleSize: number;
}

/** Leaderboard periods (D30): the most recent closed week, closed weeks locking this month, or all of them. */
export type LeaderboardPeriod = 'week' | 'month' | 'all';

/** Someone below a board's minimum (D30): listed apart with how much data they have, never with a number. */
export interface ProvisionalEntry {
  id: string;
  sampleSize: number;
}

/** A board of people: those meeting the minimum are ranked; the rest are "Provisional" (D30). */
export interface PersonBoard {
  ranked: LeaderboardEntry[];
  provisional: ProvisionalEntry[];
  /** The minimum each person needs to be ranked (the unit is board-specific, see docs/STATISTICS.md). */
  required: number;
}

/** Title and artwork next to a song-based stat. */
export interface SongSummary {
  title: string;
  artist: string;
  albumArtUrl: string | null;
  recommendedBy: string;
  submittedOn: IsoDate;
}

export type SongWinner = Winner & { song: SongSummary | null };
export type SongSuperlative = Stat<SongWinner[]>;

/** Names for current members. A userId not in this list belongs to someone who has left. */
export interface MemberName {
  userId: string;
  displayName: string;
  avatarColor: string;
  avatarImage?: string | null;
}

// ---------------------------------------------------------------------------
// Response bodies, one per endpoint (docs/API.md)
// ---------------------------------------------------------------------------

export interface UserPartyLink {
  partyId: string;
  partyName: string;
  role: MemberRole;
  joinedAt: IsoDateTime;
}

export interface MeResponse {
  user: User;
  parties: UserPartyLink[];
}

export interface PartyResponse {
  party: Party;
  members: PartyMember[];
  isHost: boolean;
}

export interface PartiesResponse {
  parties: UserPartyLink[];
}

export interface InvitePreviewResponse {
  partyId: string;
  partyName: string;
  memberCount: number;
  maxMembers: number;
  isFull: boolean;
  alreadyMember: boolean;
}

export interface InviteCodeResponse {
  inviteCode: string;
}

export interface SubmissionDay {
  weekday: Weekday;
  date: IsoDate;
  /** Which sharing day this is (1 = the week's first sharing day), for "Day 3 of 5". */
  dayNumber: number;
  /** How many sharing days this week has. */
  dayCount: number;
}

export type CurrentWeekResponse =
  | {
      round: Round;
      status: Round['status'];
      reason: null;
      /** null on days that aren't sharing days (rating still open, sharing closed). */
      today: SubmissionDay | null;
      sharedToday: boolean;
      mySubmissionDates: IsoDate[];
      sharedTodayCount: number;
      /** Only when the party reveals recommenders during the week (D10). */
      sharedTodayUserIds?: string[];
      progress: { songCount: number; ratableCount: number; ratedCount: number };
    }
  | {
      round: null;
      reason: 'paused' | 'between-weeks';
      nextWeekStartsAt: IsoDateTime | null;
      lastRoundId: string | null;
    };

export interface RoundsResponse {
  rounds: Round[];
  nextCursor: IsoDate | null;
}

export interface WeekSongsResponse {
  round: Round;
  songs: OpenWeekSongView[];
}

export interface ShareSongResponse {
  song: OpenWeekSongView;
}

export interface VoteResponse {
  vote: { recommendationId: string; rating: number; updatedAt: IsoDateTime };
}

export interface MyVotesResponse {
  votes: { recommendationId: string; rating: number; updatedAt: IsoDateTime }[];
}

/** GET /rounds/{roundId}/comments: every comment in the week, oldest first (the app groups them by song). */
export interface CommentsResponse {
  comments: Comment[];
}

export interface CommentResponse {
  comment: Comment;
}

export interface ResultsResponse {
  round: Round;
  results: WeekResults;
  members: MemberName[];
}

export interface PersonalStatsResponse {
  weeksPlayed: number;
  averageRatingGiven: Stat<number>;
  averageScoreReceived: Stat<number>;
  songsRecommended: number;
  highestRatedRecommendation: SongSuperlative;
  lowestRatedRecommendation: SongSuperlative;
  generosity: Stat<number>;
  ratingDistribution: Stat<number[]>;
  favoriteArtists: Stat<FavoriteArtist[]>;
  musicalTwin: Stat<MusicalTwin[]>;
  /** Valid ratings you gave in closed weeks (spec §18 "votes cast"). */
  ratingsGiven: number;
  favoriteGenres: Stat<FavoriteGenre[]>;
  /** Your latest songs from closed weeks, newest first (up to 5). */
  recentSongs: RecentSong[];
  /** Your place among the sharers of the most recent closed week, or null if none of your songs were rated in it. */
  lastWeekRank: { roundId: string; weekStart: IsoDate; position: number; of: number } | null;
  members: MemberName[];
}

export interface RecentSong {
  recommendationId: string;
  roundId: string;
  submittedOn: IsoDate;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  /** Exact average (the app rounds it), or null if nobody rated it. */
  average: number | null;
  ratingCount: number;
}

/** Songs and ratings in one closed week or month (group stats "activity"). */
export interface ActivityPoint {
  /** The week's Monday (weekly) or "YYYY-MM" of the lock day (monthly). */
  period: string;
  weeks: number;
  songs: number;
  ratings: number;
  /** Mean of every rating in the period, or null if none. */
  average: number | null;
}

export interface GroupStatsResponse {
  weeksPlayed: number;
  songsShared: number;
  ratingsGiven: number;
  highestRatedSong: SongSuperlative;
  crowdFavorite: SongSuperlative;
  mostDivisive: SongSuperlative;
  mostControversial: SongSuperlative;
  everyoneAgreed: SongSuperlative;
  darkHorse: SongSuperlative;
  mostGenerousVoter: Superlative;
  toughestCritic: Superlative;
  /** Current members. */
  memberCount: number;
  /** Mean of every valid rating in closed weeks (1 rating). */
  groupAverage: Stat<number>;
  ratingDistribution: Stat<number[]>;
  /** Artists shared most, top 3 (ties at 3rd all shown). */
  topArtists: Stat<ArtistCount[]>;
  mostConsistent: Superlative;
  /** Newest first, up to 12 weeks / 12 months. */
  weeklyActivity: ActivityPoint[];
  monthlyActivity: ActivityPoint[];
  members: MemberName[];
}

export interface LeaderboardResponse {
  period: LeaderboardPeriod;
  /** Closed weeks in the period. */
  weeksPlayed: number;
  highestAverageSongRating: (LeaderboardEntry & { song: SongSummary | null })[];
  /** Songs rated by at least 75% of their week's raters, by average (D30). */
  crowdFavorites: (LeaderboardEntry & { song: SongSummary | null })[];
  highestAverageReceived: PersonBoard;
  highestAverageGiven: PersonBoard;
  mostBops: PersonBoard;
  mostRatings: PersonBoard;
  mostGenerous: PersonBoard;
  toughestCritic: PersonBoard;
  mostConsistent: PersonBoard;
  mostSurprising: PersonBoard;
  mostPopular: PersonBoard;
  members: MemberName[];
}

// ---------------------------------------------------------------------------
// Party search (P13.12, D33): only the current party's songs, artists, members and weeks.
// ---------------------------------------------------------------------------

export type PartySearchType = 'all' | 'songs' | 'artists' | 'members' | 'weeks';

export interface SearchSongHit {
  recommendationId: string;
  roundId: string;
  submittedOn: IsoDate;
  title: string;
  artist: string;
  album: string | null;
  albumArtUrl: string | null;
  /** True while the song's week is open: no sharer (unless yours or the week reveals sharers, D10) and no ratings (D9). */
  weekOpen: boolean;
  isMine: boolean;
  /** Left out while the week is open, unless the song is yours or that week reveals sharers (D10). */
  recommendedBy?: string;
}

export interface SearchArtistHit {
  artist: string;
  songCount: number;
}

export interface SearchWeekHit {
  roundId: string;
  weekStart: IsoDate;
  status: RoundStatus;
  songCount: number;
}

export interface PartySearchResponse {
  q: string;
  type: PartySearchType;
  /** For `all`: the best few of each category. For one category: one page of it (the others are empty). */
  songs: SearchSongHit[];
  artists: SearchArtistHit[];
  members: MemberName[];
  weeks: SearchWeekHit[];
  /** How many matches each category has in total (for the tab labels). */
  totals: Record<Exclude<PartySearchType, 'all'>, number>;
  /** Pass back as `cursor` for the next page of a single category; null when there's no more (always null for `all`). */
  nextCursor: string | null;
  /** True if the party has more songs than one search reads (the newest are searched). */
  truncated: boolean;
}

export interface SongSearchResponse {
  songs: Song[];
}

/** One YouTube search result, exactly as YouTube returned it (ADR-0012: results aren't changed or reordered). */
export interface YouTubeVideoSuggestion {
  videoId: string;
  title: string;
  channelTitle: string;
}

/**
 * GET /songs/youtube (ADR-0012). `videos` in YouTube's order (best first), or empty with the reason:
 * `notConfigured` (no API key yet), `busy` (YouTube's daily quota used up or YouTube unreachable),
 * `dailyLimit` (this person used their searches for today). Sharing works the same either way.
 */
export interface YouTubeSuggestionsResponse {
  videos: YouTubeVideoSuggestion[];
  unavailable: 'notConfigured' | 'busy' | 'dailyLimit' | null;
}

export interface ResolveSongResponse {
  song: Song;
}

// ---------------------------------------------------------------------------
// History calendar (P13.8, D31). Ratings only for weeks whose ratings have locked (D9).
// ---------------------------------------------------------------------------

/** One song in a closed week, as the history views show it. Sharers are revealed once the week ends (D10). */
export interface HistorySong {
  recommendationId: string;
  title: string;
  artist: string;
  albumArtUrl: string | null;
  /** Rounded to 1 decimal (D12), or null if nobody rated it. */
  average: number | null;
  ratingCount: number;
  /** Rank in its week (1 = best; ties share a rank). */
  rank: number;
  myRating: number | null;
  recommendedBy: string;
  isMine: boolean;
}

/** A closed day's numbers (D31). */
export interface HistoryDayStats {
  /** That day's songs, best first. */
  songs: HistorySong[];
  ratingCount: number;
  /** Mean of every rating on that day's songs. */
  groupAverage: number | null;
  /** Mean of your ratings on that day's songs. */
  myAverageGiven: number | null;
  /** Mean of the averages of your songs that day. */
  myAverageReceived: number | null;
  /** Bop of the Day (D12): the day's highest average; ties share it. */
  bopOfTheDay: string[];
  /** Lowest average with at least 3 ratings (ties all listed); empty if none, or if it's also the top. */
  lowestRated: string[];
  /** How many of that day's songs you rated. */
  myRatingCount: number;
  /** Count of each rating 1–10 on that day's songs. */
  distribution: number[];
  /** Artists with at least 2 songs that day. */
  favoriteArtists: string[];
}

export interface HistoryDay {
  date: IsoDate;
  weekday: Weekday;
  songCount: number;
  /** You shared a song that day. */
  iShared: boolean;
  /** One of your songs that day got your best-ever song average (closed weeks only). */
  personalBest: boolean;
  /** Null while the week is open, or if it ended without results. */
  stats: HistoryDayStats | null;
}

export interface HistoryWeekSummary {
  songCount: number;
  ratingCount: number;
  averageRating: number | null;
  /** Rank-1 songs (ties share it). */
  bestSongs: string[];
  /** Artists with the most songs shared that week, top 3 (ties shared). */
  topArtists: { artist: string; songs: number }[];
  /** The day(s) whose songs had the lowest average spread (songs with ≥ 4 ratings; needs 2 such songs). */
  mostAgreeableDays: IsoDate[];
  /** The song(s) with the widest spread of ratings (≥ 4 ratings); ties all listed. */
  mostDivisive: string[];
  distribution: number[];
}

/** "Your week" (spec §23, D26). */
export interface HistoryYourWeek {
  songsRated: number;
  averageGiven: number | null;
  averageReceived: number | null;
  /** Your best song that week. */
  topSong: string | null;
  /** Your place among that week's sharers, by average received (needs 1 rated song). */
  rank: { position: number; of: number } | null;
}

export interface HistoryWeek {
  roundId: string;
  weekStart: IsoDate;
  endsAt: IsoDateTime;
  /** OPEN, CLOSED, or NOT_ENOUGH_SONGS (decided from the server clock). */
  status: RoundStatus;
  /** Every sharing day of the week, in order. */
  days: HistoryDay[];
  /** Closed weeks only. */
  summary: HistoryWeekSummary | null;
  yourWeek: HistoryYourWeek | null;
}

export interface HistoryResponse {
  month: string;
  /** Weeks that overlap the month (whole weeks), oldest first. */
  weeks: HistoryWeek[];
  members: MemberName[];
}

// ---------------------------------------------------------------------------
// Achievements (P13.9, D28). Worked out from closed weeks on request, never stored as awards.
// ---------------------------------------------------------------------------

export type AchievementGroup =
  'participation' | 'discovery' | 'rating' | 'songSuccess' | 'social' | 'consistency';

export interface Achievement {
  id: string;
  group: AchievementGroup;
  title: string;
  /** How to unlock it, in one sentence. */
  description: string;
  /** Decorative only. */
  emoji: string;
  unlocked: boolean;
  /**
   * When ratings locked on the first week that earned it, or null if not yet. Also null on another member's
   * rating-revealing badges (First 1, First 10, Full House), so they can't be tied to a week (D11).
   */
  unlockedOn: IsoDateTime | null;
  /** The same moment as a day in the party's timezone (D31), for the calendar. */
  unlockedDay: IsoDate | null;
  /** How close you are (for a progress bar), and the same in words, e.g. "7 of 10 weeks". */
  progress: { current: number; target: number; label: string };
}

export interface AchievementsResponse {
  /** Whose achievements these are (yours unless you asked for another member's). */
  memberId: string;
  achievements: Achievement[];
  unlockedCount: number;
  /** Yours only: unlocked since you last opened them (for the "Achievement unlocked" banner). */
  newlyUnlocked: string[];
  /** Yours only: when you last saw your achievements, or null if never (no banner the first time). */
  seenAt: IsoDateTime | null;
}

// ---------------------------------------------------------------------------
// Notifications (P13.10, D29): in-app only, worked out when you open the app.
// ---------------------------------------------------------------------------

export interface AppNotification {
  /** Stable for the same news (e.g. "results:<roundId>"), so the app can list it without duplicates. */
  id: string;
  type: NotificationType;
  /** When it happened; newer than your last visit to Notifications = unread. */
  time: IsoDateTime;
  title: string;
  detail: string | null;
  /** Where tapping it goes, e.g. "/rate". */
  link: string;
}

export interface NotificationsResponse {
  /** Newest first. Only types you have switched on. */
  notifications: AppNotification[];
  unreadCount: number;
  /** When you last opened your notifications, or null if never. */
  seenAt: IsoDateTime | null;
}
