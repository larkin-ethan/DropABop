// Which party the screens are showing. People can be in up to 5 parties (D15); the choice is remembered on this
// device (a convenience only: the server decides what each person may see).

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UserPartyLink } from '@dropabop/shared';
import { useMe } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';

const STORAGE_KEY = 'dropabop.currentParty';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // private mode or blocked storage: just start with the first party
  }
}

function writeStored(partyId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, partyId);
  } catch {
    // Not remembering is fine.
  }
}

/** On sign-out: the next person on this device starts with their own first party. */
export function forgetCurrentParty() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to forget.
  }
}

interface CurrentPartyState {
  /** null while loading, or when the person isn't in any party yet. */
  partyId: string | null;
  parties: UserPartyLink[];
  current: UserPartyLink | null;
  select: (partyId: string) => void;
  /** 'loading' until /users/me answers. */
  status: 'loading' | 'error' | 'ready';
  retry: () => void;
}

const CurrentPartyContext = createContext<CurrentPartyState | null>(null);

export function CurrentPartyProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const me = useMe({ enabled: authStatus === 'signedIn' });
  const [chosen, setChosen] = useState<string | null>(() => readStored());
  const parties = useMemo(() => me.data?.parties ?? [], [me.data]);

  // The remembered party may have been left or never existed on this account: fall back to the first one.
  const current = parties.find((p) => p.partyId === chosen) ?? parties[0] ?? null;

  useEffect(() => {
    if (current !== null && current.partyId !== chosen) {
      setChosen(current.partyId);
    }
  }, [current, chosen]);

  const select = useCallback((partyId: string) => {
    setChosen(partyId);
    writeStored(partyId);
  }, []);

  const value: CurrentPartyState = {
    partyId: current?.partyId ?? null,
    parties,
    current,
    select,
    status: me.isPending ? 'loading' : me.isError ? 'error' : 'ready',
    retry: () => void me.refetch(),
  };
  return <CurrentPartyContext.Provider value={value}>{children}</CurrentPartyContext.Provider>;
}

export function useCurrentParty(): CurrentPartyState {
  const value = useContext(CurrentPartyContext);
  if (value === null) {
    throw new Error('useCurrentParty must be used inside <CurrentPartyProvider>');
  }
  return value;
}
