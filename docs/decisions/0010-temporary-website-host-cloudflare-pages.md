# ADR-0010: Host the website on Cloudflare Pages until CloudFront is available

- **Status:** Accepted (Ethan, 2026-10-07)
- **Date:** 2026-10-07
- **Spec sections:** §3 (hosting), §31 (security), §35 · Temporary; reverses when AWS verifies the account

## Context

The website is static files (React build). The plan hosts it on S3 + CloudFront (P9.2), but this new AWS account
can't create CloudFront distributions until AWS Support verifies it ("Your account must be verified before you can
add new CloudFront resources"). The support case has had no reply for several days, and the first prod deploy failed
on exactly this. Everything else (API, sign-in, database) runs on AWS already. Ethan wants to launch without waiting.

## Options considered

1. **Keep waiting for AWS.** No change, but no launch date.
2. **S3 static website hosting.** Allowed service, but HTTP only (no HTTPS without CloudFront), so sign-in tokens
   would travel unencrypted. Not acceptable (spec §31).
3. **GitHub Pages.** Free for the public repo, but GitHub's own limits page says Pages sites "shouldn't be used for
   sensitive transactions like sending passwords" (our sign-in page takes passwords, even though they go to Cognito
   with SRP), and the site would share `larkin-ethan.github.io` with Ethan's personal site, so that site's scripts
   could read the tokens Amplify keeps in the browser. Rejected.
4. **Cloudflare Pages** (chosen). Free plan, HTTPS on its own `*.pages.dev` address (nothing shared), real response
   headers from a `_headers` file (the same security policy CloudFront would send), and single-page-app routing by
   default (no top-level `404.html` → every path serves the app).

## Decision

Option 4, until CloudFront works. Nothing moves except the static files:

- `infra/template.yaml`: new `ExternalSiteOrigin` parameter (https origin only). With `HostWebsite=false`, the API
  accepts browser calls from that origin (CORS) and the code email shows the logo from it. Rules: prod needs a
  website (CloudFront or `ExternalSiteOrigin`), and `ExternalSiteOrigin` must be empty when CloudFront hosts it.
- `apps/web/vite.config.ts`: every build also writes `_headers` with the CloudFront policy (CSP with the exact API
  address, HSTS, no framing, nosniff, referrer policy). Harmless on CloudFront.
- `scripts/deploy-web.sh`: if the stack has no CloudFront bucket but has `ExternalWebsiteUrl`, it uploads with
  Cloudflare's CLI (`npx wrangler@4 pages deploy`, run with npx so it's not a project dependency).
- `infra/samconfig.toml` prod: `HostWebsite=false ExternalSiteOrigin=https://<project>.pages.dev`.

**Switching back:** when AWS verifies the account, set prod's overrides back to `Stage=prod` and run
`bash scripts/deploy.sh prod`. CloudFront then serves the site at its own address; tell the group the new link.
Accounts, songs and ratings don't change (they live in Cognito and DynamoDB). Then delete the Cloudflare project.

## Cost

- No AWS resources added. Cloudflare Pages free plan: 500 builds/month, 20,000 files, 25 MiB per file
  (https://developers.cloudflare.com/pages/platform/limits/, checked 2026-10-07). We upload a few dozen files a
  handful of times a month: $0.
- Needs a free Cloudflare account (Ethan creates it; the AI can't create accounts or enter credentials).

## Consequences

- The website depends on a second provider for a while; the API does not.
- The site address changes when we move to CloudFront (one message to the group).
- Wrangler signs in through Ethan's browser (`npx wrangler@4 login`), like `aws login`; no keys are stored.

## References

- Cloudflare Pages: direct upload, https://developers.cloudflare.com/pages/get-started/direct-upload/; Wrangler
  `pages project create --production-branch` and `pages deploy --project-name --branch`,
  https://developers.cloudflare.com/workers/wrangler/commands/pages/; `_headers`,
  https://developers.cloudflare.com/pages/configuration/headers/; SPA routing,
  https://developers.cloudflare.com/pages/configuration/serving-pages/ (all checked 2026-10-07).
- GitHub Pages limits (option 3), https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
  (checked 2026-10-07).
