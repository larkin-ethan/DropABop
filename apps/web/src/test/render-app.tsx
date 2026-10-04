// Renders the whole app (routes, auth, data) for screen tests, backed by the in-memory preview API.
// Each call gets a fresh query cache and a fresh copy of the sample world, so tests don't affect each other.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { vi } from 'vitest';
import { ApiProvider } from '../api/ApiContext';
import type { ApiClient } from '../api/client';
import { App } from '../App';
import { AuthProvider } from '../auth/AuthContext';
import type { AuthService } from '../auth/auth-service';
import { createPreviewApi, createPreviewState, type PreviewState } from '../preview/preview-api';

export function fakeAuth(overrides: Partial<AuthService> = {}): AuthService {
  return {
    getCurrentUserId: vi.fn(() => Promise.resolve(null)),
    getAccessToken: vi.fn(() => Promise.resolve('token-1')),
    signUp: vi.fn(() => Promise.resolve()),
    confirmSignUp: vi.fn(() => Promise.resolve()),
    resendSignUpCode: vi.fn(() => Promise.resolve()),
    signIn: vi.fn(() => Promise.resolve({ status: 'signedIn' as const })),
    signOut: vi.fn(() => Promise.resolve()),
    resetPassword: vi.fn(() => Promise.resolve()),
    confirmResetPassword: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

/** Signed in as the sample user ("me" in the preview world). */
export const signedInAuth = () => fakeAuth({ getCurrentUserId: () => Promise.resolve('me') });

/** Shows the current path so tests can check where navigation went. */
export function WhereAmI() {
  const location = useLocation();
  return (
    <p data-testid="path">
      {location.pathname}
      {location.search}
    </p>
  );
}

export function renderApp(
  path: string,
  options: {
    auth?: AuthService;
    /** Change the sample world before rendering (e.g. make it the weekend). */
    setup?: (state: PreviewState) => void;
    api?: ApiClient;
  } = {},
) {
  const state = createPreviewState();
  options.setup?.(state);
  const api = options.api ?? createPreviewApi(state);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth = options.auth ?? signedInAuth();
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider service={auth}>
        <ApiProvider client={api}>
          <MemoryRouter initialEntries={[path]}>
            <App />
            <WhereAmI />
          </MemoryRouter>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...result, state, auth, api };
}
