// The wrapper every API handler uses. It gives handlers their dependencies, turns thrown errors into friendly JSON
// responses, and writes one structured log line per request.

import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { createDataContext, type DataContext } from '../data/context';
import { DomainError } from '../data/errors';
import { unavailableSongLookup, type SongLookup } from '../providers/song-lookup';
import { GENERIC_ERROR_MESSAGE, STATUS_BY_CODE } from './errors';
import { logger } from './logger';
import type { ApiEvent } from './request';

/** Everything a handler needs from the outside world. Tests pass fakes; production builds these once per container. */
export interface Deps {
  data: DataContext;
  /** The server clock. Handlers call it whenever they need "now" (never trust a client time). */
  now: () => Date;
  /** Random ids (UUIDs) for new records. */
  newId: () => string;
  /** Looks up song details from a music service (P6.3). */
  music: SongLookup;
}

export type ApiResult = APIGatewayProxyStructuredResultV2;
export type HandlerFn = (event: ApiEvent, deps: Deps) => Promise<ApiResult>;

let productionDeps: Deps | undefined;

/** Created on first use and reused while the Lambda container stays warm. */
function getProductionDeps(): Deps {
  productionDeps ??= {
    data: createDataContext(),
    now: () => new Date(),
    newId: () => randomUUID(),
    music: unavailableSongLookup, // replaced by the real provider registry in P6.3
  };
  return productionDeps;
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  // Responses are per-user and change often; never cache them.
  'cache-control': 'no-store',
};

export function json(statusCode: number, body: unknown): ApiResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export const ok = (body: unknown) => json(200, body);
export const created = (body: unknown) => json(201, body);
export const noContent = (): ApiResult => ({ statusCode: 204, headers: { 'cache-control': 'no-store' } });

function errorResponse(error: unknown): { response: ApiResult; expected: boolean } {
  if (error instanceof DomainError) {
    return {
      response: json(STATUS_BY_CODE[error.code], { error: { code: error.code, message: error.message } }),
      expected: true,
    };
  }
  return {
    response: json(500, { error: { code: 'INTERNAL', message: GENERIC_ERROR_MESSAGE } }),
    expected: false,
  };
}

/**
 * Runs a handler with the given dependencies, turning errors into responses and logging one line per request.
 * Logged: route, status, duration, request id, and the caller's user id if known. Not logged: the event, headers,
 * body, or token. Tests call this directly with fake dependencies.
 */
export async function runHandler(fn: HandlerFn, event: ApiEvent, deps: Deps): Promise<ApiResult> {
  const started = Date.now();
  const requestId = event.requestContext?.requestId;
  const route = event.routeKey;
  const sub = event.requestContext?.authorizer?.jwt?.claims?.sub;
  const userId = typeof sub === 'string' ? sub : undefined;

  let response: ApiResult;
  try {
    response = await fn(event, deps);
  } catch (error) {
    const { response: errorResult, expected } = errorResponse(error);
    response = errorResult;
    if (!expected) {
      logger.error('Unhandled error', { requestId, route, userId, error });
    }
  }

  logger.info('Request finished', {
    requestId,
    route,
    userId,
    status: response.statusCode,
    durationMs: Date.now() - started,
  });
  return response;
}

/**
 * Turns a handler into a Lambda entry point. Lambda calls it as (event, context); the context isn't needed, so only
 * the event is used, with production dependencies.
 */
export function createHandler(fn: HandlerFn) {
  return (event: ApiEvent): Promise<ApiResult> => runHandler(fn, event, getProductionDeps());
}
