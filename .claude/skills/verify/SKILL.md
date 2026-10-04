---
name: verify
description: Run Drop a Bop's full verification (lint, typecheck, unit tests, guardrails, and infra/integration checks when relevant) and report results truthfully. Use before ticking a roadmap task, before committing, or when the user asks "does it work?" / "run the checks".
---

# Verify

Run each step that applies, in order. Report the **actual** outcome of each — passed, failed (with the
relevant error lines), or skipped (with the reason). Never summarise as "all good" unless every step ran
and passed.

1. **Guardrails** — `bash scripts/guardrails.sh`
2. **Lint + typecheck + unit tests** — `npm run verify` (exists from P1.1; covers step 1 too).
   If `package.json` doesn't exist yet, say "skipped — no workspace yet".
3. **Integration tests** — if the change touches `services/api/src/data/` or handlers:
   `docker compose up -d` then `npm run test:integration`. If Docker isn't running, report it as
   skipped and why — do not mark the task done on unit tests alone when the task requires integration tests.
4. **Infrastructure** — if `infra/` changed: `sam validate --lint` (from `infra/`) and `sam build`.
5. **Frontend** — if `apps/web/` changed: `npm run build -w apps/web`; for UI tasks also check the
   screen at 320px and 1440px (Playwright screenshot or the browser preview) and look at the result.
6. **Coverage of the change** — confirm the new behaviour has tests that would fail without the change
   (e.g. temporarily break the rule mentally: is there a test that would catch it?). Call out gaps.

If anything fails: fix it and re-run, or stop and report. Do not delete, skip (`.skip`, `.only`),
or loosen tests or guardrails to get a pass.
