#!/usr/bin/env bash
# Publishes the website to a stack's S3 bucket and CloudFront (roadmap P9.2).
#
#   bash scripts/deploy-web.sh                  # dev, with your AWS profile dropabop-dev
#   STACK=dropabop-prod AWS_PROFILE_NAME= …      # how the GitHub deploy workflow calls it (no profile there)
#
# Prod releases go through the GitHub deploy workflow (P11.2) with Ethan's approval, not from a laptop.
#
# Steps: read the stack's outputs → build the site with those (public) addresses → upload it → clear CloudFront's
# copy of index.html so people get the new version straight away.

set -euo pipefail
cd "$(dirname "$0")/.."

STACK="${STACK:-dropabop-dev}"
REGION="${REGION:-us-east-2}"
# Unset → the dropabop-dev profile; set to empty (as in GitHub Actions) → use the credentials already configured.
PROFILE="${AWS_PROFILE_NAME-dropabop-dev}"

aws_cli() {
  if [ -n "$PROFILE" ]; then
    aws "$@" --profile "$PROFILE"
  else
    aws "$@"
  fi
}

output() {
  aws_cli cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

echo "Reading $STACK outputs…"
BUCKET=$(output WebBucketName)
if [ -z "$BUCKET" ] || [ "$BUCKET" = "None" ]; then
  echo "This stack doesn't host the website yet (HostWebsite is off). Nothing to publish."
  exit 0
fi
API_URL=$(output ApiUrl)
POOL_ID=$(output UserPoolId)
CLIENT_ID=$(output UserPoolClientId)
DISTRIBUTION=$(output WebDistributionId)
SITE=$(output WebsiteUrl)

echo "Building the website…"
# Public values only (spec §37): they end up in the JavaScript every visitor downloads.
VITE_API_URL="$API_URL" \
  VITE_COGNITO_USER_POOL_ID="$POOL_ID" \
  VITE_COGNITO_CLIENT_ID="$CLIENT_ID" \
  VITE_AWS_REGION="$REGION" \
  npm run build -w @dropabop/web

echo "Uploading to the bucket…"
# Files in assets/ have content hashes in their names, so browsers may keep them forever.
aws_cli s3 sync apps/web/dist/assets "s3://$BUCKET/assets" --delete \
  --cache-control "public, max-age=31536000, immutable" --region "$REGION"
# Everything else (index.html, icons) must be re-checked on every visit, so a release shows up immediately.
aws_cli s3 sync apps/web/dist "s3://$BUCKET" --delete --exclude "assets/*" \
  --cache-control "no-cache" --region "$REGION"

echo "Clearing CloudFront's cached copy…"
aws_cli cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/index.html" "/" \
  --query "Invalidation.Id" --output text

echo "Done: $SITE"
