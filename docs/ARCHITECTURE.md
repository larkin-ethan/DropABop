# Architecture

How Drop a Bop is put together. Everything AWS-side is defined in one file, `infra/template.yaml` (AWS SAM,
ADR-0002), and deployed twice: `dropabop-dev` and `dropabop-prod`, each with its own table, user pool, and API (spec §36).

```
Browser (React app, apps/web)
   │  1. sign up / sign in (SRP)            ┌──────────────────────────────┐
   ├──────────────────────────────────────▶ │ Cognito user pool + web client│
   │  ◀── access token (1 h) + refresh (30 d)└──────────────────────────────┘
   │
   │  2. HTTPS + Authorization: Bearer <access token>
   ▼
API Gateway HTTP API ── JWT authorizer (issuer, client id, expiry, scope) ── 401 if invalid
   │
   ▼  one Lambda function per route (Node.js 24, arm64), all from one bundle
Lambda ──▶ DynamoDB (single table)         Lambda ──▶ iTunes Search API (song search only)
```

There is no server that runs all the time, no scheduler, and no real-time connection: weeks open and close lazily
when someone makes a request (ADR-0003), and the website polls for new songs.

## AWS resources (P4.2, dev and prod)

| Resource | Type | Settings that matter | Bills when |
|---|---|---|---|
| `Table` | DynamoDB table | On-demand, keys `PK`/`SK`, no indexes; throughput caps (dev 50 read / 25 write per second, prod 100 / 50); prod: point-in-time recovery + deletion protection; kept if the stack is deleted | Per request + storage over 25 GB (ADR-0005) |
| `UserPool` | Cognito user pool | Email sign-in, email code verification, password ≥ 8 with upper/lower/number, Essentials plan; prod: deletion protection; kept if the stack is deleted | Over 10,000 monthly active users |
| `WebClient` | Cognito app client | Public (no secret), SRP + refresh token only, user-existence errors hidden, token revocation on | Free |
| `HttpApi` | API Gateway HTTP API | JWT authorizer on every route (Cognito issuer, audience = `WebClient`, scope `aws.cognito.signin.user.admin` so ID tokens are refused); CORS for one origin; rate limits per route (default 25 req/s, burst 50; tighter on search, invites, and writes: docs/API.md → Rate limits) | Per request |
| 23 × `…Function` | Lambda | Node.js 24, arm64, 256 MB, 10 s timeout; one per route in `docs/API.md` | Per request + duration |
| 23 × `…FunctionRole` | IAM role (created by SAM) | Each function may only use the table actions its handler needs (never Scan); the iTunes and health functions get no table access | Free |
| `ApiLogGroup` | CloudWatch log group | `/dropabop/<stage>/api`, shared by all functions; kept 14 days (dev) / 30 days (prod) | Log volume + storage |
| `AlertTopic` + `AlertEmailSubscription` | SNS topic + email subscription | `dropabop-<stage>-alerts`; the email (parameter `AlertEmail`, not in the repo) must click AWS's confirmation link | Per message (a handful a month) |
| 4 × alarm | CloudWatch alarms | Lambda crashes ≥ 5 / 5 min, API 5xx ≥ 5 / 5 min, any DynamoDB read or write throttling; quiet when there's no traffic | $0.10/alarm metric/month beyond 10 free (we use 4 per stage) |
| `MonthlyBudget` (dev stack only: `CreateBudget=true`) | AWS Budget | `dropabop-monthly`, $5/month, emails at 50/80/100% actual and 100% forecast; account-wide | Free (no budget actions) |

Not yet in the template: website hosting with S3 + CloudFront (P9.2), and the GitHub
deploy role (P11.1).

Deploy-time only: SAM keeps uploaded code in a small S3 bucket it manages (`resolve_s3`), outside this stack.

## Code layout

| Path | What |
|---|---|
| `apps/web` | React website (Vite, TanStack Query, Amplify auth only: ADR-0008) |
| `packages/shared` | Types and zod schemas used by both the website and the API |
| `services/api/src/handlers` | One file per area; each exports `<name>Handler` (the Lambda entry point) |
| `services/api/src/lambda.ts` | The bundle's entry: re-exports every handler. Template: `Handler: index.<name>` |
| `services/api/src/domain` | Rules with no I/O (weeks, results, stats); unit-tested |
| `services/api/src/data` | DynamoDB access (keys and queries in `docs/DATABASE.md`) |
| `services/api/Makefile`, `scripts/bundle.mjs` | How `sam build` bundles the API with esbuild (AWS SDK left out; the runtime has it) |
| `infra/template.yaml`, `infra/samconfig.toml` | The stack and its dev/prod settings |

`services/api/src/infra-template.test.ts` keeps the template and the code in step: table keys, handler names, build
targets, the route list in `docs/API.md`, and IAM actions.
