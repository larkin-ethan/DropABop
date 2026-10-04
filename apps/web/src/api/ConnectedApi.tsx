// Chooses the API the app talks to: the real one (signed-in calls to API Gateway) or, in the sample-data preview, the
// in-memory pretend API. Signing out (or a session that can't be refreshed) clears every cached answer, so the next
// person on this device never sees the previous person's data.

import { useQueryClient } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getConfig } from '../config';
import { createPreviewApi } from '../preview/preview-api';
import { ApiProvider } from './ApiContext';
import { createApiClient } from './client';

export function ConnectedApi({ preview, children }: { preview: boolean; children: ReactNode }) {
  const { service, refresh } = useAuth();
  const queryClient = useQueryClient();
  const client = useMemo(
    () =>
      preview
        ? createPreviewApi()
        : createApiClient({
            baseUrl: getConfig().apiUrl,
            auth: service,
            onSignedOut: () => {
              queryClient.clear();
              void refresh();
            },
          }),
    [preview, service, queryClient, refresh],
  );
  return <ApiProvider client={client}>{children}</ApiProvider>;
}
