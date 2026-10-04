// Routes. Sign-in screens are public; everything else needs a signed-in user (RequireAuth).
// Until the screens are wired to the API (P8), they render sample data, and a banner says so clearly.

import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { LoadingState } from './components/States';
import { Card } from './components/ui';
import { sampleCurrentWeek, sampleMembers, sampleParty, sampleSongs } from './preview/sample-data';
import { ForgotPasswordScreen, SignInScreen, SignUpScreen, VerifyEmailScreen } from './screens/AuthScreens';
import { ComponentGallery } from './screens/ComponentGallery';
import { HomeScreen } from './screens/HomeScreen';

function ComingSoon({ title, task }: { title: string; task: string }) {
  return (
    <Card className="mx-auto mt-10 max-w-md text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-muted">This screen is built in roadmap task {task}.</p>
    </Card>
  );
}

/**
 * Shown on screens that still render sample data, signed in or not, so nobody mistakes it for their party.
 * Removed screen by screen as Phase 8 connects them to the API (Home: P8.3).
 */
function SampleDataBanner({ preview }: { preview: boolean }) {
  return (
    <div className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm text-gold">
      {preview
        ? 'Preview with sample data. Not connected to the real app yet.'
        : 'You’re signed in. The songs below are sample data until this screen is connected to your party.'}
    </div>
  );
}

/** Sends signed-out visitors to sign in, then brings them back to where they were going. */
function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <LoadingState label="Checking your sign-in…" rows={2} />
      </div>
    );
  }
  if (status === 'signedOut') {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }
  return (
    <AppShell partyName={sampleParty.name}>
      <Outlet />
    </AppShell>
  );
}

export function App({ preview = false }: { preview?: boolean }) {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInScreen />} />
      <Route path="/sign-up" element={<SignUpScreen />} />
      <Route path="/verify" element={<VerifyEmailScreen />} />
      <Route path="/forgot-password" element={<ForgotPasswordScreen />} />

      <Route element={<RequireAuth />}>
        <Route
          path="/"
          element={
            <>
              <SampleDataBanner preview={preview} />
              <HomeScreen
                partyName={sampleParty.name}
                today={sampleCurrentWeek.today}
                sharedToday={sampleCurrentWeek.sharedToday}
                sharedTodayCount={sampleCurrentWeek.sharedTodayCount}
                memberCount={sampleMembers.length}
                progress={sampleCurrentWeek.progress}
                lockLabel="Ratings lock Sunday 11:59 pm"
                songs={sampleSongs}
                members={sampleMembers}
              />
            </>
          }
        />
        <Route path="/share" element={<ComingSoon title="Share today’s song" task="P8.4" />} />
        <Route path="/rate" element={<ComingSoon title="Rate this week’s songs" task="P8.5" />} />
        <Route path="/results" element={<ComingSoon title="Weekly results" task="P8.6" />} />
        <Route path="/stats" element={<ComingSoon title="Your stats" task="P8.8" />} />
        <Route path="/leaderboard" element={<ComingSoon title="Leaderboard" task="P8.9" />} />
        <Route path="/history" element={<ComingSoon title="History" task="P8.7" />} />
        <Route path="/settings" element={<ComingSoon title="Party settings" task="P8.10" />} />
        {import.meta.env.DEV && <Route path="/dev/components" element={<ComponentGallery />} />}
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
