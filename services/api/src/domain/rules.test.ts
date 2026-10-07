import { describe, expect, it } from 'vitest';
import type { Comment, PartyMember, Recommendation, Round } from '@dropabop/shared';
import {
  canAddComment,
  canCastVote,
  canDeleteComment,
  canSubmitRecommendation,
  isValidRating,
  type SubmitRecommendationContext,
} from './rules';

const utc = (iso: string) => new Date(iso);

// Week of Mon 2026-10-05 in Chicago (UTC-5): Mon 00:00 = 05:00Z, ends next Mon 05:00Z.
const round: Round = {
  roundId: 'p1.2026-10-05',
  partyId: 'p1',
  weekStart: '2026-10-05',
  timezone: 'America/Chicago',
  startsAt: '2026-10-05T05:00:00.000Z',
  endsAt: '2026-10-12T05:00:00.000Z',
  status: 'OPEN',
};

const member: PartyMember = {
  partyId: 'p1',
  userId: 'alice',
  displayName: 'Alice',
  avatarColor: '#3B82F6',
  role: 'member',
  joinedAt: '2026-09-01T00:00:00.000Z',
};

const WEDNESDAY_NOON = utc('2026-10-07T17:00:00Z');
const SATURDAY_NOON = utc('2026-10-10T17:00:00Z');
const AFTER_WEEK = utc('2026-10-12T05:00:00.000Z');

function submitCtx(overrides: Partial<SubmitRecommendationContext> = {}): SubmitRecommendationContext {
  return {
    membership: member,
    partyPaused: false,
    currentRound: round,
    requestedRoundId: round.roundId,
    mySubmissionDatesThisWeek: [],
    now: WEDNESDAY_NOON,
    ...overrides,
  };
}

describe('canSubmitRecommendation (spec §14, D1)', () => {
  it('allows a member on a weekday and returns the server-decided day', () => {
    expect(canSubmitRecommendation(submitCtx())).toEqual({
      ok: true,
      day: { weekday: 'WED', date: '2026-10-07', dayNumber: 3, dayCount: 5 },
    });
  });

  it('allows a new song each weekday even after sharing on earlier days', () => {
    const result = canSubmitRecommendation(
      submitCtx({ mySubmissionDatesThisWeek: ['2026-10-05', '2026-10-06'] }),
    );
    expect(result.ok).toBe(true);
  });

  it('rejects non-members', () => {
    expect(canSubmitRecommendation(submitCtx({ membership: null }))).toMatchObject({
      ok: false,
      code: 'NOT_A_MEMBER',
    });
  });

  it('rejects a second song on the same day with the spec’s friendly message', () => {
    expect(canSubmitRecommendation(submitCtx({ mySubmissionDatesThisWeek: ['2026-10-07'] }))).toEqual({
      ok: false,
      code: 'ALREADY_SUBMITTED_TODAY',
      message: 'You’ve already shared your song for today.',
    });
  });

  it('rejects weekends but points people to rating', () => {
    const result = canSubmitRecommendation(submitCtx({ now: SATURDAY_NOON }));
    expect(result).toMatchObject({ ok: false, code: 'WEEKEND' });
    expect(!result.ok && result.message).toContain('rate this week’s songs');
  });

  it('rejects submissions for a round other than this week’s', () => {
    expect(canSubmitRecommendation(submitCtx({ requestedRoundId: 'p1.2026-09-28' }))).toMatchObject({
      ok: false,
      code: 'WEEK_CLOSED',
      message: 'You can only share songs for this week.',
    });
  });

  it('rejects once the week has ended', () => {
    expect(canSubmitRecommendation(submitCtx({ now: AFTER_WEEK }))).toMatchObject({
      ok: false,
      code: 'WEEK_CLOSED',
    });
  });

  it('explains when the party is paused', () => {
    expect(canSubmitRecommendation(submitCtx({ currentRound: null, partyPaused: true }))).toMatchObject({
      ok: false,
      code: 'PARTY_PAUSED',
    });
  });

  it('explains when the next week hasn’t started yet', () => {
    expect(canSubmitRecommendation(submitCtx({ currentRound: null }))).toMatchObject({
      ok: false,
      code: 'WEEK_CLOSED',
      message: 'This week’s ratings are locked. The next week starts on Monday.',
    });
  });

  it('decides the day in the round’s timezone (Friday in Chicago even if the party moved to Tokyo)', () => {
    // Fri 15:00 Chicago = Sat 05:00 Tokyo. The round started in Chicago, so it's still Friday for this week.
    const result = canSubmitRecommendation(submitCtx({ now: utc('2026-10-09T20:00:00Z') }));
    expect(result).toMatchObject({ ok: true, day: { weekday: 'FRI', date: '2026-10-09' } });
  });

  it('lets a member who joined mid-week share for the remaining days (D5)', () => {
    const lateJoiner = { ...member, joinedAt: '2026-10-07T15:00:00.000Z' };
    expect(canSubmitRecommendation(submitCtx({ membership: lateJoiner })).ok).toBe(true);
  });
});

describe('canCastVote (spec §15, D6–D8)', () => {
  const song: Recommendation = {
    recommendationId: 'r1',
    roundId: round.roundId,
    partyId: 'p1',
    userId: 'bob',
    submittedOn: '2026-10-05',
    weekday: 'MON',
    song: {
      songId: 's1',
      title: 'Midnight City',
      artist: 'M83',
      album: null,
      albumArtUrl: null,
      durationMs: null,
      releaseDate: null,
      providers: [{ provider: 'spotify', providerSongId: 'x', externalUrl: 'https://open.example.com/x' }],
    },
    createdAt: '2026-10-05T15:00:00.000Z',
  };

  const voteCtx = (overrides: Partial<Parameters<typeof canCastVote>[0]> = {}) => ({
    membership: member,
    round,
    recommendation: song,
    voterId: 'alice',
    rating: 8,
    now: WEDNESDAY_NOON,
    ...overrides,
  });

  it('allows rating any song from this week, including earlier days and on the weekend', () => {
    expect(canCastVote(voteCtx())).toEqual({ ok: true });
    expect(canCastVote(voteCtx({ now: SATURDAY_NOON }))).toEqual({ ok: true });
  });

  it('allows rating right up to the last millisecond of Sunday, then locks (D8)', () => {
    expect(canCastVote(voteCtx({ now: utc('2026-10-12T04:59:59.999Z') }))).toEqual({ ok: true });
    expect(canCastVote(voteCtx({ now: AFTER_WEEK }))).toEqual({
      ok: false,
      code: 'WEEK_CLOSED',
      message: 'This week has ended, so ratings are locked.',
    });
  });

  it('rejects rating your own song (D6)', () => {
    expect(canCastVote(voteCtx({ voterId: 'bob' }))).toMatchObject({ ok: false, code: 'OWN_SONG' });
  });

  it('rejects non-members and members of a different party', () => {
    expect(canCastVote(voteCtx({ membership: null }))).toMatchObject({ ok: false, code: 'NOT_A_MEMBER' });
    expect(canCastVote(voteCtx({ membership: { ...member, partyId: 'p2' } }))).toMatchObject({
      ok: false,
      code: 'NOT_A_MEMBER',
    });
  });

  it('rejects a song from a different week or party', () => {
    expect(canCastVote(voteCtx({ recommendation: { ...song, roundId: 'p1.2026-09-28' } }))).toMatchObject({
      ok: false,
      code: 'SONG_NOT_IN_WEEK',
    });
    expect(canCastVote(voteCtx({ recommendation: { ...song, partyId: 'p2' } }))).toMatchObject({
      ok: false,
      code: 'SONG_NOT_IN_WEEK',
    });
  });

  it.each([0, 11, 7.5, '8', null, undefined, Number.NaN])('rejects rating %s', (rating) => {
    expect(canCastVote(voteCtx({ rating }))).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });

  it('checks the lock before anything about the rating itself (a closed week reports “locked”)', () => {
    expect(canCastVote(voteCtx({ now: AFTER_WEEK, rating: 99 }))).toMatchObject({ code: 'WEEK_CLOSED' });
  });

  it('lets a member who joined mid-week rate songs from earlier in the week (D5)', () => {
    const lateJoiner = { ...member, joinedAt: '2026-10-08T00:00:00.000Z' };
    expect(canCastVote(voteCtx({ membership: lateJoiner }))).toEqual({ ok: true });
  });
});

describe('isValidRating', () => {
  it('accepts whole numbers 1–10 only', () => {
    for (let rating = 1; rating <= 10; rating++) {
      expect(isValidRating(rating)).toBe(true);
    }
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(10.1)).toBe(false);
    expect(isValidRating(Infinity)).toBe(false);
  });
});

describe('comments (D25)', () => {
  const song: Recommendation = {
    recommendationId: 'r1',
    roundId: round.roundId,
    partyId: 'p1',
    userId: 'alice', // her own song: commenting on it is allowed
    submittedOn: '2026-10-05',
    weekday: 'MON',
    song: {
      songId: 's1',
      title: 'Midnight City',
      artist: 'M83',
      album: null,
      albumArtUrl: null,
      durationMs: null,
      releaseDate: null,
      providers: [],
    },
    createdAt: '2026-10-05T15:00:00.000Z',
  };
  const host: PartyMember = { ...member, userId: 'hank', role: 'host' };
  const party = { partyId: 'p1', hostUserId: 'hank' };
  const comment: Comment = {
    commentId: 'c1',
    roundId: round.roundId,
    recommendationId: 'r1',
    userId: 'alice',
    text: 'Love this',
    createdAt: '2026-10-07T17:00:00.000Z',
  };
  const addCtx = (overrides: Partial<Parameters<typeof canAddComment>[0]> = {}) => ({
    membership: member,
    round,
    recommendation: song,
    myCommentCountThisWeek: 0,
    now: WEDNESDAY_NOON,
    ...overrides,
  });
  const deleteCtx = (overrides: Partial<Parameters<typeof canDeleteComment>[0]> = {}) => ({
    membership: member,
    party,
    round,
    comment,
    userId: 'alice',
    now: WEDNESDAY_NOON,
    ...overrides,
  });

  it('lets any member comment on any of the week’s songs (their own too) while the week is open', () => {
    expect(canAddComment(addCtx())).toEqual({ ok: true });
    expect(canAddComment(addCtx({ now: SATURDAY_NOON }))).toEqual({ ok: true });
  });

  it('closes comments when ratings lock', () => {
    expect(canAddComment(addCtx({ now: AFTER_WEEK }))).toMatchObject({ ok: false, code: 'WEEK_CLOSED' });
  });

  it('refuses non-members, other parties’ songs, and the 51st comment of the week', () => {
    expect(canAddComment(addCtx({ membership: null }))).toMatchObject({ code: 'NOT_A_MEMBER' });
    expect(canAddComment(addCtx({ membership: { ...member, partyId: 'p2' } }))).toMatchObject({
      code: 'NOT_A_MEMBER',
    });
    expect(canAddComment(addCtx({ recommendation: { ...song, roundId: 'p1.2026-09-28' } }))).toMatchObject({
      code: 'SONG_NOT_IN_WEEK',
    });
    expect(canAddComment(addCtx({ myCommentCountThisWeek: 49 }))).toEqual({ ok: true });
    expect(canAddComment(addCtx({ myCommentCountThisWeek: 50 }))).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    });
  });

  it('lets you delete your own comment while the week is open, but not someone else’s', () => {
    expect(canDeleteComment(deleteCtx())).toEqual({ ok: true });
    expect(canDeleteComment(deleteCtx({ now: AFTER_WEEK }))).toMatchObject({ code: 'WEEK_CLOSED' });
    expect(
      canDeleteComment(deleteCtx({ userId: 'bob', membership: { ...member, userId: 'bob' } })),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('lets the host delete any comment, any time (moderation)', () => {
    expect(canDeleteComment(deleteCtx({ userId: 'hank', membership: host }))).toEqual({ ok: true });
    expect(canDeleteComment(deleteCtx({ userId: 'hank', membership: host, now: AFTER_WEEK }))).toEqual({
      ok: true,
    });
    // A member whose role says host but isn't the party's host gets no special powers.
    expect(
      canDeleteComment(
        deleteCtx({ userId: 'mallory', membership: { ...member, userId: 'mallory', role: 'host' } }),
      ),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });
});
