# ADR-0004: Weekly rounds with one song per member per day

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec sections:** §1, §13, §14, §15, §16 · Decisions D1–D5, D8, D9, D12

## Context

The spec describes a round as each member recommending one song, then voting, then results. Ethan
(product owner) has specified how the group will actually use it:

- Each member puts in **one song per day, Monday to Friday**.
- Members can rate **any song from the current week** at any time during that week.
- Once the week is over, ratings can no longer change.

## Decision

This deliberately changes spec §13–§15:

| Spec concept | Becomes |
|---|---|
| Round | One calendar week, Monday 00:00 → Sunday 23:59:59, party timezone |
| "Exactly one recommendation per round" (§14) | Exactly one recommendation per member **per weekday** (Mon–Fri) |
| Recommendation phase, then voting phase (§13) | No separate phases: the week is `OPEN` for both submitting (weekdays) and rating (all 7 days), then `CLOSED` |
| "Once the round closes, votes become immutable" (§15) | Once the **week** closes, ratings are immutable |
| Results at end of round (§16) | Weekly results, plus a per-day "Song of the Day" winner |

Everything else in §14–§15 still applies: server-side enforcement, membership checks, 1–10 integer ratings,
no duplicate ratings, friendly error messages, and votes can be changed only while open.

## Consequences

- **Uniqueness:** a member's recommendation key includes the date (`week#day#user`), so a conditional put
  enforces one per day without reading first.
- **Day boundaries** depend on the party's timezone, and must be computed on the server from the server clock.
  Daylight-saving weeks need tests.
- **Rating lock:** the vote write is conditional on the week's end time (from ADR-0003's lazy model), so a
  vote sent one second after Sunday 23:59:59 is rejected even if nobody has "closed" the week yet.
- **Volume:** up to 5 × 20 = 100 songs per week per party. That's still tiny for DynamoDB (one Query per week
  for songs, one per week for votes), but the voting UI must group songs by day and show progress.
- **Stats** now accumulate up to 5× faster per member, so minimum-sample thresholds are reached sooner. The
  thresholds in PRODUCT_DECISIONS stay as they are.
