# Drop a Bop — Master Build Specification

> **Renamed 2026-10-03 (Ethan):** the app was called "Song of the Day"; it is now **Drop a Bop** (`dropabop` in code
> and AWS names). Where this spec says "Song of the Day" it means the app. Each day's winner in the weekly results is
> the "Bop of the Day" (PRODUCT_DECISIONS D12, D24).

> **Source of truth.** This is the original product and engineering specification.
> If any other document disagrees with this one, this one wins, unless an ADR in
> `docs/decisions/` explicitly records a deliberate change.
> Product details the spec leaves open are resolved in `docs/PRODUCT_DECISIONS.md`.

---

## 1. Product Vision

Build a private social music application called **Drop a Bop** (originally "Song of the Day").

The core experience is simple:

> One person recommends one song. Everyone else listens and rates it from 1–10. At the end of the round, everyone sees how the song performed and how their musical taste compares with the group.

The application is initially designed for small private groups of approximately 10–20 users.

The application should feel like a polished consumer product rather than an enterprise application.

Prioritize: simplicity, reliability, low operating cost, clean UI, mobile responsiveness, easy onboarding, understandable code, strong documentation, secure authentication, provider-independent music integrations, minimal infrastructure, easy future expansion.

Do not over-engineer the initial version.

## 2. Critical Deployment Requirement: Free / Near-Free Operation

Expected initial scale: ~10–20 total users, private/invite-only groups, low request volume, no public social network, no large-scale media hosting, no high-volume analytics pipeline, no always-running backend servers.

**Primary cost objective:** normal operating cost is $0 or as close to $0 as reasonably possible at the 10–20-user scale. Use AWS free-tier/always-free allowances wherever practical.

However: **never sacrifice security, correctness, or maintainability merely to save a few dollars.** The application should not depend on an AWS service simply because that service is available. Every AWS service must have a clear purpose.

## 3. AWS Architecture — Small Private Deployment

Use a serverless architecture.

**Frontend:** Amazon S3 + Amazon CloudFront. The React application is compiled to static files and served through CloudFront. Do not run EC2, a dedicated web server, Nginx, Docker containers, ECS, or Kubernetes. No permanently running frontend server.

**Authentication:** Amazon Cognito User Pools — account creation, login, password management, email verification, access tokens, refresh tokens, authentication state. JWT-based authentication. The frontend never directly trusts client-supplied identity. Backend APIs must validate tokens.

**Backend:** Amazon API Gateway HTTP API + AWS Lambda. Small, focused Lambda functions, e.g.:

```text
createParty  joinParty  getParty  getCurrentRound  submitRecommendation  submitVote
getResults  getUserStats  getGroupStats  updateProfile  updatePartySettings
```

No permanently running backend. Avoid EC2, ECS, EKS, Kubernetes, RDS, Aurora, Redis, ElastiCache, OpenSearch, load balancers, always-on servers — unless a future requirement genuinely makes one necessary.

## 4. Database

Use **Amazon DynamoDB** (simple access patterns, very low traffic). Design around access patterns, not as a relational DB.

Possible entities: User, Party, PartyMember, Round, Recommendation, Vote, Song, ProviderConnection, Invitation, UserStats, PartyStats.

Avoid unnecessary tables. Use single-table design or a small number of focused tables. Do not introduce RDS because relational databases are familiar.

## 5. Do Not Build Real-Time Infrastructure Initially

No WebSockets or real-time event system initially. Use refresh buttons, polling, TanStack Query refetching, automatic periodic refresh where useful (e.g. `GET /party/current-round` refreshed while waiting for votes).

Do not initially add API Gateway WebSockets, AppSync, Redis pub/sub, EventBridge-based event infrastructure, or complicated real-time sync unless a demonstrated product requirement requires it. This keeps the app cheaper, easier to understand, easier to debug, easier for a beginner to maintain.

## 6. AWS Services Should Be Kept Minimal

Default architecture:

```text
User → CloudFront → S3 (frontend)
User → API Gateway → Lambda → DynamoDB
Cognito (authentication)
```

Additional AWS services only with a documented reason.

## 7. AWS Cost Protection

Configure AWS billing alerts/budgets during initial deployment. Documentation must explain:

1. Where AWS billing is visible
2. How to configure a monthly budget
3. How to configure billing alerts
4. Which services can generate charges
5. How to shut down unnecessary resources

Never tell the developer that AWS will "always be free." Free-tier eligibility, account age, usage, region, and pricing can change. The goal: architect for extremely low usage and remain within applicable free allowances whenever possible.

## 8. Private Party Model

Not a public social network. A user creates a private party and invites others. Configurable maximum party size, **default 20**, enforced server-side. The frontend must not be able to bypass membership or party-size restrictions.

## 9. Authentication and Tokenization

Flow: User → Cognito → JWT access token → API Gateway → Lambda. Use OAuth 2.0 / OIDC concepts where applicable. Third-party provider auth: authorization-code flow with PKCE where supported.

Rules: never store plaintext passwords; never put access tokens in URLs; never log access tokens; never expose client secrets in frontend code; never store provider secrets in the repository; validate JWTs server-side (expiration, issuer, audience/client); least-privilege IAM; store sensitive server-side credentials in appropriate AWS secret/configuration mechanisms.

## 10. Music Provider Architecture

Not tightly coupled to one provider. Provider abstraction, e.g.:

```typescript
interface MusicProvider {
  searchSongs(query: string): Promise<Song[]>;
  getSong(id: string): Promise<Song>;
  getPlaybackUrl(id: string): Promise<string | null>;
  canPlayInApp(): boolean;
}
```

Potential providers: Spotify, Apple Music, YouTube / YouTube Music, others later. Do not assume every provider supports the same functionality; each exposes capability info, e.g. `{ canSearch, canPlayInApp, requiresSubscription, canOpenExternal }`.

## 11. Music Playback Rules

Let users connect existing subscriptions where official APIs/policies permit. The app must not become a streaming service.

- **Option 1 — In-app playback** if the provider officially supports it via SDK/API and the user's subscription permits.
- **Option 2 — External playback**: official link that opens the song in the provider app/site ("▶ Play on Spotify", "▶ Open in Apple Music", "▶ Watch on YouTube").

Never bypass DRM, subscription requirements, playback restrictions, provider authentication, geographic restrictions, or API limitations. Follow each provider's current developer policies.

## 12. Song Data Model

Provider-independent:

```typescript
Song { id, title, artist, album, albumArtUrl, duration, releaseDate, providers }
SongProvider { songId, provider, providerSongId, externalUrl }
```

One song may map to Spotify, Apple Music, and YouTube without duplicating the core record.

## 13. Party Lifecycle

```text
Create Party → Invite Members → Members Join → Start Round → Each User Recommends One Song
→ Voting Opens → Members Listen & Rate Songs → Voting Closes → Results Calculated
→ Statistics Updated → Next Round
```

The backend enforces the rules. Do not rely solely on frontend controls.

## 14. Recommendation Rules

Each participant submits exactly one recommendation per round. Server-side: user belongs to party; round is active; user has not already submitted; song has valid provider info; recommendation belongs to the current round. A second attempt returns a clear error: *"You have already submitted your song for this round."*

## 15. Voting Rules

Each eligible participant rates each song once, 1–10. Server enforces `rating >= 1 && rating <= 10` and prevents duplicate voting. The user may change their rating while voting is open if the product design allows. Once the round closes, votes are immutable.

## 16. Results

At round end show: song, artist, average rating, number of votes, ranking within the round, rating distribution, recommendation author, personal rating, group average. Do not reveal information party settings prohibit.

## 17. Statistics

**Personal:** average rating given, average score received, number of songs recommended, highest/lowest-rated recommendation, voting generosity, favorite artists, favorite genres (when available), rating distribution.

**Group:** highest-rated song, most controversial song, biggest crowd favorite, most divisive song, everyone-agreed song, dark horse, most generous voter, toughest critic, musical similarity / "musical twin".

Label statistics clearly as calculated metrics. Do not manufacture statistics without enough underlying data.

## 18. Leaderboards

Possible: Highest Average Song Rating, Highest Average Recommendation Score, Most Consistent, Most Surprising, Most Popular. Definitions must be transparent (e.g. *Average Recommendation Score = average rating received by songs recommended by the user*). Avoid misleading rankings from tiny samples; show context like "Based on 12 recommendations".

## 19. Main Screens

1. Landing / Welcome  2. Login / Sign Up (Cognito)  3. Home / Today's Party (current round, members, user's status, recommended songs, voting status)  4. Recommend a Song (search connected providers)  5. Voting / Party View  6. Results / End of Round  7. Personal Stats  8. Group Stats  9. Leaderboard  10. Party Settings (name, members, round settings, voting settings, results visibility, provider options)  11. History  12. Profile / Account (display name, avatar, connected providers, account settings)  13. Mobile experience — every screen responsive.

## 20. UI Design System

Modern music-focused interface: dark navy/charcoal foundation, neon blue, teal, purple accents, rounded cards, album artwork, large typography, subtle gradients, clean charts, modern dashboard layouts. Not unnecessarily complicated. **The second approved mockup direction is the primary visual reference** (see `docs/design/`).

## 21. Responsive Design

Must work on desktop, laptop, tablet, mobile browser. Mobile is especially important. No desktop-only layouts. Test at 320, 375, 390, 430, 768, 1024, 1440 px.

## 22. Frontend Technology

TypeScript, React, Vite, React Router, TanStack Query, modern CSS / Tailwind. Reusable components: Button, Card, Modal, Avatar, SongCard, RatingControl, AlbumArt, StatCard, Leaderboard, Chart, LoadingState, EmptyState, ErrorState. Don't duplicate UI logic.

## 23. Backend API

REST-style HTTP APIs, e.g.:

```text
GET    /parties
POST   /parties
GET    /parties/{partyId}
POST   /parties/{partyId}/join
GET    /parties/{partyId}/rounds/current
POST   /rounds/{roundId}/recommendations
GET    /rounds/{roundId}/recommendations
POST   /rounds/{roundId}/votes
GET    /rounds/{roundId}/results
GET    /users/me/stats
GET    /parties/{partyId}/stats
```

Keep APIs small and understandable.

## 24. Authorization

Every backend request verifies: authentication, user identity, party membership, resource ownership, appropriate permissions. Never rely on a `userId` sent by the frontend — derive the user from the validated token.

## 25. Database Access Patterns

Before implementing DynamoDB, document primary access patterns: get user, user's parties, party, party members, active round, round recommendations, user's recommendation, round votes, round results, user statistics, party statistics, invitation. Design around these. Avoid arbitrary scans. Never fetch the whole DB and filter in Lambda.

## 26. Invitations

Start with a simple invite code or link (e.g. `SONG-7K4P`). Backend validates: code exists, code is active, party has room, user is not already a member.

## 27. Onboarding

Explain without overwhelming: 1) Join a Party 2) Connect your music service 3) Recommend a song 4) Listen to everyone else's songs 5) Rate them 6) See the results. Tooltips/help for unfamiliar features.

## 28. Empty States

Every major screen needs an intentional empty state ("No songs yet. Be the first person to recommend one." / "No votes yet. Invite your friends to start the round." / "No statistics yet. Complete your first round to start building your music profile."). Never a blank screen.

## 29. Loading States

Skeleton cards, spinners, disabled submit buttons, loading album art, progress indicators. Never appear frozen.

## 30. Error Handling

User-understandable errors. Bad: `DynamoDB ConditionalCheckFailedException`. Good: "That song has already been submitted for this round." Log technical details server-side.

## 31. Security

Never: hard-code secrets, store passwords, expose AWS credentials, expose provider client secrets, trust frontend authorization, log access tokens, store unnecessary personal information, allow arbitrary DynamoDB queries from clients.

Use: IAM least privilege, Cognito auth, JWT validation, HTTPS, input validation, rate limiting where appropriate, secure headers, CORS restrictions, environment-specific configuration.

## 32. Rate Limiting and Abuse Prevention

Protect login, party creation, invitation validation, song search, recommendation submission, voting. No expensive dedicated rate-limiting infrastructure; prefer simple AWS-native controls and application-level safeguards.

## 33. Observability

CloudWatch Logs, metrics, basic alarms. Log request failures, auth failures, important app errors, Lambda failures, unexpected provider errors. Never log passwords, access/refresh tokens, provider secrets, sensitive personal info. Distributed tracing only if complexity justifies it.

## 34. Testing

- **Unit:** rating validation, statistics calculations, permission checks, round logic, recommendation rules.
- **Integration:** authentication, party creation, joining, recommendation submission, voting, results.
- **UI:** Sign up → Join party → Recommend song → Vote → View results.

Never claim tests passed unless they were actually executed.

## 35. CI/CD

GitHub → Build → Test → Deploy frontend to S3 → Invalidate CloudFront → Deploy Lambda/API infrastructure. No Kubernetes/container deploy systems. Infrastructure as code (SAM, CDK, or Terraform — choose one, document it; favor the most beginner-friendly).

## 36. Development Environments

At least Development and Production. Local development must not be able to modify production data. Separate resources/configuration.

## 37. Environment Configuration

Never hard-code AWS region, API URL, Cognito IDs, provider credentials. Use env config (`VITE_API_URL`, `VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_AWS_REGION`). Frontend variables never contain secrets.

## 38. Documentation Requirements

At minimum: README.md, ARCHITECTURE.md, DEVELOPMENT.md, DEPLOYMENT.md, SECURITY.md, MUSIC_PROVIDERS.md, DATABASE.md, API.md.

README explains: what the app does; tech stack; install; run locally; how authentication works; how AWS deployment works; how music providers work; env vars; running tests; deploying; monitoring AWS costs.

## 39. Beginner-Friendly Code Requirement

Understandable to a developer who didn't write it. Prefer `const user = await getCurrentUser(); const party = await getParty(partyId);` over abstract architecture. Avoid excessive design patterns, over-abstraction, giant generic frameworks, clever one-liners, unnecessary microservices, premature optimization. Comments explain *why*.

## 40. AI Coding Rules

1. **Inspect before changing** — repo, architecture, relevant files, dependencies, tests. Don't blindly create new architecture.
2. **Do not over-engineer** — "Is this actually necessary for a 10–20-person private app?"
3. **Protect the free/low-cost architecture** — no EC2, RDS, ECS, Kubernetes, Redis, OpenSearch, WebSockets, AppSync, always-running servers without a concrete requirement.
4. **Don't invent APIs** — check current official docs; confirm the API exists, current auth method, restrictions, licensing.
5. **Smallest useful change** — understand, find smallest change, implement, test, document.
6. **Preserve existing functionality** — don't rewrite unrelated parts.
7. **Security before convenience** — never weaken auth to make development easier.
8. **Explain important decisions** — document architecture affecting cost, security, maintainability.
9. **Test real behavior** — don't claim tests pass unless run.
10. **Keep AWS costs visible** — for any new AWS service document: Why is it needed? What does it cost? Free allowance? Could an existing service do it? **Unnecessary infrastructure is a defect.**

## 41. Recommended Initial AWS Footprint

S3, CloudFront, Cognito, API Gateway HTTP API, Lambda, DynamoDB, CloudWatch. Anything else is an exception.

## 42. Future Scaling

Remain capable of growth (10–20 → 50 → 100 → 1,000 users) but don't build for millions before there are millions. Possible future additions: caching, real-time updates, queues, event-driven stats, advanced analytics, more providers, push notifications, larger-scale search, advanced observability — future upgrades, not initial requirements.

## 43. Product Philosophy

User flow: Open app → See today's round → Pick a song → Listen → Rate → See results → Compare with friends. Users never need to understand AWS, tokens, Lambda, DynamoDB, or provider APIs. Developers should understand exactly how those systems work.

## 44. Final AI Development Principle

Decision priority order:

```text
1. Security  2. Correctness  3. User experience  4. Maintainability  5. Simplicity  6. Cost  7. Scalability
```

Simplicity and cost efficiency are intentional product requirements, not shortcuts. Build the smallest robust system capable of delivering the complete Song of the Day experience. Don't add infrastructure because it's available. Don't add features because they might be useful someday.
