#!/usr/bin/env bash
# Drop a Bop — automated guardrail checks.
#
# Enforces the spec's cost and security rules that can be checked mechanically, so a
# mistake (by a person or an AI) is caught right after the edit instead of in a bill or a breach.
#
# Runs: after every Claude Code file edit (PostToolUse hook), in CI, and via `npm run guardrails`.
# Exit 0 = all checks pass. Exit 2 = violations (exit 2 makes Claude Code show the message to Claude).
#
# Suppressing a finding: only where a check says so, with an inline `guardrails-allow: <check>`
# comment and a reason. Never edit this script to make a violation go away — write an ADR instead.

set -u
cd "$(dirname "$0")/.." || exit 1

# Tracked files plus new untracked files that aren't git-ignored (skips node_modules, build output).
FILES=$(git ls-files -co --exclude-standard 2>/dev/null)
SELF='scripts/guardrails.sh'
failures=0

violation() {
  echo "GUARDRAIL VIOLATION: $1" >&2
  failures=$((failures + 1))
}

# list <file-regex> — files matching the regex, minus this script.
list() {
  printf '%s\n' "$FILES" | grep -E "$1" | grep -vxF "$SELF" || true
}

# scan <file-regex> <pattern> <message> [allow-marker]
scan() {
  local files hits
  files=$(list "$1")
  [ -z "$files" ] && return 0
  hits=$(printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 grep -HInE -- "$2" 2>/dev/null || true)
  if [ -n "${4:-}" ] && [ -n "$hits" ]; then
    hits=$(printf '%s\n' "$hits" | grep -vF -- "$4" || true)
  fi
  if [ -n "$hits" ]; then
    violation "$3"
    printf '%s\n' "$hits" | head -20 | sed 's/^/    /' >&2
  fi
}

CODE='\.(ts|tsx|js|jsx|mjs|cjs)$'
NON_TEST_CODE_FILTER='\.(test|spec)\.(ts|tsx|js)$'
INFRA='^(infra/.*\.(ya?ml|json)|template\.ya?ml)$'

# ---------------------------------------------------------------------------
# 1. AWS resource allowlist (spec §3, §6, §40 rule 3, §41)
# ---------------------------------------------------------------------------
DEFAULT_ALLOWED="
AWS::S3::Bucket
AWS::S3::BucketPolicy
AWS::CloudFront::Distribution
AWS::CloudFront::OriginAccessControl
AWS::CloudFront::ResponseHeadersPolicy
AWS::CloudFront::CachePolicy
AWS::CloudFront::Function
AWS::Cognito::UserPool
AWS::Cognito::UserPoolClient
AWS::Cognito::UserPoolDomain
AWS::Serverless::Function
AWS::Serverless::HttpApi
AWS::Serverless::LayerVersion
AWS::ApiGatewayV2::Api
AWS::ApiGatewayV2::Stage
AWS::ApiGatewayV2::Route
AWS::ApiGatewayV2::Integration
AWS::ApiGatewayV2::Authorizer
AWS::Lambda::Function
AWS::Lambda::Permission
AWS::Lambda::LayerVersion
AWS::DynamoDB::Table
AWS::Logs::LogGroup
AWS::CloudWatch::Alarm
AWS::SNS::Topic
AWS::SNS::Subscription
AWS::SNS::TopicPolicy
AWS::IAM::Role
AWS::IAM::Policy
AWS::IAM::OIDCProvider
AWS::Budgets::Budget
AWS::SSM::Parameter
AWS::CertificateManager::Certificate
"
APPROVED_FILE='docs/decisions/approved-aws-resources.txt'
APPROVED=""
if [ -f "$APPROVED_FILE" ]; then
  while read -r type adr _rest; do
    case "$type" in ''|\#*) continue ;; esac
    if [ -z "${adr:-}" ] || ! ls docs/decisions/"${adr#ADR-}"-*.md >/dev/null 2>&1; then
      violation "$APPROVED_FILE approves $type without an existing ADR file (expected docs/decisions/${adr#ADR-}-*.md)."
      continue
    fi
    APPROVED="$APPROVED
$type"
  done < "$APPROVED_FILE"
fi

infra_files=$(list "$INFRA")
if [ -n "$infra_files" ]; then
  used_types=$(printf '%s\n' "$infra_files" | tr '\n' '\0' \
    | xargs -0 grep -hoE "Type\"?:[[:space:]]*['\"]?AWS::[A-Za-z0-9]+::[A-Za-z0-9]+" 2>/dev/null \
    | grep -oE 'AWS::[A-Za-z0-9]+::[A-Za-z0-9]+' | sort -u)
  for t in $used_types; do
    if ! printf '%s\n%s\n' "$DEFAULT_ALLOWED" "$APPROVED" | grep -qxF "$t"; then
      violation "AWS resource type $t is not on the allowlist. Use the /aws-change skill: write an ADR with the Cost section, then add it to $APPROVED_FILE."
    fi
  done

  scan "$INFRA" "ProtocolType\"?:[[:space:]]*['\"]?WEBSOCKET" \
    "WebSocket APIs are not allowed initially (spec §5). Use polling."
  scan "$INFRA" "ProvisionedConcurrency" \
    "Provisioned concurrency bills while idle (spec §2). Remove it."
  scan "$INFRA" "VpcConfig" \
    "Lambdas in a VPC need NAT gateways (~\$30+/month) to reach the internet (spec §2). Remove VpcConfig."
  scan "$INFRA" "Action\"?:[[:space:]]*['\"]?\\*['\"]?[[:space:]]*$" \
    "IAM Action '*' violates least privilege (spec §31)."
  scan "$INFRA" "['\"]?(dynamodb|s3|cognito-idp|lambda|iam|logs|sns):\\*" \
    "Service-wide IAM wildcard actions violate least privilege (spec §31). List the specific actions."
fi

# ---------------------------------------------------------------------------
# 2. Secrets and credentials (spec §9, §31)
# ---------------------------------------------------------------------------
scan '.' 'AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}' "Possible AWS access key committed."
scan '.' '-----BEGIN [A-Z ]*PRIVATE KEY-----' "Private key committed."
scan '.' 'aws_secret_access_key[[:space:]]*=' "AWS secret key committed."
scan '.' "(client_?secret|CLIENT_?SECRET|api_?key|API_?KEY)[\"']?[[:space:]]*[:=][[:space:]]*[\"'][A-Za-z0-9_-]{20,}[\"']" \
  "Hard-coded secret/API key. Load it from SSM/approved config at runtime instead." "guardrails-allow: test-fixture"

env_files=$(printf '%s\n' "$FILES" | grep -E '(^|/)\.env(\.[^/]+)?$' | grep -vE '\.example$' || true)
if [ -n "$env_files" ]; then
  violation ".env files must be git-ignored and never committed (spec §31):"
  printf '%s\n' "$env_files" | sed 's/^/    /' >&2
fi

scan "($CODE|\\.env\\.example$|\\.ya?ml$)" 'VITE_[A-Z0-9_]*(SECRET|PASSWORD|PRIVATE|TOKEN)' \
  "VITE_* variables are bundled into public JavaScript. Never put secrets in them (spec §37)."

# ---------------------------------------------------------------------------
# 3. Code rules (spec §9, §24, §25, §31, §33)
# ---------------------------------------------------------------------------
code_non_test=$(list "$CODE" | grep -vE "$NON_TEST_CODE_FILTER" || true)
if [ -n "$code_non_test" ]; then
  # Re-use scan by temporarily narrowing FILES to non-test code.
  ALL_FILES=$FILES
  FILES=$code_non_test

  scan "$CODE" '(console\.(log|info|warn|error|debug)|logger\.[a-zA-Z]+)\(.*(accessToken|refreshToken|idToken|access_token|refresh_token|id_token|password|[Aa]uthorization|clientSecret|client_secret)' \
    "Possible logging of tokens/passwords/secrets (spec §33). Log ids and outcomes only." "guardrails-allow: log"

  scan '^services/' '(body|params|query|pathParameters|queryStringParameters|input)\??\.userId' \
    "Handlers must take the user's identity from the verified JWT, never from the request (spec §24)." "guardrails-allow: userId"

  scan '^services/' '(ScanCommand|\.scan\()' \
    "DynamoDB Scan is not allowed (spec §25). Query by key or GSI." "guardrails-allow: scan"

  scan '^apps/web/' "from ['\"]@aws-sdk/(client-dynamodb|lib-dynamodb)" \
    "The frontend must never talk to DynamoDB directly (spec §31). Call the API."

  scan "$CODE" '[?&](access_token|id_token|refresh_token|accessToken|idToken)=' \
    "Tokens must never be placed in URLs (spec §9)."

  FILES=$ALL_FILES
fi

# Dependencies that imply forbidden infrastructure (spec §3, §4, §5).
scan '(^|/)package\.json$' '"(ioredis|redis|pg|mysql2|mongoose|mongodb|@prisma/client|socket\.io|socket\.io-client|aws-cdk-lib|express)"[[:space:]]*:' \
  "Dependency implies infrastructure the spec forbids (Redis/SQL/Mongo/WebSockets/always-on server/second IaC tool). Write an ADR and ask the user first."

# ---------------------------------------------------------------------------
if [ "$failures" -gt 0 ]; then
  echo "" >&2
  echo "$failures guardrail violation(s). Fix them, or if one is genuinely required, stop and explain why to the user (see CLAUDE.md)." >&2
  exit 2
fi
echo "Guardrails: all checks passed."
exit 0
