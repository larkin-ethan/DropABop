// Routes. The welcome, sign-in, and invite pages are public; everything else needs a signed-in user (RequireAuth).
// The screens get their data from the API (or, in the dev-only preview, from the in-memory sample API).

import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { LoadingState } from './components/States';
import { takePendingInvite } from './lib/pending-invite';
import { CurrentPartyProvider } from './party/CurrentParty';
import { ForgotPasswordScreen, SignInScreen, SignUpScreen, VerifyEmailScreen } from './screens/AuthScreens';
import { ComponentGallery } from './screens/ComponentGallery';
import { HomeScreen } from './screens/HomeScreen';
import { LandingScreen } from './screens/LandingScreen';
import { CreatePartyScreen, JoinByLinkScreen, JoinWithCodeScreen } from './screens/OnboardingScreens';
import { RateScreen } from './screens/RateScreen';
import { HistoryScreen, LatestResultsScreen, ResultsScreen } from './screens/ResultsScreens';
import { PartySettingsScreen, ProfileScreen } from './screens/SettingsScreens';
import { ShareScreen } from './screens/ShareScreen';
import { GroupStatsScreen, LeaderboardScreen, PersonalStatsScreen } from './screens/StatsScreens';

function PreviewBanner() {
  return (
    <div className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm text-gold">
      Preview with sample data. Not connected to the real app yet.
    </div>
  );
}

/** Sends signed-out visitors to the welcome page or to sign in (then back to where they were going). */
function RequireAuth({ preview }: { preview: boolean }) {
  const { status } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Someone who opened an invite link while signed out comes back to it after signing up or logging in.
  useEffect(() => {
    if (status !== 'signedIn') return;
    const code = takePendingInvite();
    if (code !== null) {
      void navigate(`/join/${encodeURIComponent(code)}`, { replace: true });
    }
  }, [status, navigate]);

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <LoadingState label="Checking your sign-in…" rows={2} />
      </div>
    );
  }
  if (status === 'signedOut') {
    // The front door gets the welcome page; any other link (e.g. /stats) asks to sign in, then returns there.
    if (location.pathname === '/') {
      return <Navigate to="/welcome" replace />;
    }
    return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  }
  return (
    <AppShell banner={preview ? <PreviewBanner /> : undefined}>
      <Outlet />
    </AppShell>
  );
}

/** Signed-in people have no use for the welcome page, so it takes them home. */
function WelcomeRoute() {
  const { status } = useAuth();
  if (status === 'signedIn') {
    return <Navigate to="/" replace />;
  }
  return <LandingScreen />;
}

export function App({ preview = false }: { preview?: boolean }) {
  return (
    <CurrentPartyProvider>
      <Routes>
        <Route path="/welcome" element={<WelcomeRoute />} />
        <Route path="/sign-in" element={<SignInScreen />} />
        <Route path="/sign-up" element={<SignUpScreen />} />
        <Route path="/verify" element={<VerifyEmailScreen />} />
        <Route path="/forgot-password" element={<ForgotPasswordScreen />} />
        {/* Works signed out too: sign up or log in, then come back and join (P8.2). */}
        <Route path="/join/:code" element={<JoinByLinkScreen />} />

        <Route element={<RequireAuth preview={preview} />}>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/join" element={<JoinWithCodeScreen />} />
          <Route path="/parties/new" element={<CreatePartyScreen />} />
          <Route path="/share" element={<ShareScreen />} />
          <Route path="/rate" element={<RateScreen />} />
          <Route path="/results" element={<LatestResultsScreen />} />
          <Route path="/results/:roundId" element={<ResultsScreen />} />
          <Route path="/history" element={<HistoryScreen />} />
          <Route path="/stats" element={<PersonalStatsScreen />} />
          <Route path="/stats/group" element={<GroupStatsScreen />} />
          <Route path="/leaderboard" element={<LeaderboardScreen />} />
          <Route path="/settings" element={<PartySettingsScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          {import.meta.env.DEV && <Route path="/dev/components" element={<ComponentGallery />} />}
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CurrentPartyProvider>
  );
}
