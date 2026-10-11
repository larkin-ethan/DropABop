// Remembers that someone ticked "I agree" while signing up (P13.2a, ADR-0011).
// The account doesn't exist on our server until the first sign-in, so the agreement can't be saved at sign-up.
// The app saves it on that account's first signed-in visit instead (PrivacyGate), and doesn't ask a second time.
// It's tied to the new account's id, so on a shared computer it can never count as someone else's agreement.
// localStorage, because signing up, verifying the email, and signing in can span several tabs.

import { PRIVACY_POLICY_VERSION } from '@dropabop/shared';

const KEY = 'dropabop.privacyAgreedAtSignUp';

export function rememberSignUpAgreement(userId: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ userId, version: PRIVACY_POLICY_VERSION }));
  } catch {
    // Storage blocked: the app will simply ask once more after sign-in.
  }
}

/** True if this account agreed to the current version when it signed up in this browser. */
export function agreedAtSignUp(userId: string | null): boolean {
  if (userId === null) return false;
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as {
      userId?: unknown;
      version?: unknown;
    } | null;
    return saved?.userId === userId && saved.version === PRIVACY_POLICY_VERSION;
  } catch {
    return false; // missing, blocked, or not valid JSON
  }
}

export function forgetSignUpAgreement(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up.
  }
}
