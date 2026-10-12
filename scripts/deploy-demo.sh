#!/usr/bin/env bash
# Publishes the public demo site (D39): the app with made-up people and songs, running entirely in the visitor's
# browser. No sign-in, no AWS settings, nothing saved; refreshing starts over.
#
#   bash scripts/deploy-demo.sh
#
# One-time setup (Ethan): DEPLOYMENT.md §4g creates the Cloudflare Pages project "dropabop-demo".

set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${DEMO_PROJECT:-dropabop-demo}"

echo "Building the demo…"
# No VITE_* settings on purpose: the demo build never needs (or gets) the real app's addresses.
env -u VITE_API_URL -u VITE_COGNITO_USER_POOL_ID -u VITE_COGNITO_CLIENT_ID -u VITE_AWS_REGION \
  npm run build:demo -w @dropabop/web

# Belt and braces: the demo must not contain a real address (an API host with its id, or a user pool id; the
# sign-in library's own service names are fine), and must contain the sample data.
if grep -rqsE "[a-z0-9]{10}\.execute-api\.|[a-z]{2}-[a-z]+-[0-9]_[A-Za-z0-9]{9}" apps/web/dist-demo; then
  echo "Stopped: the demo build contains a real AWS address."
  exit 1
fi
if ! grep -rqs "Sarah Kim" apps/web/dist-demo; then
  echo "Stopped: the demo build doesn't contain the sample data."
  exit 1
fi

echo "Uploading to Cloudflare Pages ($PROJECT)…"
npx --yes wrangler@4 pages deploy apps/web/dist-demo --project-name "$PROJECT" --branch main --commit-dirty=true
echo "Done: https://$PROJECT.pages.dev"
