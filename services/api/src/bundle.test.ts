// Builds the real Lambda bundle and loads it in a plain Node.js ES-module process, the way the Lambda runtime does.
// P4.3 found a bundle that loaded fine in tests but failed on Lambda ("Dynamic require of node:https"): Vitest and
// `node -e` both provide a global `require`, Lambda's ES-module loader doesn't. So this runs a separate process.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { apiEvent } from '../test/events';

const outDir = mkdtempSync(join(tmpdir(), 'dropabop-bundle-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('Lambda bundle (scripts/bundle.mjs)', () => {
  it('loads as an ES module without a global require and answers /health', () => {
    execFileSync('node', [new URL('../scripts/bundle.mjs', import.meta.url).pathname, outDir]);

    const event = JSON.stringify(apiEvent({ userId: 'user-1', routeKey: 'GET /health' }));
    const script = `
      const bundle = await import(${JSON.stringify(join(outDir, 'index.mjs'))});
      const response = await bundle.healthHandler(${event});
      process.stdout.write(String(response.statusCode));
    `;
    // --input-type=module: the script is an ES module, so nothing defines `require` for the bundle.
    // TABLE_NAME: loading the bundle creates the DynamoDB client (no network calls).
    const status = execFileSync('node', ['--input-type=module', '-e', script], {
      encoding: 'utf8',
      env: { ...process.env, TABLE_NAME: 'bundle-test' },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    // The handler's log line is printed first; the status code is the last thing written.
    expect(status.trim().endsWith('200')).toBe(true);
  }, 30_000);
});
