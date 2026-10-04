import { describe, expect, it } from 'vitest';
import { apiEvent } from '../../test/events';
import { runHandler, type Deps } from '../http/handler';
import { healthFn } from './health';

// Health uses no dependencies; an empty object proves it doesn't reach for any.
const noDeps = {} as Deps;

describe('GET /health', () => {
  it('returns ok for a signed-in caller', async () => {
    const response = await runHandler(
      healthFn,
      apiEvent({ userId: 'user-1', routeKey: 'GET /health' }),
      noDeps,
    );
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body ?? '')).toEqual({ status: 'ok' });
  });

  it('rejects an ID token', async () => {
    const event = apiEvent({ userId: 'user-1', claims: { token_use: 'id' }, routeKey: 'GET /health' });
    const response = await runHandler(healthFn, event, noDeps);
    expect(response.statusCode).toBe(401);
  });
});
