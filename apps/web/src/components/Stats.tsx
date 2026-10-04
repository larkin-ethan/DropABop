// Stat cards, leaderboards, and the rating distribution chart (spec §17–§18; mockup screens 17–21).
// They display exactly what the stats API returns: a value with its sample size, or "not enough data".

import type { Stat } from '@dropabop/shared';
import { Avatar } from './ui';

/** Same shape as the API's Stat<T> (docs/API.md → Stats). */
export type StatResult<T> = Stat<T>;

export interface StatCardProps {
  label: string;
  stat: StatResult<number>;
  /** What the sample is made of: "ratings", "songs"… */
  unit: string;
  /** How the number is calculated, shown on hover/focus (spec §18: definitions must be transparent). */
  definition: string;
  format?: (value: number) => string;
}

export function StatCard({ label, stat, unit, definition, format = (v) => v.toFixed(1) }: StatCardProps) {
  return (
    <div className="rounded-xl border border-line bg-surface-raised p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        <span
          className="cursor-help rounded-full border border-line px-1.5 text-xs text-muted"
          title={definition}
          tabIndex={0}
          aria-label={`How ${label} is calculated: ${definition}`}
        >
          ?
        </span>
      </div>
      {stat.status === 'ok' ? (
        <>
          <p className="mt-2 text-3xl font-bold text-primary">{format(stat.value)}</p>
          <p className="mt-1 text-xs text-muted">
            Based on {stat.sampleSize} {unit} · calculated
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-base font-semibold text-muted">Not enough data yet</p>
          <p className="mt-1 text-xs text-muted">
            {stat.sampleSize} of {stat.required} {unit} so far
          </p>
        </>
      )}
    </div>
  );
}

export interface LeaderboardRow {
  id: string;
  rank: number;
  value: number;
  sampleSize: number;
  name: string;
  avatarColor: string;
}

export function Leaderboard({
  title,
  definition,
  rows,
  unit,
  format = (v) => v.toFixed(1),
}: {
  title: string;
  definition: string;
  rows: LeaderboardRow[];
  unit: string;
  format?: (value: number) => string;
}) {
  return (
    <div>
      <h3 className="font-bold">{title}</h3>
      <p className="mt-0.5 text-xs text-muted">{definition}</p>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nobody has enough data for this one yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-1">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-raised">
              <span
                className={`w-6 text-center font-bold ${row.rank === 1 ? 'text-gold' : 'text-muted'}`}
                aria-label={`Rank ${row.rank}`}
              >
                {row.rank}
              </span>
              <Avatar name={row.name} color={row.avatarColor} size="sm" />
              <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
              <span className="text-right">
                <span className="block font-bold">{format(row.value)}</span>
                <span className="block text-[11px] text-muted">
                  Based on {row.sampleSize} {unit}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Horizontal bars for how many of each rating a song (or person) got. `counts[0]` = number of 1s. */
export function RatingDistribution({ counts }: { counts: number[] }) {
  const max = Math.max(1, ...counts);
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Rating distribution">
      {[...counts].reverse().map((count, i) => {
        const rating = counts.length - i;
        return (
          <li
            key={rating}
            className="flex items-center gap-2 text-xs"
            aria-label={`${count} ratings of ${rating}`}
          >
            <span className="w-5 text-right text-muted">{rating}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-raised">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-blue to-primary"
                style={{ width: `${(count / max) * 100}%` }}
              />
            </span>
            <span className="w-5 text-muted">{count}</span>
          </li>
        );
      })}
    </ul>
  );
}
