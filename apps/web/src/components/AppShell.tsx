// Page frame: sidebar on desktop/tablet, bottom tab bar on mobile (D32; docs/design/README.md → Layout).
// Also holds the party switcher (people can be in up to 5 parties, D15), the profile link, and sign out.

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useMe } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { forgetSignUpAgreement } from '../lib/privacy-consent';
import { forgetCurrentParty, useCurrentParty } from '../party/CurrentParty';
import { NotificationBell } from '../screens/NotificationsScreen';
import { DockedPlayer } from '../player/DockedPlayer';
import { useMusicPlayer } from '../player/MusicPlayerContext';
import { Icon, type IconName } from './Icon';
import { Avatar, Logo } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** When the link counts as "you are here" (default: this path and the pages under it). */
  isActive?: (pathname: string, hash: string) => boolean;
}

const under =
  (...paths: string[]) =>
  (pathname: string) =>
    paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** The Drop hub (D32) covers Share, Rate and Results. */
const DROP_PAGES = under('/drop', '/share', '/rate', '/results');

/** Desktop sidebar, in D32's three groups. */
const SIDEBAR: NavItem[][] = [
  [
    { to: '/', label: 'Home', icon: 'home', isActive: (p) => p === '/' },
    { to: '/drop', label: 'Today’s Drop', icon: 'music', isActive: DROP_PAGES },
    { to: '/history', label: 'History', icon: 'history' },
    { to: '/stats', label: 'Stats', icon: 'chart' },
    { to: '/leaderboard', label: 'Leaderboard', icon: 'list' },
    { to: '/achievements', label: 'Achievements', icon: 'trophy' },
    { to: '/search', label: 'Search', icon: 'search' },
  ],
  [
    {
      to: '/settings/party',
      label: 'Party',
      icon: 'crown',
      isActive: (p, h) => p === '/settings/party' && h !== '#members',
    },
    {
      to: '/settings/party#members',
      label: 'Members',
      icon: 'users',
      isActive: (p, h) => p === '/settings/party' && h === '#members',
    },
    {
      to: '/settings',
      label: 'Settings',
      icon: 'settings',
      isActive: (p) => p === '/settings' || (p.startsWith('/settings/') && p !== '/settings/party'),
    },
  ],
];

/** Mobile bottom bar (D32): Leaderboard and Achievements are reached from Stats and Profile. */
const MOBILE_BAR: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home', isActive: (p) => p === '/' },
  { to: '/drop', label: 'Drop', icon: 'music', isActive: DROP_PAGES },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/stats', label: 'Stats', icon: 'chart', isActive: under('/stats', '/leaderboard') },
  { to: '/profile', label: 'Profile', icon: 'user', isActive: under('/profile', '/achievements') },
];

function useIsActive() {
  const { pathname, hash } = useLocation();
  return (item: NavItem) => (item.isActive ?? under(item.to))(pathname, hash);
}

/** Signs out, forgets every cached answer (the next person on this device starts clean), and goes to the welcome page. */
export function SignOutButton() {
  const { service, refresh } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await service.signOut();
    } finally {
      // Even if Cognito couldn't be reached, local tokens are cleared; re-check and go to the welcome page
      // (not "sign in to see this page again", which is what the route guard would show).
      queryClient.clear();
      forgetCurrentParty();
      forgetSignUpAgreement(); // shared computers: never carry one person's sign-up agreement over to the next
      await refresh();
      setBusy(false);
      void navigate('/welcome', { replace: true });
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={busy}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-surface-raised hover:text-ink disabled:opacity-60"
    >
      <Icon name="signOut" />
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}

/** Which party you're looking at, plus "Create a party" and "Join with a code". */
function PartySwitcher({ compact = false }: { compact?: boolean }) {
  const { parties, current, select } = useCurrentParty();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = current?.partyName ?? 'No party yet';
  return (
    <div ref={wrapper} className={`relative ${compact ? 'min-w-0 flex-1' : ''}`}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={
          compact
            ? 'mx-auto flex max-w-full items-center gap-1 truncate px-2 text-sm font-semibold'
            : 'flex w-full items-center justify-between rounded-xl border border-line bg-surface-raised px-3 py-2.5 text-left text-sm'
        }
      >
        {compact ? (
          <span className="truncate">{label}</span>
        ) : (
          <span className="min-w-0">
            <span className="block text-xs text-muted">Party</span>
            <span className="block truncate font-semibold">{label}</span>
          </span>
        )}
        <Icon name="chevronDown" className="size-4 shrink-0 text-muted" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 left-0 z-30 mt-2 min-w-56 rounded-xl border border-line bg-surface p-1.5 shadow-xl"
        >
          {parties.map((p) => (
            <button
              key={p.partyId}
              type="button"
              role="menuitemradio"
              aria-checked={p.partyId === current?.partyId}
              onClick={() => {
                select(p.partyId);
                setOpen(false);
                void navigate('/');
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-raised"
            >
              <span className="truncate">{p.partyName}</span>
              {p.partyId === current?.partyId && <Icon name="check" className="size-4 text-primary" />}
            </button>
          ))}
          {parties.length > 0 && <div className="my-1 border-t border-line" />}
          <Link
            role="menuitem"
            to="/parties/new"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-blue hover:bg-surface-raised"
          >
            <Icon name="plus" className="size-4" /> Create a party
          </Link>
          <Link
            role="menuitem"
            to="/join"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-blue hover:bg-surface-raised"
          >
            <Icon name="link" className="size-4" /> Join with a code
          </Link>
        </div>
      )}
    </div>
  );
}

function ProfileLink() {
  const me = useMe();
  const user = me.data?.user;
  return (
    <NavLink
      to="/profile"
      aria-label="Your profile"
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
          isActive ? 'bg-active text-ink' : 'text-muted hover:bg-surface-raised hover:text-ink'
        }`
      }
    >
      {user ? (
        <Avatar name={user.displayName} color={user.avatarColor} image={user.avatarImage} size="sm" />
      ) : (
        <Icon name="user" className="size-8 text-muted" />
      )}
      <span className="truncate">{user?.displayName ?? 'Profile'}</span>
    </NavLink>
  );
}

export function AppShell({ children, banner }: { children: ReactNode; banner?: ReactNode }) {
  // While the play card is docked, leave room under the page so it never covers the end of the content.
  const playerOpen = useMusicPlayer().song !== null;
  const isActive = useIsActive();
  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar: tablet and up */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-surface px-4 py-6 md:flex">
        <div className="px-2">
          <Logo />
        </div>
        <PartySwitcher />
        <nav aria-label="Main" className="flex flex-col gap-4">
          {SIDEBAR.map((group, i) => (
            <div key={i} className={`flex flex-col gap-1 ${i > 0 ? 'border-t border-line pt-4' : ''}`}>
              {group.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={isActive(item) ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive(item)
                      ? 'bg-active text-ink'
                      : 'text-muted hover:bg-surface-raised hover:text-ink'
                  }`}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-1 border-t border-line pt-4">
          <NotificationBell withLabel />
          <ProfileLink />
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
        <Logo compact />
        <PartySwitcher compact />
        <div className="flex shrink-0 items-center gap-3">
          <NotificationBell />
          <NavLink to="/search" aria-label="Search" className="text-muted">
            <Icon name="search" />
          </NavLink>
          <NavLink to="/settings" aria-label="Settings" className="text-muted">
            <Icon name="settings" />
          </NavLink>
          {/* Profile is in the bottom bar (D32); sign out is on the Profile page. */}
        </div>
      </header>

      <main
        className={`mx-auto w-full max-w-5xl flex-1 px-4 pt-5 md:px-8 md:pt-8 ${
          playerOpen ? 'pb-[30rem] md:pb-[26rem]' : 'pb-28 md:pb-8'
        }`}
      >
        {banner}
        {children}
      </main>

      {/* Bottom tab bar: mobile only (D32). */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-line bg-surface/95 px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
      >
        {MOBILE_BAR.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            aria-current={isActive(item) ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-medium ${
              isActive(item) ? 'text-primary' : 'text-muted'
            }`}
          >
            <Icon name={item.icon} />
            {item.label}
          </Link>
        ))}
      </nav>

      <DockedPlayer />
    </div>
  );
}
