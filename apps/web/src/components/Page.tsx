// Page heading and the standard "loading / error" wrapper every screen uses (spec §28–§30).

import type { ReactNode } from 'react';
import { errorMessage } from '../lib/errors';
import { ErrorState, LoadingState } from './States';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-medium text-blue">{eyebrow}</p>}
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Shows a skeleton while loading, a friendly error with "Try again" on failure, otherwise the content. */
export function QueryBoundary({
  isPending,
  error,
  onRetry,
  loadingLabel,
  children,
}: {
  isPending: boolean;
  error: unknown;
  /** Leave out when retrying can't help; the error then shows without a "Try again" button. */
  onRetry?: () => void;
  loadingLabel?: string;
  children: () => ReactNode;
}) {
  if (error) return <ErrorState message={errorMessage(error)} onRetry={onRetry} />;
  if (isPending) return <LoadingState label={loadingLabel} rows={4} />;
  return <>{children()}</>;
}
