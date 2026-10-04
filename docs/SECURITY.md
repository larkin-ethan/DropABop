# Security

How Drop a Bop keeps people's accounts and their party's music private, in plain language. The rules behind it are
in `CLAUDE.md` (Hard rules → Security) and `docs/SPEC.md` §9, §24, §31–§33. Reviewed in roadmap task P9.3 (2026-10-04): no high-severity findings; the medium one (guessable invite codes)
and three low ones are fixed or listed under Known limits below.

## What we protect, and from whom

| What | Why it matters | Who might try |
|---|---|---|
| Your account | Someone signing in as you could share songs or rate in your name | Anyone guessing or reusing passwords |
| A party's songs and ratings | Parties are private; ratings stay secret until the week ends (D9), and who shared what stays anonymous until then (D10) | Curious party members, or outsiders with a guessed link |
| Email addresses | Personal data | Anyone scraping the app |
| The AWS bill | A flood of requests costs money | Bots, or a bug |

## What we store (D19)

- **In Cognito (AWS's sign-in service):** your email and password. The password is never sent to us: the website
  signs in with SRP, which proves you know it without sending it, and Cognito stores only a protected form of it.
- **In our database:** your display name, avatar colour, optional profile picture (a small 128×128 copy made in
  your browser), preferred music app, your parties, the songs you share, and
  your ratings. **Not** your email.
- **In logs (kept 14 days in dev, 30 in prod):** request id, route, status, timing, and your user id (a random
  identifier, not your email). Never tokens, passwords, request bodies, or headers; the logger also strips these if
  they're passed by mistake (`services/api/src/http/logger.ts`).

## How each part is protected

**Signing in (Cognito).** Email + password with email verification. Passwords need 8+ characters with upper- and
lower-case letters and a number. After 5 wrong passwords Cognito locks the account for a moment, doubling each time up
to about 15 minutes. Error messages never reveal whether an email has an account.

**Tokens.** After sign-in the website holds a short-lived *access token* (1 hour) and a *refresh token* (30 days),
stored by the AWS Amplify library in the browser's local storage (ADR-0008). Tokens are sent only in the
`Authorization` header, never in links. Signing out revokes the refresh token and clears the app's cached data. The
risk with local storage is malicious script on the page reading it; the Content Security Policy below allows only the
app's own scripts, which is the main defence.

**The API (API Gateway + Lambda).**

- Every route requires a valid Cognito **access** token: API Gateway checks its signature, issuer, app client, and
  expiry, and requires the access-token scope, so ID tokens are refused. The code checks `token_use = access` again.
- Who you are comes **only** from the verified token, never from anything you send. Request bodies are strict: an
  extra field such as `userId` is rejected.
- Every handler checks, in order: signed in → member of this party → allowed to do this (e.g. host only) → the week's
  state (e.g. sharing closed on non-sharing days, ratings locked after the week's lock time). Rules are decided by the server clock, never
  the browser's.
- A week id names its party, and membership of *that* party is checked, so ids can't be used to reach another party.
- Open-week answers leave out other people's ratings entirely, and who shared each song unless the party turned that
  on. Results only unlock after the week ends.
- Rate limits per route (docs/API.md → Rate limits), on top of the app's own limits (5 parties per person, one song a
  day, invite code required). Unknown or replaced invite codes all give the same error, and each person may try at
  most 10 wrong codes an hour, so codes (4 characters, about 920,000 possibilities) can't be guessed.

**The database.** Each Lambda function may use only the table actions it needs (never scan the table). Prod keeps
point-in-time backups and has deletion protection.

**The website (P9.2).** Served over HTTPS only from a private bucket that only CloudFront can read. Security headers on
every page: HTTPS-only (HSTS), no MIME sniffing, can't be embedded in other sites, and a Content Security Policy that
lets the page run only its own scripts and talk only to Cognito and our API (the exact address is written into the
page when it's built). Prod can't be deployed with the local-development origin allowed (template rule). The API accepts browser calls only from
the website (plus `localhost` in dev). The sample-data preview can run only on a developer's machine with an explicit
flag; production builds don't contain it.

**Links to music services.** Song links come from Apple's catalog or are pasted links checked against the exact
Spotify / YouTube formats and stored in a clean form; the website only opens `https` links, in a new tab without
sharing where you came from.

**Secrets.** There are none in the code or the website: the API needs no keys (iTunes search is keyless), and the
website's settings are public ids. Automated checks (`scripts/guardrails.sh`) block committed keys, `.env` files,
logging tokens, tokens in URLs, table scans, and wildcard permissions. The GitHub repository is public, so no account
ids, emails, or stack addresses are committed.

## Known limits (accepted for a small private app)

- **No per-person rate limit** at the API: HTTP APIs limit each route for everyone together. A member could use up a
  route's allowance briefly; the effect is "try again in a moment", not data loss.
- **No Web Application Firewall:** it costs about $5+/month per rule set, more than the whole app. Revisit if abused.
- **Signed-out tokens:** an access token stays valid for up to an hour after signing out (API Gateway doesn't check
  revocation). Removed members still lose access at once, because membership is checked on every request.
- **Party limit races:** two "create party" or "join" requests sent at the same instant could take someone to 6
  parties instead of 5. Harmless; tracked to tighten with a counter if it ever matters.
- **Account takeover via a stolen device** (an unlocked laptop) isn't something the app can stop; tokens expire and
  signing out revokes them.
- **Musical twin** (D12/STATISTICS.md): a gap of 0 reveals you and your twin rated identically, even when the party
  hides who rated what. Documented trade-off.

## Reporting a problem

If you find a security or privacy problem, please **don't** open a public GitHub issue. Use GitHub's private
vulnerability reporting on this repository (Security tab → Report a vulnerability), or tell Ethan directly, with what
you found and how to reproduce it. We'll confirm, fix it, and let you know.

## Checklist (re-run before each prod release)

- [ ] `npm run verify` passes (includes guardrails and the authorization sweep test for every route).
- [ ] No route added without a membership/host check and an entry in the authorization sweep
      (`services/api/src/handlers/authorization.integration.test.ts`).
- [ ] New response fields reviewed against D9–D11 (nothing about other people's ratings or identities leaks early).
- [ ] No new AWS resource type without an ADR; IAM still least privilege.
- [ ] Security headers still present on the website (`curl -I` the site; see P9.2).
- [ ] Dependencies: `npm audit --omit=dev` reviewed.
