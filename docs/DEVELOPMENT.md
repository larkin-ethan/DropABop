# Development guide

How to set up, run, and change Drop a Bop on your own machine.

## Prerequisites

| Tool | Version | Needed for | Install |
|---|---|---|---|
| Node.js | 24 (see `.nvmrc`) | Everything. Matches the Lambda runtime `nodejs24.x` | https://nodejs.org (LTS installer) |
| Git | any recent | Source control | Comes with Xcode Command Line Tools |
| npm | 11 (comes with Node 24) | Workspaces, scripts | Bundled with Node.js |
| Docker Desktop or OrbStack | any recent | Integration tests (DynamoDB Local) | https://www.docker.com / https://orbstack.dev |
| Google Chrome | any recent | End-to-end tests (`npm run e2e` drives your installed Chrome) | https://www.google.com/chrome |
| AWS CLI v2 + AWS SAM CLI | latest | Deploying | DEPLOYMENT.md §1 (Intel Macs: the `aws-sam-cli-macos-x86_64.pkg` installer from the same release page) |

Docker is **only for local development and tests**. Nothing runs in containers in AWS.

## First-time setup

```bash
git clone <repo-url>
cd <repo-folder>
npm install
npm run verify
```

`npm install` installs all workspaces at once (npm workspaces). `npm run verify` should end with
"Guardrails: all checks passed."

To see the website straight away without AWS, run it with sample data:

```bash
npm run dev -w @dropabop/web -- --mode sample --port 5174
```

To run it against your own dev stack instead, deploy the stack (DEPLOYMENT.md), create
`apps/web/.env.development.local` from `apps/web/.env.example` with the stack outputs, then `npm run dev`.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run verify` | Format check, lint, typecheck, unit tests, guardrails. **Run before every commit.** CI runs the same. |
| `npm test` | Unit tests once (Vitest). |
| `npm run test:watch` | Unit tests, re-running on save. |
| `npm run db:up` | Start DynamoDB Local in Docker (in-memory, port 8000, localhost only). |
| `npm run db:down` | Stop it (all local data disappears). |
| `npm run test:integration` | Integration tests against DynamoDB Local. Run `npm run db:up` first. The test table is recreated on every run. |
| `npm run lint` | ESLint (type-aware: catches un-awaited promises, unsafe `any`, etc.). |
| `npm run typecheck` | TypeScript in every workspace (no output files; it only checks). |
| `npm run format` | Auto-format with Prettier. Run this if `format:check` fails. |
| `npm run guardrails` | Project rule checks: forbidden AWS services, secrets, unsafe auth patterns, DB scans. |
| `npm run dev` | The website on http://localhost:5173, talking to the dev stack. Needs `apps/web/.env.development.local` (see DEPLOYMENT.md); without it the page fails loudly instead of quietly showing sample data. |
| `npm run dev -w @dropabop/web -- --mode sample --port 5174` | The website with **sample data** (no AWS, no sign-in): every screen backed by the in-memory pretend API in `apps/web/src/preview/preview-api.ts`. A yellow banner says it's a preview. Also in `.claude/launch.json` as `web-sample`. |
| `npm run e2e` | End-to-end test (Playwright): a real browser walks join → share → rate → week ends → results in sample mode, at 375 px and 1440 px. Uses your installed Google Chrome; starts its own dev server on port 5175. |
| `npm run e2e:dev` | The journey in a real browser against the **dev stack** (manual only): signs in through the real Cognito screens as the two test users in `.test-users.json`, invites, joins, shares and rates on weekdays, then leaves. Uses port 5173 (the API's allowed local origin), reusing your `npm run dev` if it's running. |
| `node scripts/smoke-dev.mjs` | Calls every API endpoint on the deployed dev stack with two throwaway users (after `aws login --profile dropabop-dev`). |

### How the website gets its data

- `apps/web/src/api/hooks.ts`: one TanStack Query hook per endpoint. The current week and its songs refresh every
  45 s while the tab is visible; stats are cached for 5 minutes; results for the session.
- `packages/shared/src/api-types.ts`: the response shapes. The API's handlers check their responses against them
  (`satisfies`), so the website and API can't drift.
- `apps/web/src/party/CurrentParty.tsx`: which of your parties the screens show (remembered on the device).
- Screen tests (`apps/web/src/screens/screens.test.tsx`) render the whole app against the pretend API.

## Repository layout

```text
apps/web/            React frontend (Vite)
services/api/        Lambda handlers, domain rules, data access, music providers
packages/shared/     Types + validation schemas used by both web and api (@dropabop/shared)
infra/               AWS SAM template (template.yaml, samconfig.toml)
e2e/                 Playwright browser tests (sample mode, and the dev-stack journey)
docs/                Spec, roadmap, decisions, reference docs
scripts/             guardrails.sh, Claude Code hooks, deploy.sh, deploy-web.sh, smoke-dev.mjs
.github/workflows/   ci.yml (checks on every pull request; deploys are scripts/deploy.sh, ADR-0009)
.claude/             Claude Code settings, skills, and reviewer agent
```

### How the workspaces connect

- `@dropabop/shared` points straight at its TypeScript source (`packages/shared/src/index.ts`). There's no build
  step: Vite (frontend) and esbuild (Lambdas) compile it as part of their own builds.
- TypeScript runs in "check only" mode (`noEmit`) with shared settings in `tsconfig.base.json`.

## Docker (DynamoDB Local)

Docker Desktop must be running. If `docker` isn't found in your terminal, Docker Desktop hasn't added its
command-line tool to your PATH. Either enable it in Docker Desktop → Settings → Advanced, or run this in the
terminal before the `db:` commands:

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

Safety: the API's database client and the integration test setup both **refuse any custom endpoint that isn't
localhost** (`assertLocalEndpoint` in `services/api/src/data/client.ts`). Local work can't reach a real table.

## Tests

- **Unit tests** sit next to the code: `thing.ts` → `thing.test.ts`. No network, no database.
- **Integration tests** are named `*.integration.test.ts` and run only with `npm run test:integration`.
- Domain rules (rounds, ratings, permissions, stats) must have tests for both allowed and rejected cases.

## Code conventions

- Plain functions and plain objects. Use a class only when there's a clear reason.
- Comments explain *why*, not *what*.
- No `console.log`: use the structured logger, which redacts sensitive fields. `console.warn` and
  `console.error` are allowed in scripts.
- Imports of types use `import type { … }` (enforced by lint).
- See `CLAUDE.md` for the full rules, including the security rules.

## Version notes

- **TypeScript is pinned to 6.0.x** (`~6.0.3`). TypeScript 7 (the native compiler) exists, but typescript-eslint
  doesn't support it yet (it supports TypeScript up to 6.0, as of 2026-10-01). Revisit when typescript-eslint adds support.
- `@types/node` is pinned to the Node 24 line to match the Lambda runtime.

## The AWS region

Everything is in **us-east-2 (Ohio)**. If you deploy to another region, change it in all of these:
`infra/samconfig.toml`, `scripts/deploy-web.sh` (`REGION`),
`scripts/smoke-dev.mjs`, and the `VITE_AWS_REGION` value in `apps/web/.env.development.local`.
