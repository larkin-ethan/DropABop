// Routes. Until the API is connected (P7.3/P8), dev builds show screens with sample data and say so clearly.

import { Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { Card } from './components/ui';
import { sampleCurrentWeek, sampleMembers, sampleParty, sampleSongs } from './preview/sample-data';
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

function PreviewBanner() {
  return (
    <div className="mb-5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2.5 text-sm text-gold">
      Preview with sample data. Not connected to the real app yet.
    </div>
  );
}

export function App() {
  return (
    <AppShell partyName={sampleParty.name}>
      {import.meta.env.DEV && <PreviewBanner />}
      <Routes>
        <Route
          path="/"
          element={
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
      </Routes>
    </AppShell>
  );
}
