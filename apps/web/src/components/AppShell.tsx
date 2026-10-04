// Page frame from the mockup: sidebar on desktop/tablet, bottom tab bar on mobile (docs/design/README.md → Layout).

import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Icon, type IconName } from './Icon';
import { Logo } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  /** Shown in the mobile bottom bar (5 max). */
  mobile?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: 'home', mobile: true },
  { to: '/share', label: 'Share a song', icon: 'music', mobile: true },
  { to: '/rate', label: 'Rate', icon: 'star', mobile: true },
  { to: '/results', label: 'Results', icon: 'trophy', mobile: true },
  { to: '/stats', label: 'Stats', icon: 'chart', mobile: true },
  { to: '/leaderboard', label: 'Leaderboard', icon: 'list' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

/**
 * Signs out and lets the route guard send you to the sign-in page. Lives in the frame so it's reachable from every
 * screen; the Profile screen (P8.11) will offer it too.
 */
function SignOutButton({ compact = false }: { compact?: boolean }) {
  const { service, refresh } = useAuth();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      await service.signOut();
    } finally {
      // Even if Cognito couldn't be reached, re-check: local tokens are cleared, so this shows the sign-in page.
      await refresh();
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={busy}
        aria-label="Sign out"
        className="text-muted"
      >
        <Icon name="signOut" />
      </button>
    );
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

export function AppShell({ children, partyName }: { children: ReactNode; partyName: string }) {
  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar: tablet and up */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r border-line bg-surface px-4 py-6 md:flex">
        <div className="px-2">
          <Logo />
        </div>
        <button
          type="button"
          className="flex items-center justify-between rounded-xl border border-line bg-surface-raised px-3 py-2.5 text-left text-sm"
        >
          <span>
            <span className="block text-xs text-muted">Party</span>
            <span className="font-semibold">{partyName}</span>
          </span>
          <Icon name="chevronDown" className="size-4 text-muted" />
        </button>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? 'bg-active text-ink' : 'text-muted hover:bg-surface-raised hover:text-ink'
                }`
              }
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile header */}
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
        <Logo compact />
        <span className="truncate px-3 text-sm font-semibold">{partyName}</span>
        <div className="flex items-center gap-4">
          <NavLink to="/settings" aria-label="Settings" className="text-muted">
            <Icon name="settings" />
          </NavLink>
          <SignOutButton compact />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-28 md:px-8 md:py-8">{children}</main>

      {/* Bottom tab bar: mobile only */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-line bg-surface/95 px-1 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
      >
        {NAV.filter((item) => item.mobile).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-medium ${
                isActive ? 'text-primary' : 'text-muted'
              }`
            }
          >
            <Icon name={item.icon} />
            {item.label === 'Share a song' ? 'Share' : item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
