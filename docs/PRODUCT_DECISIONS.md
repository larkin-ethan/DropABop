# Product Decisions

The spec (`docs/SPEC.md`) leaves some product behaviour open. These are the **defaults** the
build uses. Ethan can change any of them — edit this file, and the AI updates code/tests to match.
Each item notes the spec section it refines.

## The week (§13, §14, §15) — confirmed by Ethan, 2026-10-01

The spec's single-song "round" is replaced by a **weekly round with daily songs**. ADR-0004 records
this deliberate change to spec §13–§15.

- **D1 — One song per member per day, Monday–Friday.** Each member may submit **one song per day** on
  Mon, Tue, Wed, Thu, and Fri (up to 5 songs per member per week). Days are optional: skipping a day is fine.
  - A "day" runs midnight to midnight in the **party's timezone** (IANA name; defaults to the host's browser
    timezone when the party is created; host can change it).
  - No backfilling: a missed day can't be filled in later. No submissions on Saturday or Sunday.
  - A second submission on the same day returns: *"You've already shared your song for today."*
  - A submitted song can't be edited or swapped (spec §14). Pick carefully.
- **D2 — Weekly round.** A round is one calendar week, **Monday 00:00 → Sunday 23:59:59** (party timezone).
  It has two states:
  - `OPEN` (Mon–Sun): songs can be submitted on weekdays, and **any song from this week can be rated at any
    time**, including songs submitted earlier in the week. A song can be rated as soon as it's submitted.
    Saturday and Sunday are catch-up days for listening and rating.
  - `CLOSED` (after Sunday 23:59:59): all ratings are **locked forever** and the week's results are revealed.
  - There's no early close: the week always ends on time, so everyone gets the full weekend to catch up.
  - If the week ends with **fewer than 2 songs**, it closes as "Not enough songs this week" (no results,
    excluded from stats).
  - The host can **pause** the party (no new weeks start until resumed), e.g. for holidays. Pausing during an
    open week lets that week finish normally.
- **D3 — Lazy weeks.** No scheduler. A week's id comes from the party and the Monday date
  (e.g. `partyId#2026-10-05`). The first request in a new week creates that week's round with a conditional
  put (exactly one wins if two people arrive at once). Whether a week is `OPEN` or `CLOSED` is always computed
  from the current time, and the first request after it ends records the close. See ADR-0003.
- **D4 — Weeks never overlap.** Exactly one round per party per week.
- **D5 — Late joiners.** Someone who joins mid-week may submit songs for the remaining weekdays and may rate
  every song from the whole week.

## Voting (§15, §16)

- **D6 — No self-rating.** You can't rate your own songs; they're excluded from your votes and from
  your generosity stats.
- **D7 — Ratings are integers 1–10.** One rating per member per song.
- **D8 — Changing a rating** is allowed any time while the week is `OPEN`. Once the week closes, ratings are
  immutable. This is enforced server-side: the rating write is conditional on the week not having ended,
  checked against the server clock, not the client.
- **D9 — Hidden until the week ends.** While the week is open, nobody sees other people's ratings or
  averages (prevents bias). You see only your own ratings and which songs you haven't rated yet.
- **D10 — Recommender anonymity** (confirmed by Ethan, 2026-10-01). Default: while the week is open, songs are
  shown **without** who recommended them; revealed with the results. Party setting
  `revealRecommenderDuringVoting` (default `false`).
- **D11 — Individual ratings visibility.** Default: results show averages, counts, and an anonymous
  distribution, plus *your own* rating. Party setting `showWhoRatedWhat` (default `false`) reveals each
  member's rating per song.
- Rating every song isn't required. With 20 members a week can have up to 100 songs, so the UI groups songs
  by day and shows progress ("12 of 31 rated").

## Results (§16)

- **D12 — Weekly results** appear when the week closes: every song from the week ranked by average rating,
  highest first, plus a per-day view (Monday's songs, Tuesday's songs, …) and a "Song of the Day" winner for
  each day (that day's highest average). Ties share a rank (1, 1, 3). Songs with 0 ratings rank last and show
  "No ratings".
- Averages shown to 1 decimal place.

## Parties & invites (§8, §26)

- **D13 — Host.** The creator is the host. Host can: change the party timezone, pause/resume the party, edit settings,
  regenerate the invite code, remove members. Host transfer is out of scope for v1.
- **D14 — Max size** 20 (configurable 2–50 by host; server-enforced).
- **D15 — Multiple parties.** A user may belong to several parties; the UI remembers the last one opened.
- **D16 — Invite code** format `SONG-XXXX` using an unambiguous alphabet (no 0/O/1/I/L). One active code per
  party; host can regenerate (old code stops working). Join link = `https://<app>/join/SONG-XXXX`.
- **D17 — Leaving** a party is allowed; your past votes and recommendations stay in history and stats.

## Profiles (§19)

- **D18 — Avatars** in v1 are generated (initials + color from user id). Image upload is deferred
  (avoids S3 upload infrastructure and moderation).
- **D19 — Personal data stored:** email (in Cognito only), display name, avatar color, preferred music app. Nothing else.

## Music (§10, §11, §12)

- **D20 — v1 provider plan: provider-neutral first** (Ethan, 2026-10-01: the group uses a mix of services).
  The final choice is made in P6.1 after checking current official docs. Target:
  - One song search that needs **no user login and no paid developer account**.
  - Every song shows official "Open in Spotify / Apple Music / YouTube" links wherever they can be resolved
    legitimately, so each person listens in whatever app they already use.
  - Per-user account connections and in-app playback come later, only where officially supported and free to build.
- **D21 — Fallback.** If search for a provider is unavailable, users can paste a song link from a
  supported provider; the backend validates and resolves it.
- **D22 — Preferred music app.** Each user can pick a preferred app (e.g. Spotify, Apple Music, YouTube) in their
  profile. That app's "Open in …" link is shown first on every song. This replaces the mockup's "Connect" buttons
  for v1 (see `docs/design/README.md`).
- **D23 — Sign-in methods.** v1 uses email + password via Cognito only. "Continue with Google" from the mockup is
  deferred (needs a Google OAuth app and Cognito federation setup).

## Statistics definitions (§17, §18)

All stats are labeled "calculated" in the UI and show their sample size ("Based on N …").
If the minimum sample isn't met, show "Not enough data yet" — never a number.

| Stat | Definition | Minimum sample |
|---|---|---|
| Song average | Mean of all ratings the song received | 1 rating |
| Average rating given | Mean of all ratings a user gave | 5 ratings |
| Average score received (= Average Recommendation Score) | Mean of the song averages of songs the user recommended | 3 recommendations |
| Generosity | User's average rating given − party's average rating given (positive = generous) | 10 ratings |
| Most generous voter / Toughest critic | Highest / lowest Generosity in the party | 10 ratings each |
| Highest-rated song / Crowd favorite | Highest song average (crowd favorite also requires ≥ 75% of eligible members to have rated it) | 3 ratings |
| Most divisive | Highest standard deviation of ratings | 4 ratings |
| Most controversial | Largest share of "extreme" ratings with both sides present: min(share ≤ 3, share ≥ 8) × 2 | 4 ratings |
| Everyone agreed | Lowest standard deviation of ratings | 4 ratings |
| Dark horse | Song whose average beats its recommender's prior Average score received by the most | recommender has ≥ 3 prior songs |
| Musical twin | Other member with the smallest mean absolute difference in ratings on songs you both rated | 5 shared songs |
| Most consistent | Lowest standard deviation of a user's song averages | 3 recommendations |
| Most surprising | Recommender with the most dark-horse wins | 1 dark-horse win |
| Most popular | Most ratings ≥ 8 received across all recommendations | 3 recommendations |
| Favorite artists | Artists the user rated highest on average | 2 songs by the artist |

Standard deviation = population standard deviation. Genres are shown only if a provider supplies them.

## Out of scope for v1

Real-time updates, push/email notifications, email invites, image uploads, comments/chat, public
profiles, host transfer, cross-party stats, native mobile apps, custom domain (Ethan, 2026-10-01: use the
free CloudFront URL for now; a domain can be added later without rebuilding).
