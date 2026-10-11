// GET /parties/{partyId}/notifications (docs/API.md → Notifications; P13.10, D29). In-app only, worked out on request
// from this week and last week (a handful of key queries), so the bell can check every few minutes cheaply.

import type { NotificationsResponse } from '@dropabop/shared';
import { wantsNotification } from '@dropabop/shared';
import { listWeekComments } from '../data/comments';
import { getSeenAt, markSeen } from '../data/party-link-seen';
import { listMySubmissionDates, listWeekRecommendations } from '../data/recommendations';
import { listRounds } from '../data/rounds';
import { getUserProfile } from '../data/users';
import { listMyWeekVotes, listWeekVotes } from '../data/votes';
import { buildNotifications, type NotificationsInput } from '../domain/notifications';
import { getSubmissionDay, startOfDay } from '../domain/week';
import { createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser, pathId } from '../http/request';
import { loadPartyForMember } from './parties';
import { resolveCurrentWeek } from './weeks';

/** How many recent weeks to look through for the latest one with results (paused or empty weeks in between). */
const RECENT_WEEKS = 4;

export const getNotificationsFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  const { party } = await loadPartyForMember(data, partyId, userId);
  const current = now();
  const week = await resolveCurrentWeek(data, party, current); // also records any week that just closed

  let currentInput: NotificationsInput['current'] = null;
  if (week.round !== null) {
    const round = week.round;
    const [songs, myVotes, myDates, comments] = await Promise.all([
      listWeekRecommendations(data, round.roundId, current),
      listMyWeekVotes(data, round.roundId, userId),
      listMySubmissionDates(data, round.roundId, userId),
      listWeekComments(data, round.roundId),
    ]);
    const today = getSubmissionDay(round, current);
    currentInput = {
      round,
      today: today === null ? null : { ...today, startsAt: startOfDay(today.date, round.timezone) },
      songs,
      myVotes,
      myDates,
      comments,
    };
  }

  // Consistent read: resolveCurrentWeek may have just recorded a week's close.
  const { rounds } = await listRounds(data, partyId, { limit: RECENT_WEEKS, consistent: true });
  const lastRound = rounds.find((r) => r.status === 'CLOSED') ?? null;
  const lastClosed =
    lastRound === null
      ? null
      : {
          round: lastRound,
          songs: await listWeekRecommendations(data, lastRound.roundId, current),
          votes: await listWeekVotes(data, lastRound.roundId),
        };

  const [user, seenAt] = await Promise.all([
    getUserProfile(data, userId),
    getSeenAt(data, userId, partyId, 'notificationsSeenAt'),
  ]);
  const notifications = buildNotifications({ userId, current: currentInput, lastClosed }).filter(
    (n) => user === null || wantsNotification(user, n.type),
  );

  return ok({
    notifications,
    unreadCount: notifications.filter((n) => seenAt === null || n.time > seenAt).length,
    seenAt,
  } satisfies NotificationsResponse);
};

/** "I've read my notifications" in this party (D29). The time comes from the server clock. */
export const markNotificationsSeenFn: HandlerFn = async (event, { data, now }) => {
  const { userId } = getAuthenticatedUser(event);
  const partyId = pathId(event, 'partyId');
  await loadPartyForMember(data, partyId, userId);
  const seenAt = now().toISOString();
  await markSeen(data, userId, partyId, 'notificationsSeenAt', new Date(seenAt));
  return ok({ seenAt });
};

export const getNotificationsHandler = createHandler(getNotificationsFn);
export const markNotificationsSeenHandler = createHandler(markNotificationsSeenFn);
