# Progress

## Current focus

Phase 1. Next: **P1.0 Install Node.js 24 LTS [HUMAN]**, then P1.1 (monorepo skeleton).

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

## Session log

<!-- Newest first. One entry per task: date, task id, what changed, how it was verified, anything left over. -->

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
