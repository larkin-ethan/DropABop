// Turning DynamoDB's technical failures into the app's friendly errors (spec §30).
// A lost race (e.g. two "share today's song" taps at once) ends up as the same message the rule check would give.

import type { ErrorCode } from '@dropabop/shared';

/** An expected, user-facing failure. Handlers turn it into an API error response (P5.1). */
export class DomainError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

function errorName(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string'
    ? error.name
    : undefined;
}

/** A single-item write's condition wasn't met. */
export function isConditionalCheckFailed(error: unknown): boolean {
  return errorName(error) === 'ConditionalCheckFailedException';
}

/**
 * For a cancelled transaction, which items failed their condition (by position in the TransactItems list).
 * Returns null if the error isn't a cancelled transaction.
 */
export function failedTransactionItems(error: unknown): number[] | null {
  if (errorName(error) !== 'TransactionCanceledException') {
    return null;
  }
  const reasons =
    typeof error === 'object' &&
    error !== null &&
    'CancellationReasons' in error &&
    Array.isArray(error.CancellationReasons)
      ? (error.CancellationReasons as { Code?: string }[])
      : [];
  return reasons.flatMap((reason, index) => (reason.Code === 'ConditionalCheckFailed' ? [index] : []));
}

/** True when a cancelled transaction failed only because of conflicts with other transactions (no condition failures). */
export function isTransactionConflictOnly(error: unknown): boolean {
  if (errorName(error) !== 'TransactionCanceledException') {
    return false;
  }
  const reasons = (error as { CancellationReasons?: { Code?: string }[] }).CancellationReasons ?? [];
  const codes = reasons.map((r) => r.Code ?? 'None');
  return codes.includes('TransactionConflict') && !codes.includes('ConditionalCheckFailed');
}
