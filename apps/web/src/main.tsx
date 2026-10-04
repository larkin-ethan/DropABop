import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { ConnectedApi } from './api/ConnectedApi';
import { AuthProvider } from './auth/AuthContext';
import { createAmplifyAuthService } from './auth/amplify-auth-service';
import { previewAuthService, type AuthService } from './auth/auth-service';
import { getConfig } from './config';
import './index.css';

/**
 * The sample-data preview runs only when explicitly asked for (`--mode sample` on the dev server). Otherwise the app
 * needs its AWS settings and fails loudly without them, so a misconfigured build can never quietly serve fake data.
 */
function chooseAuthService(): { service: AuthService; preview: boolean } {
  if (import.meta.env.DEV && import.meta.env.MODE === 'sample') {
    return { service: previewAuthService, preview: true };
  }
  return { service: createAmplifyAuthService(getConfig()), preview: false };
}

const { service, preview } = chooseAuthService();
const queryClient = new QueryClient({
  defaultOptions: {
    // One quick retry smooths over a dropped connection; friendly errors show after that (spec §30).
    queries: { retry: 1 },
  },
});

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider service={service}>
        <ConnectedApi preview={preview}>
          <BrowserRouter>
            <App preview={preview} />
          </BrowserRouter>
        </ConnectedApi>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
