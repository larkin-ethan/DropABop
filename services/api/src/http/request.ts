// Reading requests safely: who's calling (from the verified token only), the JSON body, path ids, and query strings.

import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import type { ZodType } from 'zod';
import { isSafeId } from '../data/keys';
import { fail } from './errors';

export type ApiEvent = APIGatewayProxyEventV2WithJWTAuthorizer;

export interface AuthenticatedUser {
  /** Cognito `sub`: the user's permanent id. */
  userId: string;
}

/**
 * The caller's identity, taken ONLY from the claims API Gateway has already verified (signature, issuer, client,
 * expiry). Never from the body, path, or query (spec §24).
 *
 * Also requires `token_use === "access"`: Cognito ID tokens pass the same signature and issuer checks, but are meant
 * for the app itself, not for calling the API.
 */
export function getAuthenticatedUser(event: ApiEvent): AuthenticatedUser {
  const claims = event.requestContext.authorizer?.jwt?.claims ?? {};
  const sub = claims.sub;
  if (typeof sub !== 'string' || !isSafeId(sub) || claims.token_use !== 'access') {
    fail('UNAUTHENTICATED', 'Please sign in again.');
  }
  return { userId: sub };
}

/** Request bodies are small JSON objects; anything bigger is a mistake or abuse. */
const MAX_BODY_BYTES = 10 * 1024;

/** Parses and validates the JSON body against a shared zod schema. Bad input becomes a 400 with a friendly message. */
export function parseBody<T>(event: ApiEvent, schema: ZodType<T>): T {
  const raw = event.body ?? '';
  const text = event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw;
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    fail('VALIDATION_FAILED', 'That request is too large.');
  }
  let json: unknown;
  try {
    json = text === '' ? {} : JSON.parse(text);
  } catch {
    fail('VALIDATION_FAILED', 'That request couldn’t be read. Please try again.');
  }
  return validate(json, schema);
}

/** Validates query-string parameters against a schema. */
export function parseQuery<T>(event: ApiEvent, schema: ZodType<T>): T {
  return validate(event.queryStringParameters ?? {}, schema);
}

/** A path parameter that must be one of our ids (UUIDs etc.). Anything else is "not found", revealing nothing. */
export function pathId(event: ApiEvent, name: string): string {
  const value = event.pathParameters?.[name];
  if (value === undefined || !isSafeId(value)) {
    fail('NOT_FOUND', 'We couldn’t find that.');
  }
  return value;
}

/** A path parameter that isn't a plain id (e.g. a roundId like `<partyId>.<date>`, or an invite code). */
export function pathParam(event: ApiEvent, name: string): string {
  const value = event.pathParameters?.[name];
  if (value === undefined || value.length === 0 || value.length > 100) {
    fail('NOT_FOUND', 'We couldn’t find that.');
  }
  return value;
}

function validate<T>(input: unknown, schema: ZodType<T>): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    // Our schemas carry friendly messages; show the first one.
    fail(
      'VALIDATION_FAILED',
      result.error.issues[0]?.message ?? 'Please check what you entered and try again.',
    );
  }
  return result.data;
}
