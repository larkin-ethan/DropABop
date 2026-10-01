import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { createAmplifyAuthService } from './auth/amplify-auth-service';
import { previewAuthService, type AuthService } from './auth/auth-service';
import { getConfig } from './config';
import './index.css';

/**
 * Real sign-in when the AWS settings are present. In local development without them, fall back to the sample-data
 * preview (clearly labelled). A production build without settings fails loudly instead of pretending to work.
 */
function chooseAuthService(): { service: AuthService; preview: boolean } {
  try {
    return { service: createAmplifyAuthService(getConfig()), preview: false };
  } catch (error) {
    if (import.meta.env.DEV) {
      return { service: previewAuthService, preview: true };
    }
    throw error;
  }
}

const { service, preview } = chooseAuthService();
const queryClient = new QueryClient();

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider service={service}>
        <BrowserRouter>
          <App preview={preview} />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
