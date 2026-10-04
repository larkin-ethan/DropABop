# Drop a Bop

A private social music app for small groups (10–20 friends). Every weekday (Mon–Fri), each member
shares one song. All week long, everyone listens and rates the week's songs 1–10. When Sunday ends, ratings
lock and the group sees the weekly results, each day's top song, and how their taste compares.

Built to run on AWS serverless services at (or very near) **$0/month** at this scale:
S3 + CloudFront (frontend), Cognito (accounts), API Gateway HTTP API + Lambda (backend), DynamoDB (data),
CloudWatch (logs and alarms). Infrastructure is defined with AWS SAM.

> **Status:** planning complete, build not started. See [docs/ROADMAP.md](docs/ROADMAP.md).
> This README is completed in roadmap task P12.1.

## How this project is built

The project is built task by task with Claude Code, inside guardrails that enforce the spec:

| Piece | What it does |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | The master specification — source of truth |
| [docs/PRODUCT_DECISIONS.md](docs/PRODUCT_DECISIONS.md) | Defaults for things the spec leaves open — edit to change behaviour |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Ordered tasks with "Done when" criteria; `[HUMAN]` tasks are yours |
| [docs/PROGRESS.md](docs/PROGRESS.md) | Where things stand, open questions, session log |
| [docs/decisions/](docs/decisions/) | Architecture decision records (why things are the way they are) |
| [CLAUDE.md](CLAUDE.md) | Rules the AI follows every session |
| [scripts/guardrails.sh](scripts/guardrails.sh) | Automatic checks: forbidden AWS services, secrets, unsafe auth patterns, DB scans, token logging |
| `.claude/` | Hooks (guardrails after every edit, blocked dangerous commands, session briefing), skills, reviewer agent |

### Day-to-day

In Claude Code, from this folder:

- `/next-task` — do the next roadmap task (build → test → review → docs → commit).
- `/next-task 3` — up to three in a row; it stops early at anything that needs you.
- `/verify` — run all checks and report honestly.
- `/aws-change` — the required process before any new AWS service.

You'll be pulled in only for `[HUMAN]` tasks (installing tools, AWS account setup, approving deploys,
registering music-provider developer apps) and for genuine product questions, which collect in
`docs/PROGRESS.md` under "Blocked / Questions for Ethan".

## Cost safety

Nothing in AWS is guaranteed free forever — free tiers depend on account age, usage, and region, and
AWS changes them. The safeguards here: no idle-billing services (enforced by `scripts/guardrails.sh`),
a monthly AWS Budget with email alerts set up in task P4.1, CloudWatch alarms, and short log retention.
Full billing instructions arrive in `docs/DEPLOYMENT.md` (P4.1 / P12.1).
