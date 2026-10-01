# Progress

## Current focus

Phase 5 — API endpoints (moved ahead of Phase 4; built and tested locally). Phase 5 complete and reviewed. Next roadmap task: **P4.0 Install AWS CLI + SAM [HUMAN]**, then **P4.1 account safety [HUMAN]** (guide: `docs/DEPLOYMENT.md`). P6.1 (music provider research, doc only) can proceed meanwhile.
In parallel, Ethan: **P4.0** (install AWS CLI + SAM) and **P4.1** (account safety) — step-by-step in `docs/DEPLOYMENT.md`.

## Blocked / Questions for Ethan

- [ ] 2026-10-01 — **Removed members rejoining:** after the host removes someone, that person can rejoin with the same
  invite code unless the host regenerates it. Default plan: the app suggests "Regenerate the invite code?" right after
  a removal. Alternative: regenerate automatically on every removal. (P8.10)
- [ ] 2026-10-01 — **Confirm D15:** I added a limit of 20 parties per person as basic abuse protection (spec §32). OK?

<!-- Add items as: - [ ] YYYY-MM-DD — question — (task id) -->

## Environment facts

<!-- Record verified facts future sessions need: region, stack names, profile names, Node version, etc.
     Never record secrets, tokens, or passwords here. -->

- AWS region: _not chosen yet_ (P4.1)
- AWS CLI profile: `sotd-dev` (planned)
- Stacks: `sotd-dev`, `sotd-prod` (planned)
- Lambda runtime: `nodejs24.x` (newest GA as of 2026-10-01; Node 26 is preview only). Local Node must be 24.
- Local Node: v24.21.0, npm 11.19.0 (verified 2026-10-01).
- Docker Desktop installed (engine 25.0.3). Its CLI is not on PATH by default: prefix commands with
  `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"`.
- Toolchain: TypeScript ~6.0.3 (TS 7 unsupported by typescript-eslint), ESLint 10, Vitest 5, Prettier 3.

## Session log

<!-- Newest first. One entry per task: date, task id, what changed, how it was verified, anything left over. -->

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
  `.claude/launch.json` "web" for the preview. Verified: `npm run build -w @sotd/web` → static files only
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

- 2026-10-01 — **P1.3** — `@sotd/shared`: limits/enums (`limits.ts`), domain types (`types.ts`), API error shape +
  codes (`errors.ts`), zod 4 request schemas (`schemas.ts`). Decisions made: all request schemas are strict (unknown
  keys like `userId` are rejected, spec §24); recommendation requests carry only `{provider, providerSongId}` so the
  server looks up song metadata itself (client can't forge titles/links); only https links accepted; invite codes
  normalized to uppercase. Zod 4 APIs checked against https://zod.dev/api (2026-10-01). Verified: `npm run verify`
  exit 0, 79 tests pass. Dependency added: zod ^4.6.5 (runtime, shared).

- 2026-10-01 — **P1.2** — CI workflow: guardrails → setup-node (from `.nvmrc`, npm cache) → `npm ci` → `npm run verify`.
  Uses actions/checkout@v7 and actions/setup-node@v7 (latest majors via `git ls-remote`; inputs confirmed in the
  setup-node README, 2026-10-01). Verified: YAML parses; `npm ci && npm run verify` exit 0 locally. **Not yet verified
  on GitHub**: the `build` branch hasn't been pushed (push needs Ethan's OK).

- 2026-10-01 — **P1.1** — npm workspaces (`packages/shared` as `@sotd/shared`, `services/api`, `apps/web`
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
