// What each score means (D37): the party's own key, or the default. Shown on Rate (a "How to score" panel, open on
// the first visit, then remembered closed), under the rating picker, and on How it works.

import { MAX_RATING, MIN_RATING } from '@dropabop/shared';
import { useId, useState } from 'react';
import { Icon } from './Icon';

const SEEN_KEY = 'dropabop.scoringKeySeen';

/** Storage can be blocked (private mode, strict settings): then the panel just starts open every time. */
function readSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Not saved; harmless.
  }
}

/** Scores from the highest down, each with its meaning. */
export function ScoringKeyList({ scoringKey }: { scoringKey: readonly string[] }) {
  const scores = Array.from({ length: MAX_RATING - MIN_RATING + 1 }, (_, i) => MAX_RATING - i);
  return (
    <dl className="grid grid-cols-[2rem_1fr] gap-x-3 gap-y-1.5 text-sm">
      {scores.map((score) => (
        <div key={score} className="contents">
          <dt className="text-right font-bold text-primary">{score}</dt>
          <dd className="text-muted">{scoringKey[score - MIN_RATING]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The collapsible "How to score" panel at the top of Rate. */
export function HowToScore({ scoringKey }: { scoringKey: readonly string[] }) {
  // Open the first time someone rates, so everyone sees the key once; closed after that unless they open it.
  const [open, setOpen] = useState(() => !readSeen());
  const panelId = useId();

  function toggle() {
    setOpen((was) => !was);
    rememberSeen();
  }

  return (
    <section className="mb-4 rounded-xl border border-line bg-surface px-4 py-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 text-left font-semibold"
      >
        How to score
        <Icon name="chevronDown" className={`size-4 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={panelId} className="mt-3">
          <ScoringKeyList scoringKey={scoringKey} />
        </div>
      )}
    </section>
  );
}

/** The chosen score's meaning, under the picker ("8: Really like it"). */
export function ScoreMeaning({
  id,
  value,
  scoringKey,
}: {
  id: string;
  value: number | null;
  scoringKey: readonly string[];
}) {
  return (
    <p id={id} className="min-h-5 text-sm text-muted" aria-live="polite">
      {value !== null && (
        <>
          <span className="font-semibold text-ink">{value}</span>: {scoringKey[value - MIN_RATING]}
        </>
      )}
    </p>
  );
}
