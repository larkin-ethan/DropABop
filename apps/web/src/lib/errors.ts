// Turns any failure into a sentence that's safe to show (spec §30). API errors already carry a friendly message.

import { ApiError } from '../api/client';

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : GENERIC_ERROR;
}

export function errorCode(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null;
}
