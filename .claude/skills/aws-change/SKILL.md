---
name: aws-change
description: Required process before adding or changing any AWS resource, service, IAM permission, or setting that could affect cost or security in Song of the Day (infra/template.yaml, bootstrap, CI deploy roles). Use whenever a task touches infra or someone proposes a new AWS service.
---

# AWS change process

Unnecessary infrastructure is a defect (spec §40 rule 10). Follow these steps for every infra change.

## 1. Is it already allowed?

The default allowlist is at the top of `scripts/guardrails.sh` (S3, CloudFront, Cognito, HTTP API,
Lambda, DynamoDB, CloudWatch, plus IAM/SNS/Budgets/SSM/ACM support types). Extra approvals live in
`docs/decisions/approved-aws-resources.txt`.

- **Already allowed** → still apply the checks in step 3, then implement.
- **Not allowed** → step 2.

## 2. New service or resource type

1. Ask: can an existing allowed service do this? (Polling instead of WebSockets, lazy evaluation instead
   of a scheduler, SSM Parameter Store instead of Secrets Manager, API Gateway throttling instead of WAF…)
   If yes, use that and stop.
2. Look up the **current official pricing page and free-tier page** (WebFetch). Do not rely on memory —
   AWS changed its Free Tier for new accounts in 2025, and prices change.
3. Write an ADR from `docs/decisions/0000-template.md` including the **Cost** section: why it's needed,
   cost at 10–20 users, free allowance (URL + date), and why existing services can't do it.
4. **Stop and ask Ethan to approve the ADR.** Do not add the type to the approved list yourself until he says yes.
5. After approval: add `<Type>  ADR-XXXX` to `docs/decisions/approved-aws-resources.txt` (this file
   requires the user's permission to edit), set the ADR status to Accepted.

## 3. Checks for every infra change

- Nothing that bills while idle (provisioned concurrency, NAT, load balancers, always-on compute,
  Secrets Manager per-secret fees, WAF, hosted zones) unless an approved ADR covers it.
- IAM: one role per function, only the actions it calls, only the resources it touches (table ARN +
  `/index/*` if it queries GSIs). No `*` actions; avoid `*` resources.
- Log groups have a retention period (14 days dev, 30 days prod).
- DynamoDB: capacity mode per ADR-0005; point-in-time recovery on in prod.
- Every resource name/ARN that differs per stage is derived from the `Stage` parameter — dev can
  never point at prod resources.
- Outputs needed by the frontend are non-secret IDs/URLs only.
- `sam validate --lint` and `bash scripts/guardrails.sh` pass.

## 4. Document

- Update `docs/ARCHITECTURE.md` (resource list + diagram) and the "What can cost money" table in
  `docs/DEPLOYMENT.md`.
- Deploying to dev needs the user's approval at the prompt. Deploying to prod is always done by Ethan.
