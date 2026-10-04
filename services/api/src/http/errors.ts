// HTTP status for each error code, and helpers to stop a request with a friendly error.

import type { ErrorCode } from '@dropabop/shared';
import { DomainError } from '../data/errors';
import type { RuleResult } from '../domain/messages';

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_A_MEMBER: 403,
  NOT_HOST: 403,
  OWN_SONG: 403,
  RESULTS_NOT_READY: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 400,
  INVALID_INVITE: 400,
  SONG_NOT_IN_WEEK: 400,
  PARTY_FULL: 409,
  ALREADY_MEMBER: 409,
  PARTY_PAUSED: 409,
  WEEKEND: 409,
  ALREADY_SUBMITTED_TODAY: 409,
  WEEK_CLOSED: 409,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 502,
  INTERNAL: 500,
};

/** Stops the request with an error response. Handlers throw these; the wrapper turns them into JSON. */
export function fail(code: ErrorCode, message: string): never {
  throw new DomainError(code, message);
}

/** Throws if a domain rule check didn't allow the action. Returns the success value otherwise. */
export function assertAllowed<T extends object>(result: RuleResult<T>): { ok: true } & T {
  if (!result.ok) {
    throw new DomainError(result.code, result.message);
  }
  return result;
}

export const GENERIC_ERROR_MESSAGE = 'Something went wrong on our side. Please try again in a moment.';
