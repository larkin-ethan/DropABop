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

Code: `services/api/src/handlers/parties.ts`. A person can be in at most 20 parties (D15, §32).

#### `POST /parties`

Body (`createPartyRequestSchema`): `name` (1–60), `timezone` (IANA, e.g. `America/Chicago`), optional `maxMembers`
(2–50, default 20). The caller becomes the host. A random invite code (`SONG-XXXX`) is generated.

`201`: `{ "party": Party, "members": [hostMember], "isHost": true }`.
Errors: `400 VALIDATION_FAILED` (bad input, unexpected fields like `hostUserId`, or already in 20 parties).

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

Body: `{ "inviteCode": "SONG-7K4P" }`. Must be the party's current code. Also counts toward the 20-party limit.
`200`: `{ "party", "members", "isHost": false }`.
Errors: `400 INVALID_INVITE`, `409 ALREADY_MEMBER`, `409 PARTY_FULL`, `400 VALIDATION_FAILED` (20-party limit).
The size limit and duplicate checks are enforced atomically in the database, so simultaneous joins can't overfill.

#### `POST /parties/{partyId}/invite-code`

Host only. Replaces the invite code; the old one stops working at once (D16).
`200`: `{ "inviteCode": "SONG-XXXX" }`. Errors: `403 NOT_HOST` / `NOT_A_MEMBER`, `409 CONFLICT` (changed by a
simultaneous request; refresh).

#### `DELETE /parties/{partyId}/members/{memberId}`

Leave (`memberId` = yourself) or, as host, remove someone. Past songs and ratings stay (D17).
`204`. Errors: `403 NOT_HOST` (removing someone else), `403 FORBIDDEN` (the host can't leave or be removed),
`403 NOT_A_MEMBER`, `404 NOT_FOUND`.

