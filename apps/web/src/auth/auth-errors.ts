// Turns Cognito/Amplify error names into sentences people understand (spec §30). Never shows raw error text.

const MESSAGES: Record<string, string> = {
  NotAuthorizedException: 'That email and password don’t match. Please try again.',
  UserNotFoundException: 'That email and password don’t match. Please try again.', // same message: don't reveal accounts
  UsernameExistsException: 'An account with this email already exists. Try signing in instead.',
  InvalidPasswordException:
    'Passwords need at least 8 characters, with upper- and lower-case letters and a number.',
  CodeMismatchException: 'That code isn’t right. Check the email and try again.',
  ExpiredCodeException: 'That code has expired. Ask for a new one.',
  LimitExceededException: 'Too many attempts. Please wait a few minutes and try again.',
  TooManyRequestsException: 'Too many attempts. Please wait a few minutes and try again.',
  TooManyFailedAttemptsException: 'Too many attempts. Please wait a few minutes and try again.',
  InvalidParameterException: 'Please check what you entered and try again.',
  EmptySignInUsername: 'Please enter your email.',
  EmptySignInPassword: 'Please enter your password.',
  EmptySignUpUsername: 'Please enter your email.',
  EmptySignUpPassword: 'Please enter a password.',
  NetworkError: 'We couldn’t reach the server. Check your connection and try again.',
};

const FALLBACK = 'Something went wrong. Please try again.';

export function friendlyAuthError(error: unknown): string {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  const message = error instanceof Error ? error.message : '';
  // Cognito's temporary lockout after 5 wrong passwords (P9.1) arrives as NotAuthorizedException with this message.
  if (name === 'NotAuthorizedException' && message.includes('Password attempts exceeded')) {
    return MESSAGES.TooManyFailedAttemptsException ?? FALLBACK;
  }
  return MESSAGES[name] ?? FALLBACK;
}

/** True when the account exists but the email hasn't been confirmed yet. */
export function isUnconfirmedError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'UserNotConfirmedException'
  );
}
