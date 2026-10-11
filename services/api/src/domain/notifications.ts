// In-app notifications (P13.10, D29): worked out when you open the app from this week and last week only, so the
// bell's regular check stays cheap (no whole-party reads, unlike stats). Nothing is stored except when you last
// looked. Achievement news comes from the achievements endpoint instead (it needs the whole history).

import type { AppNotification, Comment, Recommendation, Round, Vote } from '@dropabop/shared';
import { buildHistoryMonth } from './history';
import type { SubmissionDay } from './week';

export interface NotificationsInput {
  userId: string;
  /** This week, if one is open (not paused, not between weeks). */
  current: {
    round: Round;
    /** Today, if it's a sharing day, and when it started (party time). */
    today: (SubmissionDay & { startsAt: string }) | null;
    songs: Recommendation[];
    myVotes: Vote[];
    myDates: string[];
    comments: Comment[];
  } | null;
  /** The most recent week whose ratings locked with results, and its songs and ratings. */
  lastClosed: { round: Round; songs: Recommendation[]; votes: Vote[] } | null;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Every notification that applies right now, newest first. Filtering by the person's switches happens after. */
export function buildNotifications(input: NotificationsInput): AppNotification[] {
  const list: AppNotification[] = [];
  const { current, lastClosed, userId } = input;

  if (current !== null) {
    const rated = new Set(current.myVotes.map((v) => v.recommendationId));
    const waiting = current.songs.filter((s) => s.userId !== userId && !rated.has(s.recommendationId));
    if (waiting.length > 0) {
      list.push({
        id: `toRate:${current.round.roundId}`,
        type: 'toRate',
        // The newest unrated song: a new song makes this unread again.
        time:
          waiting
            .map((s) => s.createdAt)
            .sort()
            .at(-1) ?? current.round.startsAt,
        title: `${plural(waiting.length, 'song is', 'songs are')} waiting for your rating`,
        detail: null,
        link: '/rate?show=unrated',
      });
    }

    if (current.today !== null && !current.myDates.includes(current.today.date)) {
      list.push({
        id: `shareToday:${current.today.date}`,
        type: 'shareToday',
        time: current.today.startsAt,
        title: 'You haven’t shared a song today',
        detail: null,
        link: '/share',
      });
    }

    // Comments by other people on your songs this week (D25: names are public, so this reveals nothing new).
    const mine = new Set(current.songs.filter((s) => s.userId === userId).map((s) => s.recommendationId));
    const onMine = current.comments.filter((c) => mine.has(c.recommendationId) && c.userId !== userId);
    if (onMine.length > 0) {
      list.push({
        id: `comments:${current.round.roundId}:${onMine.length}`,
        type: 'comments',
        time:
          onMine
            .map((c) => c.createdAt)
            .sort()
            .at(-1) ?? current.round.startsAt,
        title: `${plural(onMine.length, 'comment', 'comments')} on your songs this week`,
        detail: null,
        link: '/rate',
      });
    }
  }

  if (lastClosed !== null) {
    const { round } = lastClosed;
    list.push({
      id: `results:${round.roundId}`,
      type: 'results',
      time: round.endsAt,
      title: 'Weekly results are ready',
      detail: null,
      link: `/results/${encodeURIComponent(round.roundId)}`,
    });

    // Your place among last week's sharers, from the same rules as the history's "Your week".
    const [week] = buildHistoryMonth({
      month: round.weekStart.slice(0, 7),
      viewerId: userId,
      rounds: [{ round, status: 'CLOSED' }],
      recommendations: lastClosed.songs,
      votes: lastClosed.votes,
    });
    const rank = week?.yourWeek?.rank ?? null;
    if (rank !== null) {
      list.push({
        id: `weeklyRank:${round.roundId}`,
        type: 'weeklyRank',
        time: round.endsAt,
        title: `You finished #${rank.position} of ${rank.of} last week`,
        detail: 'By the average your songs received.',
        link: `/history/week/${round.weekStart}`,
      });
    }
  }

  return list.sort((a, b) => b.time.localeCompare(a.time));
}
