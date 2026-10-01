# API

REST-style JSON API served by API Gateway (HTTP API) → Lambda. Every endpoint is added here as it's built
(roadmap Phase 5). Shared request schemas live in `packages/shared/src/schemas.ts`; the frontend uses the same ones.

## Conventions (all endpoints)

### Authentication

- Every endpoint requires a Cognito **access token**: `Authorization: Bearer <token>`. Tokens never go in URLs.
- API Gateway's JWT authorizer verifies the signature, issuer, app client, and expiry before Lambda runs.
- The handler takes the caller's identity **only** from the verified claims (`sub`), and also requires
  `token_use = "access"` (ID tokens are rejected). Code: `getAuthenticatedUser` in `services/api/src/http/request.ts`.
- No endpoint accepts a `userId` from the client. Request schemas are strict, so an unexpected `userId` field
  fails validation.

### Requests

- Bodies are JSON, at most 10 KB, validated against the shared zod schema for that endpoint.
- Path ids must be plain ids (UUIDs); anything else is treated as "not found".
- Dates and days are never sent by the client; the server decides them (ADR-0003).

### Responses

- Success: `200` (or `201` when something was created, `204` with no body). JSON, `Cache-Control: no-store`.
- Errors always look like this, with a message that is safe to show to users as-is:

```json
{ "error": { "code": "ALREADY_SUBMITTED_TODAY", "message": "You’ve already shared your song for today." } }
```

| Status | Codes |
|---|---|
| 400 | `VALIDATION_FAILED`, `INVALID_INVITE`, `SONG_NOT_IN_WEEK` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN`, `NOT_A_MEMBER`, `NOT_HOST`, `OWN_SONG`, `RESULTS_NOT_READY` |
| 404 | `NOT_FOUND` |
| 409 | `PARTY_FULL`, `ALREADY_MEMBER`, `PARTY_PAUSED`, `WEEKEND`, `ALREADY_SUBMITTED_TODAY`, `WEEK_CLOSED`, `CONFLICT` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL`: generic message; details are only in server logs |
| 502 | `PROVIDER_UNAVAILABLE` |

### Logging

One structured JSON line per request: request id, route, status, duration, and the caller's user id. Never the
token, headers, body, or email (`services/api/src/http/logger.ts` redacts these even if passed by mistake).

## Endpoints

### Profile

#### `GET /users/me`

Your profile and the parties you're in. Creates the profile on the first call (display name "New member", a
generated avatar color; D18). Code: `services/api/src/handlers/users.ts`.

`200`:

```json
{
  "user": { "userId": "…", "displayName": "Ethan", "avatarColor": "#3B82F6", "preferredProvider": null, "createdAt": "…" },
  "parties": [{ "partyId": "…", "partyName": "Ethan's Music Party", "role": "host", "joinedAt": "…" }]
}
```

#### `PATCH /users/me`

Body (`updateProfileRequestSchema`, at least one field): `displayName` (1–40 chars, trimmed), `avatarColor`
(`#RRGGBB`), `preferredProvider` (`spotify` | `appleMusic` | `youtube` | `youtubeMusic` | `null`, D22).
Updates only the given fields; your name/color in party member lists updates too.

`200`: `{ "user": { … } }`. Errors: `400 VALIDATION_FAILED` (bad value, empty update, or any unexpected field such
as `userId`).

### Parties

Code: `services/api/src/handlers/parties.ts`. A person can be in at most 5 parties (D15, §32).

#### `POST /parties`

Body (`createPartyRequestSchema`): `name` (1–60), `timezone` (IANA, e.g. `America/Chicago`), optional `maxMembers`
(2–50, default 20). The caller becomes the host. A random invite code (`SONG-XXXX`) is generated.

`201`: `{ "party": Party, "members": [hostMember], "isHost": true }`.
Errors: `400 VALIDATION_FAILED` (bad input, unexpected fields like `hostUserId`, or already in 5 parties).

#### `GET /parties`

`200`: `{ "parties": [{ "partyId", "partyName", "role", "joinedAt" }] }`. The caller's parties only.

#### `GET /parties/{partyId}`

Members only. `200`: `{ "party": Party, "members": PartyMember[], "isHost": boolean }`. `party.inviteCode` is
visible to members (D16). Errors: `403 NOT_A_MEMBER`, `404 NOT_FOUND`.

### Invites & membership

Code: `services/api/src/handlers/membership.ts`.

#### `GET /invites/{code}`

Preview before joining. The code is case-insensitive. Reveals only the party's name and capacity.
`200`: `{ "partyId", "partyName", "memberCount", "maxMembers", "isFull", "alreadyMember" }`.
Errors: `400 INVALID_INVITE` (unknown, malformed, or replaced code; all look the same).
Rate limiting for this route is configured in P9.1.

#### `POST /parties/{partyId}/join`

Body: `{ "inviteCode": "SONG-7K4P" }`. Must be the party's current code. Also counts toward the 5-party limit.
`200`: `{ "party", "members", "isHost": false }`.
Errors: `400 INVALID_INVITE`, `409 ALREADY_MEMBER`, `409 PARTY_FULL`, `400 VALIDATION_FAILED` (5-party limit).
The size limit and duplicate checks are enforced atomically in the database, so simultaneous joins can't overfill.

#### `POST /parties/{partyId}/invite-code`

Host only. Replaces the invite code; the old one stops working at once (D16).
`200`: `{ "inviteCode": "SONG-XXXX" }`. Errors: `403 NOT_HOST` / `NOT_A_MEMBER`, `409 CONFLICT` (changed by a
simultaneous request; refresh).

#### `DELETE /parties/{partyId}/members/{memberId}`

Leave (`memberId` = yourself) or, as host, remove someone. Past songs and ratings stay (D17).
`204`. Errors: `403 NOT_HOST` (removing someone else), `403 FORBIDDEN` (the host can't leave or be removed),
`403 NOT_A_MEMBER`, `404 NOT_FOUND`.

### Party settings

#### `PATCH /parties/{partyId}/settings`

Host only. Code: `services/api/src/handlers/settings.ts`. Body (`updatePartySettingsRequestSchema`, at least one
field): `name`, `maxMembers` (2–50, not below the current member count), `timezone` (applies from next week),
`paused`, `revealRecommenderDuringVoting`, `showWhoRatedWhat`. The invite code and host can't be changed here.
`200`: `{ "party", "members", "isHost": true }`. Errors: `403 NOT_HOST` / `NOT_A_MEMBER`, `400 VALIDATION_FAILED`.

### Weeks

Code: `services/api/src/handlers/weeks.ts`. Weeks are created and closed lazily (ADR-0003): the first request of a
week creates it, and the first request after a week ends records its close.

#### `GET /parties/{partyId}/rounds/current`

Members only. The home screen's main call; poll it every 30–60 s while the app is open.

`200` while a week is running:

```json
{
  "round": { "roundId": "…​.2026-10-05", "weekStart": "2026-10-05", "timezone": "America/Chicago",
             "startsAt": "…", "endsAt": "2026-10-12T05:00:00.000Z", "status": "OPEN" },
  "status": "OPEN",
  "reason": null,
  "today": { "weekday": "WED", "date": "2026-10-07", "dayNumber": 3 },
  "sharedToday": false,
  "mySubmissionDates": ["2026-10-05"],
  "sharedTodayCount": 3,
  "progress": { "songCount": 7, "ratableCount": 5, "ratedCount": 3 }
}
```

- `today` is `null` on Saturday and Sunday (rating still open, sharing closed).
- `endsAt` is the exclusive end (next Monday 00:00 in the week's timezone); show it as "Sunday 11:59 pm".
- `sharedTodayCount` is how many people have shared today. *Who* has shared (`sharedTodayUserIds`) is included
  **only** when the party has `revealRecommenderDuringVoting` on: otherwise, comparing that list with the songs list
  over time would reveal whose song is whose (D10).
- `ratableCount` excludes your own songs; `ratedCount` is how many of those you've rated.

`200` when there's no current week: `{ "round": null, "reason": "paused" | "between-weeks", "nextWeekStartsAt": "…" | null, "lastRoundId": "…" | null }`.
Errors: `403 NOT_A_MEMBER`, `404 NOT_FOUND`.

#### `GET /parties/{partyId}/rounds?limit=20&cursor=2026-09-14`

Members only. Week history, newest first. `limit` 1–50 (default 20); pass `nextCursor` back as `cursor`.
`200`: `{ "rounds": Round[], "nextCursor": "2026-09-14" | null }`. Status is `OPEN`, `CLOSED`, or
`NOT_ENOUGH_SONGS` (fewer than 2 songs; no results). Errors: `400 VALIDATION_FAILED` (bad cursor/limit).

### Songs (recommendations)

Code: `services/api/src/handlers/recommendations.ts`. For every `/rounds/{roundId}/…` route, the party is taken from
the `roundId` and the caller must be a member of *that* party (`loadRoundForMember`), so a round id can't be used
to read another party's data.

#### `POST /rounds/{roundId}/recommendations`

Share today's song. Body: `{ "provider": "spotify", "providerSongId": "…" }`; nothing else is accepted (no
title, links, or date). The server decides today's date in the week's timezone, looks the song up with the music
service itself (P6.3), and stores it with a random id.

`201`: `{ "song": SongView }` (see below). Errors: `409 ALREADY_SUBMITTED_TODAY`, `409 WEEKEND`,
`409 WEEK_CLOSED` (week ended / not this week), `409 PARTY_PAUSED`, `403 NOT_A_MEMBER`,
`400 VALIDATION_FAILED` (song not found or bad input), `404 NOT_FOUND` (unknown week),
`502 PROVIDER_UNAVAILABLE` (music service down; until P6.3 this is always the case in production).

#### `GET /rounds/{roundId}/recommendations`

The week's songs so far, oldest first. `200`: `{ "round": Round, "songs": SongView[] }` where:

```json
{
  "recommendationId": "…", "weekday": "MON", "submittedOn": "2026-10-05",
  "song": { "songId": "…", "title": "…", "artist": "…", "album": "…", "albumArtUrl": "https://…",
            "durationMs": 243000, "releaseDate": "…", "providers": [{ "provider": "spotify", "providerSongId": "…", "externalUrl": "https://…" }] },
  "isMine": false,
  "myRating": 8
}
```

`recommendedBy` (a userId) appears only for your own songs, when the party reveals recommenders, or after the week
ends (D10). Other people's ratings and averages never appear here (D9); see the results endpoint.

### Ratings

Code: `services/api/src/handlers/votes.ts`.

#### `PUT /rounds/{roundId}/votes/{recommendationId}`

Body: `{ "rating": 8 }` (whole number 1–10). Creates or replaces your rating while the week is open; locked from
Monday 00:00 in the week's timezone (D8). You can't rate your own songs (D6).
`200`: `{ "vote": { "recommendationId", "rating", "updatedAt" } }`.
Errors: `409 WEEK_CLOSED`, `403 OWN_SONG`, `403 NOT_A_MEMBER`, `404 NOT_FOUND` (song not in this week),
`400 VALIDATION_FAILED`.

#### `GET /rounds/{roundId}/votes/me`

`200`: `{ "votes": [{ "recommendationId", "rating", "updatedAt" }] }`. Your ratings only.

### Results

#### `GET /rounds/{roundId}/results`

Members only, after the week ends. Code: `services/api/src/handlers/results.ts`. Ratings saved after the week's end
are ignored.

`200`:

```json
{
  "round": Round,
  "results": {
    "roundId": "…",
    "songs": [{ "recommendationId": "…", "rank": 1, "weekday": "TUE", "submittedOn": "…", "song": { … },
                "recommendedBy": "userId", "averageRating": 9.5, "ratingCount": 4,
                "distribution": [0,0,0,0,0,0,0,0,2,2], "myRating": 10 }],
    "days": [{ "weekday": "MON", "songIds": ["…"], "winnerIds": ["…"] }, … 5 days],
    "totalRatings": 23
  },
  "members": [{ "userId": "…", "displayName": "…", "avatarColor": "#…" }]
}
```

- Ranks: equal displayed averages share a rank (1, 1, 3); unrated songs last (D12). `distribution[0]` = number of 1s.
- `winnerIds` = that day's Song of the Day (several if tied; empty if none rated).
- `ratings: [{ userId, rating }]` is added to each song only when the party's `showWhoRatedWhat` is on (D11).
- `members` gives names for current members; a `recommendedBy` not in the list has left the party.

Errors: `403 RESULTS_NOT_READY` ("Results unlock when the week ends on Sunday night." or, for weeks with fewer than
2 songs, "Not enough songs were shared this week…"), `403 NOT_A_MEMBER`, `404 NOT_FOUND`.

### Stats & leaderboards

Code: `services/api/src/handlers/stats.ts`. Computed on request from **closed weeks only** (ADR-0006); definitions
and minimums in `docs/STATISTICS.md`. Every stat is either
`{ "status": "ok", "value": …, "sampleSize": N }` or `{ "status": "not-enough-data", "sampleSize": N, "required": M }`.
"Most …" stats return `value` as a list of tied winners `{ id, value, sampleSize, song? }` (`song` summary for
song-based stats). Each response includes `members` (names for current members) and `weeksPlayed`.
Results only change when a week closes, so clients should cache these.

#### `GET /users/me/stats?partyId=…`

Your stats in one party: `averageRatingGiven`, `averageScoreReceived`, `songsRecommended` (number),
`highestRatedRecommendation`, `lowestRatedRecommendation`, `generosity`, `ratingDistribution` (10 counts),
`favoriteArtists` (top 3), `musicalTwin`. Errors: `400` (missing partyId), `403 NOT_A_MEMBER`,
`404 NOT_FOUND` (unknown party).

#### `GET /parties/{partyId}/stats`

`songsShared`, `ratingsGiven`, `highestRatedSong`, `crowdFavorite`, `mostDivisive`, `mostControversial`,
`everyoneAgreed`, `darkHorse`, `mostGenerousVoter`, `toughestCritic`. Members only.

#### `GET /parties/{partyId}/leaderboard`

`highestAverageSongRating` (songs, with `song` summary), `highestAverageRecommendationScore`, `mostConsistent`,
`mostSurprising`, `mostPopular`: each a ranked list of `{ id, rank, value, sampleSize }` containing only entries
that meet the minimum sample. Ties share a rank. Members only.

