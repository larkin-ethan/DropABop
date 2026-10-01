# ADR-0008: Amplify JS (auth only) for Cognito sign-in in the browser

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec sections:** §9, §19 (screens 2–5), §31, §37

## Context

The website needs sign-up with email verification, sign-in, sign-out, forgot/reset password, and fresh access tokens
for API calls (spec §9). The user pool is created by our SAM template (P4.2), not by Amplify's backend tooling.
The mockup draws our own login/sign-up screens (screens 2–5).

## Options considered

1. **Amplify JS v6, auth category only** (`aws-amplify`, imports from `aws-amplify/auth`). Official AWS library,
   actively maintained (6.22.1 published 2026-10-01). It supports existing user pools via `Amplify.configure` without
   any Amplify backend, and provides `signUp`, `confirmSignUp`, `signIn` (with `nextStep`), `signOut`,
   `resetPassword`/`confirmResetPassword`, and `fetchAuthSession` (tokens, refreshed for us). Our own screens.
2. **Cognito managed login (hosted UI) + `oidc-client-ts` with authorization code + PKCE.** The password never touches
   our page. But sign-in redirects to a Cognito-hosted page that can only be partly branded, so it can't match the
   mockup, and it needs a Cognito domain plus callback URLs per environment.
3. **`amazon-cognito-identity-js` or raw `@aws-sdk/client-cognito-identity-provider` calls.** Lower-level: we'd
   implement SRP and token refresh ourselves. More code we'd have to get right; no benefit at our size.

## Decision

**Option 1.** Amplify JS v6 auth only, configured from `VITE_COGNITO_USER_POOL_ID` / `VITE_COGNITO_CLIENT_ID`
(public ids, not secrets) with email sign-in and code-based verification. All Amplify calls sit behind one small
`AuthService` interface (`apps/web/src/auth/`), so screens and tests don't depend on Amplify directly, and the sample
preview can run with a fake.

- **Sign-in flow:** Amplify's default SRP flow (confirmed in the installed library: with no `authFlowType`, `signIn` uses `signInWithSRP`), so the password itself isn't sent to Cognito. The P4.2 app client must
  allow `ALLOW_USER_SRP_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH` (no client secret). Confirm in the P4.3 smoke test.
- **Token storage:** Amplify's default `localStorage`, so people stay signed in between visits, which matters for a
  daily-use app. Trade-off: a script injected into the page could read tokens. Mitigations: React escapes output by
  default; no third-party scripts; a strict Content-Security-Policy in P9.2; short-lived access tokens (Cognito
  default 1 hour) with refresh tokens; the API also requires `token_use = access`. Revisit (`sessionStorage` or
  cookies) if the threat model changes.
- **Tokens never go in URLs** (spec §9): the API client sends `Authorization: Bearer <access token>`.

## Cost

No AWS cost (client library). Cognito itself is in the always-free tier at 10–20 users (checked in P4.2).

## References (checked 2026-10-01)

- https://docs.amplify.aws/react/build-a-backend/auth/use-existing-cognito-resources/
- https://docs.amplify.aws/react/build-a-backend/auth/connect-your-frontend/sign-in/
- https://docs.amplify.aws/react/build-a-backend/auth/concepts/tokens-and-credentials/
