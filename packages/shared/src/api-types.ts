// Shapes of API responses (docs/API.md), shared so the website and the API can't drift apart.
// The API's domain code builds these objects; the website reads them. Privacy rules (D9–D11) decide which optional
// fields are present: a field a viewer may not see is left out entirely, never set to null.

import type {
  IsoDate,
  IsoDateTime,
  MemberRole,
  Party,
  PartyMember,
  Round,
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
  /** Monday to Friday, always all five, in order. */
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
  members: MemberName[];
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
  members: MemberName[];
}

export interface LeaderboardResponse {
  weeksPlayed: number;
  highestAverageSongRating: (LeaderboardEntry & { song: SongSummary | null })[];
  highestAverageRecommendationScore: LeaderboardEntry[];
  mostConsistent: LeaderboardEntry[];
  mostSurprising: LeaderboardEntry[];
  mostPopular: LeaderboardEntry[];
  members: MemberName[];
}

export interface SongSearchResponse {
  songs: Song[];
}

export interface ResolveSongResponse {
  song: Song;
}
