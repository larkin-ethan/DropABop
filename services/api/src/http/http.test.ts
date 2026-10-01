import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { castVoteRequestSchema } from '@sotd/shared';
import { apiEvent, bodyOf } from '../../test/events';
import type { DataContext } from '../data/context';
import { DomainError } from '../data/errors';
import { assertAllowed, STATUS_BY_CODE } from './errors';
import { ok, runHandler, type Deps } from './handler';
import { logger, redact } from './logger';
import { getAuthenticatedUser, parseBody, parseQuery, pathId } from './request';

const USER = '5f0c9a3e-1b2d-4c5e-8f9a-0b1c2d3e4f5a';
const deps: Deps = {
  data: {} as DataContext,
  now: () => new Date('2026-10-07T17:00:00Z'),
  newId: () => '00000000-0000-4000-8000-000000000000',
  music: { getSong: () => Promise.resolve(null) },
};

/** Captures everything written to stdout/stderr during a test. */
function captureOutput() {
  const lines: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  return lines;
}

afterEach(() => vi.restoreAllMocks());

describe('getAuthenticatedUser (spec §24: identity only from verified claims)', () => {
  it('returns the Cognito sub from the verified access-token claims', () => {
    expect(getAuthenticatedUser(apiEvent({ userId: USER }))).toEqual({ userId: USER });
  });

  it('ignores any userId in the body, path, or query', () => {
    const event = apiEvent({
      userId: USER,
      body: { userId: 'someone-else' },
      pathParameters: { userId: 'someone-else' },
      queryStringParameters: { userId: 'someone-else' },
    });
    expect(getAuthenticatedUser(event).userId).toBe(USER);
  });

  it('rejects requests without verified claims', () => {
    expect(() => getAuthenticatedUser(apiEvent())).toThrow(DomainError);
  });

  it('rejects ID tokens (token_use must be "access")', () => {
    const error = (() => {
      try {
        getAuthenticatedUser(apiEvent({ userId: USER, claims: { token_use: 'id' } }));
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('UNAUTHENTICATED');
  });

  it('rejects a malformed sub', () => {
    expect(() => getAuthenticatedUser(apiEvent({ claims: { sub: 'bad#sub' } }))).toThrow(DomainError);
  });
});

describe('parseBody', () => {
  it('parses and validates JSON with a shared schema', () => {
    expect(parseBody(apiEvent({ body: { rating: 8 } }), castVoteRequestSchema)).toEqual({ rating: 8 });
  });

  it('decodes base64 bodies', () => {
    const event = apiEvent({
      rawBody: Buffer.from('{"rating":5}').toString('base64'),
      isBase64Encoded: true,
    });
    expect(parseBody(event, castVoteRequestSchema)).toEqual({ rating: 5 });
  });

  it('turns schema failures into the schema’s friendly message', () => {
    expect(() => parseBody(apiEvent({ body: { rating: 11 } }), castVoteRequestSchema)).toThrow(
      'Ratings are whole numbers from 1 to 10.',
    );
  });

  it('rejects unreadable JSON and oversized bodies', () => {
    expect(() => parseBody(apiEvent({ rawBody: '{not json' }), castVoteRequestSchema)).toThrow(
      'couldn’t be read',
    );
    expect(() =>
      parseBody(apiEvent({ rawBody: JSON.stringify({ x: 'a'.repeat(11 * 1024) }) }), z.unknown()),
    ).toThrow('too large');
  });
});

describe('parseQuery and pathId', () => {
  it('validates query parameters', () => {
    const schema = z.strictObject({ q: z.string().min(1) });
    expect(parseQuery(apiEvent({ queryStringParameters: { q: 'hi' } }), schema)).toEqual({ q: 'hi' });
    expect(() => parseQuery(apiEvent({ queryStringParameters: { q: '' } }), schema)).toThrow(DomainError);
  });

  it('accepts safe ids and treats anything else as not found', () => {
    expect(pathId(apiEvent({ pathParameters: { partyId: USER } }), 'partyId')).toBe(USER);
    for (const bad of ['a#b', '../x', '']) {
      expect(() => pathId(apiEvent({ pathParameters: { partyId: bad } }), 'partyId')).toThrow(
        'couldn’t find',
      );
    }
    expect(() => pathId(apiEvent(), 'partyId')).toThrow('couldn’t find');
  });
});

describe('redact (spec §33: never log secrets)', () => {
  it('removes sensitive fields at any depth, case-insensitively', () => {
    const redacted = redact({
      userId: USER,
      Authorization: 'Bearer abc',
      nested: { accessToken: 'x', deeper: [{ password: 'p', ok: 1 }] },
      email: 'person@example.com',
      body: '{"rating":8}',
    });
    expect(redacted).toEqual({
      userId: USER,
      Authorization: '[REDACTED]',
      nested: { accessToken: '[REDACTED]', deeper: [{ password: '[REDACTED]', ok: 1 }] },
      email: '[REDACTED]',
      body: '[REDACTED]',
    });
  });

  it('logger output is redacted JSON', () => {
    const lines = captureOutput();
    logger.info('hello', { userId: USER, refresh_token: 'secret-value' });
    const entry = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: 'info',
      message: 'hello',
      userId: USER,
      refresh_token: '[REDACTED]',
    });
    expect(lines.join('')).not.toContain('secret-value');
  });
});

describe('runHandler', () => {
  it('returns the handler’s response and logs one summary line without the body or token', async () => {
    const lines = captureOutput();
    const event = apiEvent({
      userId: USER,
      body: { secretish: 'do-not-log-me' },
      claims: { token_use: 'access' },
    });
    const result = await runHandler(() => Promise.resolve(ok({ hello: 'world' })), event, deps);

    expect(result.statusCode).toBe(200);
    expect(result.headers).toMatchObject({ 'cache-control': 'no-store' });
    expect(bodyOf(result)).toEqual({ hello: 'world' });
    const output = lines.join('');
    expect(output).toContain('"status":200');
    expect(output).toContain(USER);
    expect(output).not.toContain('do-not-log-me');
  });

  it('turns a DomainError into its status and friendly message', async () => {
    captureOutput();
    const result = await runHandler(
      () => Promise.reject(new DomainError('PARTY_FULL', 'This party is full.')),
      apiEvent({ userId: USER }),
      deps,
    );
    expect(result.statusCode).toBe(409);
    expect(bodyOf(result)).toEqual({ error: { code: 'PARTY_FULL', message: 'This party is full.' } });
  });

  it('hides unexpected errors behind a generic message, but logs the details', async () => {
    const lines = captureOutput();
    const result = await runHandler(
      () => Promise.reject(new Error('ConditionalCheckFailedException: internal details')),
      apiEvent({ userId: USER }),
      deps,
    );
    expect(result.statusCode).toBe(500);
    const body = bodyOf(result) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL');
    expect(body.error.message).not.toContain('ConditionalCheck');
    expect(lines.join('')).toContain('internal details'); // in the server log, not the response
  });

  it('assertAllowed passes successes through and throws denials', () => {
    expect(assertAllowed({ ok: true, day: 'MON' })).toEqual({ ok: true, day: 'MON' });
    expect(() => assertAllowed({ ok: false, code: 'OWN_SONG', message: 'nope' })).toThrow(DomainError);
  });

  it('maps every error code to an HTTP status', () => {
    for (const status of Object.values(STATUS_BY_CODE)) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });
});
