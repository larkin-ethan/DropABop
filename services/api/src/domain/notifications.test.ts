import type { Comment, Recommendation, Round, Vote } from '@dropabop/shared';
import { describe, expect, it } from 'vitest';
import { buildNotifications } from './notifications';
import { startOfDay } from './week';

const ME = 'me';
const round = (weekStart: string, endsAt: string): Round => ({
  roundId: `p1.${weekStart}`,
  partyId: 'p1',
  weekStart,
  timezone: 'America/Chicago',
  startsAt: `${weekStart}T05:00:00.000Z`,
  endsAt,
  status: 'OPEN',
});
const thisWeek = round('2026-10-05', '2026-10-12T05:00:00.000Z');
const lastWeek = { ...round('2026-09-28', '2026-10-05T05:00:00.000Z'), status: 'CLOSED' as const };

let n = 0;
function song(
  r: Round,
  userId: string,
  createdAt = '2026-10-06T15:00:00.000Z',
  day = '2026-10-06',
): Recommendation {
  n += 1;
  return {
    recommendationId: `r${n}`,
    roundId: r.roundId,
    partyId: 'p1',
    userId,
    submittedOn: day,
    weekday: 'TUE',
    song: {
      songId: `s${n}`,
      title: `Song ${n}`,
      artist: 'A',
      album: null,
      albumArtUrl: null,
      durationMs: null,
      releaseDate: null,
      providers: [{ provider: 'appleMusic', providerSongId: '1', externalUrl: 'https://music.apple.com/x' }],
    },
    createdAt,
  };
}
const vote = (rec: Recommendation, userId: string, rating: number): Vote => ({
  roundId: rec.roundId,
  recommendationId: rec.recommendationId,
  userId,
  rating,
  updatedAt: '2026-09-30T00:00:00.000Z',
});
const comment = (rec: Recommendation, userId: string, createdAt: string): Comment => ({
  commentId: `c${createdAt}`,
  roundId: rec.roundId,
  recommendationId: rec.recommendationId,
  userId,
  text: 'nice',
  createdAt,
});

describe('buildNotifications (D29)', () => {
  it('this week: songs to rate (newest unrated song’s time), not shared today, comments on your songs', () => {
    const mine = song(thisWeek, ME, '2026-10-05T15:00:00.000Z', '2026-10-05');
    const rated = song(thisWeek, 'u1', '2026-10-05T16:00:00.000Z');
    const waiting1 = song(thisWeek, 'u2', '2026-10-06T10:00:00.000Z');
    const waiting2 = song(thisWeek, 'u3', '2026-10-07T09:00:00.000Z');
    const list = buildNotifications({
      userId: ME,
      current: {
        round: thisWeek,
        today: {
          weekday: 'WED',
          date: '2026-10-07',
          dayNumber: 3,
          dayCount: 5,
          startsAt: startOfDay('2026-10-07', 'America/Chicago'),
        },
        songs: [mine, rated, waiting1, waiting2],
        myVotes: [vote(rated, ME, 7)],
        myDates: ['2026-10-05'],
        comments: [
          comment(mine, 'u1', '2026-10-07T12:00:00.000Z'),
          comment(mine, ME, '2026-10-07T13:00:00.000Z'), // your own: not news
          comment(rated, 'u2', '2026-10-07T14:00:00.000Z'), // not on your song
        ],
      },
      lastClosed: null,
    });
    expect(list.map((x) => x.type)).toEqual(['comments', 'toRate', 'shareToday']); // newest first
    expect(list.find((x) => x.type === 'toRate')).toMatchObject({
      title: '2 songs are waiting for your rating',
      time: '2026-10-07T09:00:00.000Z',
      link: '/rate?show=unrated',
    });
    expect(list.find((x) => x.type === 'shareToday')?.time).toBe('2026-10-07T05:00:00.000Z'); // midnight in Chicago
    expect(list.find((x) => x.type === 'comments')?.title).toBe('1 comment on your songs this week');
  });

  it('nothing to do: no notifications for this week', () => {
    const theirs = song(thisWeek, 'u1');
    const list = buildNotifications({
      userId: ME,
      current: {
        round: thisWeek,
        today: null, // not a sharing day
        songs: [theirs],
        myVotes: [vote(theirs, ME, 8)],
        myDates: [],
        comments: [],
      },
      lastClosed: null,
    });
    expect(list).toEqual([]);
  });

  it('last week: results ready, and your place among the sharers', () => {
    const mine = song(lastWeek, ME, '2026-09-28T15:00:00.000Z', '2026-09-28');
    const theirs = song(lastWeek, 'u1', '2026-09-29T15:00:00.000Z', '2026-09-29');
    const list = buildNotifications({
      userId: ME,
      current: null,
      lastClosed: {
        round: lastWeek,
        songs: [mine, theirs],
        votes: [vote(mine, 'u1', 9), vote(theirs, ME, 6)],
      },
    });
    expect(list.find((x) => x.type === 'results')).toMatchObject({
      time: lastWeek.endsAt,
      link: '/results/p1.2026-09-28',
    });
    expect(list.find((x) => x.type === 'weeklyRank')).toMatchObject({
      title: 'You finished #1 of 2 last week',
      link: '/history/week/2026-09-28',
    });
  });

  it('no rank if none of your songs was rated last week', () => {
    const theirs = song(lastWeek, 'u1', '2026-09-29T15:00:00.000Z', '2026-09-29');
    const list = buildNotifications({
      userId: ME,
      current: null,
      lastClosed: { round: lastWeek, songs: [theirs, song(lastWeek, 'u2')], votes: [vote(theirs, ME, 6)] },
    });
    expect(list.map((x) => x.type)).toEqual(['results']);
  });
});
