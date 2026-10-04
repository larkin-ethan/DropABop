# Drop a Bop

A private social music app for small groups (up to about 20 friends). Every weekday (Monday–Friday), each member of a
party **shares one song**. All week, everyone listens and **rates the week's songs 1–10** (songs stay anonymous, and
ratings stay hidden). When Sunday ends, ratings lock and the group sees the **weekly results**: the ranking, each
day's **Bop of the Day**, and stats on everyone's taste.

It runs on AWS serverless services at (or very near) **$0/month** at this scale.

## Contents

1. [What the app does](#what-the-app-does)
2. [Tech stack](#tech-stack)
3. [Install](#install)
4. [Run it locally](#run-it-locally)
5. [How sign-in works](#how-sign-in-works)
6. [How the AWS deployment works](#how-the-aws-deployment-works)
7. [How music services work](#how-music-services-work)
8. [Environment variables](#environment-variables)
9. [Running the tests](#running-the-tests)
10. [Deploying](#deploying)
11. [Watching AWS costs](#watching-aws-costs)
12. [How this project is built](#how-this-project-is-built)

## What the app does

- **Parties:** private and invite-only (a link or a code like `SONG-7K4P`). Anyone can create one; up to 5 per
  person.
- **Each weekday:** share one song (search Apple Music's catalog, or paste a link from Apple Music, Spotify, or
  YouTube Music). You can't change it afterwards.
- **All week:** listen through "Apple Music / Spotify / YouTube Music" links and rate others' songs 1–10. You can
  change a rating until Sunday 11:59 pm (in the party's timezone). You never rate your own song.
- **After Sunday:** results unlock: every song ranked, each day's Bop of the Day, rating spreads, and your rating next
  to the group's. Who shared each song is revealed then (or during the week, if the host turns that on).
- **Stats & leaderboards** from finished weeks, each showing what it's based on (or "Not enough data yet").
- **Profiles:** display name, avatar colour or photo, and a preferred music app.

The rules in detail: [docs/PRODUCT_DECISIONS.md](docs/PRODUCT_DECISIONS.md). The original spec:
[docs/SPEC.md](docs/SPEC.md). Stats definitions: [docs/STATISTICS.md](docs/STATISTICS.md).

## Tech stack

| Part | Built with |
|---|---|
| Website | React 19, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query (`apps/web`) |
| API | Node.js 24 Lambda functions, one per route, TypeScript (`services/api`) |
| Shared rules | Types and zod validation schemas used by both (`packages/shared`) |
| Data | DynamoDB, one table ([docs/DATABASE.md](docs/DATABASE.md)) |
| Sign-in | Amazon Cognito, through the AWS Amplify library (sign-in only) |
| Hosting | S3 + CloudFront (website), API Gateway HTTP API (API) |
| Infrastructure | AWS SAM (`infra/template.yaml`), deployed by GitHub Actions |
| Tests | Vitest (unit + integration with DynamoDB Local), Playwright (end-to-end) |

How it fits together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Why each choice:
[docs/decisions/](docs/decisions/).

## Install

You need Node.js 24 and npm 11; Docker Desktop for the database tests; Google Chrome for the browser tests; the AWS
CLI and SAM CLI only for deploying.
Full list and versions: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

```bash
npm install
```

```bash
npm run verify
```

`npm run verify` should end with "Guardrails: all checks passed."

## Run it locally

**With sample data** (no AWS needed; a yellow banner says it's a preview):

```bash
npm run dev -w @dropabop/web -- --mode sample --port 5174
```

**Against your dev stack** (after deploying it): create `apps/web/.env.development.local` from
`apps/web/.env.example` with the stack's outputs, then:

```bash
npm run dev
```

Open http://localhost:5173.

## How sign-in works

- Accounts live in **Amazon Cognito**: email and password, with an emailed code to verify. The password itself is
  never sent: the website signs in with SRP (it proves you know the password). Cognito briefly locks an account after
  5 wrong passwords.
- After signing in, the website holds a 1-hour **access token** (renewed automatically for 30 days) and sends it with
  every API call in the `Authorization` header, never in a link.
- **API Gateway** checks every token (signature, issuer, app, expiry, and that it's an access token) before any code
  runs. The API then takes who you are only from that verified token, never from anything you send, and checks you're
  a member of the party (and the host, where needed).
- Details and the threat model: [docs/SECURITY.md](docs/SECURITY.md); token storage: ADR-0008.

## How the AWS deployment works

One SAM template (`infra/template.yaml`) defines everything: the DynamoDB table, Cognito user pool, the HTTP API with
its token check and rate limits, 23 Lambda functions (one per route, each allowed only the database actions it
needs), logs kept 14 days (30 in prod), failure alarms that email you, a $5 budget alert, and the website (private S3
bucket behind CloudFront with security headers). There are two copies, **`dropabop-dev`** and **`dropabop-prod`**,
each with its own data and accounts. Nothing runs (or bills) while idle: weeks open and close lazily when someone
uses the app.

Resource list: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Step-by-step: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## How music services work

- **Search and song details** come from Apple's iTunes Search API: free, no key, no account (ADR-0007).
- **Listen links:** Apple Music (exact link), plus Spotify and YouTube Music: the sharer's own pasted link when they
  gave one, otherwise a search on that app. Your preferred app's link comes first.
- We don't call the Spotify or YouTube APIs: their terms forbid how this app would use them, and their costs or
  quotas don't fit. Pasted Spotify / YouTube Music links are kept and attached to the song you pick.
- Full research with sources: [docs/MUSIC_PROVIDERS.md](docs/MUSIC_PROVIDERS.md).

## Environment variables

The website reads four **public** values (they end up in the JavaScript every visitor downloads, so they are never
secrets). Copy `apps/web/.env.example` to `apps/web/.env.development.local` (git-ignored) and fill them in from the
stack outputs:

| Variable | What it is | Stack output |
|---|---|---|
| `VITE_API_URL` | The API's address | `ApiUrl` |
| `VITE_COGNITO_USER_POOL_ID` | The user pool | `UserPoolId` |
| `VITE_COGNITO_CLIENT_ID` | The website's app client | `UserPoolClientId` |
| `VITE_AWS_REGION` | The AWS region (`us-east-2`) | `Region` |

The API's settings (table name and so on) are set by the template; there are no secret keys anywhere in this app.
The deploy workflow uses GitHub variables `AWS_DEPLOY_ROLE_ARN`, `AWS_CLOUDFORMATION_ROLE_ARN` and secret
`ALERT_EMAIL` ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §6).

## Running the tests

| Command | What it runs |
|---|---|
| `npm run verify` | Format, lint, typecheck, unit tests, and guardrail checks. Run before every commit. |
| `npm test` | Unit tests only (domain rules, screens against a pretend API, template checks). |
| `npm run db:up` then `npm run test:integration` | API tests against DynamoDB Local in Docker. |
| `npm run e2e` | A real browser walks join → share → rate → week ends → results, at phone and desktop widths. |
| `node scripts/smoke-dev.mjs`, then `npm run e2e:dev` | Every endpoint, then the browser journey, against your deployed dev stack (manual; the first creates the test users the second needs). |

GitHub runs the first four on every pull request ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

## Deploying

- **Automatic** (once set up, [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §6): every push to `main` deploys dev and the
  dev website; prod deploys the same commit after you approve it in GitHub. GitHub uses short-lived OpenID Connect
  credentials; no AWS keys are stored anywhere.
- **By hand (dev):** `npm install` at the repo root, then from `infra/`, `sam build --config-env dev`, then `sam
  deploy --config-env dev --profile dropabop-dev`, then `bash scripts/deploy-web.sh` for the website. The **first**
  deploy also needs your alert email (it's kept out of this public repo): see
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §4a. Prod is only deployed through the approved workflow.
- **First-time AWS setup** (account, sign-in, budget, region): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §1–2.

## Watching AWS costs

Expected cost at 10–20 people: **well under $1/month**. Nothing here is guaranteed free forever, so:

- **Budget alert:** `dropabop-monthly` ($5, created by the dev stack) emails at 50%, 80%, 100% of actual and 100% of
  forecast spend. If your account offers one, set a spend limit too.
- **Where to look:** AWS console → Billing and Cost Management → Home (month to date and forecast), Bills (per
  service), Cost Explorer (by day), Free Tier (how much allowance is used).
- **What can charge:** a table of every service, its free allowance and expected cost:
  [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §4.
- **Guardrails** block idle-billing services (servers, NAT gateways, provisioned capacity) from ever being added
  without a written decision. **Shutting everything down:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) §5.

## How this project is built

Task by task with Claude Code, inside guardrails that enforce the spec: [docs/ROADMAP.md](docs/ROADMAP.md) (tasks and
"Done when" criteria; `[HUMAN]` tasks are the owner's), [docs/PROGRESS.md](docs/PROGRESS.md) (status and log),
[CLAUDE.md](CLAUDE.md) (rules the AI follows), [scripts/guardrails.sh](scripts/guardrails.sh) (automatic checks). In
Claude Code: `/next-task` does the next task, `/verify` runs all checks, `/aws-change` is required before any new AWS
service.
