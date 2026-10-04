#!/usr/bin/env bash
# Publishes the website to a stack's S3 bucket and CloudFront (roadmap P9.2). Dev only from here: prod releases go
# through the GitHub deploy workflow (P11.2) or Ethan.
#
#   bash scripts/deploy-web.sh            # dev, AWS profile dropabop-dev
#
# Steps: read the stack's outputs → build the site with those (public) addresses → upload it → clear CloudFront's
# copy of index.html so people get the new version straight away.

set -euo pipefail
cd "$(dirname "$0")/.."

STACK="dropabop-dev"
REGION="us-east-2"
PROFILE="${AWS_PROFILE_NAME:-dropabop-dev}"

output() {
  aws cloudformation describe-stacks --stack-name "$STACK" --region "$REGION" --profile "$PROFILE" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

echo "Reading $STACK outputs…"
API_URL=$(output ApiUrl)
POOL_ID=$(output UserPoolId)
CLIENT_ID=$(output UserPoolClientId)
BUCKET=$(output WebBucketName)
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
aws s3 sync apps/web/dist/assets "s3://$BUCKET/assets" --delete \
  --cache-control "public, max-age=31536000, immutable" --region "$REGION" --profile "$PROFILE"
# Everything else (index.html) must be re-checked on every visit, so a release shows up immediately.
aws s3 sync apps/web/dist "s3://$BUCKET" --delete --exclude "assets/*" \
  --cache-control "no-cache" --region "$REGION" --profile "$PROFILE"

echo "Clearing CloudFront's cached copy…"
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION" --paths "/index.html" "/" \
  --profile "$PROFILE" --query "Invalidation.Id" --output text

echo "Done: $SITE"
