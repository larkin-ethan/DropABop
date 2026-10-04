// GET /health (docs/API.md → Health). Proves the API, its JWT authorizer, and Lambda are wired up. It sits behind
// the authorizer like every other route, so calling it without a token returns 401 from API Gateway.

import { createHandler, ok, type HandlerFn } from '../http/handler';
import { getAuthenticatedUser } from '../http/request';

/** Deliberately touches nothing else (no database, no providers), so it can't fail for an unrelated reason. */
export const healthFn: HandlerFn = (event) => {
  getAuthenticatedUser(event); // rejects ID tokens, like every other route
  return Promise.resolve(ok({ status: 'ok' }));
};

export const healthHandler = createHandler(healthFn);
