// The real AuthService, backed by Amplify JS v6 talking to our Cognito user pool (ADR-0008).
// Function names and sign-in steps were checked against the installed @aws-amplify/auth types.

import { Amplify } from 'aws-amplify';
import {
  confirmResetPassword,
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
} from 'aws-amplify/auth';
import type { AppConfig } from '../config';
import type { AuthService } from './auth-service';

export function createAmplifyAuthService(config: AppConfig): AuthService {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.cognitoUserPoolId,
        userPoolClientId: config.cognitoClientId,
        loginWith: { email: true },
        signUpVerificationMethod: 'code',
        userAttributes: { email: { required: true } },
      },
    },
  });

  return {
    async getCurrentUserId() {
      try {
        return (await getCurrentUser()).userId;
      } catch {
        return null; // not signed in
      }
    },

    async getAccessToken(options) {
      try {
        const session = await fetchAuthSession({ forceRefresh: options?.forceRefresh ?? false });
        return session.tokens?.accessToken?.toString() ?? null;
      } catch {
        return null;
      }
    },

    async signUp(email, password) {
      await signUp({ username: email, password, options: { userAttributes: { email } } });
    },

    async confirmSignUp(email, code) {
      await confirmSignUp({ username: email, confirmationCode: code });
    },

    async resendSignUpCode(email) {
      await resendSignUpCode({ username: email });
    },

    async signIn(email, password) {
      const result = await signIn({ username: email, password }); // SRP by default
      if (result.nextStep.signInStep === 'CONFIRM_SIGN_UP') {
        return { status: 'needsConfirmation' };
      }
      if (result.nextStep.signInStep === 'DONE') {
        return { status: 'signedIn' };
      }
      // MFA and other challenges aren't enabled on our user pool (P4.2), so anything else is unexpected.
      throw new Error(`Unsupported sign-in step: ${result.nextStep.signInStep}`);
    },

    async signOut() {
      await signOut();
    },

    async resetPassword(email) {
      await resetPassword({ username: email });
    },

    async confirmResetPassword(email, code, newPassword) {
      await confirmResetPassword({ username: email, confirmationCode: code, newPassword });
    },
  };
}
