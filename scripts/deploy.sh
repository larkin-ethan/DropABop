#!/usr/bin/env bash
# One-command deploy from your Mac (ADR-0009): checks → build → deploy the stack → publish the website.
#
#   bash scripts/deploy.sh dev
#   bash scripts/deploy.sh prod        # asks you to type "prod" first; only from a clean `main`
#
# Sign in first:  aws login --profile dropabop-dev
# The very first deploy of a stage also needs the alert email (kept out of this public repo):
#   ALERT_EMAIL=you@example.com bash scripts/deploy.sh prod
#
# GitHub still runs the same checks on every pull request (ci.yml); it just can't deploy, because this AWS account
# type doesn't allow GitHub's keyless sign-in (ADR-0009).

set -euo pipefail
cd "$(dirname "$0")/.."

STAGE="${1:-}"
case "$STAGE" in
  dev | prod) ;;
  *)
    echo "Usage: bash scripts/deploy.sh dev   (or prod)"
    exit 1
    ;;
esac
# The AWS CLI profile you signed in with. Override with AWS_PROFILE_NAME=… if prod uses a different one.
PROFILE="${AWS_PROFILE_NAME:-dropabop-dev}"

# Deploy exactly what's committed, so what's live always matches a commit you can find again.
if [ -n "$(git status --porcelain)" ]; then
  echo "You have uncommitted changes. Commit (or stash) them first, so the deploy matches a commit."
  exit 1
fi
if [ "$STAGE" = "prod" ]; then
  if [ "$(git branch --show-current)" != "main" ]; then
    echo "Prod deploys come from the main branch. Switch to main first (git checkout main)."
    exit 1
  fi
  read -r -p 'This updates the real app everyone uses. Type "prod" to continue: ' answer
  if [ "$answer" != "prod" ]; then
    echo "Cancelled."
    exit 1
  fi
fi

echo "Checking AWS sign-in…"
if ! aws sts get-caller-identity --profile "$PROFILE" > /dev/null 2>&1; then
  echo "Not signed in. Run: aws login --profile $PROFILE"
  exit 1
fi

echo "Running all checks (format, lint, types, tests, guardrails)…"
npm run verify

echo "Building the API…"
(cd infra && sam build --config-env "$STAGE")

echo "Deploying the $STAGE stack (it shows the changes and asks before applying them)…"
deploy_args=(--config-env "$STAGE" --profile "$PROFILE" --no-fail-on-empty-changeset)
if [ -n "${ALERT_EMAIL:-}" ]; then
  # A command-line --parameter-overrides replaces samconfig's, so repeat the stage's settings with the email added.
  stage_overrides=$(awk -v section="[$STAGE.deploy.parameters]" '
    $0 == section { inside = 1; next }
    /^\[/ { inside = 0 }
    inside && /^parameter_overrides/ { sub(/^[^"]*"/, ""); sub(/".*$/, ""); print }
  ' infra/samconfig.toml)
  deploy_args+=(--parameter-overrides "$stage_overrides AlertEmail=$ALERT_EMAIL")
fi
(cd infra && sam deploy "${deploy_args[@]}")

echo "Publishing the website…"
STACK="dropabop-$STAGE" AWS_PROFILE_NAME="$PROFILE" bash scripts/deploy-web.sh

echo "Deployed $STAGE from commit $(git rev-parse --short HEAD)."
