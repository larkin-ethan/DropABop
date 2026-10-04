// Loading, empty, and error states (spec §28–§30). Every screen uses these so nothing ever shows a blank page.

import type { ReactNode } from 'react';
import { Button } from './ui';

/** A placeholder shape that pulses while content loads. */
export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return (
    <span className={`block animate-pulse rounded-md bg-surface-raised ${className}`} aria-hidden="true" />
  );
}

/** Skeleton rows shaped like song cards, with a label for screen readers. */
export function LoadingState({ label = 'Loading…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3 py-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-14 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="text-3xl" aria-hidden="true">
        🎵
      </span>
      <p className="text-lg font-semibold">{title}</p>
      {message && <p className="max-w-sm text-muted">{message}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Shows the API's friendly message (spec §30) and a way to try again. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-red-400/30 bg-red-400/10 p-5 text-center"
    >
      <p className="text-ink">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
