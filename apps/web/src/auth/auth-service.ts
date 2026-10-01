// Everything the app needs from sign-in, as one small interface (ADR-0008). Screens and the API client use this,
// never Amplify directly, so tests can pass a fake and the sample preview runs without AWS.

export type SignInResult =
  /** Signed in; tokens are available. */
  | { status: 'signedIn' }
  /** The account exists but the email code hasn't been entered yet. */
  | { status: 'needsConfirmation' };

export interface AuthService {
  /** The signed-in user's id (Cognito sub), or null if nobody is signed in. */
  getCurrentUserId: () => Promise<string | null>;
  /** A valid access token (refreshed automatically when needed), or null if signed out. */
  getAccessToken: (options?: { forceRefresh?: boolean }) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  resendSignUpCode: (email: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  confirmResetPassword: (email: string, code: string, newPassword: string) => Promise<void>;
}

/** For the sample-data preview (dev only): always signed in as the sample user, no network. */
export const previewAuthService: AuthService = {
  getCurrentUserId: () => Promise.resolve('me'),
  getAccessToken: () => Promise.resolve('preview-token'),
  signUp: () => Promise.resolve(),
  confirmSignUp: () => Promise.resolve(),
  resendSignUpCode: () => Promise.resolve(),
  signIn: () => Promise.resolve({ status: 'signedIn' }),
  signOut: () => Promise.resolve(),
  resetPassword: () => Promise.resolve(),
  confirmResetPassword: () => Promise.resolve(),
};
