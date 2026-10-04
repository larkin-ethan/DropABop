# ADR-0002: AWS SAM for infrastructure as code

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec sections:** §35, §36, §41

## Context

The spec asks for one IaC tool among SAM, CDK, and Terraform, favoring whichever is easiest for a
beginner to understand and maintain.

## Options considered

1. **AWS SAM** — one YAML file, purpose-built for Lambda + API Gateway + DynamoDB, `sam local` for testing,
   deploys through CloudFormation (free). Less flexible for exotic resources (we don't want those anyway).
2. **AWS CDK** — real TypeScript, powerful, but adds abstraction layers, a bootstrap stack, and asset buckets;
   easier to accidentally create extra resources.
3. **Terraform** — great tool, but a second language (HCL) and remote state to manage.

## Decision

**AWS SAM.** The whole backend is readable in one template; the guardrail script can inspect resource types
with simple text matching; nothing extra to bootstrap.

- `infra/template.yaml` — app stack (Cognito, HTTP API, Lambdas, DynamoDB, alarms, frontend bucket + CloudFront).
- `infra/samconfig.toml` — `dev` and `prod` config-envs → stacks `dropabop-dev` and `dropabop-prod`, separate
  tables/user pools/buckets, so local or dev work can never touch prod data (§36).
- `infra/bootstrap.yaml` (Phase 11) — GitHub OIDC deploy role, deployed once by hand.

## Cost

CloudFormation and SAM are free for AWS-native resources. SAM's managed artifact bucket is a small S3 bucket
(pennies at most).

## Consequences

Anything SAM/CloudFormation can't express needs an ADR before working around it.
