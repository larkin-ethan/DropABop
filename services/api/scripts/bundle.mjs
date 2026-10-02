// Bundles the API into one file for Lambda: `node scripts/bundle.mjs <output-dir>` writes <output-dir>/index.mjs.
// `sam build` runs this through services/api/Makefile; `npm run build -w @sotd/api` runs it into dist/ for checking.

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const outDir = process.argv[2];
if (outDir === undefined) {
  console.error('Usage: node scripts/bundle.mjs <output-dir>');
  process.exit(1);
}

await build({
  entryPoints: [fileURLToPath(new URL('../src/lambda.ts', import.meta.url))],
  outfile: `${outDir}/index.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24', // matches the Lambda runtime (nodejs24.x)
  // The AWS SDK is bundled too, even though the runtime includes one: the runtime's copy is a fixed, older minor
  // version that depends on the region, so bundling guarantees the version our tests ran against.
  // docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html#nodejs-sdk-included (checked 2026-10-02)
  // Smaller upload and faster cold starts (roughly half the size); the source map keeps errors readable.
  minify: true,
  // Readable stack traces in CloudWatch (the template sets NODE_OPTIONS=--enable-source-maps).
  sourcemap: true,
  logLevel: 'warning',
});
