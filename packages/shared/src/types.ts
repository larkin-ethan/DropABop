// Domain types shared by the frontend and the API.
// These describe the app's data. API responses may hide some fields (for example, who recommended
// a song while the week is open, per D10); those response shapes are defined alongside each endpoint.

import type { MEMBER_ROLES, MUSIC_PROVIDERS, ROUND_STATUSES, SUBMISSION_WEEKDAYS } from './limits';

/** Calendar date in the party's timezone, formatted YYYY-MM-DD. */
export type IsoDate = string;
/** Instant in time, ISO 8601 with timezone (e.g. 2026-10-05T05:00:00.000Z). */
export type IsoDateTime = string;

export type Weekday = (typeof SUBMISSION_WEEKDAYS)[number];
export type RoundStatus = (typeof ROUND_STATUSES)[number];
export type MusicProviderId = (typeof MUSIC_PROVIDERS)[number];
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** D19: the only personal data we keep. Email lives in Cognito, not here. */
export interface User {
  /** Cognito `sub` claim. Never taken from request input. */
  userId: string;
  displayName: string;
  /** #RRGGBB, used for the generated initials avatar (D18). */
  avatarColor: string;
  /**
   * Optional profile picture (D18, updated 2026-10-04): a small square JPEG/WebP as a data URL, made in the browser.
   * Missing or null = initials avatar.
   */
  avatarImage?: string | null;
  /** D22: whose "Open in …" link is shown first. */
  preferredProvider: MusicProviderId | null;
  createdAt: IsoDateTime;
}

export interface PartySettings {
  maxMembers: number;
  /** IANA timezone name, e.g. "America/Chicago". Days and weeks follow this zone (D1, D2). */
  timezone: string;
  /** D2: a paused party starts no new weeks. */
  paused: boolean;
  /** D10: default false (songs are anonymous until results). */
  revealRecommenderDuringVoting: boolean;
  /** D11: default false (results show anonymous distributions). */
  showWhoRatedWhat: boolean;
}

export interface Party {
  partyId: string;
  name: string;
  hostUserId: string;
  /** Current active invite code (D16). Only shown to members. */
  inviteCode: string;
  memberCount: number;
  settings: PartySettings;
  createdAt: IsoDateTime;
}

export interface PartyMember {
  partyId: string;
  userId: string;
  displayName: string;
  avatarColor: string;
  /** Copy of the member's profile picture, if any (kept in sync like the name and colour). */
  avatarImage?: string | null;
  role: MemberRole;
  joinedAt: IsoDateTime;
}

/** A party's week (ADR-0004). Created lazily by the first request in that week (ADR-0003). */
export interface Round {
  /** Deterministic: derived from partyId and weekStart. */
  roundId: string;
  partyId: string;
  /** The Monday that starts this week, in the round's timezone. */
  weekStart: IsoDate;
  /**
   * The party's timezone when this week was created. Days within the week follow this zone even if the
   * host changes the party timezone mid-week; the change applies from the next week.
   */
  timezone: string;
  /** Monday 00:00 in the round's timezone. */
  startsAt: IsoDateTime;
  /**
   * The following Monday 00:00 (exclusive). The week is open while now < endsAt; ratings lock at this
   * instant. Shown to people as "Sunday 11:59 pm".
   */
  endsAt: IsoDateTime;
  /**
   * Stored status. Never read this directly to decide what's allowed: the effective status comes
   * from the current time (getEffectiveWeekStatus, ADR-0003).
   */
  status: RoundStatus;
}

/** Spec §10: what a provider can do. */
export interface ProviderCapabilities {
  canSearch: boolean;
  canPlayInApp: boolean;
  requiresSubscription: boolean;
  canOpenExternal: boolean;
}

/** Spec §12: where one song lives on one service. */
export interface SongProvider {
  provider: MusicProviderId;
  providerSongId: string;
  /** Official https link that opens the song on that service. */
  externalUrl: string;
}

/** Spec §12: provider-independent song record. */
export interface Song {
  songId: string;
  title: string;
  artist: string;
  album: string | null;
  albumArtUrl: string | null;
  durationMs: number | null;
  releaseDate: IsoDate | null;
  providers: SongProvider[];
}

export interface Recommendation {
  recommendationId: string;
  roundId: string;
  partyId: string;
  /** Who shared it. Hidden from other members while the week is open unless D10's setting allows. */
  userId: string;
  /** The day it was shared, decided by the server in the party's timezone (D1). */
  submittedOn: IsoDate;
  weekday: Weekday;
  song: Song;
  createdAt: IsoDateTime;
}

export interface Vote {
  roundId: string;
  recommendationId: string;
  userId: string;
  rating: number;
  updatedAt: IsoDateTime;
}

/** D16: lookup record for joining by code. */
export interface Invitation {
  code: string;
  partyId: string;
  active: boolean;
}
