// Who may share and rate songs, and when (spec §14, §15, §24; decisions D1, D2, D5–D8).
//
// These are pure checks: handlers load the facts (membership, the current round, whether you've already
// shared today) and ask these functions for a decision. The database then enforces the same rules again
// with conditional writes, so two simultaneous requests can't both slip through (see docs/DATABASE.md).

import type { Comment, Party, PartyMember, Recommendation, Round } from '@dropabop/shared';
import { MAX_COMMENTS_PER_PERSON_PER_WEEK, MAX_RATING, MIN_RATING } from '@dropabop/shared';
import { MESSAGES, deny, type RuleResult } from './messages';
import { getSubmissionDay, isWeekOpen, type SubmissionDay } from './week';

export interface SubmitRecommendationContext {
  /** The requester's membership in the party, or null if they aren't a member. */
  membership: PartyMember | null;
  /** True if the party is paused (only matters when there's no current round). */
  partyPaused: boolean;
  /** This week's round from planCurrentWeek, or null if there is none (paused or between weeks). */
  currentRound: Round | null;
  /** The round id from the request URL. Must be this week's round. */
  requestedRoundId: string;
  /** Dates (YYYY-MM-DD) the requester has already shared a song on in this round. */
  mySubmissionDatesThisWeek: string[];
  now: Date;
}

/**
 * Can this member share a song right now? On success, returns today's submission day as decided by
 * the server; the handler stores the recommendation under that date (never a client-supplied one).
 */
export function canSubmitRecommendation(
  ctx: SubmitRecommendationContext,
): RuleResult<{ day: SubmissionDay }> {
  if (ctx.membership === null) {
    return deny('NOT_A_MEMBER', MESSAGES.NOT_A_MEMBER);
  }
  if (ctx.currentRound === null) {
    return ctx.partyPaused
      ? deny('PARTY_PAUSED', MESSAGES.PARTY_PAUSED)
      : deny('WEEK_CLOSED', MESSAGES.BETWEEN_WEEKS);
  }
  if (ctx.requestedRoundId !== ctx.currentRound.roundId) {
    return deny('WEEK_CLOSED', MESSAGES.NOT_CURRENT_WEEK_SUBMIT);
  }
  if (!isWeekOpen(ctx.currentRound, ctx.now)) {
    return deny('WEEK_CLOSED', MESSAGES.WEEK_CLOSED_SUBMIT);
  }
  // The round's own timezone and days, so a mid-week settings change can't shift which day it is.
  const day = getSubmissionDay(ctx.currentRound, ctx.now);
  if (day === null) {
    return deny('WEEKEND', MESSAGES.WEEKEND);
  }
  if (ctx.mySubmissionDatesThisWeek.includes(day.date)) {
    return deny('ALREADY_SUBMITTED_TODAY', MESSAGES.ALREADY_SUBMITTED_TODAY);
  }
  return { ok: true, day };
}

export interface CastVoteContext {
  /** The voter's membership in the party, or null if they aren't a member. */
  membership: PartyMember | null;
  /** The round from the request URL. */
  round: Round;
  /** The song being rated. */
  recommendation: Recommendation;
  /** From the verified token (never the request body). */
  voterId: string;
  rating: unknown;
  now: Date;
}

/**
 * Can this member give (or change) this rating right now? Ratings can be created or changed any time
 * while the week is open; after that they're locked forever (D8).
 */
export function canCastVote(ctx: CastVoteContext): RuleResult {
  if (ctx.membership === null || ctx.membership.partyId !== ctx.round.partyId) {
    return deny('NOT_A_MEMBER', MESSAGES.NOT_A_MEMBER);
  }
  if (ctx.recommendation.roundId !== ctx.round.roundId || ctx.recommendation.partyId !== ctx.round.partyId) {
    return deny('SONG_NOT_IN_WEEK', MESSAGES.SONG_NOT_IN_WEEK);
  }
  if (!isWeekOpen(ctx.round, ctx.now)) {
    return deny('WEEK_CLOSED', MESSAGES.WEEK_CLOSED_RATE);
  }
  if (ctx.recommendation.userId === ctx.voterId) {
    return deny('OWN_SONG', MESSAGES.OWN_SONG);
  }
  if (!isValidRating(ctx.rating)) {
    return deny('VALIDATION_FAILED', MESSAGES.INVALID_RATING);
  }
  return { ok: true };
}

/** Spec §15 / D7. The request schema checks this too; the domain re-checks so the rule can't be skipped. */
export function isValidRating(rating: unknown): rating is number {
  return (
    typeof rating === 'number' && Number.isInteger(rating) && rating >= MIN_RATING && rating <= MAX_RATING
  );
}

export interface AddCommentContext {
  /** The commenter's membership in the week's party, or null. */
  membership: PartyMember | null;
  round: Round;
  /** The song being commented on. */
  recommendation: Recommendation;
  /** How many comments this person already wrote this week. */
  myCommentCountThisWeek: number;
  now: Date;
}

/**
 * D25: any member may comment on any of the week's songs (their own too) while the week is open; comments close when
 * ratings lock. A per-person weekly cap stops flooding.
 */
export function canAddComment(ctx: AddCommentContext): RuleResult {
  if (ctx.membership === null || ctx.membership.partyId !== ctx.round.partyId) {
    return deny('NOT_A_MEMBER', MESSAGES.NOT_A_MEMBER);
  }
  if (ctx.recommendation.roundId !== ctx.round.roundId || ctx.recommendation.partyId !== ctx.round.partyId) {
    return deny('SONG_NOT_IN_WEEK', MESSAGES.SONG_NOT_IN_WEEK);
  }
  if (!isWeekOpen(ctx.round, ctx.now)) {
    return deny('WEEK_CLOSED', MESSAGES.WEEK_CLOSED_COMMENT);
  }
  if (ctx.myCommentCountThisWeek >= MAX_COMMENTS_PER_PERSON_PER_WEEK) {
    return deny('CONFLICT', MESSAGES.TOO_MANY_COMMENTS);
  }
  return { ok: true };
}

export interface DeleteCommentContext {
  membership: PartyMember | null;
  party: Pick<Party, 'hostUserId' | 'partyId'>;
  round: Round;
  comment: Comment;
  /** From the verified token. */
  userId: string;
  now: Date;
}

/**
 * D25: you can delete your own comment while the week is open (after that, comments are part of the week's record).
 * The host can delete any comment in their party at any time, so there's always someone who can remove something
 * unkind.
 */
export function canDeleteComment(ctx: DeleteCommentContext): RuleResult {
  if (ctx.membership === null || ctx.membership.partyId !== ctx.party.partyId) {
    return deny('NOT_A_MEMBER', MESSAGES.NOT_A_MEMBER);
  }
  if (ctx.comment.roundId !== ctx.round.roundId) {
    return deny('NOT_FOUND', MESSAGES.COMMENT_NOT_FOUND);
  }
  const isHost = ctx.membership.role === 'host' && ctx.party.hostUserId === ctx.userId;
  if (isHost) {
    return { ok: true };
  }
  if (ctx.comment.userId !== ctx.userId) {
    return deny('FORBIDDEN', MESSAGES.NOT_YOUR_COMMENT);
  }
  if (!isWeekOpen(ctx.round, ctx.now)) {
    return deny('WEEK_CLOSED', MESSAGES.WEEK_CLOSED_COMMENT);
  }
  return { ok: true };
}
