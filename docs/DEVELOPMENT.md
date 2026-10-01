# Development guide

How to set up, run, and change Song of the Day on your own machine.

## Prerequisites

| Tool | Version | Needed for | Install |
|---|---|---|---|
| Node.js | 24 (see `.nvmrc`) | Everything. Matches the Lambda runtime `nodejs24.x` | https://nodejs.org (LTS installer) |
| Git | any recent | Source control | Comes with Xcode Command Line Tools |
| Docker Desktop or OrbStack | any recent | Integration tests (DynamoDB Local) from Phase 3 | https://www.docker.com / https://orbstack.dev |
| AWS CLI v2 + AWS SAM CLI | latest | Deploying from Phase 4 | AWS docs |

Docker is **only for local development and tests**. Nothing runs in containers in AWS.

## First-time setup

```bash
git clone <repo-url>
cd SOTD
npm install
npm run verify
```

`npm install` installs all workspaces at once (npm workspaces). `npm run verify` should end with
"Guardrails: all checks passed."

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

## Repository layout

```text
apps/web/            React frontend (Vite app created in P7.1)
services/api/        Lambda handlers, domain rules, data access, music providers
packages/shared/     Types + validation schemas used by both web and api (@sotd/shared)
infra/               AWS SAM templates (from P4.2)
docs/                Spec, roadmap, decisions, reference docs
scripts/             guardrails.sh and Claude Code hook scripts
.claude/             Claude Code settings, skills, and reviewer agent
```

### How the workspaces connect

- `@sotd/shared` points straight at its TypeScript source (`packages/shared/src/index.ts`). There's no build
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
- No `console.log`: from P5.1 use the structured logger, which redacts sensitive fields. `console.warn` and
  `console.error` are allowed in scripts.
- Imports of types use `import type { … }` (enforced by lint).
- See `CLAUDE.md` for the full rules, including the security rules.

## Version notes

- **TypeScript is pinned to 6.0.x** (`~6.0.3`). TypeScript 7 (the native compiler) exists, but typescript-eslint
  doesn't support it yet (it supports TypeScript up to 6.0, as of 2026-10-01). Revisit when typescript-eslint adds support.
- `@types/node` is pinned to the Node 24 line to match the Lambda runtime.
