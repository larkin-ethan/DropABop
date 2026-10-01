# CLAUDE.md — Song of the Day

Private social music app. Each week, every party member shares one song per day (Mon–Fri), anyone can
rate any of that week's songs 1–10 until Sunday night, then ratings lock and the weekly results and taste
statistics are revealed. 10–20 users per party. (This weekly model deliberately changes spec §13–15: ADR-0004.)
Serverless AWS, near-$0 to run.

## Where things are

| File | What it's for |
|---|---|
| `docs/SPEC.md` | **Source of truth.** The master specification. Never edit it without being asked. |
| `docs/PRODUCT_DECISIONS.md` | Answers to product questions the spec leaves open (round rules, stats formulas, defaults). |
| `docs/design/` | Approved mockup (visual reference) + `README.md` mapping each mockup screen to a task and its adaptations. |
| `docs/ROADMAP.md` | Every build task, in order, with acceptance criteria. Work top to bottom. |
| `docs/PROGRESS.md` | Current state, blockers, and a session log. Read first, update last. |
| `docs/decisions/` | ADRs (architecture decision records) + `approved-aws-resources.txt`. |
| `scripts/guardrails.sh` | Automated rule checks. Runs after every file edit and in CI. |

## How to work (every session)

1. Read `docs/PROGRESS.md`, then the next unchecked task in `docs/ROADMAP.md`.
   The `/next-task` skill does this whole loop — prefer it.
2. If the next task is tagged **[HUMAN]**, do not attempt it. Give the user clear,
   step-by-step instructions for it and stop.
3. Read the spec sections the task cites. Inspect the existing code before writing new code.
4. Make the **smallest change** that satisfies the task's "Done when" criteria. One task at a time.
5. Write/extend tests alongside the code. Run `/verify`. Fix failures — never skip, delete,
   or weaken a test to make it pass.
6. Update the docs the task names. Tick the task's checkbox. Add a PROGRESS log entry.
7. Commit with message `P<n>.<m>: <task title>` (one commit per task). Do not push unless asked.

## Definition of Done (all must be true before ticking a box)

- Every "Done when" bullet is met and was **actually checked** (command run, output seen).
- `npm run verify` passes (lint, typecheck, unit tests, guardrails) — once Phase 1 creates it;
  before that, `bash scripts/guardrails.sh` passes.
- New behaviour has tests. Backend rules (auth, membership, round state, ratings) have unit tests.
- No new AWS resource type, dependency category, or architecture without an ADR.
- Docs touched by the change are updated.
- If something could not be verified, say so in PROGRESS.md and in your reply. Never claim
  "tests pass" or "deployed" without having run it.

## Hard rules (enforced by guardrails, hooks, and review)

**Architecture / cost**
- Allowed AWS: S3, CloudFront, Cognito, API Gateway **HTTP API**, Lambda, DynamoDB, CloudWatch,
  plus the supporting types listed in `scripts/guardrails.sh` (IAM, Budgets, SNS for alarms, SSM, ACM).
- Forbidden without an approved ADR: EC2, VPC/NAT, RDS/Aurora, ECS/EKS/Fargate, ElastiCache/Redis,
  OpenSearch, load balancers, AppSync, API Gateway WebSockets/REST APIs, provisioned concurrency,
  Secrets Manager, WAF, Route 53 hosted zones, EventBridge, SQS, Step Functions — anything that bills
  while idle or isn't in the list above. To add one: use the `/aws-change` skill.
- No real-time infrastructure. Use TanStack Query polling/refetch.
- Weeks are created and closed **lazily on request** (no schedulers/cron), and the **server clock** decides the
  day and whether ratings are locked. Never trust a date from the client. See ADR-0003.
- Infrastructure as code only (AWS SAM). Never create resources by hand-clicking or ad-hoc CLI.

**Security**
- The user's identity comes **only** from the validated JWT claims (`sub`) in the Lambda event.
  Never read `userId` from a request body, path, or query.
- Every handler checks: authenticated → party member → owns/may act on the resource → round state.
- Never log tokens, passwords, secrets, `Authorization` headers, or full request events.
- Never put tokens in URLs. Never put secrets in frontend code or `VITE_*` variables.
- Never commit `.env` files, credentials, or keys. Never read `.env` or `~/.aws` files.
- Validate all input server-side (use the shared zod schemas). 400 on bad input, 403 on not allowed.
- Never weaken auth/CORS/validation to make development easier.

**AWS actions the AI must not take** (the human does these)
- Deploying to **production**, deleting any stack/table/bucket/data, creating IAM access keys,
  changing billing, registering third-party developer apps, entering any credentials.
- Dev deploys (`sam deploy --config-env dev`) require the user's approval at the prompt.

**Code style**
- Beginner-readable TypeScript. Plain functions over classes/patterns. No clever one-liners.
  Comments explain *why*. Match surrounding code.
- DynamoDB: query by key/GSI only. No `Scan` (guardrail-enforced). No fetching everything to filter.
- User-facing errors are friendly sentences; technical detail goes to logs.
- Every screen has loading, empty, and error states, and works at 320px wide.
- Don't add dependencies casually. Prefer what's already in the repo. New runtime deps need a
  one-line justification in the commit message.

**External APIs** (Spotify, Apple, YouTube, AWS, Cognito…)
- Never invent endpoints, SDK methods, scopes, limits, or prices. Check current official docs
  (WebFetch/WebSearch) and cite the URL + date checked in `docs/MUSIC_PROVIDERS.md` or the ADR.
- Never bypass DRM, subscription checks, region locks, or provider ToS.

## When to stop and ask the user

- The task is tagged [HUMAN], or needs credentials, an account, a payment, or a prod action.
- The spec, PRODUCT_DECISIONS, and ADRs don't answer a product question that changes behaviour
  users would notice. (Otherwise pick the simplest option, note it in PROGRESS.md, continue.)
- A guardrail blocks something you believe is genuinely required.
- Official docs show a provider capability the plan relies on doesn't exist or has changed.
- The same failure persists after 3 honest fix attempts.

Record the question under "Blocked / Questions for Ethan" in `docs/PROGRESS.md` so it survives the session.

## Decision priority (spec §44)

Security → Correctness → User experience → Maintainability → Simplicity → Cost → Scalability.
Unnecessary infrastructure is a defect. Build what the 10–20-person group needs now.

## Commands (available after Phase 1)

```bash
npm install            # install all workspaces
npm run verify         # lint + typecheck + unit tests + guardrails (run before every commit)
npm test               # unit tests (Vitest)
npm run test:integration   # needs DynamoDB Local (docker compose up -d)
npm run dev            # frontend dev server
bash scripts/guardrails.sh # rule checks only
```
