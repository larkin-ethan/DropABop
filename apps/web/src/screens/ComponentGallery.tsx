// /dev/components: every UI component on one page, for checking looks at different widths (dev builds only, P7.2).

import { useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { RatingControl } from '../components/RatingControl';
import { SongCard } from '../components/SongCard';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { Leaderboard, RatingDistribution, StatCard } from '../components/Stats';
import { AlbumArt, Avatar, Button, Card, ProgressBar } from '../components/ui';
import { sampleMembers, sampleSongs } from '../preview/sample-data';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </Card>
  );
}

export function ComponentGallery() {
  const [rating, setRating] = useState<number | null>(7);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Components</h1>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>
            <Icon name="plus" className="size-4" /> Share today’s song
          </Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Rating control">
        <RatingControl label="Rate Midnight City" value={rating} onChange={setRating} />
        <p className="mt-3 text-sm text-muted">Selected: {rating ?? 'none'}</p>
      </Section>

      <Section title="Avatars, album art, progress">
        <div className="flex flex-wrap items-center gap-4">
          {sampleMembers.slice(0, 4).map((m) => (
            <Avatar key={m.userId} name={m.displayName} color={m.avatarColor} />
          ))}
          <AlbumArt hue={265} />
          <AlbumArt hue={160} size="lg" />
          <div className="w-48">
            <ProgressBar value={6} max={10} label="Songs rated" />
          </div>
        </div>
      </Section>

      <Section title="Song cards">
        <ul className="flex flex-col">
          {sampleSongs.slice(0, 3).map((s) => (
            <SongCard key={s.recommendationId} item={s} />
          ))}
          <SongCard item={{ ...sampleSongs[9]!, myRating: null }} />
        </ul>
      </Section>

      <Section title="Stat cards">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Average score received"
            unit="songs"
            definition="Mean of the averages of your rated songs"
            stat={{ status: 'ok', value: 8.43, sampleSize: 12 }}
          />
          <StatCard
            label="Generosity"
            unit="ratings"
            definition="Your average rating minus the party's average"
            stat={{ status: 'ok', value: 1.2, sampleSize: 48 }}
            format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
          />
          <StatCard
            label="Musical twin"
            unit="shared songs"
            definition="Member whose ratings differ least from yours"
            stat={{ status: 'not-enough-data', sampleSize: 3, required: 5 }}
          />
        </div>
      </Section>

      <Section title="Leaderboard and distribution">
        <div className="grid gap-6 md:grid-cols-2">
          <Leaderboard
            title="Highest Average Recommendation Score"
            definition="Average rating received by songs the user recommended"
            unit="songs"
            rows={sampleMembers.slice(0, 4).map((m, i) => ({
              id: m.userId,
              rank: [1, 2, 2, 4][i] ?? i + 1,
              value: [8.7, 8.1, 8.1, 7.4][i] ?? 7,
              sampleSize: 12 - i,
              name: m.displayName,
              avatarColor: m.avatarColor,
            }))}
          />
          <RatingDistribution counts={[0, 0, 1, 0, 1, 2, 3, 5, 4, 2]} />
        </div>
      </Section>

      <Section title="States">
        <div className="grid gap-4 md:grid-cols-3">
          <LoadingState label="Loading songs" rows={2} />
          <EmptyState title="No songs yet." message="Be the first to share one today." />
          <ErrorState message="We couldn’t load this week. Check your connection." onRetry={() => {}} />
        </div>
      </Section>

      <Section title="Modal">
        <Button variant="secondary" onClick={() => setModalOpen(true)}>
          Open modal
        </Button>
        <Modal open={modalOpen} title="Share today’s song" onClose={() => setModalOpen(false)}>
          <p className="text-muted">You can’t change it after sharing.</p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Back
            </Button>
            <Button onClick={() => setModalOpen(false)}>Share song</Button>
          </div>
        </Modal>
      </Section>
    </div>
  );
}
