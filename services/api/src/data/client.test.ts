import { describe, expect, it } from 'vitest';
import { assertLocalEndpoint, createDocumentClient, getTableName } from './client';

describe('assertLocalEndpoint (spec §36: local work can never reach a real database)', () => {
  it.each(['http://localhost:8000', 'http://127.0.0.1:8000', 'http://[::1]:8000'])(
    'allows %s',
    (endpoint) => {
      expect(() => assertLocalEndpoint(endpoint)).not.toThrow();
    },
  );

  it.each([
    'https://dynamodb.us-east-1.amazonaws.com',
    'http://localhost.evil.example.com:8000',
    'http://10.0.0.5:8000',
    'not a url',
  ])('refuses %s', (endpoint) => {
    expect(() => assertLocalEndpoint(endpoint)).toThrow();
  });

  it('createDocumentClient refuses a non-local DYNAMODB_ENDPOINT', () => {
    expect(() =>
      createDocumentClient({ DYNAMODB_ENDPOINT: 'https://dynamodb.us-east-1.amazonaws.com' }),
    ).toThrow('must be localhost');
  });
});

describe('getTableName', () => {
  it('reads TABLE_NAME and fails loudly when missing', () => {
    expect(getTableName({ TABLE_NAME: 'sotd-dev' })).toBe('sotd-dev');
    expect(() => getTableName({})).toThrow('TABLE_NAME is not set');
  });
});
