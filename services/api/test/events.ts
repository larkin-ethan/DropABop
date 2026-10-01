// Builds realistic API Gateway HTTP API (payload 2.0) events for handler tests, including the JWT claims shape
// that API Gateway's JWT authorizer passes to Lambda (requestContext.authorizer.jwt.claims).

import type { ApiEvent } from '../src/http/request';

export interface EventOptions {
  /** Cognito sub of the caller. Omit for an unauthenticated event. */
  userId?: string;
  /** Override or add claims (e.g. token_use: 'id'). */
  claims?: Record<string, string | number | boolean | string[]>;
  routeKey?: string;
  body?: unknown;
  rawBody?: string;
  isBase64Encoded?: boolean;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
}

export function apiEvent(options: EventOptions = {}): ApiEvent {
  const claims =
    options.userId === undefined && options.claims === undefined
      ? undefined
      : {
          sub: options.userId ?? '',
          token_use: 'access',
          client_id: 'test-client',
          iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TEST',
          ...options.claims,
        };

  const body = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));

  return {
    version: '2.0',
    routeKey: options.routeKey ?? 'POST /test',
    rawPath: '/test',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    queryStringParameters: options.queryStringParameters,
    pathParameters: options.pathParameters,
    body,
    isBase64Encoded: options.isBase64Encoded ?? false,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/test',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'test-request-id',
      routeKey: options.routeKey ?? 'POST /test',
      stage: '$default',
      time: '01/Oct/2026:12:00:00 +0000',
      timeEpoch: 1790000000000,
      authorizer: { principalId: '', integrationLatency: 0, jwt: { claims: claims ?? {}, scopes: [] } },
    },
  };
}

/** Parses a JSON response body. */
export function bodyOf(result: { body?: string }): unknown {
  return result.body === undefined ? undefined : JSON.parse(result.body);
}
