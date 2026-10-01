// Who's signed in, available to every screen. Also provides the AuthService so screens can sign in/out.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthService } from './auth-service';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  userId: string | null;
  service: AuthService;
  /** Re-reads the signed-in user (after sign-in or sign-out). */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ service, children }: { service: AuthService; children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [userId, setUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const id = await service.getCurrentUserId();
    setUserId(id);
    setStatus(id === null ? 'signedOut' : 'signedIn');
  }, [service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(() => ({ status, userId, service, refresh }), [status, userId, service, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}
