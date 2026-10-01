# Progress

## Current focus

Phase 3 — data layer. Next: **P3.3 Repository functions**.

## Blocked / Questions for Ethan

_None._

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
