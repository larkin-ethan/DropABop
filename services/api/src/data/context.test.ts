import { describe, expect, it } from 'vitest';
import type { DataContext } from './context';
import { transactWrite } from './context';
import { isTransactionConflictOnly } from './errors';

function cancelled(...codes: string[]) {
  return Object.assign(new Error('Transaction cancelled'), {
    name: 'TransactionCanceledException',
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}

/** A fake client whose send() fails with the given errors in order, then succeeds. */
function fakeContext(failures: Error[]): { ctx: DataContext; calls: () => number } {
  let calls = 0;
  const db = {
    send: () => {
      const failure = failures[calls];
      calls++;
      return failure === undefined ? Promise.resolve({}) : Promise.reject(failure);
    },
  };
  return { ctx: { db, tableName: 't' } as unknown as DataContext, calls: () => calls };
}

const noWait = () => Promise.resolve();

describe('isTransactionConflictOnly', () => {
  it('is true only for conflicts without condition failures', () => {
    expect(isTransactionConflictOnly(cancelled('None', 'TransactionConflict'))).toBe(true);
    expect(isTransactionConflictOnly(cancelled('ConditionalCheckFailed', 'TransactionConflict'))).toBe(false);
    expect(isTransactionConflictOnly(cancelled('ConditionalCheckFailed'))).toBe(false);
    expect(isTransactionConflictOnly(new Error('other'))).toBe(false);
  });
});

describe('transactWrite', () => {
  it('retries a transaction conflict and then succeeds', async () => {
    const { ctx, calls } = fakeContext([cancelled('TransactionConflict')]);
    await transactWrite(ctx, { TransactItems: [] }, noWait);
    expect(calls()).toBe(2);
  });

  it('never retries a condition failure (that’s a real answer, like "party full")', async () => {
    const failure = cancelled('ConditionalCheckFailed', 'None');
    const { ctx, calls } = fakeContext([failure]);
    await expect(transactWrite(ctx, { TransactItems: [] }, noWait)).rejects.toBe(failure);
    expect(calls()).toBe(1);
  });

  it('gives up after 3 attempts', async () => {
    const conflict = cancelled('TransactionConflict');
    const { ctx, calls } = fakeContext([conflict, conflict, conflict, conflict]);
    await expect(transactWrite(ctx, { TransactItems: [] }, noWait)).rejects.toBe(conflict);
    expect(calls()).toBe(3);
  });

  it('does not retry unrelated errors', async () => {
    const failure = new Error('network down');
    const { ctx, calls } = fakeContext([failure]);
    await expect(transactWrite(ctx, { TransactItems: [] }, noWait)).rejects.toBe(failure);
    expect(calls()).toBe(1);
  });
});
