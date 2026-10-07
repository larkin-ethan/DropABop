#!/usr/bin/env bash
# Publishes the website: to the stack's S3 bucket + CloudFront (roadmap P9.2), or, while CloudFront is off, to the
# temporary Cloudflare Pages site named by the stack's ExternalWebsiteUrl (ADR-0010).
#
#   bash scripts/deploy-web.sh                  # dev, with your AWS profile dropabop-dev
#   STACK=dropabop-prod bash scripts/deploy-web.sh
#
# Usually you don't run this directly: scripts/deploy.sh runs it after deploying the stack (ADR-0009).
#
# Steps: read the stack's outputs → build the site with those (public) addresses → upload it → clear CloudFront's
# copy of index.html so people get the new version straight away.

set -euo pipefail
cd "$(dirname "$0")/.."

STACK="${STACK:-dropabop-dev}"
REGION="${REGION:-us-east-2}"
# Unset → the dropabop-dev profile; set to empty → use whatever credentials the shell already has.
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

is_set() {
  [ -n "$1" ] && [ "$1" != "None" ]
}

echo "Reading $STACK outputs…"
BUCKET=$(output WebBucketName)
EXTERNAL_SITE=$(output ExternalWebsiteUrl)
if ! is_set "$BUCKET" && ! is_set "$EXTERNAL_SITE"; then
  echo "This stack doesn't host a website (HostWebsite is off and there's no ExternalSiteOrigin). Nothing to publish."
  exit 0
fi
API_URL=$(output ApiUrl)
POOL_ID=$(output UserPoolId)
CLIENT_ID=$(output UserPoolClientId)

echo "Building the website…"
# Public values only (spec §37): they end up in the JavaScript every visitor downloads.
VITE_API_URL="$API_URL" \
  VITE_COGNITO_USER_POOL_ID="$POOL_ID" \
  VITE_COGNITO_CLIENT_ID="$CLIENT_ID" \
  VITE_AWS_REGION="$REGION" \
  npm run build -w @dropabop/web

if ! is_set "$BUCKET"; then
  # Temporary host (ADR-0010): Cloudflare Pages, through Cloudflare's own CLI (Wrangler). The project name is the
  # pages.dev subdomain, e.g. https://dropabop.pages.dev → dropabop. One-time setup: DEPLOYMENT.md §4d.
  PROJECT=$(echo "$EXTERNAL_SITE" | sed -E 's#^https://([a-z0-9-]+)\.pages\.dev$#\1#')
  if [ "$PROJECT" = "$EXTERNAL_SITE" ]; then
    echo "ExternalSiteOrigin ($EXTERNAL_SITE) isn't a pages.dev address, so I don't know where to upload it."
    exit 1
  fi
  echo "Uploading to Cloudflare Pages ($PROJECT)…"
  # The production branch is main (set when the project was created), so this updates the live site.
  npx --yes wrangler@4 pages deploy apps/web/dist --project-name "$PROJECT" --branch main --commit-dirty=true
  echo "Done: $EXTERNAL_SITE"
  exit 0
fi

DISTRIBUTION=$(output WebDistributionId)
SITE=$(output WebsiteUrl)

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
