// The 1–10 rating picker from the mockup (screen 12). Big touch targets, works with keyboard (arrow keys move,
// like any radio group) and reads correctly in screen readers.

import { useRef, type KeyboardEvent } from 'react';

const RATINGS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export interface RatingControlProps {
  value: number | null;
  onChange: (rating: number) => void;
  /** Read aloud by screen readers, e.g. "Rate Midnight City". */
  label: string;
  disabled?: boolean;
}

export function RatingControl({ value, onChange, label, disabled = false }: RatingControlProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function move(event: KeyboardEvent, index: number) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    let next: number | undefined;
    if (step !== undefined) next = Math.min(Math.max(index + step, 0), RATINGS.length - 1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = RATINGS.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    onChange(RATINGS[next] ?? 1);
    buttons.current[next]?.focus();
  }

  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-5 gap-2 sm:grid-cols-10">
      {RATINGS.map((rating, index) => {
        const selected = value === rating;
        // Only one button is in the tab order: the selected one, or "1" when nothing is selected.
        const tabbable = selected || (value === null && index === 0);
        return (
          <button
            key={rating}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${rating} out of 10`}
            tabIndex={tabbable ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(rating)}
            onKeyDown={(event) => move(event, index)}
            className={`h-11 rounded-xl text-base font-bold transition disabled:opacity-50 ${
              selected
                ? 'bg-primary text-primary-ink shadow-lg shadow-primary/25'
                : 'border border-line bg-surface-raised text-ink hover:border-blue'
            }`}
          >
            {rating}
          </button>
        );
      })}
    </div>
  );
}
