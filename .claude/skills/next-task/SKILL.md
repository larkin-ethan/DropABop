---
name: next-task
description: Continue building Song of the Day — pick the next unchecked task in docs/ROADMAP.md, implement it within the project guardrails, verify it, update docs and progress, and commit. Use when the user says "next", "continue", "keep going", "next task", or "/next-task [count]".
---

# Next task

Argument: optional number of tasks to complete in a row (default 1, max 5). Stop early at any
[HUMAN] task, blocker, or failed verification.

## 1. Orient

1. Read `docs/PROGRESS.md` (current focus, blockers, environment facts, latest log entries).
2. Run `git status`. If there are uncommitted changes you didn't make this session, summarise them
   and ask the user whether to keep, finish, or discard them before starting anything new.
3. Find the first `- [ ] **` line in `docs/ROADMAP.md`. That is the task. Do not skip ahead,
   reorder, or combine tasks.

## 2. Human tasks

If the task is tagged **[HUMAN]**:
- Explain exactly what Ethan needs to do, as numbered steps with links to official pages and
  copy-pasteable commands (each command in its own ```bash block).
- Say how he can confirm it worked, and tell him to say "done" (or run `/next-task`) when finished.
- If he reports it's done, verify what you can (e.g. `node -v`, `sam --version`) before ticking it.
- Never ask for, accept, or handle passwords, keys, tokens, or secrets in chat.
- Stop here.

## 3. Prepare

1. Read the spec sections and decisions the task cites (`docs/SPEC.md`, `docs/PRODUCT_DECISIONS.md`,
   relevant ADRs in `docs/decisions/`).
2. Inspect the existing code the task touches. Reuse what exists.
3. If the task involves an external API (AWS, Cognito, Spotify, Apple, YouTube…), look up the current
   official documentation first (WebSearch/WebFetch). Note URL + date for the docs.
4. If the task adds or changes an AWS resource type, follow the `aws-change` skill.
5. If a product question would change user-visible behaviour and isn't answered by the spec,
   PRODUCT_DECISIONS, or an ADR: record it in PROGRESS.md "Blocked / Questions" and ask. Otherwise
   pick the simplest option and note it in the log.
6. Write a short plan (3–8 bullets) in your reply before editing.

## 4. Build

- Smallest change that satisfies every "Done when" bullet. Nothing from later tasks.
- Tests alongside code: domain rules → unit tests; data/handlers → integration tests too.
- Beginner-readable code; comments explain *why*.
- The guardrail hook runs after each edit. If it reports a violation, fix the code — never work around
  the check. If you believe the violation is genuinely required, stop and explain to the user.

## 5. Verify (never skip)

1. Run the `verify` skill (or `npm run verify`; before Phase 1 exists: `bash scripts/guardrails.sh`).
2. Run any task-specific checks in "Done when" (integration tests, `sam validate --lint`, a dev-stack
   smoke call, a screenshot at 320px, etc.).
3. For tasks in Phases 3–5, 6, 9, or 11 (data, API, providers, security, infra), run the
   `spec-reviewer` agent on the diff and address every "must fix" item.
4. If verification fails after 3 honest attempts, stop: record what fails and why in PROGRESS.md
   "Blocked / Questions", leave the box unchecked, and report to the user.

## 6. Record

1. Update docs named in the task (and any doc your change made stale).
2. Tick the task's checkbox in `docs/ROADMAP.md`.
3. Add a log entry at the top of PROGRESS.md "Session log":
   `- YYYY-MM-DD — **ID** — what changed. Verified: <commands run + result>. Leftovers: <none/...>`
   Update "Current focus" and "Environment facts" if they changed.
4. Commit everything for this task: `git add -A && git commit -m "<ID>: <task title>"` (with the
   required attribution trailer). Do not push unless the user asked.

## 7. Report

Tell the user, briefly: what was built, how it was verified (actual commands/results), anything
unverified or left over, and what the next task is (flag it if it's [HUMAN]).
