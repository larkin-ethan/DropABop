// Chooses the API the app talks to: the real one (signed-in calls to API Gateway) or, in the sample-data preview, the
// in-memory pretend API. Signing out (or a session that can't be refreshed) clears every cached answer, so the next
// person on this device never sees the previous person's data.

import { useQueryClient } from '@tanstack/react-query';
import { useMemo, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getConfig } from '../config';
import { closeWeek, createDemoState, createPreviewApi } from '../preview/preview-api';
import { IS_SAMPLE_BUILD } from '../sample-build';
import { ApiProvider } from './ApiContext';
import { createApiClient, type ApiClient } from './client';

export function ConnectedApi({ preview, children }: { preview: boolean; children: ReactNode }) {
  const { service, refresh } = useAuth();
  const queryClient = useQueryClient();
  const client = useMemo(
    () =>
      // Only in the dev server's sample mode and the demo build (D39); in the real app's builds this is false, so the
      // bundler drops the preview API and its sample data.
      preview && IS_SAMPLE_BUILD
        ? createSampleApi()
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

/**
 * The sample world for the dev server's sample mode, plus a hook the end-to-end tests use to end the week
 * (`window.__dropabopSample.closeWeek()`). Only in the sample and demo builds, never the real app's (D39).
 */
let sample: ApiClient | undefined;

function createSampleApi(): ApiClient {
  // One sample world per page load. React's development mode calls useMemo twice, and the test hook must reach the
  // same world the screens use.
  if (sample === undefined) {
    const state = createDemoState();
    (window as unknown as { __dropabopSample?: { closeWeek: () => void } }).__dropabopSample = {
      closeWeek: () => closeWeek(state),
    };
    sample = createPreviewApi(state);
  }
  return sample;
}
