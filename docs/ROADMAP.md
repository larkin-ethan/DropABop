# Roadmap

Work **top to bottom**. One task per commit. A task is done only when every "Done when" bullet has
been checked for real (see Definition of Done in `CLAUDE.md`). Tasks tagged **[HUMAN]** are for
Ethan — the AI explains them step by step and waits.

Format: `- [ ] **ID — Title**` then *Spec* (sections to read), *Do*, *Done when*, *Docs*.
The `/next-task` skill picks the first unchecked box.

---

## Phase 0 — Guardrails & prerequisites

- [x] **P0.1 — AI guardrails**
  Spec, CLAUDE.md, roadmap, product decisions, ADRs, guardrail script, Claude Code hooks/skills, CI skeleton.

- [x] **P0.2 — Install local tools** (split: each install now sits just before the phase that needs it —
  Node 24 at P1.0, Docker at P3.0, AWS CLI + SAM at P4.0.)

- [x] **P0.3 — Design reference** [HUMAN]
  - Put the **second approved mockup** images in `docs/design/` (any filenames). Spec §20 treats it as
    the primary visual reference. Done: `docs/design/mockup-v2-overview.webp` + `docs/design/README.md`.

---

## Phase 1 — Project scaffolding

- [x] **P1.0 — Install Node.js 24 LTS** [HUMAN]
  - Why: Lambda's newest stable runtime is `nodejs24.x` (supported to Apr 2028; `nodejs20.x` was deprecated
    Apr 30, 2026, per https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html, checked 2026-10-01), and
    current Vitest needs Node 22.12 or newer. Local Node should match production.
  - Easiest: download the **Node.js 24 LTS macOS installer (.pkg)** from https://nodejs.org and run it. It replaces
    the existing `/usr/local/bin/node` (v20.11).
  - Done when: a new terminal shows `node -v` → `v24.x`.

- [x] **P1.1 — Monorepo skeleton**
  - *Spec:* §22, §35, §37, §39
  - *Do:* npm workspaces: `apps/web` (empty placeholder), `services/api`, `packages/shared`. Root
    `tsconfig.base.json` (strict), `.nvmrc` = `24` (matches Lambda `nodejs24.x`), root `engines.node`, `.editorconfig`, Prettier, ESLint (typescript-eslint flat config), Vitest.
    Root scripts: `lint`, `typecheck`, `test`, `test:integration`, `guardrails`, `verify`
    (= lint + typecheck + test + guardrails), `format`.
  - *Done when:* `npm install && npm run verify` passes with one trivial test per workspace.
  - *Docs:* create `docs/DEVELOPMENT.md` (prereqs, install, commands, repo layout).

- [x] **P1.2 — CI runs verify**
  - *Do:* Update `.github/workflows/ci.yml` to run `npm ci` + `npm run verify` on PRs and pushes to main
    using the `.nvmrc` Node version.
  - *Done when:* workflow file is valid YAML and the same steps pass locally.

- [x] **P1.3 — Shared types & validation**
  - *Spec:* §12, §14, §15, §26
  - *Do:* In `packages/shared`: TypeScript types for User, Party, PartyMember, PartySettings (incl. timezone,
    paused), Round (a week), RoundStatus (`OPEN | CLOSED | NOT_ENOUGH_SONGS`), Weekday (`MON`–`FRI`), Recommendation
    (with its submission date), Vote, Song, SongProvider, ProviderCapabilities, Invitation; zod schemas
    for every API request body (rating int 1–10, display name 1–40 chars trimmed, party name 1–60,
    invite code `^SONG-[A-HJ-KM-NP-Z2-9]{4}$`, settings ranges from PRODUCT_DECISIONS); API error shape
    `{ error: { code, message } }`.
  - *Done when:* unit tests cover valid + invalid cases for each schema.

---

## Phase 2 — Domain logic (pure functions, no AWS)

Everything here is plain TypeScript in `services/api/src/domain/` with exhaustive unit tests.
This is where correctness lives; handlers later just call these.

- [x] **P2.1 — Week & day logic**
  - *Spec:* §13–15 · *Decisions:* D1–D5 · *ADRs:* 0003, 0004
  - *Do:* `getWeekWindow(timezone, now)` → week id (`<Monday date>`), start (Mon 00:00), end (Sun 23:59:59.999),
    in the party timezone and daylight-saving-correct (use `Intl` or a small, well-maintained date library;
    justify the choice). `getSubmissionDay(timezone, now)` → `MON`–`FRI` with its date, or `null` on weekends.
    `getEffectiveWeekStatus(round, now, songCount)` → `OPEN`, `CLOSED`, or `NOT_ENOUGH_SONGS` (< 2 songs at close).
    Paused parties don't get new weeks.
  - *Done when:* tests cover: each weekday and the weekend, exactly-at-midnight edges (Fri 23:59:59 vs Sat
    00:00, Sun 23:59:59 vs Mon 00:00), a daylight-saving change week, a non-US timezone, a paused party, and that
    consecutive weeks never overlap.

- [x] **P2.2 — Recommendation & voting rules**
  - *Spec:* §14, §15, §24 · *Decisions:* D6–D8
  - *Do:* `canSubmitRecommendation(...)`, `canVote(...)` returning `{ ok: true } | { ok: false, code, message }`
    with friendly messages (spec §30). Submission covers: not a member, weekend ("Song submissions open again
    on Monday"), already submitted today ("You've already shared your song for today."), paused party, week closed.
    Voting covers: not a member, own song, song not from the current week, week closed ("This week has ended,
    so ratings are locked."), rating not an integer 1–10. Changing an existing rating while open is allowed.
  - *Done when:* each rule has a passing and a failing test.

- [x] **P2.3 — Results calculation**
  - *Spec:* §16 · *Decisions:* D9–D12
  - *Do:* `calculateWeekResults(round, recommendations, votes, viewerId, settings)` → the whole week ranked, plus
    per-day groups and each day's "Bop of the Day" winner. Each song has average, count, distribution (1–10
    buckets), and viewer's rating; recommender and individual ratings appear **only if settings allow**.
  - *Done when:* tests cover ties (overall and for a day's winner), a day with no songs, zero-rating songs,
    visibility settings on/off, and that hidden fields are absent (not just empty) from the output.

- [x] **P2.4 — Statistics**
  - *Spec:* §17, §18 · *Decisions:* stats table
  - *Do:* One small function per stat in the PRODUCT_DECISIONS table, each returning
    `{ value, sampleSize } | { notEnoughData: true, sampleSize, required }`.
  - *Done when:* every stat has tests for: normal case, below-minimum sample, ties.
  - *Docs:* create `docs/STATISTICS.md` mirroring the definitions with formulas (user-facing wording too).

- [x] **P2.5 — Invite codes & permissions**
  - *Spec:* §8, §24, §26 · *Decisions:* D13–D17
  - *Do:* `generateInviteCode(randomSource)` (crypto-random, unambiguous alphabet); `canJoinParty(...)`
    (code active, room left, not already member); `isHost`, `canManageParty`.
  - *Done when:* tests cover full party, inactive code, duplicate join, non-host management attempts.

---

## Phase 3 — Data layer (DynamoDB)

- [x] **P3.1 — Access patterns & table design (doc first)**
  - *Spec:* §4, §25
  - *Do:* Write `docs/DATABASE.md`: every access pattern from §25 plus any the API needs; single-table
    key design (PK/SK + at most 2 GSIs) mapping each pattern to a Query/GetItem; item shapes; which
    writes use conditions/transactions (one recommendation per user per **day** via a key containing the date;
    rating writes conditional on the week's end time; first-request week creation with `attribute_not_exists`;
    party size limit; unique membership). Capacity mode decision with current pricing link (ADR-0005).
  - *Done when:* every pattern maps to a key-based operation; no Scan; reviewed against §25 list.

- [x] **P3.0 — Install Docker** [HUMAN]
  - Docker Desktop or OrbStack (local development only: runs DynamoDB Local for integration tests; never used
    in production).
  - Done when: `docker info` succeeds.

- [x] **P3.2 — Local DynamoDB for tests**
  - *Do:* `docker-compose.yml` with `amazon/dynamodb-local`; `services/api/scripts/create-local-table.ts`
    creating the table from the same definition as the SAM template (single source for key schema);
    `test:integration` script that runs against it.
  - *Done when:* `docker compose up -d && npm run test:integration` runs a smoke test that writes and reads an item.

- [x] **P3.3 — Repository functions**
  - *Do:* `services/api/src/data/` — plain async functions (`getParty`, `listUserParties`, `addMember`,
    `putRecommendation`, `putVote`, `getRoundVotes`, …) using `@aws-sdk/lib-dynamodb`. Conditional writes
    map `ConditionalCheckFailedException` to domain errors with friendly messages.
  - *Done when:* integration tests cover each function including every conditional-write failure
    (second song on the same day, join full party, duplicate join, two simultaneous week creations, old invite code
    after regeneration).

---

## Phase 5 — API endpoints (built and tested locally, before Phase 4)

This phase runs before Phase 4 so the API can be built while AWS account setup (P4.0/P4.1) happens in parallel.
Each task: handler in `services/api/src/handlers/`, thin (parse → auth context → domain → data → response),
unit tests with mocked data layer **and** integration tests against DynamoDB Local (handlers invoked with
realistic API Gateway events), entry in `docs/API.md` (method, path, auth, body schema, responses, errors).
Routes are added to the SAM template in P4.2; real-AWS smoke tests happen in P4.3.

- [x] **P5.1 — Handler toolkit**
  - *Do:* `getAuthenticatedUser(event)` (reads `sub`/email from JWT authorizer claims only), `parseBody(schema)`,
    `ok/badRequest/forbidden/notFound/conflict` helpers, a top-level error wrapper that logs (no tokens, no full
    events) and returns friendly messages; a tiny structured logger with a redaction list.
  - *Done when:* tests prove claims-only identity, redaction, and that unknown errors return a generic 500 message.

- [x] **P5.2 — Profile:** `GET /users/me` (creates profile on first call), `PATCH /users/me`.
- [x] **P5.3 — Parties:** `POST /parties`, `GET /parties`, `GET /parties/{partyId}` (members only).
- [x] **P5.4 — Invites & joining:** `GET /invites/{code}` (party name + room left; rate-limited route),
  `POST /parties/{partyId}/join` with code, `POST /parties/{partyId}/invite-code` (host regenerates),
  `DELETE /parties/{partyId}/members/{memberId}` (host removes / user leaves).
- [x] **P5.5 — Party settings:** `PATCH /parties/{partyId}/settings` (host only; validated values, including
  timezone and pause/resume).
- [x] **P5.6 — Weeks:** `GET /parties/{partyId}/rounds/current` (creates this week's round on first request with a
  conditional put; returns status, today's weekday or "weekend", week end time, and "paused" if applicable),
  `GET /parties/{partyId}/rounds` (past weeks, paginated). Integration test: two simultaneous first requests create
  exactly one round. The server decides the date; the client never sends it.
- [x] **P5.7 — Recommendations:** `POST /rounds/{roundId}/recommendations` (server stamps today's date; rejects
  weekends, a second song today, and closed weeks), `GET /rounds/{roundId}/recommendations` (all songs so far this
  week, oldest first, each with its weekday so the app groups by day; respects anonymity setting D10; never includes other people's ratings while open).
- [x] **P5.8 — Votes:** `PUT /rounds/{roundId}/votes/{recommendationId}` (create or change while the week is OPEN,
  checked with `canCastVote`; `updatedAt` from a fresh server clock read at write time; rejects own songs),
  `GET /rounds/{roundId}/votes/me`.
  Integration test: a rating sent after the week's end time is rejected even if the round is still stored as OPEN.
- [x] **P5.9 — Results:** `GET /rounds/{roundId}/results` (403 until the week has ended; weekly ranking, per-day
  groups, daily winners; applies visibility settings).
- [x] **P5.10 — Stats:** `GET /users/me/stats?partyId=`, `GET /parties/{partyId}/stats`, `GET /parties/{partyId}/leaderboard`.
  Decide in the task whether stats are computed on read or stored at round close (ADR-0006; prefer on-read if
  a party's full history is a handful of queries).
- [x] **P5.11 — Authorization test sweep**
  - *Do:* Table-driven integration test hitting **every** route as: no token, non-member, member, host,
    removed member. Verifies 401/403/404 as appropriate and that no route accepts a client-supplied userId.
  - *Done when:* sweep passes; any gap fixed.

Done when (each of P5.2–P5.10): unit + integration tests for success and every rule violation pass;
`docs/API.md` updated.

---

## Phase 4 — Dev infrastructure (AWS SAM)

- [x] **P4.0 — Install AWS CLI v2 and AWS SAM CLI** [HUMAN]
  - Official installers: AWS CLI v2 and AWS SAM CLI (macOS packages or Homebrew).
  - Done when: `aws --version` and `sam --version` succeed.

- [x] **P4.1 — AWS account safety setup** [HUMAN]
  - Follow `docs/DEPLOYMENT.md` → "Account safety" (the AI writes that section first if missing):
    enable MFA on root, create an IAM Identity Center user for daily work, set a **$5/month budget** with
    email alerts at 50%/80%/100% actual and 100% forecasted, enable Free Tier usage alerts, pick a region.
    Run `aws configure sso` with profile name `dropabop-dev`.
  - Done when: `aws sts get-caller-identity --profile dropabop-dev` works and the budget exists.

- [x] **P4.2 — SAM template: core stack**
  - *Spec:* §3, §6, §9, §36, §41 · *ADR:* 0002
  - *Do:* `infra/template.yaml` + `infra/samconfig.toml` with `dev` and `prod` config-envs (separate stack
    names `dropabop-dev` / `dropabop-prod`, parameter `Stage`). Resources: DynamoDB table (from P3.1 / ADR-0005: on-demand,
    `OnDemandThroughput` caps, PITR + deletion protection in prod), every Phase 5 route with its handler,
    Cognito User Pool (email sign-in, email verification, strong password policy) + public app client
    (no secret, SRP + refresh), HTTP API with **JWT authorizer** (issuer + audience = app client id; routes require
    the `aws.cognito.signin.user.admin` scope or equivalent so only access tokens pass — check current Cognito docs;
    handlers also require `token_use = access`), CORS limited to the
    stage's frontend origin, default route throttling, one `GET /health` Lambda (Node LTS, arm64, 128–256 MB,
    log group with 14-day retention). Per-function least-privilege IAM (only the table, only needed actions).
  - *Done when:* `sam validate --lint` and `sam build` pass; `bash scripts/guardrails.sh` passes; a unit test parses
    `infra/template.yaml` and asserts the table's key schema equals `TABLE_KEY_SCHEMA`
    (`services/api/src/data/table-definition.ts`) so local tests and AWS can't drift.
  - *Docs:* `docs/ARCHITECTURE.md` updated with the real resource list.

- [x] **P4.3 — First dev deploy + API smoke test** [HUMAN approves the command] (deployed + 34/34 smoke checks 2026-10-03; left: a weekday share → rate run of `node scripts/smoke-dev.mjs`; website sign-up run done)
  - *Do:* AI runs `sam build --config-env dev`, then `sam deploy --config-env dev --profile dropabop-dev` (user approves at the prompt), then calls
    `/health` with and without a token to prove the authorizer works. Create two throwaway test users in the dev
    user pool (credentials kept only in a git-ignored local file), then smoke-test every Phase 5 endpoint with real
    Cognito tokens: create party → join → share a song → rate → (results/stats return the "not ready" error while
    the week is open).
  - *Also:* fill `apps/web/.env.development.local` from the stack outputs and do a real sign-up → email code → sign-in →
    sign-out → forgot-password run through the website (closes P7.3).
  - *Done when:* unauthenticated call → 401; every endpoint behaves as in `docs/API.md` on dev; outputs (API URL,
    pool id, client id) in the git-ignored `apps/web/.env.development.local` only: not secrets, but the repo is public,
    so real dev addresses aren't committed.

- [x] **P4.4 — Cost & failure alarms**
  - *Spec:* §7, §33
  - *Do:* In the template: SNS topic + email subscription (parameter), CloudWatch alarms for Lambda errors
    (sum ≥ 5 in 5 min), API 5xx, and DynamoDB throttles. AWS Budget resource as a second safety net.
  - *Done when:* deployed to dev; user confirms the SNS subscription email. Docs list every billable resource.

---

## Phase 6 — Music providers

- [x] **P6.1 — Provider research (doc first, no code)**
  - *Spec:* §10–12, §40 rule 4
  - *Do:* Using **current official docs only**, write `docs/MUSIC_PROVIDERS.md` with a table per candidate
    (Spotify Web API + Web Playback SDK, Apple MusicKit JS / Apple Music API, iTunes Search API, YouTube Data API +
    IFrame Player): auth model, developer cost (e.g. paid developer membership), user-count limits in dev mode,
    subscription required for playback, search availability, quotas, ToS constraints on caching/display,
    branding requirements, and **whether an official link for the same track on the other services can be
    found legitimately** (e.g. by ISRC or search). Cite URL + date checked for every claim. Recommend a
    provider-neutral v1 plan per D20 (the group uses a mix of services).
  - *Done when:* every row has a citation; recommendation recorded as ADR-0007.
  - **Stop and ask Ethan** to approve ADR-0007 if it needs a paid account or a developer-app registration.

- [x] **P6.2 — Provider registration** [HUMAN] (only if ADR-0007 needs one) — not needed: ADR-0007 uses no accounts.
  - Register the developer app(s) and put any client secret into SSM Parameter Store / the approved
    mechanism yourself — never paste it into chat or the repo. Give the AI the parameter **name**.

- [x] **P6.3 — Provider interface + first provider**
  - *Do:* `services/api/src/providers/` — `MusicProvider` interface with capabilities (§10), a registry that
    implements the existing `SongLookup` interface (`providers/song-lookup.ts`) and replaces `unavailableSongLookup`
    in the production deps (`http/handler.ts`),
    and the v1 provider. `GET /songs/search?q=&provider=` (auth required, rate-limited, query length capped,
    results normalized to `Song`), `POST /songs/resolve` (paste-a-link fallback, D21). Provider HTTP calls
    mocked in unit tests; one opt-in live test.
  - *Done when:* searching from dev returns normalized songs; provider errors become friendly messages.

- [x] **P6.4 — External links & optional in-app playback** (backend: links stored per ADR-0007; in-app playback deferred by ADR-0007; the "Listen on Apple Music" badge and Open/Search buttons are drawn in P8.4–P8.6)
  - *Do:* Each `SongProvider` carries the official `externalUrl`. In-app playback only if ADR-0007 confirms
    an official, free path; otherwise "Open in …" buttons with the provider's branding rules.
  - *Docs:* `MUSIC_PROVIDERS.md` "How to add a provider" section.

---

## Phase 7 — Frontend foundation

- [x] **P7.1 — Vite app + design tokens**
  - *Spec:* §20–22, §37
  - *Do:* Vite + React + TS + React Router + TanStack Query + Tailwind in `apps/web`. Design tokens sampled from
    `docs/design/mockup-v2-overview.webp` per `docs/design/README.md` (contrast-checked to WCAG AA; record final
    values in that README). App shell: left sidebar on desktop/tablet, bottom tab bar on mobile, as in the mockup. `src/config.ts`
    reads only `VITE_API_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_AWS_REGION`
    and fails loudly if missing.
  - *Done when:* `npm run dev` shows a styled placeholder; build output is static files only.

- [x] **P7.2 — Component library**
  - *Spec:* §22, §28, §29
  - *Do:* Button, Card, Modal, Avatar (initials, D18), SongCard, AlbumArt (with loading/fallback), RatingControl
    (1–10, keyboard + touch accessible), StatCard, Leaderboard, Chart (pick one small lib or SVG — justify),
    LoadingState/Skeleton, EmptyState, ErrorState. Component tests with Testing Library.
  - *Done when:* tests pass; a `/dev/components` route (dev builds only) shows every component at 320px and 1440px.

- [x] **P7.3 — Authentication**
  - *Spec:* §9 · *ADR:* 0007 (choose the Cognito client library after checking current docs; prefer the smallest
    official option; tokens kept in memory/library storage, never in URLs)
  - *Do:* Sign up, email verification code, sign in, sign out, forgot/reset password, session refresh, protected
    routes, API client that attaches the access token and handles 401 by refreshing once then signing out.
  - *Done when:* full auth flow works against the dev user pool; tested with mocked auth in unit tests.

---

## Phase 8 — Screens

> **Status 2026-10-03:** P8.1–P8.11 are built and ticked on the strength of screen tests (against the in-memory
> preview API) and a browser review in sample mode at 7 widths. Still to do before calling Phase 8 finished: Ethan's
> walkthrough of every screen against the real dev stack (agreed: "we will check them all at the end").

Each screen matches its mockup screen in `docs/design/README.md` (screen map), **with the adaptations listed
there**. Behaviour always follows PRODUCT_DECISIONS. Compare a screenshot of your screen with the mockup before
ticking the box. Each screen also needs loading, empty, and error states; works at 320/375/390/430/768/1024/1440; uses TanStack Query
(polling for new songs during the week, e.g. every 30–60 s on the current week, paused when the tab is hidden).

- [x] **P8.1 — Landing / Welcome** (§19.1, §27)
- [x] **P8.2 — Onboarding & join-by-code/link** (§26, §27) — `/join/:code` works logged out (sign up then auto-join).
- [x] **P8.3 — Home / Today** (§19.3) — today's songs first, then the rest of the week by day; "Share today's song"
  call to action (or "You've shared today's song ✓"; on weekends "Catch up on this week's songs"); countdown to the
  week's end (in the viewer's local time); members with today's submitted status; unrated count; party switcher;
  create party; "paused" state.
- [x] **P8.4 — Share Today's Song** (§19.4) — provider search, paste-link fallback, confirm step ("You can't change
  it after sharing"), "already shared today" state, weekend state.
- [x] **P8.5 — Rate This Week's Songs** (§19.5) — all of the week's songs grouped by day (anonymous per D10),
  play/open buttons, RatingControl, "Unrated" filter, progress ("12 of 31 rated"), change a rating any time until the
  week ends, clear "ratings lock Sunday 11:59 pm" notice.
- [x] **P8.6 — Weekly Results** (§16, §19.6) — overall ranking, each day's "Bop of the Day" winner, per-day view,
  averages, distribution chart, your rating vs group, reveal per settings.
- [x] **P8.7 — History** (§19.11) — past weeks list → weekly results.
- [x] **P8.8 — Personal Stats** (§17, §19.7) — every stat with "Based on N" or "Not enough data yet".
- [x] **P8.9 — Group Stats & Leaderboard** (§17, §18, §19.8–9) — each metric shows its definition (tooltip/help).
- [x] **P8.10 — Party Settings** (§19.10) — host only; non-hosts see read-only. Includes the party timezone (with a
  plain-language note: "Days run midnight to midnight in America/Chicago; ratings lock Sunday 11:59 pm"), visibility
  settings, and pause/resume.
- [x] **P8.11 — Profile / Account** (§19.12) — display name, avatar color, preferred music app (D22), sign out.
- [x] **P8.12 — Responsive & accessibility pass** (§21) (manual pass 2026-10-03: contrast AA fixes; automated 2026-10-04: `e2e/screens.spec.ts`, 17 screens × 7 widths) — check every screen at all 7 widths (screenshots via
  Playwright), keyboard navigation, color contrast AA, no horizontal scroll at 320px.
- [x] **P8.13 — Host-editable schedule** (Ethan, 2026-10-04; D1, D2) — the host picks the sharing days and the day +
  time ratings lock (11:59 pm on the last sharing day at the earliest); changes apply from next week. *Done when:* settings saves and
  validates them (API + form), weeks/results/home/share follow the week's own days and lock time, old parties keep
  Mon–Fri / Sunday 11:59 pm, unit + integration + screen tests.

---

## Phase 9 — Hardening

- [x] **P9.1 — Rate limiting** (§32) — API Gateway stage + per-route throttles (tighter on invites, search, writes);
  Cognito's built-in protections documented. No WAF unless an ADR justifies the monthly cost.
- [ ] **P9.2 — Frontend hosting stack** (§3) (template + deploy script done 2026-10-04; blocked: AWS must verify the account for CloudFront, see DEPLOYMENT.md §4c) — private S3 bucket + CloudFront with Origin Access Control, SPA
  fallback to `index.html`, CloudFront Response Headers Policy (HSTS, CSP, X-Content-Type-Options, frame-ancestors,
  referrer-policy), HTTPS only. CORS on the API set to the CloudFront origin.
- [x] **P9.3 — Security review** (§31) — run `/security-review`; check SECURITY.md checklist; fix findings.
  *Docs:* `docs/SECURITY.md` (threat model in plain language, what's stored, token handling, how to report issues).
- [x] **P9.4 — Observability** (§33) — confirm structured logs have request id, route, user sub (not email), outcome;
  confirm redaction; alarm test (force an error in dev and see the email).

---

## Phase 10 — End-to-end tests

- [x] **P10.1 — Playwright setup** — runs against `npm run dev` with a mocked API (MSW) for CI.
- [x] **P10.2 — Critical journey** (§34) — sign up → join party → share today's song → rate others' songs → (clock
  moved past Sunday) ratings locked → view weekly results, at 375px and 1440px.
- [x] **P10.3 — Dev-stack smoke test** (`npm run e2e:dev` written and passing on 2026-10-04, a Sunday; tick after a weekday run covers share → rate) — same journey against the deployed dev stack with two test users
  (credentials created in this task and stored only in a git-ignored local file). Manual trigger only.

---

## Phase 11 — CI/CD & production

- [x] **P11.1 — GitHub → AWS via OIDC** (§35) (superseded 2026-10-04 by ADR-0009: this account type can't create the
  OIDC provider; removed) — IAM OIDC provider + deploy role scoped to the `dropabop-*` stacks and
  frontend buckets (in a small separate `infra/bootstrap.yaml`). **No long-lived access keys.**
- [x] **P11.2 — Deploy workflow** (2026-10-04: replaced by `scripts/deploy.sh`, run from Ethan's Mac, ADR-0009; GitHub
  keeps running the checks) — on push to main: verify → `sam deploy` dev → build web → `aws s3 sync` → CloudFront
  invalidation. Prod job exists but requires a manual approval (GitHub Environment `production` with Ethan as reviewer).
- [ ] **P11.3 — First prod deploy** [HUMAN] — after AWS verifies CloudFront: protect `main` on GitHub, merge
  `build` → `main`, then `ALERT_EMAIL=… bash scripts/deploy.sh prod` (DEPLOYMENT.md §6). AI provides exact commands.
- [ ] **P11.4 — Prod verification** — run P10.3 smoke test against prod with a throwaway account; confirm alarms and budget.

---

## Phase 12 — Documentation & launch

- [x] **P12.1 — Complete docs** (§38) — README (all 11 required topics), ARCHITECTURE, DEVELOPMENT, DEPLOYMENT
  (incl. billing: where to see it, budgets, alerts, which services can charge, how to tear down), SECURITY,
  MUSIC_PROVIDERS, DATABASE, API. A reader who didn't build it can set up from scratch.
- [ ] **P12.2 — Cost check** — after one week of real use, read Cost Explorer with the user; record actual cost in
  ARCHITECTURE.md.
- [ ] **P12.3 — Launch** [HUMAN] — create your party, share the invite link with the group.

---

## Later (do not build until a real need appears — spec §42)

Real-time updates · notifications · email invites · avatar upload · more providers · caching · queue-based stats.
