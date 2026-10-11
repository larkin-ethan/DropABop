// Notifications (spec v2 §22, roadmap P13.10, D29): the bell, the list, and the switches in Settings. In-app only, no
// push or email. Opening the list marks everything read. Achievement news comes from the achievements data, which the
// list loads when opened (it needs the whole history, so the bell itself doesn't check it).

import {
  NOTIFICATION_TYPES,
  wantsNotification,
  type AppNotification,
  type NotificationType,
  type User,
} from '@dropabop/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router';
import {
  useAchievements,
  useMarkNotificationsSeen,
  useMe,
  useNotifications,
  useUpdateProfile,
} from '../api/hooks';
import { Icon } from '../components/Icon';
import { PageHeader, QueryBoundary } from '../components/Page';
import { EmptyState } from '../components/States';
import { Card } from '../components/ui';
import { errorMessage } from '../lib/errors';
import { useCurrentParty } from '../party/CurrentParty';
import { NoPartyCard } from './ResultsScreens';
import { Alert, Saved, Toggle } from './SettingsScreens';

/** How far back achievement news is listed. */
const ACHIEVEMENT_NEWS_DAYS = 30;

const TYPE_TEXT: Record<NotificationType, { label: string; description: string; emoji: string }> = {
  toRate: {
    label: 'Songs to rate',
    description: 'When there are songs this week you haven’t rated.',
    emoji: '🎵',
  },
  shareToday: {
    label: 'Share reminder',
    description: 'On sharing days, until you’ve shared your song.',
    emoji: '📣',
  },
  comments: {
    label: 'Comments on your songs',
    description: 'When someone comments on a song you shared.',
    emoji: '💬',
  },
  results: {
    label: 'Weekly results',
    description: 'When a week’s ratings lock and the results are out.',
    emoji: '📊',
  },
  weeklyRank: { label: 'Your weekly rank', description: 'Your place among the week’s sharers.', emoji: '👑' },
  achievements: { label: 'Achievements', description: 'When you unlock an achievement.', emoji: '🏆' },
};

function timeAgo(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The bell (app shell)
// ---------------------------------------------------------------------------------------------------------------

export function NotificationBell({ withLabel = false }: { withLabel?: boolean }) {
  const { partyId } = useCurrentParty();
  const notifications = useNotifications(partyId);
  const unread = notifications.data?.unreadCount ?? 0;
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <NavLink
      to="/notifications"
      aria-label={label}
      className={({ isActive }) =>
        withLabel
          ? `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              isActive ? 'bg-active text-ink' : 'text-muted hover:bg-surface-raised hover:text-ink'
            }`
          : 'relative text-muted'
      }
    >
      <span className="relative inline-flex">
        <Icon name="bell" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-bold text-primary-ink"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </span>
      {withLabel && 'Notifications'}
    </NavLink>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// The list (/notifications)
// ---------------------------------------------------------------------------------------------------------------

interface ListItem extends AppNotification {
  unread: boolean;
}

export function NotificationsScreen() {
  const { partyId, status, retry, current } = useCurrentParty();
  const notifications = useNotifications(partyId);
  const achievements = useAchievements(partyId);
  const me = useMe();
  const markSeen = useMarkNotificationsSeen(partyId);
  const marked = useRef(false);

  // Opening the list reads everything, once per visit, after it has loaded (so this visit still shows what's new).
  const loaded = notifications.data !== undefined;
  useEffect(() => {
    if (!loaded || marked.current) return;
    marked.current = true;
    markSeen.mutate();
  }, [loaded, markSeen]);
  // What counted as unread when the list first loaded (marking it read mustn't make it look read straight away).
  const openedSeenAt = useRef<string | null | undefined>(undefined);
  if (notifications.data !== undefined && openedSeenAt.current === undefined) {
    openedSeenAt.current = notifications.data.seenAt;
  }

  if (status === 'ready' && partyId === null) return <NoPartyCard />;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Notifications"
        description={current ? `In ${current.partyName}` : undefined}
        actions={
          <Link to="/settings/notifications" className="text-sm font-medium text-blue hover:underline">
            Choose what you get
          </Link>
        }
      />
      <QueryBoundary
        isPending={status === 'loading' || notifications.isPending}
        error={status === 'error' ? true : notifications.error}
        onRetry={() => {
          retry();
          void notifications.refetch();
        }}
        loadingLabel="Loading notifications…"
      >
        {() => {
          const data = notifications.data;
          if (data === undefined) return null;
          const seenAt = openedSeenAt.current === undefined ? data.seenAt : openedSeenAt.current;
          const items: ListItem[] = data.notifications.map((n) => ({
            ...n,
            unread: seenAt === null || n.time > seenAt,
          }));
          // Recent achievements (D29), if switched on.
          const user = me.data?.user;
          if (user === undefined || wantsNotification(user, 'achievements')) {
            const since = Date.now() - ACHIEVEMENT_NEWS_DAYS * 24 * 60 * 60 * 1000;
            for (const a of achievements.data?.achievements ?? []) {
              if (a.unlockedOn === null || new Date(a.unlockedOn).getTime() < since) continue;
              items.push({
                id: `achievement:${a.id}`,
                type: 'achievements',
                time: a.unlockedOn,
                title: `Achievement unlocked: ${a.title}`,
                detail: a.description,
                link: '/achievements',
                unread: seenAt === null || a.unlockedOn > seenAt,
              });
            }
          }
          items.sort((a, b) => b.time.localeCompare(a.time));
          if (items.length === 0) {
            return (
              <Card>
                <EmptyState title="You’re all caught up" message="News about your party shows up here." />
              </Card>
            );
          }
          return (
            <Card>
              <ul className="flex flex-col">
                {items.map((item) => (
                  <li key={item.id} className="border-b border-line last:border-b-0">
                    <Link
                      to={item.link}
                      className="flex items-start gap-3 rounded-lg px-1 py-3 transition hover:bg-surface-raised"
                    >
                      <span className="text-xl" aria-hidden="true">
                        {TYPE_TEXT[item.type].emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block ${item.unread ? 'font-semibold' : ''}`}>{item.title}</span>
                        {item.detail && <span className="block text-sm text-muted">{item.detail}</span>}
                        <span className="block text-xs text-muted">{timeAgo(item.time)}</span>
                      </span>
                      {item.unread && (
                        <>
                          <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                          <span className="sr-only">(new)</span>
                        </>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          );
        }}
      </QueryBoundary>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Settings → Notifications (/settings/notifications)
// ---------------------------------------------------------------------------------------------------------------

export function NotificationSettingsScreen() {
  const me = useMe();
  return (
    <div className="mx-auto max-w-xl">
      <Link
        to="/settings"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-blue hover:underline"
      >
        <Icon name="arrowLeft" className="size-4" /> Settings
      </Link>
      <PageHeader
        title="Notifications"
        description="In the app only: Drop a Bop never sends push notifications or emails."
      />
      <QueryBoundary isPending={me.isPending} error={me.error} onRetry={() => void me.refetch()}>
        {() => (me.data ? <NotificationSwitches user={me.data.user} /> : null)}
      </QueryBoundary>
    </div>
  );
}

function NotificationSwitches({ user }: { user: User }) {
  const update = useUpdateProfile();
  const [prefs, setPrefs] = useState<Record<NotificationType, boolean>>(
    () =>
      Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, wantsNotification(user, t)])) as Record<
        NotificationType,
        boolean
      >,
  );
  const [saved, setSaved] = useState(false);

  function change(type: NotificationType, on: boolean) {
    const next = { ...prefs, [type]: on };
    setPrefs(next); // the switch moves straight away; the saved profile catches up
    setSaved(false);
    update.mutate({ notificationPrefs: next }, { onSuccess: () => setSaved(true) });
  }

  return (
    <Card>
      <ul className="flex flex-col divide-y divide-line">
        {NOTIFICATION_TYPES.map((type) => (
          <li key={type}>
            <Toggle
              label={TYPE_TEXT[type].label}
              description={TYPE_TEXT[type].description}
              checked={prefs[type]}
              disabled={update.isPending}
              onChange={(on) => change(type, on)}
            />
          </li>
        ))}
      </ul>
      {update.error && <Alert>{errorMessage(update.error)}</Alert>}
      <Saved show={saved && !update.isPending} />
    </Card>
  );
}
