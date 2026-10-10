// "Today's Drop" hub (D32): Share · Rate · Results as tabs over the existing screens. The screens keep their own
// addresses (/share, /rate, /results), so links from Home, notifications and the e2e journey still work.

import { Navigate, NavLink, Outlet } from 'react-router';
import { useCurrentWeek } from '../api/hooks';
import { QueryBoundary } from '../components/Page';
import { dropPath } from '../lib/home-action';
import { useCurrentParty } from '../party/CurrentParty';

export function DropTabs() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex-1 rounded-full px-4 py-1.5 text-center text-sm font-semibold sm:flex-none ${
      isActive ? 'bg-active text-ink' : 'text-muted hover:text-ink'
    }`;
  return (
    <nav aria-label="Today’s drop" className="mb-5 flex gap-1 rounded-full border border-line p-1 sm:w-fit">
      <NavLink to="/share" className={tab}>
        Share
      </NavLink>
      <NavLink to="/rate" className={tab}>
        Rate
      </NavLink>
      <NavLink to="/results" end className={tab}>
        Results
      </NavLink>
    </nav>
  );
}

/** Wraps the Share, Rate and Results routes. */
export function DropLayout() {
  return (
    <>
      <DropTabs />
      <Outlet />
    </>
  );
}

/** /drop: opens the tab that fits right now (share today's song, rate, or see results). */
export function DropRedirect() {
  const { partyId, status, retry } = useCurrentParty();
  const week = useCurrentWeek(partyId);
  if (status === 'ready' && partyId === null) return <Navigate to="/join" replace />;
  return (
    <QueryBoundary
      isPending={status === 'loading' || week.isPending}
      error={status === 'error' ? true : week.error}
      onRetry={() => {
        retry();
        void week.refetch();
      }}
      loadingLabel="Loading this week…"
    >
      {() => <Navigate to={dropPath(true, week.data)} replace />}
    </QueryBoundary>
  );
}
