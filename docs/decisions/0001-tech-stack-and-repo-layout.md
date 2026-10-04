# ADR-0001: Tech stack and repository layout

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec sections:** §3, §22, §35, §39

## Context

The spec fixes most of the stack (React/Vite/TS/TanStack Query/Tailwind, Cognito, HTTP API, Lambda,
DynamoDB). Open choices: backend language, package manager, repo layout, test tools.

## Decision

- **TypeScript everywhere** (frontend, Lambdas, shared code). One language for a beginner to learn;
  request/response types and validation schemas are shared, so the frontend and backend can't drift.
- **npm workspaces** monorepo — ships with Node, no extra tool to install.
  ```text
  apps/web/          React + Vite frontend (static build → S3/CloudFront)
  services/api/      Lambda handlers, domain logic, data access, music providers
  packages/shared/   Types + zod schemas used by both
  infra/             AWS SAM template(s)
  docs/              Spec, roadmap, ADRs, reference docs
  scripts/           Guardrails and Claude Code hook scripts
  ```
- **Validation:** zod (small, readable, works on both sides).
- **Tests:** Vitest (unit + integration), Testing Library (components), Playwright (E2E),
  DynamoDB Local in Docker for integration tests (**local development only** — nothing runs in
  containers in AWS).
- **Lambda:** latest Node.js LTS runtime AWS supports, arm64 (cheaper per ms), bundled with esbuild via SAM.

## Consequences

Docker is required on the developer's machine for integration tests and `sam local`, not in production.
