# Progress

## Current focus

Phases 10–11 written. Waiting on Ethan: **P11.3** (put the repo on GitHub, deploy `infra/bootstrap.yaml`, set the
GitHub variables / secret / `production` environment: DEPLOYMENT.md §6), and AWS's two account requests (§4c).
Weekday checks still to run: **P4.3** and **P10.3** (`node scripts/smoke-dev.mjs`, `npm run e2e:dev`). Next AI work:
**P12.1** (complete the docs).

## Blocked / Questions for Ethan

- **CloudFront verification (blocks P9.2's deploy, 2026-10-04).** Creating the distribution failed: "Your account must
  be verified before you can add new CloudFront resources. ... contact AWS Support". Ethan opens a free Account and
  billing case (DEPLOYMENT.md §4c). Until then dev has `HostWebsite=false`.
- **Lambda concurrency is 10 for the account** (new-account default). Free quota request to 1,000 (DEPLOYMENT.md §4c).
  Not blocking: the website retries a 503 once.

Resolved 2026-10-01: ADR-0007 approved (iTunes plan); removed members → app asks the host to make a new invite link
(D17, P8.10); party limit lowered to 5 per person (D15).

## Environment facts

<!-- Record verified facts future sessions need: region, stack names, profile names, Node version, etc.
     Never record secrets, tokens, or passwords here. -->

- AWS region: **`us-east-2`** (the project's home region; regional services are denied everywhere else, and
  us-east-1 allows only global ones like IAM, billing, CloudFront, ACM). Set in `infra/samconfig.toml`; pass
  `--region us-east-2` to other CLI calls anyway (the `dropabop-dev` profile's default is also us-east-2).
- Alerts: SNS topic `dropabop-dev-alerts` → the alert email (confirmed 2026-10-03); budget `dropabop-monthly` $5.
- The GitHub repo is **public**: never commit account ids, emails, stack addresses, or test-user details.
- AWS account: AWS's *new experience* (projects, settings.aws.com); IAM Identity Center is unavailable there.
  CLI profile `dropabop-dev` signs in with `aws login --profile dropabop-dev` (role `AccountFullAccessRole`, 12 h credentials;
  verified 2026-10-03). See DEPLOYMENT.md §2.8.
- Stacks: `dropabop-dev` (live since 2026-10-03), `dropabop-prod` (planned). Old `sotd-dev` and its table and user pool were deleted by Ethan (2026-10-03).
- Lambda runtime: `nodejs24.x` (newest GA as of 2026-10-01; Node 26 is preview only). Local Node must be 24.
- Local Node: v24.21.0, npm 11.19.0 (verified 2026-10-01).
- AWS CLI 2.37.9, SAM CLI 1.166.2 (verified 2026-10-03). Set `SAM_CLI_TELEMETRY=0` to skip SAM's telemetry.
- Docker Desktop installed (engine 25.0.3). Its CLI is not on PATH by default: prefix commands with
  `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"`.
- Toolchain: TypeScript ~6.0.3 (TS 7 unsupported by typescript-eslint), ESLint 10, Vitest 5, Prettier 3.

## Session log

<!-- Newest first. One entry per task: date, task id, what changed, how it was verified, anything left over. -->

- 2026-10-04 — **P11.1 done, P11.2 written** — `infra/bootstrap.yaml`: GitHub OIDC provider (optional if it already
  exists), `dropabop-github-deploy` role (trust: this repo's `main` branch or its `production` environment; may only
  run change sets on the dropabop stacks, upload build files, publish the website, clear CloudFront) and
  `dropabop-cloudformation` role (what CloudFormation may do: listed actions only, on dropabop resources; IAM limited
  to `dropabop-dev-*`/`dropabop-prod-*` so it can't edit the deploy roles: a gap I found and closed while writing it).
  `infra-bootstrap.test.ts` locks those in. `.github/workflows/deploy.yml`: verify → dev deploy → dev website; prod
  behind the `production` environment's required reviewer, alert email from a secret. `scripts/deploy-web.sh` works
  in CI and skips while hosting is off. Verified: cfn-lint (it caught two non-existent API Gateway action names),
  guardrails, `npm run verify` (420 tests), workflow YAML parses, deploy-web skip path run against dev. **Not run
  yet:** the workflow and roles themselves (need P11.3). The local repo has no GitHub remote configured.
- 2026-10-04 — **P10.3 (written; weekday run pending)** — `e2e/dev-stack.spec.ts` + `npm run e2e:dev`: the host and a
  friend (the two test users) sign in through the real Cognito screens, the friend joins via the invite link, the
  host shares today's song (real iTunes search) and the friend rates it on weekdays (on weekends it checks sharing is
  closed), then the friend leaves. Must use port 5173 (the dev API's only allowed local origin). Found a real bug:
  after leaving a party the app stayed on Settings, because the data refresh removed the screen before its "go
  home" step ran; fixed (refresh in the background) + screen test. Verified: `npm run e2e:dev` passed on the dev
  stack (Sunday path); `npm run e2e` 2/2; `npm run verify` exit 0 (417 tests + 1 skipped).
- 2026-10-04 — **P10.1 + P10.2 done** — Playwright 1.63 (dev dep; no browser download: locally it uses the installed
  Google Chrome, CI installs Chromium). Instead of MSW (roadmap suggestion) the e2e test runs the website in sample
  mode, reusing the in-memory preview API every screen already works with (no new dependency). Sample mode gained
  `window.__dropabopSample.closeWeek()` (dev-only stand-in for the server clock passing Sunday night; results
  computed from the sample songs and your ratings). `e2e/journey.spec.ts`: join a party from an invite link → share
  today's song (search, confirm) → rate a song → week closes → results show it → Rate shows nothing to rate; no
  horizontal overflow; at 375 px and 1440 px. Found and fixed: React dev mode built the sample world twice, so the
  hook reached the wrong copy (now one world per page load). CI job `e2e` added. Verified: `npm run e2e` 2/2 passed;
  `npm run verify` exit 0. Sign-up/sign-in are covered against real Cognito by P10.3 / `scripts/smoke-dev.mjs`.
- 2026-10-04 — **P9.4 done** — API Gateway access log (`/dropabop/<stage>/api-access`, same retention) so requests
  rejected before our code (missing/bad token, throttling) are logged with the reason; no IP or headers. Verified live:
  401s show "missing: token not provided" / "invalid_token…", a 429 shows the route and user id; app log lines carry
  requestId, route, userId (sub), status, durationMs; past hour of both log groups grepped: no tokens, Authorization,
  passwords, or emails. Alarm test: `set-alarm-state` forced `dropabop-dev-lambda-errors` to ALARM → alarm history
  "Successfully executed action … dropabop-dev-alerts", SNS NumberOfNotificationsDelivered = 1 (email to the alert
  address; Ethan to confirm it arrived).
- 2026-10-04 — **P9.3 done** — Independent security review (read-only agent): no HIGH. Fixed MEDIUM: invite codes
  were guessable (any account, ~173k tries/day at the route limit) → at most 10 wrong codes per person per hour
  (`data/invite-attempts.ts`, hourly counter with TTL; preview and join answer 429 after that; correct codes never
  count). Fixed LOW: CSP `connect-src` allowed any API Gateway → production `index.html` now carries a CSP naming the
  exact API and Cognito hosts (Vite plugin; build fails without them); prod can't be deployed with `DevOrigin` or
  without the website (template Rules). Documented (accepted): party-limit race, access token valid ≤1 h after
  sign-out (ADR-0008), musical-twin 0-gap. New `docs/SECURITY.md` (threat model, data stored, tokens, reporting,
  release checklist). `npm audit --omit=dev`: 0 vulnerabilities. Deployed (table TTL on, preview role gains
  UpdateItem, access log). Verified live: smoke 34/34; 10 wrong codes then 429; integration tests 185/185 (2 new);
  `npm run verify` exit 0 (410 tests + 1 skipped).
- 2026-10-04 — **P9.2 (written; deploy blocked by AWS)** — Template: private S3 bucket (public access blocked,
  owner-enforced, SSE, HTTPS-only deny), Origin Access Control, bucket policy letting only this distribution read,
  response-headers policy (HSTS 2 y, nosniff, DENY framing, strict-origin-when-cross-origin, CSP: self + Apple art +
  Cognito/API Gateway in-region, `frame-ancestors 'none'`), CloudFront (HTTPS redirect, CachingOptimized,
  PriceClass_100, SPA fallback 403/404 → index.html). API CORS: the CloudFront site, plus `DevOrigin` (localhost) in
  dev; `FrontendOrigin` parameter replaced. `scripts/deploy-web.sh` (build with stack outputs, upload with immutable
  assets / no-cache index, invalidate). zod set to jitless (no runtime code generation under CSP). `HostWebsite`
  switch so dev can deploy without CloudFront until AWS verifies the account; a test forbids turning it off in prod.
  Verified: `sam validate --lint`, `npm run verify`, template tests (bucket private, HTTPS, headers, CSP, CORS).
  First deploy attempt: CloudFront refused ("account must be verified"); stack rolled back cleanly, smoke 34/34 after.
- 2026-10-04 — **P9.1 done** — Per-route throttles in `RouteSettings` (search 3/s burst 10, invites/join 2/5, create
  party and new link 1/3, other writes 2/5, share 5/10, rate 10/20; default 25/50); test checks every key is a real
  route and sensitive ones are tighter. Website: 429 → "please wait a few seconds"; 503 (AWS couldn't start the
  function) retried once then "busy"; Cognito lockout ("Password attempts exceeded") explained instead of "wrong
  password". Docs: API.md → Rate limits, ARCHITECTURE.md. Deployed to dev (change set: API, stage, function code
  only). Verified live: stage shows `GET /songs/search` 3/10; sustained bursts on `/invites/{code}` got 429s (AWS
  applies limits as best-effort targets); 40 parallel searches hit the account's **10 concurrent Lambda** limit (503),
  hence the retry and the quota request above.

- 2026-10-03 — **Phase 8 review fixes** — Spec review of the screens: no privacy leak, security issue, or API behaviour
  change found. MUST FIX done: when a party reveals recommenders (D10), Home and Rate now show "Shared by …" and the
  Home / Rate / Share texts no longer promise anonymity (the Share confirm step tells the sharer people will see it's
  theirs); preview API mirrors the real API's D10 rules. SHOULD FIXes done: auto-join after signing up / logging in
  from an invite link (P8.2 "sign up then auto-join"; opening a link while already signed in still asks); a rating
  tapped just before leaving the page is still saved; malformed links can't crash a screen (safe decode) and a
  top-level error boundary shows a friendly message; the sample preview needs an explicit `--mode sample`, so a build
  missing its settings fails loudly instead of serving fake data. NICE: Sign out on Profile, failed rating rolls back
  only that song, timezone note says changes apply next week, sign-out forgets the remembered party, Stats uses the
  shared `Stat<T>`. Process note: P8.2–P8.11 went into one commit (`ed8461b`) rather than one per task, and their
  boxes are ticked before Ethan's real-stack walkthrough; ROADMAP.md says so above the Phase 8 list. Verified:
  `npm run verify` exit 0 (403 tests + 1 skipped; 7 new screen tests).

- 2026-10-03 — **P8.2–P8.11 (+ P8.12 manual pass)** — Every screen wired to the API: Home/Today (open week, weekend,
  paused, between weeks, not-in-a-party onboarding, "what should we call you?" for new accounts, 45 s polling,
  countdown in local time, today's songs first, ✓ per member only when the party reveals recommenders: D10), join by
  link (works signed out: code kept in sessionStorage through sign-up/sign-in) and by code, create party (invite link),
  Share (iTunes search, paste Apple Music link, optional Spotify/YouTube links, confirm "can't change it", already
  shared / weekend / paused), Rate (by day, Unrated filter, progress, lock notice, saves after a 0.4 s pause,
  optimistic update), Results (Bop of the Day per day, overall / by-day ranking, spreads, your rating, who-rated-what
  only with D11), History (paged), Stats (you / group / leaderboard, every number with "Based on N" or "Not enough
  data yet" and its definition), Party settings (host edit, read-only for members, switches, pause, invite link
  copy / replace, remove → "make a new link?" per D17, leave), Profile (name, colour, preferred app D22). Party
  switcher + create/join in the frame; sign-out clears cached data. Foundation: `packages/shared/src/api-types.ts`
  (API handlers now `satisfies` these, which caught a possible `party: null` in the join response, fixed),
  `api/hooks.ts`, `party/CurrentParty.tsx`, `preview/preview-api.ts` (sample mode + tests). Verified: `npm run verify`
  exit 0 (396 tests + 1 skipped; 36 new screen tests), integration tests 183/183 (DynamoDB Local), web build OK
  (622 kB / 182 kB gzip; sample data confirmed absent from the bundle). Browser (sample mode, port 5174): every page
  viewed at 1280 px and 320 px; no horizontal scroll on 16 pages × 7 widths; no unnamed buttons/links, unlabelled
  inputs, or missing h1; contrast checked (fixed: "Your pick" text and step numbers were below AA). **Not verified:**
  the screens against the real dev stack (Ethan's walkthrough); keyboard-only walkthrough beyond unit tests;
  Playwright screenshots (P10.1). Follow-up: the bundle is over Vite's 500 kB advisory; route code-splitting in P9.

- 2026-10-03 — **Daily winner renamed "Bop of the Day"** (Ethan; D12, D24, SPEC note) in docs, API comments, tests.

- 2026-10-03 — **Old dev stack removed** — Ethan ran `sam delete` for `sotd-dev`, then deleted its retained table and
  user pool. Verified (us-east-2): tables, user pools, stacks, and log groups now list only `dropabop-dev` resources
  (plus SAM's `aws-sam-cli-managed-default` bucket stack).

- 2026-10-03 — **P4.4 done** — Ethan confirmed the SNS subscription (list-subscriptions shows a real subscription
  ARN, no longer PendingConfirmation). CLI profile `dropabop-dev` works (`sts get-caller-identity` →
  `AccountFullAccessRole`, region us-east-2). Billable resources are listed in ARCHITECTURE.md and DEPLOYMENT.md §4.

- 2026-10-03 — **dropabop-dev deployed (+ P4.4 resources)** — 82 resources, CREATE_COMPLETE. Alert email passed as a
  NoEcho parameter at deploy time (not in the repo). Verified: smoke test 34/34 on the new stack; 4 alarms in state OK;
  budget `dropabop-monthly` $5 exists; SNS subscription `PendingConfirmation` (Ethan must click the link). Website
  local config points at `dropabop-dev`. Left for P4.4: the subscription confirmation. Note: the prod-guard hook
  also fires on doc-editing shell commands that mention a CLI login and the prod stack name; use the file tools.

- 2026-10-03 — **Rename: Song of the Day → Drop a Bop** (Ethan's request; D24, SPEC.md header note) — app name in
  the UI, verification email, docs, skills and hooks; `@sotd/*` → `@dropabop/*` packages; stacks, user pool, log
  group, alarms, budget → `dropabop-*`. Kept: "Song of the Day" as the name of each day's winner (D12), history in
  this log, the repo folder name. Prod-deploy guard blocks both `dropabop-prod` and `sotd-prod`. CLI profile renamed
  to `dropabop-dev` in docs (Ethan runs `aws login --profile dropabop-dev`). Verified: `npm install`, `npm run verify`
  exit 0 (361 tests + 1 skipped), `sam validate --lint`, `sam build --config-env dev`.

- 2026-10-03 — **P7.3 done** — Ethan ran the real flow on the website against `sotd-dev`: sign-up → emailed code →
  sign-in → sign-out → forgot password → sign-in with the new password, all working (his account is CONFIRMED in the
  dev pool). Added during the run: a Sign out button in the app frame (none existed; P8.11 adds it to Profile too) and
  a sample-data banner on Home that also shows when really signed in (was preview-only). Verified: `npm run verify`
  exit 0 (360 tests + 1 skipped), sign-out covered by a new test.

- 2026-10-03 — **P4.3 (deployed, 2 checks left)** — Ethan approved; `sotd-dev` created in us-east-2 (75 resources,
  CREATE_COMPLETE). First run: every function failed at startup ("Dynamic require of node:https": the bundled AWS
  SDK is CommonJS and an ES-module bundle has no `require`; the earlier local check used `node -e`, which has one).
  Fixed with an esbuild `createRequire` banner; new `bundle.test.ts` loads the bundle in a plain ES-module Node
  process (fails without the fix, passes with it). Redeployed (code-only change set). `scripts/smoke-dev.mjs` (two
  throwaway users, passwords in git-ignored `.test-users.json`; SRP sign-in via Amplify; stack outputs read live):
  34/34 pass, including no token/garbage token → 401, ID token → 403 (scope), access token → 200, NOT_A_MEMBER,
  NOT_HOST, ALREADY_MEMBER, INVALID_INVITE, RESULTS_NOT_READY, iTunes search (10 songs), sharing → 409 WEEKEND
  (Saturday). CloudWatch logs checked: no tokens, Authorization headers, passwords, or emails. Verified also:
  `npm run verify` exit 0 (359 tests + 1 skipped). Left: weekday share → rate, website sign-up run (needs Ethan's
  email). The website's local config file was created (git-ignored); `apps/web/.env.example` region → us-east-2.

- 2026-10-03 — **P4.1** — Ethan's account uses AWS's new experience (projects); IAM Identity Center is unavailable
  there, so the CLI signs in with `aws login --profile sotd-dev` (DEPLOYMENT.md §2.8). Region us-east-1. Project
  spend limit $20/month (the lowest AWS offered); no Budgets yet, P4.4 adds a $5 budget alert. Verified:
  `aws sts get-caller-identity --profile sotd-dev` → `AccountFullAccessRole`; `aws budgets describe-budgets` → none.

- 2026-10-03 — **P4.0 + P4.2 done** — Ethan installed the tools (`aws --version` 2.37.9, `sam --version` 1.166.2).
  Verified: `sam validate --lint` → "valid SAM Template"; `sam build` and `sam build --config-env dev` → Build
  Succeeded, 23 functions, each with the 1.1 MB `index.mjs`; guardrails pass. Leftovers: a real DynamoDB call from
  the bundle is still unverified (P4.3 smoke test).

- 2026-10-02 — **P4.2 (code done, SAM checks pending)** — `infra/template.yaml`: on-demand table with caps, PITR
  and deletion protection in prod, Retain policies (table + user pool); Cognito pool (email sign-in, code verification,
  password rules matching the sign-up form, Essentials plan) + public SRP web client; HTTP API with a Cognito JWT
  authorizer on every route (audience = client id, scope `aws.cognito.signin.user.admin` so ID tokens are refused),
  CORS for one `FrontendOrigin`, default throttle 25/50; 23 functions (22 Phase 5 routes + new `GET /health`), Node 24
  arm64 256 MB, one shared 14-day log group, per-function IAM with only the DynamoDB actions each handler uses (traced
  by hand and confirmed by the spec reviewer; never Scan). Prod `FrontendOrigin` must be https (template Rule) and
  isn't set yet (P9.2). `infra/samconfig.toml` (dev/prod, `build_in_source`), `services/api/Makefile` +
  `scripts/bundle.mjs` (esbuild → one 1.1 MB ESM bundle; the AWS SDK is bundled because the runtime's copy is an
  unpinned older minor version), `src/lambda.ts` (bundle entry). `infra-template.test.ts`: key schema =
  `TABLE_KEY_SCHEMA`, handlers = lambda exports, Makefile targets, routes = docs/API.md, IAM actions, authorizer,
  CORS. Docs: new ARCHITECTURE.md, API.md (/health), DEPLOYMENT.md (costs, build-then-deploy). Verified:
  `npm run verify` exit 0 (358 tests + 1 skipped); cfn-lint 1.57.1 (the linter `sam validate --lint` uses) passes and catches a
  planted type error; bundle imports and runs a handler in Node 24 up to the network call. Spec review: 1 MUST FIX
  (plain `sam build` wouldn't build in place) fixed; SHOULD FIXes applied. **Not verified:** `sam validate --lint` and
  `sam build` (SAM not installed: P4.0), and a real DynamoDB call from the bundle (Docker was off; P4.3 covers it).
  Known limit: ADR-0005's read cap (prod 100/s) may throttle the stats page once history grows; P4.4's throttle
  alarm will show it. Dev deps: esbuild (bundles the Lambdas), yaml (test parses the template).

- 2026-10-01 — **P6.3 + P6.4** — iTunes catalog (`providers/itunes.ts`: search + lookup, 5 s timeout, 10-min
  in-memory cache, 403/429 → friendly busy message, results validated with `songSchema`, 300×300 artwork via the
  observed URL pattern), `SongLookup` now has `searchSongs`, `PROVIDER_CAPABILITIES` (spec §10), production deps use
  the iTunes catalog. Shared `links.ts` (Spotify/YouTube/Apple Music URL parsers, canonical + search links) and
  updated schemas: submit = `{provider:'appleMusic', providerSongId: digits, links?}`, search `q` ≥ 2 chars, resolve =
  Apple Music links only. Sharing stores pasted links as canonical URLs. New `GET /songs/search`, `POST /songs/resolve`
  (both added to the authorization sweep). Verified: live response sampled and live opt-in test passed against the
  real iTunes API; unit 348 (+1 live skipped by default), integration 179; `npm run verify` exit 0.

- 2026-10-01 — **P6.1** — Research (research subagent, official sources only, every claim cited; UNCONFIRMED items
  marked) → `docs/MUSIC_PROVIDERS.md` + ADR-0007 (**Proposed**, needs Ethan's approval). Key findings: Spotify Dev Mode
  now needs the owner's Premium, 5-user cap, terms forbid our snapshot and multi-service integration; Apple Music API
  $99/yr and playback-tied terms; YouTube search 100/day + 30-day refresh rule; Odesli API retired 2026-07-31; iTunes
  Search API free/keyless. Proposed v1: iTunes search + Apple Music badge + member-pasted Spotify/YouTube links.

- 2026-10-01 — **P7.3 (code done, live check pending)** — ADR-0008: Amplify JS v6 auth only (official, maintained,
  works with an existing pool; SRP default confirmed in the installed source; localStorage tokens with CSP as the
  mitigation). `auth/` (AuthService interface + Amplify implementation + preview fake, AuthContext, friendly Cognito
  error messages that don't reveal whether an account exists), `api/client.ts` (Bearer header, one refresh-and-retry on
  401 then sign-out, API error passthrough, network errors), screens: sign in / sign up / verify email / forgot
  password (`AuthScreens.tsx`, `TextField`), `RequireAuth` route guard returning people to where they were. `main.tsx`
  uses real auth when env is set; dev without env → labelled sample preview; prod without env → fails loudly.
  Verified: 13 new web tests (34 web total; 313 overall); `npm run verify` exit 0; build OK (bundle 440 kB / 134 kB gz,
  +~140 kB from Amplify); sign-in screen checked in the browser. **Remaining:** real sign-up/sign-in against the dev
  user pool (added to P4.3). Dep: aws-amplify (runtime, web).

- 2026-10-01 — **P7.2** — Components: `RatingControl` (1–10 radio group, arrow/Home/End keys, roving tabindex),
  `Modal` (Escape/close, focus in and back), `States` (Skeleton/LoadingState/EmptyState/ErrorState), `Stats`
  (StatCard with "Not enough data yet"/"Based on N", Leaderboard with shared ranks, RatingDistribution as plain HTML
  bars — no chart library needed), plus existing Button/Card/Avatar/AlbumArt/ProgressBar/SongCard. Vitest now has two
  projects (`node`, `web` with jsdom + Testing Library + jest-dom). Dev-only `/dev/components` gallery (excluded from
  the production bundle — verified by grepping dist). Verified: 21 component tests; `npm run verify` exit 0 (300
  tests); gallery at 320px and 1440px: no horizontal scroll, sidebar visible on desktop, no console errors (checked
  programmatically — the browser pane was hidden, so no screenshots this time). Dev deps: @testing-library/{react,dom,
  user-event,jest-dom}, jsdom.

- 2026-10-01 — **P7.1** (done early at Ethan's request to see the UI) — `apps/web`: Vite 8 + React 19 + React
  Router 8 (declarative mode; API checked in its docs) + TanStack Query 5 + Tailwind 4 (`@tailwindcss/vite`).
  Tokens sampled from the mockup with PIL → `index.css` `@theme`, recorded in docs/design/README.md. `AppShell`
  (sidebar ≥ md, bottom tab bar on mobile), basic components (`ui.tsx`, `Icon`, `SongCard`), `config.ts` (lazy env
  read, fails loudly), `.env.example`. Head start on P8.3: `HomeScreen` rendered with sample data (dev-only banner
  says so; other routes show "built in task …"). **P8.3 is not done** (no API wiring, states, or tests yet).
  `.claude/launch.json` "web" for the preview. Verified: `npm run build -w @dropabop/web` → static files only
  (298 kB JS / 22 kB CSS); screenshots at desktop and 375px; 320px has no horizontal scroll; no console errors;
  `npm run verify` exit 0.

- 2026-10-01 — **Phase 5 review** — Independent spec review of P5.1–P5.11 returned 1 MUST FIX: the current-week
  endpoint listed *who* shared today, which combined with the (polled) songs list revealed whose song is whose,
  defeating D10. Fixed: only `sharedTodayCount` by default; `sharedTodayUserIds` only when the party reveals
  recommenders (D10, API.md, design README screens 9/15 updated). SHOULD FIXes applied: moving-clock test proving
  `updatedAt` uses a fresh clock read (mutation-checked: fails if the check time is reused); D9 tests with a third
  member's rating (myRating stays null; progress unaffected); sweep outsider now belongs to another party
  (cross-party on every route) and regenerate moved last with an accurate comment; API.md 404 for stats; roadmap
  wording; D15 soft-limit note; musical-twin note in STATISTICS.md; membership/recommendations readability.
  Logged two product questions above. Verified: unit 280, integration 171, `npm run verify` exit 0.

- 2026-10-01 — **P5.11** — `handlers/authorization.integration.test.ts`: table-driven sweep of all 19 routes ×
  {no token, ID token} → 401, and × {outsider, left member, member, host} → expected status/error code; plus
  client-supplied identity checks (body rejected, path/query ignored, strict query rejects extras). No gaps found.
  Verified: integration 169 (63 in the sweep), unit 280; `npm run verify` exit 0. **Phase 5 complete.**

- 2026-10-01 — **P5.10** — `handlers/stats.ts`: personal stats, group stats, leaderboards, computed on read from
  closed weeks (ADR-0006, new). Closed weeks are chosen by *effective* status (time + song count), not the stored
  field. Song summaries attached to song-based winners; member names included. Added `personalStatsQuerySchema`.
  Verified: integration 106 (6 new; seeded 3 closed weeks + an open week whose ratings must not leak — they don't);
  `npm run verify` exit 0.

- 2026-10-01 — **P5.9** — `handlers/results.ts`: results after the week ends (`canViewResults`), lazy close
  recorded, `calculateWeekResults` with party visibility settings, plus current member names. Verified: integration
  100 (6 new: locked while open, full ranking + daily winners + revealed recommenders, who-rated-what toggle, late
  rating ignored, <2 songs → no results + history NOT_ENOUGH_SONGS, non-member 403); `npm run verify` exit 0.

- 2026-10-01 — **P5.8** — `handlers/votes.ts`: rate/change rating (song must be in this round; `canCastVote`;
  `updatedAt` from a fresh clock read) and list my ratings. Verified: integration 94 (6 new: change of mind, last-ms
  accept + Monday lock keeps the earlier rating, own song, invalid ratings/extra fields, cross-party attempts both
  ways, only-my-votes); `npm run verify` exit 0.

- 2026-10-01 — **P5.7** — `handlers/recommendations.ts`: share today's song (body validated → rules via
  `resolveCurrentWeek` + `canSubmitRecommendation` → server-side song lookup validated with `songSchema` → random id →
  conditional write) and list the week's songs (privacy via `toOpenWeekSongView`; recommenders revealed after the week
  ends or by setting). New `SongLookup` dependency (`providers/song-lookup.ts`): production uses
  `unavailableSongLookup` (502 PROVIDER_UNAVAILABLE) until P6.3 — **sharing won't work in a deployed env until then**;
  tests use a fake. `loadRoundForMember` (weeks.ts) scopes round routes to the round's own party. Verified:
  integration 88 (8 new incl. cross-party roundId → 403, simultaneous shares → 201+409, weekend/ended/paused/other
  week); `npm run verify` exit 0.

- 2026-10-01 — **P5.6** — `handlers/weeks.ts`: `resolveCurrentWeek` (shared: records the previous week's close,
  then `planCurrentWeek` → use/create/none), current-week endpoint (today, sharedToday, who shared today without
  revealing songs, rating progress excluding own songs), paged history with validated query. Added
  `listWeekSubmissions` (data) and `roundHistoryQuerySchema` (shared). Verified: integration 80 (8 new: first-visit
  creation, progress per person, weekend, Monday rollover + NOT_ENOUGH_SONGS recorded, pause, 4 simultaneous first
  visits → 1 round, non-member 403, paging + bad cursor 400); `npm run verify` exit 0.

- 2026-10-01 — **P5.5** — `handlers/settings.ts`: host-only rename + settings; size limit checked in code and DB;
  unknown fields (host, invite code) rejected by the strict schema. Verified: integration 72 (4 new); verify exit 0.

- 2026-10-01 — **P5.4** — `handlers/membership.ts`: invite preview (name + capacity only; all bad codes → same
  INVALID_INVITE), join (code must be current and match the party; 20-party limit; DB re-checks atomically),
  host-only code regeneration (retry on clash), leave/remove (host can't leave or be removed). Verified: integration
  68 (10 new); `npm run verify` exit 0.

- 2026-10-01 — **P5.3** — `handlers/parties.ts`: create (host from verified user, random invite code with retry on
  clash, default settings), list mine, get one (members only). Shared helpers `loadPartyForMember` (404 vs 403) and
  `assertCanJoinAnotherParty`. Decision: max 20 parties per person (D15, §32; `MAX_PARTIES_PER_USER`). Verified:
  integration 58 (7 new incl. 20-party limit, non-member 403, unknown 404, malformed id 404, `hostUserId` in body
  rejected); `npm run verify` exit 0.

- 2026-10-01 — **P5.2** — `handlers/users.ts` (`getMe` returns profile + parties, creating the profile on first
  call; `updateMe` field-level update), `domain/profile.ts` (default name "New member" since access tokens carry no
  name/email; deterministic palette avatar color). Test infra: `test/handler-deps.ts` (real local DB + controllable
  clock). Verified: integration 51 tests (7 new: create-on-first-call, idempotent, 401, update, body `userId`
  rejected, friendly validation message, empty update), unit 280; `npm run verify` exit 0.

- 2026-10-01 — **P5.1** — `services/api/src/http/`: `request.ts` (`getAuthenticatedUser` from verified JWT claims
  only + requires `token_use = access`; `parseBody` with 10 KB cap, base64, friendly zod errors; `parseQuery`;
  `pathId`/`pathParam`), `handler.ts` (`runHandler` for tests, one-arg `createHandler` for Lambda — avoids Lambda's
  context being mistaken for deps; `Deps` = data/now/newId; ok/created/noContent; DomainError → status + message;
  unknown → generic 500), `errors.ts` (status map for every code, `fail`, `assertAllowed`), `logger.ts` (JSON lines,
  recursive case-insensitive redaction). `test/events.ts` builds realistic HTTP API v2 events. Claims location and
  ID-vs-access-token caveat verified in the API Gateway JWT authorizer docs (2026-10-01). New `docs/API.md`
  conventions. Verified: `npm run verify` exit 0, 278 tests (18 new). Dep: @types/aws-lambda (dev).

- 2026-10-01 — **P3.3** — Data layer in `services/api/src/data/`: `keys.ts` (validated key builders, `parseRoundId`),
  `errors.ts` (`DomainError`, condition/transaction failure helpers), `context.ts` (`DataContext`, paginated queries,
  `transactWrite` with conflict-only retry), `users.ts`, `parties.ts`, `rounds.ts`, `recommendations.ts`, `votes.ts`.
  **Independent spec review** (subagent) returned 1 MUST FIX — regenerating the invite code twice with the same old
  code surfaced a raw error — fixed (`CONFLICT` "just changed" message, new error code). Also applied its SHOULD FIXes:
  host can't be removed (DB condition), profile updates set only changed fields, rename/profile copies best-effort,
  `putRecommendation` asserts partition match + UUID id (D10), scoping comments for handlers, invite key regex uses
  the strict shared pattern, `isTransactionConflictOnly` moved to errors.ts, fixtures use the real code generator,
  DATABASE.md drift fixed (settings/profile rows, best-effort copies, pagination, rating-lock edge). Probed real
  concurrency: losers of simultaneous joins/shares get friendly DomainErrors. Verified: `npm run verify` exit 0;
  integration 44 tests pass (races: 3-way last spot, same-user double join, double removal, double regenerate,
  simultaneous same-day shares, 5 simultaneous week creations, profile edits from two devices). **Phase 3 complete.**

- 2026-10-01 — **P3.2** — `docker-compose.yml` (amazon/dynamodb-local:3.3.1, in-memory, bound to 127.0.0.1),
  `db:up`/`db:down` scripts, `data/table-definition.ts` (single key schema), `data/client.ts` (env-configured client;
  `assertLocalEndpoint` refuses non-localhost endpoints), vitest global setup that recreates the test table (also
  refuses non-local), smoke integration test, CI `integration` job with a DynamoDB Local service container. Used a
  global setup instead of a separate create-table script (Node can't run our extensionless TS imports directly).
  Verified: integration smoke test passes against DynamoDB Local; pointing the run at a real AWS endpoint fails with
  "must be localhost" before any network call; `npm run verify` exit 0, 231 tests. Deps: @aws-sdk/client-dynamodb,
  @aws-sdk/lib-dynamodb (runtime, api). CI integration job not yet run on GitHub (branch unpushed).
- 2026-10-01 — **P3.0** — Ethan installed Docker Desktop; started it; `docker info` works (engine 25.0.3).

- 2026-10-01 — **P3.1** — `docs/DATABASE.md`: single table, no GSIs, one partition per party; 16 access patterns all
  GetItem/single-partition Query; write table with every condition/transaction (party size, unique membership, one
  week per week, one song per day via marker item, invite regeneration). ADR-0005: on-demand + `OnDemandThroughput`
  caps, PITR + deletion protection in prod (pricing/free-tier/CFN property verified on official pages 2026-10-01).
  Design finding: DynamoDB conditions can't compare to "now", so the rating lock is two layers — server-clock check
  before write + ignore votes saved at/after `endsAt`. Implemented: `countableVotes` (results) and `buildStatsData`
  now takes the closed rounds and drops open-week data and late votes (closed-weeks rule now enforced in code, not
  by callers). Updated ADR-0003/0004, D8, P3.3 wording. Verified: `npm run verify` exit 0, 222 tests (3 new).

- 2026-10-01 — **P2.5** — `domain/party.ts`: `generateInviteCode` (node:crypto, rejection sampling to avoid bias),
  `canJoinParty` (invalid/regenerated code, already member, full, last spot), `isHost`, `canViewParty`,
  `canManageParty` (party record must agree with role), `canRemoveMember` (leave / host removes / host can't leave),
  `canSetMaxMembers`. Added host-can't-leave + limit rule to D17. Verified: `npm run verify` exit 0, 219 tests.
  **Phase 2 complete.**

- 2026-10-01 — **P2.4** — `domain/stats.ts`: every personal/group stat from the PRODUCT_DECISIONS table plus five
  leaderboards; `Stat<T>` = ok {value, sampleSize} | not-enough-data {sampleSize, required}; superlatives return all
  tied winners. Stats take closed weeks only (caller's job; documented). Tightened three definitions so they're
  computable (crowd favorite = 75% of that week's active raters excl. recommender; dark horse needs 3 song ratings;
  most surprising = songs beating own earlier average by ≥1.0). New `docs/STATISTICS.md`. Verified: 36 stats tests
  (normal / below minimum / ties); found and fixed a test that couldn't fail (crowd-favorite recommender exclusion),
  then confirmed by mutation that it now catches the bug. `npm run verify` exit 0, 197 tests.

- 2026-10-01 — **P2.3** — `domain/results.ts`: `toOpenWeekSongView` (D9/D10 privacy while open), `canViewResults`,
  `calculateWeekResults` (weekly ranking, per-day groups, daily winners incl. ties, anonymous distribution, viewer
  rating, `ratings` only when `showWhoRatedWhat`), `roundToOneDecimal`. Decision: rank by the displayed 1-decimal
  average (added to D12). Self-ratings and unknown-song votes ignored defensively. Verified: 24 results tests; mutation
  check (forcing both visibility settings on) fails 2 tests; `npm run verify` exit 0, 161 tests.

- 2026-10-01 — **P2.2** — `domain/rules.ts` (`canSubmitRecommendation` returns the server-decided day;
  `canCastVote`; `isValidRating`) and `domain/messages.ts` (all friendly messages + `RuleResult`). Covered: non-member,
  other party, paused, between weeks, wrong round, weekend, second song same day, week ended (exact ms edge), own song,
  song from another week/party, invalid ratings, late joiners. Verified: `npm run verify` exit 0, 137 tests.

- 2026-10-01 — **P2.1** — `services/api/src/domain/week.ts`: week windows, submission day, effective status, pending
  close, and `planCurrentWeek`. Library: Luxon (readable immutable API, built-in zones, ISO Monday weeks; Temporal not
  in Node 24). Decisions made (documented in D1 / ADR-0003): rounds store their timezone and a timezone change applies
  from the next week; new weeks start only after the previous ends and for a later Monday (no overlap/id reuse);
  `endsAt` is the exclusive next-Monday instant; round ids use `partyId.<Monday>` (URL-safe, not `#`). Verified: 32 week
  tests (all weekdays, weekend, Fri/Sun midnight edges, US DST 167h/169h weeks, Kolkata/Auckland/Tokyo, 60 consecutive
  weeks, pause, east/west timezone changes); mutation check: disabling the overlap rules fails 2 tests. `npm run verify`
  exit 0, 111 tests. Dependency added: luxon (runtime, api) + @types/luxon (dev).

- 2026-10-01 — **P1.3** — `@dropabop/shared`: limits/enums (`limits.ts`), domain types (`types.ts`), API error shape +
  codes (`errors.ts`), zod 4 request schemas (`schemas.ts`). Decisions made: all request schemas are strict (unknown
  keys like `userId` are rejected, spec §24); recommendation requests carry only `{provider, providerSongId}` so the
  server looks up song metadata itself (client can't forge titles/links); only https links accepted; invite codes
  normalized to uppercase. Zod 4 APIs checked against https://zod.dev/api (2026-10-01). Verified: `npm run verify`
  exit 0, 79 tests pass. Dependency added: zod ^4.6.5 (runtime, shared).

- 2026-10-01 — **P1.2** — CI workflow: guardrails → setup-node (from `.nvmrc`, npm cache) → `npm ci` → `npm run verify`.
  Uses actions/checkout@v7 and actions/setup-node@v7 (latest majors via `git ls-remote`; inputs confirmed in the
  setup-node README, 2026-10-01). Verified: YAML parses; `npm ci && npm run verify` exit 0 locally. **Not yet verified
  on GitHub**: the `build` branch hasn't been pushed (push needs Ethan's OK).

- 2026-10-01 — **P1.1** — npm workspaces (`packages/shared` as `@dropabop/shared`, `services/api`, `apps/web`
  placeholder), strict `tsconfig.base.json`, ESLint flat config with type-aware rules, Prettier, Vitest unit +
  integration configs, `.nvmrc` = 24, root scripts incl. `verify`, `docs/DEVELOPMENT.md`. Verified: `npm run verify`
  exit 0 (3 test files / 3 tests pass, guardrails pass). Negative check: a deliberate type error fails `typecheck`
  (exit 2) and an un-awaited promise fails lint (`no-floating-promises`). Leftovers: none.
- 2026-10-01 — **P1.0** — Ethan installed Node 24. Verified `node -v` = v24.21.0.

- 2026-10-01 — **P0.3** — Added approved mockup `docs/design/mockup-v2-overview.webp` and `docs/design/README.md`
  (visual language, layout, screen-by-screen map to roadmap tasks, adaptations for the weekly model). New decisions
  D22 (preferred music app instead of account connections) and D23 (email/password only; Google sign-in deferred).
  Linked from P7.1, Phase 8, P8.11, CLAUDE.md.

- 2026-10-01 — **Planning change** — Ethan set the round model: one song per member per weekday (Mon–Fri),
  rate any song from the current week until Sunday 23:59:59 (party timezone), then ratings lock. Also confirmed:
  provider-neutral music (group uses mixed services), free CloudFront URL (no custom domain), recommender hidden
  until results. Updated PRODUCT_DECISIONS D1–D5, D8, D9, D12, D20; new ADR-0004; rewrote ADR-0003; updated
  roadmap tasks P1.3, P2.1–P2.3, P3.1, P3.3, P5.5–P5.9, P8.3–P8.7, P8.10, P10.2. Later ADR numbers shifted by one.

- 2026-10-01 — **P0.1** — Added spec, CLAUDE.md, roadmap, product decisions, ADRs 0001–0003,
  guardrail script, Claude Code hooks/skills/reviewer agent, CI skeleton. Verified:
  `bash scripts/guardrails.sh` passes; guardrail self-test catches seeded violations; hook scripts tested
  with sample payloads.
