// Dependencies for handler integration tests: the real DynamoDB Local table, plus a controllable clock.

import { randomUUID } from 'node:crypto';
import type { Deps } from '../src/http/handler';
import { testContext } from './fixtures';

export interface TestDeps extends Deps {
  /** Moves the fake clock. */
  setNow: (iso: string) => void;
}

export function testDeps(startIso = '2026-10-07T17:00:00.000Z'): TestDeps {
  let current = new Date(startIso);
  return {
    data: testContext(),
    now: () => new Date(current),
    newId: () => randomUUID(),
    setNow: (iso) => {
      current = new Date(iso);
    },
  };
}
