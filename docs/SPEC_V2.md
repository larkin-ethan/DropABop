# Drop a Bop — Master Development, UI, Music Integration, and API Compliance Specification (v2)

> **Intake note (P13.1, 2026-10-09).** Ethan pasted this specification on 2026-10-09 together with three mockup
> sheets (`docs/design/mockup-v3-*.webp`). It is stored here word for word (only Markdown headings and code fences
> were added). It is **not** a rewrite of the app: §1 asks to preserve working functionality. How each section maps
> onto the existing weekly app is in **[SPEC_V2_RECONCILIATION.md](SPEC_V2_RECONCILIATION.md)** and decisions
> D26–D33 in `PRODUCT_DECISIONS.md`. Precedence: this file → `PRODUCT_DECISIONS.md` → ADRs → `SPEC.md` (v1, kept
> unchanged). Where a decision or ADR explicitly adapts a v2 section, the decision wins. Never edit this file
> without being asked.

## 1. Your Role and Primary Objective

Act as a senior full-stack software engineer, UI/UX designer, cloud architect, security engineer, and API compliance specialist.

Your task is to continue developing my existing web application, Drop a Bop, into a polished, reliable, secure, and production-ready private social music-rating application.

Do not simply generate a visual prototype. Implement working functionality, integrate supported APIs correctly, build the required screens, write tests, document the architecture, and preserve existing functionality.

Before making changes:

1. Inspect the existing repository and project structure.
2. Identify the frontend framework, backend implementation, database, authentication, existing features, and tests.
3. Review existing screens and visual references.
4. Identify existing API integrations and their applicable terms.
5. Prepare an implementation plan that builds on the existing code.
6. Implement changes incrementally and verify them.

Do not replace working functionality unnecessarily. Do not rebuild the application from scratch unless there is a compelling technical reason.

The code should be clean, readable, maintainable, well documented, and understandable to a developer who is still learning software development.

Avoid unnecessary complexity, excessive abstraction, and generated code that is difficult to understand.

## 2. Product Overview

Drop a Bop is a private, invite-only social music-rating application for approximately 10–20 people.

The core experience is:

1. Users join a private party.
2. Each member recommends exactly one song per round.
3. Other members listen to the submitted songs.
4. Members rate each song from 1–10.
5. The round concludes when the required voting conditions are satisfied.
6. Users see round results and group rankings.
7. The application tracks individual and group statistics.
8. Users explore their history through a calendar.
9. Users unlock achievements based on verified activity.
10. Users can use supported music services to listen to songs within the application when permitted and technically supported.

The app should support multiple private parties and retain historical results.

Product requirements

* Private, invite-only experience
* Default party size of approximately 20 members
* Exactly one recommendation per user per round
* Ratings from 1 to 10
* One vote per eligible user per song per round
* Individual statistics
* Group statistics
* Historical rounds
* Calendar-based history
* Day and week summaries
* Leaderboards
* Achievements
* Profiles
* Notifications
* Search
* Embedded or in-app music playback when officially supported
* External music links as a fallback
* Responsive desktop and mobile experiences
* Simple onboarding and help
* Extremely low operating costs

Do not add public social networking, complex messaging, or other major features unless they are already part of the application or explicitly required.

## 3. Mandatory API Terms, Legal Compliance, and Responsible Integration

This section is mandatory and takes priority over feature requests, mockups, convenience, or implementation shortcuts.

Every third-party integration must be implemented in accordance with the provider's current official documentation, API terms, developer agreements, licensing conditions, privacy requirements, and applicable law.

Do not assume that a feature is permitted simply because it is technically possible.

### 3.1 Verify official documentation before implementation

Before implementing any external API or SDK:

1. Locate the provider's official developer documentation.
2. Locate the applicable API terms, developer agreement, usage policies, and licensing restrictions.
3. Verify the current authentication requirements.
4. Verify whether the intended application and use case are eligible.
5. Verify commercial, noncommercial, branding, attribution, display, and content restrictions.
6. Verify rate limits, quotas, caching rules, and storage restrictions.
7. Verify privacy, data retention, and deletion requirements.
8. Verify whether user authorization or a paid subscription is required.
9. Verify whether the proposed playback, search, metadata, artwork, and embedding features are permitted.
10. Record the official documentation URLs and the date they were reviewed.

Prefer official first-party documentation over blogs, forum posts, tutorials, or unverified examples.

If official documentation is ambiguous, do not interpret that ambiguity as permission. Identify the uncertainty and request clarification from the provider when necessary.

### 3.2 Never circumvent restrictions

The application and its developers must not:

* Bypass authentication or authorization.
* Circumvent subscription or payment requirements.
* Bypass DRM, encryption, or playback restrictions.
* Scrape websites or private endpoints when prohibited.
* Reverse-engineer private or undocumented APIs to obtain restricted functionality.
* Use stolen, shared, or improperly obtained credentials.
* Impersonate users or services.
* Falsify application identity, origin, referrer, or authorization data.
* Evade rate limits, quotas, bans, or usage restrictions.
* Rotate accounts, IP addresses, or credentials to evade enforcement.
* Forge API responses or misrepresent user permissions.
* Extract audio from streaming services when prohibited.
* Download, rip, or redistribute copyrighted music without authorization.
* Remove watermarks, advertisements, attribution, or required branding.
* Modify or repackage provider content in prohibited ways.
* Circumvent geographic, account, device, or subscription restrictions.
* Use an unofficial API endpoint as a workaround for a restricted official feature.
* Collect more user information than the integration requires.
* Share user tokens or credentials between users.
* Claim that a feature is compliant without verifying the applicable requirements.

Do not implement a technically possible workaround if it violates a provider's terms or applicable law.

### 3.3 Stop when a feature is not permitted

If a requested feature cannot be implemented in compliance with a provider's requirements:

1. Do not implement the prohibited behavior.
2. Explain which capability is restricted.
3. Identify the official documentation or terms that establish the limitation.
4. Suggest a compliant alternative.
5. Preserve the rest of the application functionality.

For example, if a provider does not permit unrestricted playback, use an approved embedded player, an authorized preview if permitted, or a valid external link.

Do not weaken API compliance requirements to make a feature appear functional.

### 3.4 Legal compliance checklist

Before releasing each integration, document:

* Provider and API name
* Official documentation
* Applicable terms and policies
* Approved use case
* Authentication requirements
* User consent requirements
* Required subscription or account eligibility
* Permitted playback behavior
* Permitted metadata and artwork usage
* Branding and attribution requirements
* Rate limits and quotas
* Caching and retention restrictions
* Privacy requirements
* Revocation and disconnection behavior
* Known limitations
* Compliance test results

Do not describe the application as legally certified or guaranteed compliant. The objective is to follow documented requirements, identify uncertainty, and obtain appropriate legal advice when necessary.

## 4. Music Provider Strategy

For the initial release, prioritize:

1. Apple Music
2. YouTube and YouTube Music where supported through officially permitted YouTube integrations

Do not implement Spotify in the first release.

Keep the architecture extensible so other providers can be considered later.

Apple Music

Investigate MusicKit on the Web and the Apple Music API.

Determine which capabilities are currently permitted and available for the specific use case, including:

* Catalog search
* Song metadata
* Artwork
* User authorization
* Playback
* Account eligibility
* Subscription requirements
* Playback limitations
* Attribution and branding
* Data retention and caching

Use only officially supported interfaces and authorization flows.

Do not assume every Apple Music feature is available without a subscription or authorization.

YouTube and YouTube Music

Investigate the official YouTube Data API and YouTube IFrame Player API where appropriate.

Determine which capabilities are available for:

* Video search
* Video identification
* Embedding
* Playback
* Player controls
* Metadata
* Thumbnails
* User authorization, if needed
* Quotas
* Branding
* Playback restrictions

Do not assume that YouTube Music provides a general-purpose browser playback SDK equivalent to Apple Music's MusicKit.

An embedded YouTube video is not automatically equivalent to an unrestricted YouTube Music audio stream.

Use only permitted playback methods and comply with the current YouTube API Services Terms of Service, Developer Policies, branding requirements, and applicable content rules.

Do not extract audio from YouTube videos or attempt to hide required player elements, branding, or advertisements.

Do not misrepresent a YouTube video as an official recording when its identity cannot be verified.

Provider-independent experience

The user interface should use a consistent internal music-player interface while respecting each provider's real capabilities.

Never promise that every song will be playable inside Drop a Bop.

## 5. Visual Design Requirements

Preserve the established Drop a Bop design.

Design direction

* Dark navy and charcoal backgrounds
* Neon cyan, blue, and purple accents
* Rounded cards
* Modern typography
* Album artwork
* Subtle gradients
* Clean charts
* Clear statistics
* Smooth but restrained animations
* Consistent spacing
* Accessible contrast
* Polished desktop and mobile layouts

The application should feel like a modern music application combined with a social experience and analytics dashboard.

Do not introduce a completely different visual theme.

Use existing approved screenshots and mockups as the primary visual references.

If a screen already exists, improve and extend it rather than creating a disconnected replacement.

## 6. Technical Architecture

Use the existing project's architecture where reasonable.

If the existing project follows the previously established stack, retain:

Frontend

* TypeScript
* React
* Vite
* React Router
* TanStack Query
* Existing styling framework or a consistent modern CSS/Tailwind implementation

AWS hosting

* Amazon S3 for static frontend hosting
* Amazon CloudFront for content delivery
* Amazon Cognito for authentication
* Amazon API Gateway HTTP API
* AWS Lambda for backend logic
* Amazon DynamoDB for application data
* Amazon CloudWatch for monitoring

Do not add EC2, ECS, Kubernetes, RDS, Redis, OpenSearch, WebSockets, AppSync, or always-running servers without a documented technical justification.

The expected scale is approximately 10–20 users. Favor simplicity and low operating costs.

Use AWS billing budgets and alerts. Do not promise that AWS usage will always be free.

Do not migrate away from a working architecture without identifying a genuine requirement.

## 7. Music Provider Abstraction

Create a shared music integration layer.

A conceptual interface may resemble:

```typescript
interface MusicPlayerProvider {
    initialize(): Promise<void>;
    loadSong(song: Song): Promise<void>;
    play(): Promise<void>;
    pause(): Promise<void>;
    seek(positionSeconds: number): Promise<void>;
    setVolume(volume: number): Promise<void>;
    getPlaybackState(): PlaybackState;
    destroy(): void;
}

```

Adjust this interface to the actual supported capabilities of each provider.

Potential implementations:

* AppleMusicPlayer
* YouTubePlayer

Use an internal MusicPlayerService to coordinate the active player.

Conceptually:

```text
SongCard
   ↓
MusicPlayerService
   ↓
Selected Provider
   ├── Apple Music
   └── YouTube Embedded Player

```

The UI must not need to understand provider-specific implementation details.

However, do not force both providers to pretend they support identical capabilities. Represent unsupported features explicitly.

Ensure only one song plays at a time within the application.

Clean up player instances when appropriate.

Handle loading, playback, pause, failure, disconnection, and authorization errors consistently.

## 8. Song Data Model

Separate logical songs from provider-specific references.

A logical song may contain:

* id
* title
* artist
* album
* albumArtwork
* duration
* releaseYear
* explicit
* genre
* submittedBy
* providerLinks

Provider-specific records may contain:

Apple Music

* Catalog ID
* Authorized URL or reference
* Relevant metadata allowed by Apple's terms

YouTube

* Video ID
* Video URL
* Relevant metadata allowed by YouTube's terms

Do not assume provider IDs are interchangeable.

Avoid duplicate logical songs when a match can be reliably established.

Do not merge recordings merely because their titles are similar. Account for artist, remix, live performance, cover, clean/explicit version, and other meaningful differences.

Follow each provider's rules concerning metadata storage, artwork use, caching, refreshing, and deletion.

Do not download or permanently store provider content unless explicitly permitted.

## 9. Music Services Settings

Create a dedicated Music Services page under Settings.

Example:

```text
MUSIC SERVICES

Choose how you listen to songs in Drop a Bop.

--------------------------------

APPLE MUSIC

[Apple Music Logo]

Not Connected

Authorize Apple Music to use supported
in-app playback features.

[Connect Apple Music]

--------------------------------

YOUTUBE

[YouTube Logo]

Embedded playback available
for compatible videos.

[Playback Preferences]

```

Display:

* Provider name and logo
* Connection or availability status
* Short description
* Connect or disconnect controls where applicable
* Relevant account information
* Playback availability
* Known limitations

Clearly distinguish account authorization from ordinary embedded playback.

Do not require YouTube account authorization if it is not necessary for the intended feature.

Never request unnecessary permissions.

## 10. Account Authorization and Disconnection

Apple Music

Provide a connection flow that explains why authorization is needed.

Example:

```text
CONNECT APPLE MUSIC

Connect Apple Music to use supported
in-app listening features.

You'll be asked to authorize access through Apple.

[Connect Apple Music]
[Cancel]

```

After successful authorization:

```text
APPLE MUSIC CONNECTED

Your account is ready for supported
Drop a Bop listening features.

[Done]

```

Handle authorization cancellation, failure, expiration, revocation, and disconnection.

YouTube

Provide embedded playback without unnecessary account permissions.

If a feature genuinely requires optional account authorization, explain its purpose and request only the permissions required for that feature.

Security requirements

* Never store provider passwords.
* Never expose client secrets in frontend code.
* Never log access or refresh tokens.
* Follow current provider authorization requirements.
* Store only necessary account metadata.
* Support disconnection.
* Handle revoked access.
* Do not expose one user's provider credentials to another user.

Do not claim an account is connected until authorization has actually succeeded.

## 11. Recommend a Song

Update the existing Recommend a Song screen.

Example:

```text
RECOMMEND A SONG

What are you dropping today?

[Search songs...]

--------------------------------

SEARCH RESULTS

[Album Art]
Blinding Lights
The Weeknd
After Hours

[Apple Music]
[YouTube]

--------------------------------

[Select Song]

```

Allow users to search supported catalogs or permitted YouTube results.

Use official APIs and authorized search methods.

Display only verified results.

Respect API quotas and rate limits.

Do not scrape search results from websites or call undocumented endpoints.

If the same song exists on multiple providers, associate the references with one logical song when the match is sufficiently reliable.

If no match can be verified, retain separate candidates rather than incorrectly merging them.

Do not create duplicate recommendations for a user in the same round.

Validate the recommendation on the server.

## 12. Song Confirmation Screen

Example:

```text
YOUR BOP

[Large Album Artwork]

Blinding Lights
The Weeknd
After Hours

Available on:
Apple Music ✓
YouTube ✓

--------------------------------

PREVIEW

[▶ Play]

--------------------------------

You're about to submit this song
to today's Drop.

[Submit My Bop]
[Change Song]

```

Show only verified provider references.

Provide preview or playback only where permitted and supported.

Do not make successful playback a prerequisite for submitting a song.

Do not reproduce, store, or distribute music outside the provider's authorized mechanisms.

## 13. Voting Screen With Embedded Player

Update the voting screen.

Example:

```text
TODAY'S BOPS

2 of 8 completed

--------------------------------

ALEX'S BOP

[Album Artwork]

Blinding Lights
The Weeknd

[Embedded Player]

0:32 / 2:56

--------------------------------

HOW WOULD YOU RATE IT?

1 2 3 4 5 6 7 8 9 10

[Submit Rating]

```

Support, where permitted and supported:

* Play
* Pause
* Playback progress
* Seeking
* Volume
* Loading states
* Error states
* Provider branding

Do not display unsupported controls.

Keep the rating experience simple.

Enforce one vote per eligible user per song per round.

Validate party membership and voting eligibility server-side.

## 14. Playback Fallbacks

Implement graceful fallback behavior.

Player loading

```text
[Album Artwork]

Loading player...

```

Playback unavailable

```text
This song can't be played here.

[Listen on Apple Music]
[Listen on YouTube]

```

No account authorization

```text
Want to use supported in-app playback?

[Connect Apple Music]
[Use YouTube]

```

Provider failure

```text
We couldn't play this song here.

Try another available listening option.

```

Only display valid links and verified destinations.

Do not redirect users to unrelated songs.

Do not automatically select a different recording without explaining the difference.

Respect browser autoplay restrictions.

Do not attempt to bypass them.

Connecting a service must never be required to participate in the app.

Users must still be able to vote, submit songs, view results, and access statistics without connecting a provider.

## 15. Player Lifecycle and Persistence

Ensure:

* Only one Drop a Bop player is active at a time.
* Starting another song pauses or stops the previous song.
* Player instances are cleaned up when necessary.
* Playback state is preserved where supported.
* Navigation does not unnecessarily restart playback.
* Errors are handled without breaking voting.
* Provider authorization errors do not crash the application.

Do not promise uninterrupted playback or background playback unless supported by the provider and browser.

## 16. Calendar-Based History

Replace the basic History page with a calendar experience.

Calendar view

Example:

```text
HISTORY

September 2026

       S  M  T  W  T  F  S
          1  2  3  4  5  6
       7  8  9 10 11 12 13
      14 15 16 17 18 19 20
      21 22 23 24 25 26 27
      28 29 30

● Activity
★ Personal Best

```

Support:

* Month navigation
* Previous and next month
* Jump to today
* Select a day
* Select a week
* Activity indicators
* Notable results
* Achievement indicators
* Empty days

Day view

Display:

* Number of rounds
* Songs submitted
* Songs rated
* Average rating given
* Average rating received
* Highest-rated song
* Lowest-rated song
* Favorite artists when sufficient data exists
* Rating distribution
* Group average
* User ranking where meaningful

Example:

```text
SEPTEMBER 18

3 Rounds
12 Songs Rated
8.1 Average Given
7.7 Average Received

TOP BOP

[Artwork]
Song Name
9.6

RATING DISTRIBUTION

[Chart]

[View Rounds]

```

Allow users to open historical songs and rounds.

Week view

Example:

```text
WEEK OF SEPTEMBER 14–20

[Previous Week] [Next Week]

Rounds              5
Songs Rated        42
Average Rating    7.8
Best Bop           9.7

TOP ARTISTS

1. The Weeknd
2. Kendrick Lamar
3. Taylor Swift

MOST AGREEABLE DAY

Thursday

MOST DIVISIVE BOP

[Song Artwork]
Song Name

```

All calculations must use actual historical data.

Define metrics clearly.

Do not fabricate activity or show misleading rankings from insufficient data.

## 17. Achievements

Create a dedicated Achievements screen.

Example:

```text
ACHIEVEMENTS

12 / 30 Unlocked

--------------------------------

🔥 FIRST DROP

Submit your first song.

✓ Unlocked

--------------------------------

🎧 MUSIC LOVER

Rate 100 songs.

68 / 100

--------------------------------

🏆 CROWD FAVORITE

Have your song receive the highest
score of a round.

✓ Unlocked

--------------------------------

🎯 PERFECT 10

Give a song a 10.

✓ Unlocked

--------------------------------

👑 HITMAKER

Receive an average rating
of 9.0 or higher.

7.8 / 9.0

```

Achievement categories

Participation:

* First Drop
* First Vote
* 10 Rounds
* 50 Rounds
* 100 Rounds

Music discovery:

* 10 Different Artists
* 25 Different Artists
* 10 Different Genres
* Genre Explorer

Rating:

* First 10
* First 1
* Generous Voter
* Tough Critic
* Balanced Judge

Song success:

* Crowd Favorite
* Top Bop
* Perfect Score
* Back-to-Back Winners

Social:

* Musical Twin
* Most Compatible
* Most Divisive
* Group Favorite

Consistency:

* Weekly Regular
* Monthly Regular
* 7-Day Streak
* 30-Day Streak

Define exact unlock criteria.

Use server-side validation to award achievements.

Prevent duplicate awards and frontend manipulation.

Do not award achievements based on incomplete rounds unless the achievement explicitly permits it.

Avoid achievements that encourage unhealthy or excessive usage.

Achievement unlock notification

Example:

```text
🎉 ACHIEVEMENT UNLOCKED

        🏆

CROWD FAVORITE

Your song was the highest-rated
Bop of the round!

[View Achievement]

```

Use restrained animation and respect reduced-motion preferences.

Do not interrupt active voting unnecessarily.

## 18. Personal Profile

Expand the existing Profile screen.

Example:

```text
PROFILE

[Profile Picture]

Display Name
Music Lover

--------------------------------

DROP A BOP SCORE
8.4

AVERAGE GIVEN
7.8

AVERAGE RECEIVED
8.2

SONGS SUBMITTED
124

VOTES CAST
1,024

--------------------------------

ACHIEVEMENTS

[Achievement Badges]

--------------------------------

TOP ARTISTS

[Artist List]

--------------------------------

RECENT BOPS

[Song Cards]

```

Include:

* Profile photo
* Display name
* Username
* Personal statistics
* Achievements
* Favorite artists
* Favorite genres
* Recent Bops
* Connected services when appropriate

Only display metrics supported by actual data.

Respect privacy settings.

## 19. Group Statistics

Create a detailed group statistics screen.

Example:

```text
GROUP STATS

12 Members
428 Bops
2,941 Votes

--------------------------------

GROUP AVERAGE

7.9

--------------------------------

TOP BOP

[Artwork]
Song
9.7

--------------------------------

MOST DIVISIVE

[Artwork]
Song

--------------------------------

TOUGHEST CRITIC

Alex
5.9 Average Given

--------------------------------

MOST GENEROUS

Sarah
8.8 Average Given

```

Include:

* Highest-rated songs
* Most divisive songs
* Crowd favorite
* Most consistent voter
* Most generous voter
* Toughest critic
* Favorite artists
* Rating distributions
* Weekly activity
* Monthly activity
* Historical comparisons

Define the calculations for each metric.

Use minimum sample sizes where appropriate.

Do not expose private user information to unauthorized parties.

## 20. Leaderboard

Provide filters for:

* Overall
* This Week
* This Month
* All Time

Include:

* Highest Average Received
* Highest Average Given
* Most Bops
* Most Votes
* Crowd Favorite
* Toughest Critic
* Most Generous
* Most Consistent

Avoid misleading rankings from small sample sizes.

A user with one rating of 10 should not automatically outrank a user with 100 ratings averaging 9.5.

Clearly explain provisional rankings and minimum eligibility requirements.

Use real calculations rather than mock data in production.

## 21. Song Details

Create a detailed Song Details screen.

Example:

```text
[Large Album Artwork]

Song Name
Artist

Album
Release Year

--------------------------------

[Embedded Player]

--------------------------------

ROUND RESULT

9.2 / 10

#1 of 12

--------------------------------

YOUR RATING

9

--------------------------------

GROUP DISTRIBUTION

[Chart]

```

Include:

* Song metadata
* Verified provider links
* Playback
* User rating
* Group average
* Ranking
* Rating distribution
* Historical round
* Submission date
* Submitter where privacy settings allow

Follow each provider's restrictions on displaying metadata and artwork.

## 22. Notifications

Create a Notifications screen.

Example:

```text
NOTIFICATIONS

🏆 Achievement unlocked:
"Crowd Favorite"

🎵 A new Bop is ready to rate.

🔥 You're on a 7-day participation streak.

📊 Weekly results are ready.

👑 You finished #2 this week.

```

Support read/unread states and notification preferences.

Keep notifications useful rather than excessive.

In-app notifications are sufficient for the first release. Do not add push-notification infrastructure unless required.

## 23. Weekly Summary

Create a weekly summary screen.

Example:

```text
YOUR WEEK

September 14–20

--------------------------------

You rated
42 songs

Average given
7.8

Average received
8.3

--------------------------------

YOUR TOP BOP

[Artwork]

Song Name
9.4

--------------------------------

YOUR BEST ACHIEVEMENT

🏆 Crowd Favorite

--------------------------------

THIS WEEK'S RANK

#3 / 12

```

Include group comparisons and relevant trends.

Generate summaries from actual historical data.

Avoid unnecessary scheduled infrastructure.

## 24. Global Search

Create a global search experience with categories:

* All
* Songs
* Artists
* Users
* History

Search songs and artists using authorized data sources.

Respect API quotas and terms.

Respect party membership and privacy restrictions.

Do not expose private party data to unauthorized users.

Do not scrape websites or use undocumented private endpoints.

## 25. Party Management

Maintain and improve the existing party system.

Required screens:

* Create Party
* Join Party
* Invite Members
* Party Home
* Party Settings
* Member Management
* Start Round
* Current Round
* Round Results
* End Round

Authorized owners/admins can manage:

* Party name
* Invite code
* Invite link
* Members
* Round behavior
* Privacy settings
* Rating anonymity
* Other existing settings

Enforce authorization on the backend.

Do not rely on hiding frontend controls as a security mechanism.

## 26. Home Dashboard

The home dashboard should be the primary entry point.

Example:

```text
GOOD EVENING, ETHAN

TODAY'S DROP

8 Bops
5 Rated
3 Remaining

[Continue Voting]

--------------------------------

YOUR STATS

7.9 Average Given
8.3 Average Received

--------------------------------

RECENT ACHIEVEMENT

🏆 Crowd Favorite

--------------------------------

THIS WEEK

#3 Group Ranking

[View Stats]

```

The primary action must reflect the actual application state:

* Submit a recommendation
* Continue voting
* View results
* Join a round
* Wait for the next round

Do not display inconsistent or stale status.

## 27. Mobile Design

Support the following viewport widths:

* 320px
* 375px
* 390px
* 430px
* 768px
* 1024px
* 1440px and above

Design mobile screens intentionally rather than simply shrinking desktop layouts.

Use bottom navigation:

```text
Home
Drop
History
Stats
Profile

```

Secondary screens should be accessible through menus or contextual navigation.

Prevent horizontal overflow.

Ensure charts, cards, player controls, and rating buttons remain usable on small screens.

## 28. Mobile Player

Create a compact mobile player.

Example:

```text
┌────────────────────────────┐
│ [Art] Song Name        ▶   │
│       Artist               │
│ ─────────────────────────  │
│ 0:32                 2:56  │
└────────────────────────────┘

```

An expanded view may show:

* Artwork
* Song name
* Artist
* Supported playback controls
* Progress
* Time
* Volume where supported

Do not create multiple independent playback sessions for the compact and expanded player.

Keep rating controls accessible.

## 29. Settings

Organize Settings into:

```text
ACCOUNT
Profile
Password
Email

MUSIC
Music Services
Default Music Provider
Playback Preferences

NOTIFICATIONS
Achievement Notifications
Round Notifications
In-App Notifications

PRIVACY
Profile Visibility
Rating Visibility

PARTY
Party Settings

HELP
How Drop a Bop Works
FAQ
Contact / Support

ABOUT
Version
Terms
Privacy

```

Only display controls that actually work.

## 30. Help and Onboarding

Create a How Drop a Bop Works screen.

Example:

```text
HOW DROP A BOP WORKS

1. DROP A BOP
Everyone submits one song.

2. LISTEN
Listen to everyone's songs.

3. RATE
Rate each song from 1–10.

4. SEE RESULTS
Find out which Bop won.

5. TRACK YOUR STATS
See how your taste compares over time.

```

Explain how music connections work, why some songs cannot play inside the app, and how to use external links.

Add contextual help for unfamiliar features.

## 31. Empty and Error States

Create intentional empty and error states for every major screen.

No history

```text
No Bops yet.

Your history will appear here
after your first round.

[Start a Drop]

```

No achievements

```text
Your achievement shelf is empty.

Participate in a round to start
unlocking achievements.

```

No music provider

```text
Choose a way to listen.

[Connect Apple Music]
[Use YouTube]

```

Playback error

```text
We couldn't play this song here.

[Try another provider]
[Open available music link]

```

No search results

Explain that no matches were found and let the user retry.

Network/server error

Provide a useful message and retry action where appropriate.

Never expose stack traces, tokens, or sensitive internal information.

## 32. Database Design

Reuse the existing database where possible.

Relevant entities may include:

* User
* Party
* PartyMembership
* Round
* Song
* SongProvider
* Recommendation
* Vote
* Achievement
* UserAchievement
* MusicAccount
* Notification

These are conceptual entities, not a requirement to duplicate existing tables.

Keep provider references separate from logical song records.

Follow provider rules for metadata retention, caching, and deletion.

Design database access around expected queries.

Avoid unnecessary full-table scans.

Store only data required for application functionality.

## 33. Authentication and Application Security

Use the existing authentication architecture if it is secure and appropriate.

For the established AWS architecture, Cognito can provide application authentication with JWT-based sessions.

Requirements:

* Validate authentication server-side.
* Enforce party membership server-side.
* Enforce admin permissions server-side.
* Validate all submitted ratings.
* Enforce one recommendation per user per round.
* Enforce one vote per eligible user per song per round.
* Prevent unauthorized data access.
* Validate input.
* Use least-privilege IAM permissions.
* Use HTTPS.
* Configure CORS correctly.
* Apply rate limiting where appropriate.
* Avoid logging credentials or tokens.
* Never trust the frontend as the authority for permissions or achievements.

Do not invent a custom authentication system when a suitable existing implementation is available.

## 34. Provider Capabilities

Create a provider capability model so the UI only displays supported features.

A conceptual interface may resemble:

```typescript
interface MusicProviderCapabilities {
    search: boolean;
    embeddedPlayback: boolean;
    seek: boolean;
    volume: boolean;
    accountConnection: boolean;
    backgroundPlayback: boolean;
}

```

Adjust this to the actual provider capabilities.

Do not assume that a feature is available because it exists in another provider.

Do not expose unsupported controls.

Verify the current official documentation before marking any capability as supported.

## 35. Provider Quotas, Caching, and Rate Limits

For each API:

* Document the applicable quota.
* Implement appropriate request limits.
* Avoid unnecessary repeated requests.
* Cache only data that the provider permits to be cached.
* Follow required cache expiration and refresh rules.
* Respect attribution requirements.
* Handle rate-limit responses correctly.
* Implement reasonable retry behavior.
* Use exponential backoff where appropriate.
* Do not retry indefinitely.
* Do not evade quota restrictions.
* Do not use multiple API keys or accounts to bypass limits.

If an API quota is exhausted, show a graceful error or fallback.

Never respond to quota restrictions by switching to an unauthorized endpoint.

## 36. Privacy and Data Retention

Collect only the personal data necessary to operate Drop a Bop.

Requirements:

* Explain relevant data collection.
* Request appropriate user consent.
* Store provider account information securely.
* Do not expose music-account credentials to other users.
* Do not collect unnecessary listening history.
* Respect provider data deletion and retention rules.
* Support account disconnection.
* Remove or update stored authorization data when required.
* Respect provider restrictions on data sharing.
* Protect private parties and user profiles.
* Do not use provider data for unrelated advertising or profiling.
* Do not claim data is private or secure without implementing appropriate controls.

Create or update the privacy documentation to explain relevant integrations.

## 37. Accessibility

Support:

* Keyboard navigation
* Screen readers
* Accessible labels
* Adequate color contrast
* Visible focus states
* Accessible charts
* Reduced-motion preferences
* Proper heading hierarchy
* Usable touch targets

Do not rely on color alone to convey information.

Ensure rating controls and playback controls are accessible.

## 38. Performance

Optimize for a small application and low running costs.

* Lazy-load player integrations.
* Do not initialize all providers simultaneously.
* Avoid unnecessary API requests.
* Avoid unnecessary database queries.
* Paginate historical data when appropriate.
* Reuse components.
* Avoid excessive dependencies.
* Clean up player instances.
* Avoid unnecessary polling.
* Avoid always-running services.
* Monitor errors and usage.

Do not add infrastructure solely because it is commonly used in larger applications.

## 39. Required Screen Inventory

Ensure the application includes the following screens, reusing existing screens when appropriate.

Authentication

1. Landing
2. Login
3. Sign Up
4. Forgot Password
5. Email Verification

Party

6. Create Party
7. Join Party
8. Invite Party
9. Party Home
10. Party Settings
11. Member Management

Music

12. Recommend a Song
13. Song Search
14. Song Confirmation
15. Song Details
16. Embedded Music Player
17. Music Service Connection
18. Music Service Settings
19. Playback Error and Fallback

Voting

20. Voting
21. Vote Submitted
22. Waiting for Everyone
23. Round Results
24. Detailed Results

Statistics

25. Personal Stats
26. Group Stats
27. Leaderboard
28. Weekly Summary
29. Profile

History

30. Calendar
31. Day View
32. Week View
33. Historical Round Details

Gamification

34. Achievements
35. Achievement Detail
36. Achievement Unlock Notification

Utilities

37. Notifications
38. Search
39. Help / How It Works

40. Settings
41. Empty States
42. Error States

Every screen must have a responsive mobile implementation.

## 40. Navigation

Desktop

```text
Logo

Home
Today's Drop
History
Stats
Leaderboard
Achievements
Search

Party
Members
Settings

Profile
Account Settings

```

Mobile

```text
Home
Drop
History
Stats
Profile

```

Highlight the current page.

Avoid unnecessarily deep navigation.

Maintain a consistent design across all pages.

## 41. Testing Requirements

Write tests for all critical functionality.

Authentication

* Login
* Sign up
* Session handling
* Authorization failures

Songs

* Search
* Song selection
* Recommendation
* Duplicate detection
* Provider reference validation

Music integrations

* Apple Music initialization
* Authorization success
* Authorization cancellation
* Disconnection
* Expired authorization
* YouTube embedded playback
* Player loading
* Playback errors
* Fallback behavior
* One-player-at-a-time behavior
* Provider quota errors
* Unsupported capabilities

Use mocks or test fixtures when testing external services. Do not make unauthorized requests or violate provider policies during testing.

Voting

* Ratings from 1–10
* Duplicate vote prevention
* Unauthorized vote prevention
* Round closure

Calendar

* Day selection
* Week selection
* Correct aggregation
* Empty days
* Historical data

Achievements

* Unlock criteria
* Progress
* Duplicate prevention
* Server-side validation

Statistics

* Personal calculations
* Group calculations
* Leaderboard calculations
* Minimum sample sizes

API compliance

Test that:

* Only approved endpoints are used.
* Authorization is enforced.
* Requests respect quotas and rate limits.
* Required attribution is displayed.
* Disallowed data is not stored.
* Provider errors are handled correctly.
* No undocumented endpoint is required.
* Secrets are not exposed.
* Disconnection and deletion behave correctly.

Responsive layouts

Test at:

* 320px
* 375px
* 390px
* 430px
* 768px
* 1024px
* 1440px

Never claim that tests passed unless they were actually executed.

Do not claim an API integration works unless it has been verified.

## 42. AWS Cost Requirements

Maintain the low-cost architecture:

```text
React + TypeScript + Vite
          |
          v
      S3 + CloudFront
          |
          v
   API Gateway HTTP API
          |
          v
       AWS Lambda
          |
          v
       DynamoDB

Authentication:
Cognito

Monitoring:
CloudWatch

```

Prefer this minimal footprint where compatible with the existing application.

Do not introduce expensive infrastructure without a clear requirement.

Configure AWS budgets and cost alerts.

Document expected costs and free-tier limitations.

Do not assume third-party API access, Apple Music subscriptions, YouTube API quotas, or AWS infrastructure will necessarily be free.

Keep provider-specific costs and user subscription requirements distinct from AWS operating costs.

## 43. Required Documentation

Create or update:

* README.md
* ARCHITECTURE.md
* DEVELOPMENT.md
* DEPLOYMENT.md
* SECURITY.md
* MUSIC_PROVIDERS.md
* DATABASE.md
* API.md
* PRIVACY.md
* API_COMPLIANCE.md

MUSIC_PROVIDERS.md

Document:

* Apple Music integration
* YouTube integration
* Provider-specific capabilities
* Authorization flows
* Player abstraction
* Song/provider mapping
* Fallback behavior
* Token security
* Mobile limitations
* Provider policies
* How to add another provider

API_COMPLIANCE.md

Document:

* Official API documentation URLs
* Applicable terms and policies
* Review date
* Approved endpoints
* Authentication requirements
* Rate limits and quotas
* Permitted data usage
* Caching and retention requirements
* Attribution requirements
* Privacy requirements
* Known restrictions
* Outstanding questions
* Compliance test results

When provider terms change, flag the documentation for review before modifying the integration.

Do not automatically change the implementation in ways that could violate updated terms.

## 44. Implementation Workflow

Follow this sequence.

Phase 1: Inspect

* Inspect the repository.
* Review existing screens and mockups.
* Identify the current stack.
* Identify existing working functionality.
* Identify existing APIs and authentication.
* Identify tests.
* Identify missing screens.
* Identify provider-specific compliance requirements.

Phase 2: Plan

Create an implementation plan that:

* Reuses existing code.
* Lists the files and components that need changes.
* Identifies database changes.
* Identifies API changes.
* Identifies provider requirements.
* Identifies compliance uncertainties.
* Prioritizes core functionality.
* Avoids unnecessary infrastructure.

Phase 3: Design and implement the screens

Implement the required UI and responsive layouts.

Reuse components.

Include loading, empty, error, and success states.

Do not leave buttons or controls nonfunctional without clearly marking them as placeholders.

Phase 4: Implement core application behavior

Verify:

* Authentication
* Party membership
* Song recommendations
* Voting
* Results
* Statistics
* Calendar history
* Achievements
* Profiles
* Notifications

Phase 5: Implement music providers

Before implementing each provider:

1. Verify the official documentation and current terms.
2. Confirm that the intended feature is permitted.
3. Confirm the necessary authentication and account requirements.
4. Implement only approved APIs and SDKs.
5. Implement provider-specific error handling.
6. Document limitations.
7. Test using authorized methods.

If a feature is not permitted, stop and implement an approved alternative.

Phase 6: Test

Run unit tests, integration tests, and critical UI tests.

Test mobile responsiveness.

Test provider failure scenarios.

Test authorization and privacy.

Document actual results.

Phase 7: Document and deploy

Update all required documentation.

Verify deployment settings.

Confirm secrets are not exposed.

Confirm AWS budgets and alerts are configured.

Do not deploy an integration with unresolved critical security or compliance issues.

## 45. Rules for AI-Assisted Development

Follow these rules throughout development:

1. Inspect before modifying.
2. Preserve working functionality.
3. Do not invent API endpoints.
4. Do not invent provider capabilities.
5. Do not invent test results.
6. Do not invent successful API responses.
7. Do not use undocumented private endpoints.
8. Do not bypass API restrictions.
9. Do not expose secrets.
10. Do not add unnecessary infrastructure.
11. Do not silently introduce paid services.
12. Explain significant architecture decisions.
13. Explain tradeoffs and limitations.
14. Write clear documentation.
15. Use readable, maintainable code.
16. Validate security server-side.
17. Respect privacy and data-retention requirements.
18. Verify current official API terms before implementation.
19. Stop and report any unresolved legal or technical blocker.
20. Provide a clear summary of what was implemented and tested.

Do not state that a feature is complete merely because the UI has been generated. It must be connected to real functionality or clearly identified as a prototype.

## 46. Final Acceptance Criteria

The project is not complete until the following criteria are satisfied.

Product functionality

* Users can authenticate.
* Users can create or join private parties.
* Users can submit one song per round.
* Users can rate songs from 1–10.
* Duplicate voting is prevented.
* Round results are accurate.
* Personal statistics are calculated correctly.
* Group statistics are calculated correctly.
* Calendar history supports day and week views.
* Achievements are calculated and awarded correctly.
* Leaderboards use real data.
* Profiles and settings work.
* Notifications behave correctly.
* The application works on desktop and mobile.

Music functionality

* Apple Music uses an officially supported integration when permitted.
* YouTube uses an officially supported embedded-player integration when permitted.
* Provider capabilities are represented accurately.
* Authorization is handled securely.
* Users can disconnect services where applicable.
* Playback failures have graceful fallbacks.
* External links work where available.
* Users without connected accounts can still participate.
* Only one player is active at a time.
* No music is downloaded, extracted, or redistributed through unauthorized means.

Compliance

* Current official API documentation has been reviewed.
* Applicable terms and restrictions have been documented.
* Only permitted endpoints and SDKs are used.
* Rate limits and quotas are respected.
* Branding and attribution requirements are followed.
* Privacy and data-retention rules are followed.
* No authentication or subscription restrictions are bypassed.
* No undocumented API workaround is required.
* Unresolved compliance questions are documented.
* No feature is falsely described as compliant or production-ready.

Quality

* Tests have been run and their actual results documented.
* Error states are implemented.
* Security checks have been completed.
* Documentation is up to date.
* AWS costs are monitored.
* Existing functionality remains intact.

## 47. Final Product Vision

Drop a Bop should feel like a cohesive, polished, production-quality private music social application.

The primary experience should flow naturally:

```text
Recommend a Song
        ↓
Song Details
        ↓
Listen
        ↓
Vote
        ↓
Results
        ↓
Statistics
        ↓
History
        ↓
Achievements
        ↓
Profile

```

The music connection experience should flow naturally:

```text
Settings
    ↓
Music Services
    ↓
Authorize or Select a Provider
    ↓
Supported Playback
    ↓
Fallback When Unavailable

```

The history experience should flow naturally:

```text
Calendar
    ↓
Select Day or Week
    ↓
View Statistics
    ↓
Open Historical Round
    ↓
View Song Details
    ↓
Review Ratings

```

All features should feel like parts of the same application.

Final instruction: prioritize a reliable, secure, legally compliant, maintainable application over implementing every feature at any cost. If a third-party provider does not permit a requested capability, do not bypass its restrictions. Explain the limitation and implement the closest compliant alternative.
