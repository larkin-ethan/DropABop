// Makes the API client available to every screen. The real app uses createApiClient (signed-in calls to our API);
// the sample-data preview and tests pass a fake with the same interface.

import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient } from './client';

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (client === null) {
    throw new Error('useApi must be used inside <ApiProvider>');
  }
  return client;
}
