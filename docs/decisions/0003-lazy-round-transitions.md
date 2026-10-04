# ADR-0003: Weeks are created and closed lazily (no scheduler)

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec sections:** §5, §6, §13, §15 · Decisions D2, D3, D8 · See also ADR-0004

## Context

Each party has a weekly round (ADR-0004): a new week starts every Monday 00:00, members submit one song per
weekday, and ratings lock when the week ends Sunday 23:59:59 (party timezone). Something has to start each
week, track the current day, and lock ratings at the end.

## Options considered

1. **Scheduler** (EventBridge Scheduler / cron Lambda): an extra service, extra IAM, extra failure mode, and
   a background process the spec asks us to avoid.
2. **Lazy evaluation**: derive everything from the current server time and the party's timezone:
   - **Which week/day is it?** Computed from time. The week id is deterministic: `partyId.<Monday date>`.
   - **Does this week's round exist?** The first request in a new week creates it with a conditional put
     (`attribute_not_exists`). If two people arrive at once, exactly one write wins and both read the same round.
   - **Is the week open?** `now < weekEnd`. The first request after the end records `CLOSED` with a
     conditional update; but correctness never depends on that write having happened.

## Decision

**Lazy evaluation.** With 10–20 users someone opens the app shortly after any boundary. Even if nobody
does, every request still gives the correct answer, because status is always derived from time.

Ratings lock in two layers, both based on the **server** clock (details in `docs/DATABASE.md`): the API rejects a
rating once `now >= endsAt`, even if the week hasn't been marked `CLOSED` yet; and results and stats ignore any
rating saved at or after `endsAt`, so a request that straddles midnight can't change the outcome. Submissions are likewise checked against the server's idea of "today" in the
party timezone (weekdays only, one per member per day).

## Cost

Zero additional services.

## Consequences

- All week/day logic goes through one module, `services/api/src/domain/week.ts`: `planCurrentWeek` (which round
  is this week, or create one), `getSubmissionDay`, `isWeekOpen`, `getEffectiveWeekStatus`, `getPendingStatusChange`.
  Handlers never read `round.status` directly or compute dates themselves.
- Each round stores the timezone it started with. A timezone change applies from the next week, and a new week
  starts only after the previous one ends and only for a later Monday, so weeks never overlap.
- A week's `endsAt` is the *exclusive* lock instant (the minute after the host's lock time; next Monday 00:00 by
  default): open means `now < endsAt`. It's fixed when the week is created.
- Never trust a date or day sent by the client.
- Results and stats for a closed week are computed when first requested after close (or on read; ADR-0006).
- If push notifications are ever added ("today's songs are in!"), a scheduler becomes justified. Write a
  new ADR then.

## Amendment (2026-10-04)

The host can now choose the sharing days and when ratings lock (PRODUCT_DECISIONS D1, D2; roadmap P8.13). Nothing
about the lazy approach changes: a week still starts on the first request after Monday 00:00 and still closes by
time alone. What's new: `endsAt` comes from the host's lock day and time, and if it's before Sunday night,
`planCurrentWeek` reports `between-weeks` from the lock until next Monday (no week runs over that gap). Each round
stores its `shareDays`, so like the timezone, a schedule change applies from the next week.
