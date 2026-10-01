# Database

Song of the Day stores everything in **one DynamoDB table** per environment (`sotd-dev`, `sotd-prod`).
The design starts from how the app reads and writes data (spec §25), not from entities. There are **no
secondary indexes** and **no scans**: every operation below is a `GetItem`, a `Query` on one partition, or a
transaction.

Capacity mode and cost: see [ADR-0005](decisions/0005-dynamodb-on-demand.md) (on-demand, with a throughput cap).

## Why one table, and why one partition per party

- A party's data (members, weeks, songs, ratings) is almost always read together, so it all lives under one
  partition key: `PARTY#<partyId>`. Stats for a whole party are then just two paginated queries.
- At 20 people per party, one partition is far below DynamoDB's per-partition limits (thousands of requests per
  second). If parties ever got much bigger, this is the first thing to revisit.
- No secondary indexes means nothing extra to keep in sync, and nothing extra to pay for.

## Keys

Every item has a partition key `PK` and sort key `SK` (both strings) plus an `entity` attribute naming its type.
`<week>` is the week's Monday date (`2026-10-05`); `<date>` is a day (`2026-10-07`).

| Item | PK | SK | Main attributes |
|---|---|---|---|
| User profile | `USER#<userId>` | `PROFILE` | displayName, avatarColor, preferredProvider, createdAt |
| "My party" link | `USER#<userId>` | `PARTY#<partyId>` | partyName, role, joinedAt |
| Party | `PARTY#<partyId>` | `META` | name, hostUserId, inviteCode, memberCount, settings, createdAt |
| Member | `PARTY#<partyId>` | `MEMBER#<userId>` | displayName, avatarColor, role, joinedAt |
| Week (round) | `PARTY#<partyId>` | `ROUND#<week>` | timezone, startsAt, endsAt, status |
| Song shared (recommendation) | `PARTY#<partyId>` | `REC#<week>#<recommendationId>` | userId, submittedOn, weekday, song (embedded), createdAt |
| "Already shared today" marker | `PARTY#<partyId>` | `SUBMITTED#<week>#<userId>#<date>` | recommendationId |
| Rating (vote) | `PARTY#<partyId>` | `VOTE#<week>#<userId>#<recommendationId>` | rating, updatedAt |
| Invite code lookup | `INVITE#<code>` | `INVITE` | partyId |

Notes:

- **`userId`** is the Cognito `sub` from the verified token. It is never taken from request input.
- **`roundId`** (public) = `<partyId>.<week>`, so the API can find a week's keys from its id without a lookup.
- **`recommendationId`** is random (`crypto.randomUUID()`). It must not contain the recommender's user id,
  because songs are anonymous while the week is open (D10).
- **Songs are embedded** in the recommendation item: a snapshot of title, artist, artwork, and provider links
  taken when it was shared. The spec's Song / SongProvider shapes (§12) describe that embedded object; there's no
  separate song table because nothing reads songs on their own.
- **Not stored in v1:** provider connections (no account linking, D20), and precomputed stats (computed when
  requested; see ADR-0006 in P5.10). Email lives in Cognito only (D19).
- Timestamps are UTC ISO strings set by the server.

## Access patterns

| # | Pattern (spec §25 / API) | Operation |
|---|---|---|
| 1 | Get user profile | `GetItem USER#u / PROFILE` |
| 2 | List a user's parties | `Query PK=USER#u, SK begins_with PARTY#` |
| 3 | Get party | `GetItem PARTY#p / META` |
| 4 | List party members | `Query PK=PARTY#p, SK begins_with MEMBER#` |
| 5 | Is this user a member? (every party request) | `GetItem PARTY#p / MEMBER#u` |
| 6 | Look up an invite code | `GetItem INVITE#code / INVITE`, then pattern 3 |
| 7 | Latest week for a party (input to `planCurrentWeek`) | `Query PK=PARTY#p, SK begins_with ROUND#, descending, Limit 1` |
| 8 | Get a week by roundId | `GetItem PARTY#p / ROUND#week` |
| 9 | Week history (paginated) | `Query PK=PARTY#p, SK begins_with ROUND#, descending, Limit 20` |
| 10 | All songs in a week | `Query PK=PARTY#p, SK begins_with REC#week#` |
| 11 | Get one song | `GetItem PARTY#p / REC#week#recId` |
| 12 | Dates I've already shared on this week | `Query PK=PARTY#p, SK begins_with SUBMITTED#week#u#` |
| 13 | All ratings in a week (results) | `Query PK=PARTY#p, SK begins_with VOTE#week#` |
| 14 | My ratings in a week | `Query PK=PARTY#p, SK begins_with VOTE#week#u#` |
| 15 | Party stats / user stats (closed weeks) | Pattern 9 (all weeks), then `Query SK begins_with REC#` and `SK begins_with VOTE#`, keeping only closed weeks |
| 16 | Week results | Patterns 8, 10, 13 |

Every query is limited to one partition. Lists that can grow (history, stats inputs) are paginated with
`LastEvaluatedKey`.

## Writes and the rules they enforce

The domain rules (`services/api/src/domain/`) check everything first and give friendly errors. The database
then enforces the same rules again, so two simultaneous requests can't both get through.

| Action | Operation | What the condition guarantees |
|---|---|---|
| Create profile (first sign-in) | `Put USER#u/PROFILE` with `attribute_not_exists(PK)` | Created once; later calls read it |
| Create party | Transaction: put `META`, host `MEMBER#`, `USER#/PARTY#` link, `INVITE#code`, each `attribute_not_exists` | No half-created party; invite code is unique (retry with a new code on clash) |
| Join party | Transaction: update `META` with `memberCount < settings.maxMembers` and `inviteCode = :code`, then `ADD memberCount 1`; put `MEMBER#u` and `USER#u/PARTY#p` with `attribute_not_exists` | **Party size limit** and **no duplicate membership** hold even if several people join at once; an old code can't be used after regeneration |
| Leave / remove member | Transaction: delete `MEMBER#u` with `attribute_exists(PK) AND role <> host`, delete `USER#u/PARTY#p`; `ADD memberCount -1` | Count stays accurate (a double removal decrements once); the host can't be removed (D17) |
| Regenerate invite code | Transaction: put new `INVITE#new` (`attribute_not_exists`), delete `INVITE#old`, update `META` with `inviteCode = :old` | Old code stops working at the same moment; a double tap gets "The invite code was just changed" (`CONFLICT`) |
| Update settings / rename | `Update META` (host checked in code); a new `maxMembers` also requires `memberCount <= :maxMembers`. A rename then updates each member's `USER#/PARTY#` link (best-effort, see below) | Limit can't drop below the member count |
| Update profile | `Update USER#u/PROFILE` setting only the changed fields; then copies displayName/avatarColor onto each `MEMBER#u` item (best-effort) | Edits from two devices to different fields don't undo each other |
| Start a week | `Put ROUND#week` with `attribute_not_exists(PK)` | **Exactly one round per week**, even if several people open the app at once; the loser re-reads it |
| Record a week's close | `Update ROUND#week SET status` with `status = :open` | Recorded once; correctness never depends on it (status is derived from time, ADR-0003) |
| Share a song | Transaction: put `SUBMITTED#week#u#date` with `attribute_not_exists(PK)` + put `REC#week#recId` | **One song per member per day**. A second attempt fails the marker condition → "You've already shared your song for today." |
| Rate / change a rating | `Put VOTE#week#u#recId` (overwrites the previous rating) | **One rating per member per song** (the key is unique per member + song) |

Every transaction goes through `transactWrite`, which retries briefly (up to 3 attempts) **only** when DynamoDB
cancels it because another transaction touched the same item at that instant (`TransactionConflict`). Condition
failures are never retried; they're real answers such as "party full".

### Copies that are best-effort

Two pieces of data are copied for cheap reads and kept in sync **best-effort** (eventually consistent):
the party name on each member's `USER#/PARTY#` link, and a member's display name / avatar color on their
`MEMBER#` items. If someone leaves a party mid-update, their copy is simply skipped. The source of truth is always
`META` (party) and `PROFILE` (user). A rename racing a join can leave one stale link name until the next rename;
that's acceptable for a display label.

### Pagination

`listRounds` (history) returns up to 20 weeks per page (max 50). Its cursor is the last week's start date
(`2026-09-14`), not a raw database key, so a crafted cursor can't read outside the party's partition. Malformed
cursors are rejected.

### The rating lock (D8)

DynamoDB conditions can't compare against "the current time", so the lock is enforced in two layers:

1. **Before writing**, the handler checks `now < round.endsAt` with the server clock (`canCastVote`). After the week
   ends, rating requests are rejected with "This week has ended, so ratings are locked."
2. **When counting**, results and stats ignore any rating whose server-set `updatedAt` is at or after `endsAt`
   (`countableVotes`, `buildStatsData`). `updatedAt` is read from the server clock at write time, separately from the
   check in step 1. A request that passes the check at 23:59:59.999 but is written a few milliseconds after midnight
   can't add a late rating.

   Known edge: because a rating change overwrites the previous rating, a *change* that lands in that millisecond
   window removes the member's earlier on-time rating rather than leaving it. The window is milliseconds wide and the
   outcome is "that rating doesn't count", which we accept.

## Data size and cost at our scale

A year of one 20-person party: about 5,200 songs and at most about 100,000 ratings (if everyone rated
everything), roughly 10–20 MB. Far inside the 25 GB always-free storage. Request costs are covered in ADR-0005.

## Local development

Integration tests run against **DynamoDB Local** in Docker (P3.2), using a table created from the same key
definition as the SAM template, so local and AWS can't drift.
