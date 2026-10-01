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

_Added task by task from P5.2 onward._
