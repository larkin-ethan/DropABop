// The one error shape every API response uses (spec §30): a stable code the frontend can branch on,
// plus a friendly sentence it can show as-is. Technical details stay in server logs.

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'NOT_A_MEMBER',
  'NOT_HOST',
  'PARTY_FULL',
  'ALREADY_MEMBER',
  'INVALID_INVITE',
  'PARTY_PAUSED',
  'WEEKEND',
  'ALREADY_SUBMITTED_TODAY',
  'WEEK_CLOSED',
  'OWN_SONG',
  'SONG_NOT_IN_WEEK',
  'RESULTS_NOT_READY',
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    /** Shown to users directly, so it must be a friendly sentence with no technical detail. */
    message: string;
  };
}

export function apiError(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}
