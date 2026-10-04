// Last line of defence (spec §30): if a screen crashes while rendering, show a friendly message with a way out
// instead of a blank page. React only supports this as a class component, so this is the app's one class.

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  crashed: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // Details stay in the browser console for debugging; people only see the friendly message.
    console.error('Screen crashed', error, info.componentStack);
  }

  override render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div
        role="alert"
        className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center"
      >
        <p className="text-2xl font-bold">Something went wrong</p>
        <p className="text-muted">Sorry about that. Reloading the page usually fixes it.</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-ink"
          >
            Reload
          </button>
          <a
            href="/"
            className="rounded-full border border-blue/60 px-5 py-2.5 text-sm font-semibold text-blue"
          >
            Go home
          </a>
        </div>
      </div>
    );
  }
}
