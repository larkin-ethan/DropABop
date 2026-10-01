# ADR-0006: Statistics are computed when requested

- **Status:** Accepted
- **Date:** 2026-10-01
- **Spec sections:** §17, §18, §25 · See also ADR-0003, ADR-0005, `docs/STATISTICS.md`

## Context

Personal stats, group stats, and leaderboards are calculated from a party's closed weeks. The spec's lifecycle says
"Statistics Updated" after results. We can either store precomputed stats when a week closes, or compute them from
the raw songs and ratings each time someone opens a stats screen.

## Options considered

1. **Precompute at week close.** Fast reads, but needs a trigger at close. With lazy weeks (ADR-0003) that would be
   "the first request after close", which then does heavy work. It also adds stored items that must be kept correct
   (and recomputed if a definition changes), plus an extra failure mode.
2. **Compute on read.** Each stats request loads the party's weeks, songs, and ratings (three paginated queries on
   one partition, see DATABASE.md pattern 15) and runs the pure functions in `domain/stats.ts`.

## Decision

**Compute on read.** It's simpler, always consistent with the current definitions, and has nothing to keep in sync.

## Cost

- **Why needed:** spec §17–18.
- **Cost at our scale:** a year of one party is about 5k songs and up to about 100k ratings (~10–20 MB). Reading it
  all is at most a few thousand read units per stats view (≈ $0.0003 at $0.125 per million). Even 20 people checking
  stats daily is cents per month (ADR-0005).
- **New services:** none.

## Consequences

- Revisit (switch to precomputing at close, stored per week) if any of these happen: a stats request takes more than
  about 1 second, DynamoDB read cost from stats exceeds about $1/month, or parties grow well past 20 people.
- The frontend should cache stats (TanStack Query, long stale time). They only change when a week closes.
