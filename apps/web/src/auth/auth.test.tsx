import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '../api/client';
import { App } from '../App';
import { SignInScreen, SignUpScreen, VerifyEmailScreen } from '../screens/AuthScreens';
import { AuthProvider } from './AuthContext';
import { friendlyAuthError } from './auth-errors';
import type { AuthService } from './auth-service';

function fakeAuth(overrides: Partial<AuthService> = {}): AuthService {
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

function named(name: string) {
  return Object.assign(new Error('raw cognito text'), { name });
}

/** Shows the current path so tests can check where navigation went. */
function WhereAmI() {
  const location = useLocation();
  return <p data-testid="path">{location.pathname}</p>;
}

function renderAt(path: string, service: AuthService, element: React.ReactNode) {
  return render(
    <AuthProvider service={service}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={element} />
          <Route path="*" element={<WhereAmI />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('friendlyAuthError (spec §30)', () => {
  it('turns Cognito error names into plain sentences, never raw text', () => {
    expect(friendlyAuthError(named('NotAuthorizedException'))).toBe(
      'That email and password don’t match. Please try again.',
    );
    expect(friendlyAuthError(named('CodeMismatchException'))).toContain('code isn’t right');
    expect(friendlyAuthError(named('SomethingNew'))).toBe('Something went wrong. Please try again.');
  });

  it('does not reveal whether an account exists', () => {
    expect(friendlyAuthError(named('UserNotFoundException'))).toBe(
      friendlyAuthError(named('NotAuthorizedException')),
    );
  });
});

describe('API client (spec §9)', () => {
  const ok = (body: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
    );

  it('sends the access token in the Authorization header, never the URL', async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => ok({ hello: 'world' }));
    const client = createApiClient({
      baseUrl: 'https://api.example.com/',
      auth: fakeAuth(),
      onSignedOut: vi.fn(),
      fetchImpl,
    });
    expect(await client.get('/users/me')).toEqual({ hello: 'world' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/users/me');
    expect(url as string).not.toContain('token');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer token-1');
  });

  it('refreshes the token once on 401 and retries', async () => {
    const auth = fakeAuth({
      getAccessToken: vi.fn((options?: { forceRefresh?: boolean }) =>
        Promise.resolve(options?.forceRefresh ? 'token-2' : 'token-1'),
      ),
    });
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(() => ok({ error: { code: 'UNAUTHENTICATED', message: 'x' } }, 401))
      .mockImplementationOnce(() => ok({ fine: true }));
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      auth,
      onSignedOut: vi.fn(),
      fetchImpl,
    });
    expect(await client.get('/users/me')).toEqual({ fine: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      ((fetchImpl.mock.calls[1] as [string, RequestInit])[1].headers as Record<string, string>).authorization,
    ).toBe('Bearer token-2');
  });

  it('signs out when the session can’t be recovered', async () => {
    const auth = fakeAuth();
    const onSignedOut = vi.fn();
    const fetchImpl = vi.fn(() => ok({ error: { code: 'UNAUTHENTICATED', message: 'x' } }, 401));
    const client = createApiClient({ baseUrl: 'https://api.example.com', auth, onSignedOut, fetchImpl });
    await expect(client.get('/users/me')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(auth.signOut).toHaveBeenCalled();
    expect(onSignedOut).toHaveBeenCalled();
  });

  it('passes the API’s friendly error through, and handles network failures', async () => {
    const message = 'You’ve already shared your song for today.';
    const client = createApiClient({
      baseUrl: 'https://api.example.com',
      auth: fakeAuth(),
      onSignedOut: vi.fn(),
      fetchImpl: () => ok({ error: { code: 'ALREADY_SUBMITTED_TODAY', message } }, 409),
    });
    await expect(client.post('/rounds/x/recommendations', {})).rejects.toEqual(
      new ApiError(409, 'ALREADY_SUBMITTED_TODAY', message),
    );

    const offline = createApiClient({
      baseUrl: 'https://api.example.com',
      auth: fakeAuth(),
      onSignedOut: vi.fn(),
      fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')),
    });
    await expect(offline.get('/users/me')).rejects.toMatchObject({ code: 'NETWORK' });
  });
});

describe('sign-in screens', () => {
  it('signs in and goes home', async () => {
    const service = fakeAuth();
    renderAt('/sign-in', service, <SignInScreen />);
    await userEvent.type(screen.getByLabelText('Email'), 'ethan@example.com ');
    await userEvent.type(screen.getByLabelText('Password'), 'Secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(service.signIn).toHaveBeenCalledWith('ethan@example.com', 'Secret123');
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/'));
  });

  it('shows a friendly error on a wrong password', async () => {
    const service = fakeAuth({ signIn: vi.fn(() => Promise.reject(named('NotAuthorizedException'))) });
    renderAt('/sign-in', service, <SignInScreen />);
    await userEvent.type(screen.getByLabelText('Email'), 'ethan@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('don’t match');
    expect(screen.queryByText('raw cognito text')).not.toBeInTheDocument();
  });

  it('sends unconfirmed accounts to the verification step', async () => {
    const service = fakeAuth({ signIn: vi.fn(() => Promise.reject(named('UserNotConfirmedException'))) });
    renderAt('/sign-in', service, <SignInScreen />);
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/verify'));
  });

  it('sign up checks the passwords match before calling Cognito, then asks for the code', async () => {
    const service = fakeAuth();
    renderAt('/sign-up', service, <SignUpScreen />);
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'Secret123');
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Secret124');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('don’t match');
    expect(service.signUp).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText('Confirm password'));
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Secret123');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(service.signUp).toHaveBeenCalledWith('new@example.com', 'Secret123');
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/verify'));
  });

  it('verify confirms the code', async () => {
    const service = fakeAuth();
    renderAt('/verify', service, <VerifyEmailScreen />);
    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Verification code'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verify email' }));
    expect(service.confirmSignUp).toHaveBeenCalledWith('new@example.com', '123456');
  });
});

describe('protected routes', () => {
  it('send signed-out visitors to sign in', async () => {
    render(
      <AuthProvider service={fakeAuth()}>
        <MemoryRouter initialEntries={['/stats']}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Welcome back!' })).toBeInTheDocument();
  });

  it('show signed-out visitors the welcome page at the front door', async () => {
    render(
      <AuthProvider service={fakeAuth()}>
        <MemoryRouter initialEntries={['/']}>
          <App />
          <WhereAmI />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Drop a Bop', level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent('/welcome');
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/sign-up');
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument();
  });

  it('take signed-in people from the welcome page straight home', async () => {
    render(
      <AuthProvider service={fakeAuth({ getCurrentUserId: () => Promise.resolve('user-1') })}>
        <MemoryRouter initialEntries={['/welcome']}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'This week’s songs' })).toBeInTheDocument();
  });

  it('show the app to signed-in people', async () => {
    render(
      <AuthProvider service={fakeAuth({ getCurrentUserId: () => Promise.resolve('user-1') })}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'This week’s songs' })).toBeInTheDocument();
    // Home still shows sample songs (until P8.3), so it must say so even when really signed in.
    expect(screen.getByText(/sample data until this screen is connected/)).toBeInTheDocument();
  });

  it('let signed-in people sign out, back to the welcome page', async () => {
    let signedIn = true;
    const service = fakeAuth({
      getCurrentUserId: () => Promise.resolve(signedIn ? 'user-1' : null),
      signOut: vi.fn(() => {
        signedIn = false;
        return Promise.resolve();
      }),
    });
    render(
      <AuthProvider service={service}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    );
    // The sidebar has a labelled button; the mobile header has an icon-only one. Both sign out.
    const buttons = await screen.findAllByRole('button', { name: 'Sign out' });
    await userEvent.click(buttons[0] as HTMLElement);
    expect(service.signOut).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { name: 'How it works' })).toBeInTheDocument();
  });
});
