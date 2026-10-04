# ADR-0009: Deploys run from the owner's Mac, not GitHub

- **Status:** Accepted (Ethan, 2026-10-04)
- **Date:** 2026-10-04
- **Spec sections:** §35 (CI/CD), §31 (no secrets in the repo) · Supersedes roadmap P11.1/P11.2's GitHub deploys

## Context

Spec §35 describes GitHub building, testing and deploying. P11.1 wrote `infra/bootstrap.yaml` so GitHub could sign
in to AWS with OpenID Connect (short-lived credentials, no stored keys). Deploying it failed: the account is a
new-experience AWS account, and an AWS-managed service control policy explicitly denies
`iam:CreateOpenIDConnectProvider`. Nothing in this project can lift that policy.

## Options considered

1. **Deploy from the owner's Mac** with one script, signed in with `aws login` (short-lived credentials, as for dev
   today). GitHub keeps running every check. No AWS changes, no stored keys.
2. **Unlock the account** ("Explore advanced features"): should lift the block, but it can't be undone and changes how
   billing limits and sign-in work.
3. **IAM user access keys in GitHub secrets:** automatic deploys, but long-lived keys are exactly what the project
   avoids (and the AI is forbidden from creating them).

## Decision

Option 1 (Ethan chose it, 2026-10-04). `scripts/deploy.sh dev|prod` runs the §35 pipeline locally: verify (lint,
types, tests, guardrails) → `sam build` → `sam deploy` (shows changes, asks first) → publish the website to S3 →
invalidate CloudFront. Prod deploys only from a clean `main`, after typing `prod`. `main` is protected on GitHub
(pull request + CI checks), so what reaches prod has passed review and CI.

The GitHub deploy workflow, `infra/bootstrap.yaml` and its test are removed; they're in git history (commits
db1c47f, 1a30ff9) if the account type ever changes.

## Cost

No AWS resources added or removed. The failed bootstrap attempt left an empty `ROLLBACK_COMPLETE` stack
(no resources, $0) for Ethan to delete.

## Consequences

- Easier: nothing to set up in GitHub beyond branch protection; no deploy credentials exist outside the owner's
  sign-in.
- Harder: deploys depend on the owner's Mac and a signed-in session; nothing deploys automatically on merge.
- Watch: the script refuses uncommitted changes, so every deploy matches a commit. Run it after merging.

## References

- AWS: supported services for new-experience accounts,
  https://docs.aws.amazon.com/accounts/latest/reference/supported-services-sign-up-new.html (checked 2026-10-03).
- The denial itself: CloudFormation event for `GitHubOidcProvider`, 2026-10-04 ("explicit deny in a service control
  policy").
