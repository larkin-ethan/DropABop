# Product Decisions

The spec (`docs/SPEC.md`) leaves some product behaviour open. These are the **defaults** the
build uses. Ethan can change any of them — edit this file, and the AI updates code/tests to match.
Each item notes the spec section it refines.

## The week (§13, §14, §15) — confirmed by Ethan, 2026-10-01

The spec's single-song "round" is replaced by a **weekly round with daily songs**. ADR-0004 records
this deliberate change to spec §13–§15.

- **D1 — One song per member per sharing day (default Monday–Friday).** Each member may submit **one song per
  sharing day**. New parties share Mon, Tue, Wed, Thu, and Fri; **the host can pick any days** (at least one) in
  party settings (Ethan, 2026-10-04). Days are optional: skipping a day is fine.
  - A "day" runs midnight to midnight in the **party's timezone** (IANA name; defaults to the host's browser
    timezone when the party is created; host can change it). A timezone change **takes effect from the next
    week**; the current week keeps the timezone it started with, so days and the lock time never shift mid-week.
  - No backfilling: a missed day can't be filled in later. No submissions on days that aren't sharing days.
  - A change to the sharing days, like a timezone change, **takes effect from the next week** (Ethan, 2026-10-04):
    each week stores the days it started with.
  - A second submission on the same day returns: *"You've already shared your song for today."*
  - A submitted song can't be edited or swapped (spec §14). Pick carefully.
- **D2 — Weekly round.** A round starts **Monday 00:00** (party timezone) and runs until **ratings lock**: by
  default the end of **Sunday 23:59**, but **the host can choose the day and minute** (Ethan, 2026-10-04), as long
  as it's **no earlier than 11:59 pm on the last sharing day** (Ethan, 2026-10-04), so that whole day is open for
  sharing. The new lock time applies from the next week. It has two states:
  - `OPEN` (Monday 00:00 → lock): songs can be submitted on sharing days, and **any song from this week can be
    rated at any time**, including songs submitted earlier in the week. Non-sharing days before the lock are
    catch-up days for listening and rating.
  - `CLOSED` (after the lock): all ratings are **locked forever** and the week's results are revealed. If the
    lock is before Sunday night, nothing runs until the next Monday (the API reports "between weeks").
  - There's no early close: the week always ends at the lock time it started with.
  - If the week ends with **fewer than 2 songs**, it closes as "Not enough songs this week" (no results,
    excluded from stats).
  - The host can **pause** the party (no new weeks start until resumed), e.g. for holidays. Pausing during an
    open week lets that week finish normally.
- **D3 — Lazy weeks.** No scheduler. A week's id comes from the party and the Monday date
  (e.g. `partyId.2026-10-05`). The first request in a new week creates that week's round with a conditional
  put (exactly one wins if two people arrive at once). Whether a week is `OPEN` or `CLOSED` is always computed
  from the current time, and the first request after it ends records the close. See ADR-0003.
- **D4 — Weeks never overlap.** Exactly one round per party per week.
- **D5 — Late joiners.** Someone who joins mid-week may submit songs on the week's remaining sharing days and may rate
  every song from the whole week.

## Voting (§15, §16)

- **D6 — No self-rating.** You can't rate your own songs; they're excluded from your votes and from
  your generosity stats.
- **D7 — Ratings are integers 1–10.** One rating per member per song.
- **D8 — Changing a rating** is allowed any time while the week is `OPEN`. Once the week closes, ratings are
  immutable. This is enforced server-side with the server clock (never the client's): ratings are rejected once
  the week has ended, and any rating saved after the end is ignored in results and stats.
- **D9 — Hidden until the week ends.** While the week is open, nobody sees other people's ratings or
  averages (prevents bias). You see only your own ratings and which songs you haven't rated yet.
- **D10 — Recommender anonymity** (confirmed by Ethan, 2026-10-01). Default: while the week is open, songs are
  shown **without** who recommended them; revealed with the results. Party setting
  `revealRecommenderDuringVoting` (default `false`). While it's off, the app also doesn't show *who* has shared today
  (only how many), because that list next to the songs would give away whose song is whose. Each week records the
  setting it started with, so a change applies from the next week and never un-hides songs already shared
  (pre-launch security review, 2026-10-04).
- **D11 — Individual ratings visibility.** Default: results show averages, counts, and an anonymous
  distribution, plus *your own* rating. Party setting `showWhoRatedWhat` (default `false`) reveals each
  member's rating per song. Also recorded per week: turning it on shows names only for weeks that start afterwards, so
  ratings given anonymously stay anonymous (2026-10-04).
- Rating every song isn't required. With 20 members a week can have up to 100 songs, so the UI groups songs
  by day and shows progress ("12 of 31 rated").

## Results (§16)

- **D12 — Weekly results** appear when the week closes: every song from the week ranked by average rating,
  highest first, plus a per-day view (Monday's songs, Tuesday's songs, …) and a "Bop of the Day" winner for
  each day (that day's highest average). Ties share a rank (1, 1, 3). Songs with 0 ratings rank last and show
  "No ratings".
- Averages shown to 1 decimal place, and ranking uses that displayed value, so two songs that both show 8.3
  share a rank instead of appearing as #1 and #2. Tied songs are listed earlier-day first.

## Parties & invites (§8, §26)

- **D13 — Host.** The creator is the host. Host can: change the party timezone, pause/resume the party, edit settings,
  regenerate the invite code, remove members. Host transfer is out of scope for v1.
- **D14 — Max size** 20 (configurable 2–50 by host; server-enforced).
- **D15 — Multiple parties.** A user may belong to several parties (at most **5**, confirmed by Ethan 2026-10-01, as basic abuse protection, §32;
  a soft limit, so simultaneous requests could briefly exceed it); the UI remembers the last one opened.
- **D16 — Invite code** format `SONG-XXXX` using an unambiguous alphabet (no 0/O/1/I/L). One active code per
  party; host can regenerate (old code stops working). Join link = `https://<app>/join/SONG-XXXX`.
- **D17 — Leaving** a party is allowed; your past votes and recommendations stay in history and stats. The host
  can't leave or be removed (no host transfer in v1). The member limit can't be set below the current member count.
  After the host removes someone, the app asks "Make a new invite link?" so the removed person can't rejoin with the
  old one (Ethan, 2026-10-01; built in P8.10).

## Profiles (§19)

- **D18 — Avatars:** initials on a colour by default. **Updated 2026-10-04 (Ethan): people may add a profile picture.**
  The browser crops and shrinks the photo to a 128×128 JPEG (a few KB, so the original photo and its location data
  never leave the device); it's stored with the profile as a small data URL and shown to party members instead of the
  initials. JPEG/WebP only (no SVG), at most 9,000 characters; it can be removed any time. No new AWS service.
- **D19 — Personal data stored:** email (in Cognito only), display name, avatar color, optional profile picture (D18),
  preferred music app, plus what you do in a party (songs, ratings, comments, D25). Nothing else. *Added by D27/D29
  (Phase 13):* the "Play videos" setting, notification
  switches and seen-times, and when you agreed to the privacy policy (timestamp + version).

## Music (§10, §11, §12)

- **D20 — v1 provider plan: provider-neutral first** (Ethan, 2026-10-01: the group uses a mix of services). **Decided in
  ADR-0007 (approved 2026-10-01):** iTunes Search API for search and song details, a "Listen on Apple Music" badge on
  every song, and optional Spotify/YouTube links pasted by the person sharing.
  The final choice is made in P6.1 after checking current official docs. Target:
  - One song search that needs **no user login and no paid developer account**.
  - Every song shows official "Open in Spotify / Apple Music / YouTube" links wherever they can be resolved
    legitimately, so each person listens in whatever app they already use.
  - Per-user account connections and in-app playback come later, only where officially supported and free to build.
- **D21 — Fallback.** If search for a provider is unavailable, users can paste a song link from a
  supported provider; the backend validates and resolves it.
  Updated 2026-10-04: any of Apple Music, Spotify, or YouTube Music links can be pasted. Apple Music links resolve
  directly; for the others the person picks the same song in search and their link is attached (no calls to
  Spotify/YouTube; see MUSIC_PROVIDERS.md).
- **D22 — Preferred music app.** Each user can pick a preferred app (e.g. Spotify, Apple Music, YouTube) in their
  profile. That app's "Open in …" link is shown first on every song. This replaces the mockup's "Connect" buttons
  for v1 (see `docs/design/README.md`).
  Listen links offer Apple Music, Spotify, and **YouTube Music** (not plain YouTube; Ethan, 2026-10-04); people who
  chose YouTube get YouTube Music first.
- **D23 — Sign-in methods.** v1 uses email + password via Cognito only. "Continue with Google" from the mockup is
  deferred (needs a Google OAuth app and Cognito federation setup).
- **D24 — Name (2026-10-03).** The app is called **Drop a Bop**; `dropabop` in package, stack, and AWS resource
  names. It replaces "Song of the Day" / `sotd` everywhere. Each day's winner in the weekly results (D12) is the
  **"Bop of the Day"** (Ethan, 2026-10-03).

## Comments (Ethan, 2026-10-07)

- **D25 — Comments on songs.** Any party member can comment on any song in the current week (their own too): one
  line, up to 280 characters, at most 50 per person per week. **Names are always shown** (Ethan chose this knowing a
  sharer commenting on their own song gives away that it's theirs). Comments can be added **only while the week is
  open**; they close when ratings lock and stay readable afterwards. You can delete your own comment while the week
  is open; the host can delete any comment at any time (moderation). In the app every song's comments start
  **collapsed** ("💬 Comments (3)"), on the Rate screen and (read-only) in the results. Comments don't affect ratings,
  results or stats.

## Spec v2 (Ethan, 2026-10-09; `docs/SPEC_V2.md`, roadmap Phase 13)

Spec v2 asks to keep working functionality (§1), so it is fitted onto the weekly app rather than replacing it.
Section-by-section mapping: `docs/SPEC_V2_RECONCILIATION.md`. Thresholds below are defaults Ethan can change.

- **D26 — Spec v2 words mapped onto the weekly model.** A spec **"round" is the week** (D2) and a spec **"day" is one
  sharing day** inside it. "One recommendation per round" stays one song per sharing day (D1). Starting and ending a
  round stays lazy with the host's days and lock time (D3, P8.13): no Start/End Round buttons. Stats, achievements,
  leaderboards and history ratings use **closed weeks only**; open weeks show counts only (D9). The spec's separate
  "Weekly Summary" screen is the **"Your week"** section of the history Week view (one screen, not two).
- **D27 — Provider plan v2** (Ethan's answers, 2026-10-09; compliance to be confirmed in P13.2 / ADR-0011).
  - **Apple Music:** stays links only (iTunes Search + "Listen on Apple Music" badge, ADR-0007). MusicKit needs a paid
    Apple Developer membership, so it is **deferred** (roadmap P13.L). The player layer keeps a slot for it.
  - **YouTube (updated 2026-10-09, ADR-0012):** when a song is chosen, the server makes **one YouTube search** for
    it and the share dialog suggests the top result, which the sharer can keep, change or remove. Song search stays
    on iTunes (YouTube allows only 100 searches a day). Every YouTube video id is deleted after 29 days.
    Original plan: the **sharer pastes a YouTube / YouTube Music link** (already supported, D21) and the app plays it in
    **YouTube's official embedded player** (IFrame Player API). No Google API key, no YouTube Data API search, no
    quota, no Google account connection. Because a pasted video isn't verified as the official recording, it's labelled
    **"YouTube video linked by the sharer"** (spec §4).
  - **Spotify:** stays a plain pasted link. Spec §4 says not to integrate Spotify in the first release; a link the
    sharer pastes is not an integration (no Spotify API calls, no connect, no playback).
  - Playback is never required: rating, sharing, results and stats work without it (spec §14). A per-user
    **"Play videos in Drop a Bop"** setting (default on) turns the embed off for people who'd rather open links.
  - The preferred music app (D22) moves from Profile to **Settings → Music** (P13.6).
  - **Compliance answers (Ethan, 2026-10-09, ADR-0011):** a privacy page anyone can open, an "I agree" checkbox at
    sign-up and a one-time prompt for existing members (YouTube requires agreement before use); privacy contact
    **droppa.bop@gmail.com**; the in-app player is offered only for songs **shared in the last 30 days** (cautious
    reading of YouTube's 30-day rule), older songs keep their plain link. The repo stays public: the contact address
    is meant to be public and is on the site anyway.
- **D28 — Achievements.** Computed on the server from **closed weeks only**, per party, never stored as awards
  (so no duplicates and nothing the browser can fake). Each one shows progress (`current / target`) and is
  "unlocked on" the lock date of the first closed week that met it. Party members can see each other's
  achievements. No daily streaks (spec §17: avoid encouraging unhealthy use); consistency counts weeks.
  "Took part in a week" = shared at least one song or rated at least one song that week.

  | Group | Achievement | Unlocks when |
  |---|---|---|
  | Participation | First Drop | You shared your first song |
  | | First Rating | You rated your first song |
  | | 10 / 50 / 100 Weeks | You took part in 10 / 50 / 100 weeks |
  | Discovery | 10 Artists / 25 Artists | Your shared songs cover 10 / 25 different artists (artist name, case-insensitive) |
  | | Genre Explorer / 10 Genres | Your shared songs cover 5 / 10 different genres (only songs with a genre count, P13.7) |
  | Rating | First 10 / First 1 | You gave a 10 / a 1 |
  | | Generous Voter / Tough Critic | Your generosity is ≥ +1.0 / ≤ −1.0, with at least 10 ratings |
  | | Balanced Judge | Your average given is within 0.3 of the party's, with at least 20 ratings |
  | Song success | Top Bop | Your song was #1 in a week's results (ties count) |
  | | Crowd Favorite | Your song was a week's crowd favorite (stats definition, applied to that week) |
  | | Perfect Score | A song of yours averaged 10.0 with at least 3 ratings |
  | | Back-to-Back | You had the #1 song in two weeks in a row (weeks that had results) |
  | Social | Musical Twin / Most Compatible | Someone's ratings differ from yours by ≤ 1.0 on ≥ 5 shared songs / ≤ 0.5 on ≥ 10 (the twin isn't named) |
  | | Most Divisive | Your song was a week's most divisive song (≥ 4 ratings) |
  | | Group Favorite | Everyone who rated that week (except you) rated your song, average ≥ 8.0, ≥ 3 ratings |
  | Consistency | Weekly Regular | You shared on every sharing day of a week |
  | | Full House | You rated every song of a week that you didn't share (at least 5) |
  | | Monthly Regular / Season Regular | You took part in 4 / 12 weeks in a row |

  The spec's "7-Day Streak" and "30-Day Streak" become Full House and Season Regular (week-based). An unlock shows a
  small toast on Home or Results only (never mid-rating), with reduced motion respected.
- **D29 — Notifications: in-app only, worked out when you open the app** (spec §22 allows this). No push, no email,
  no new AWS service, nothing scheduled. Types, for your current party: songs waiting for you to rate this week (a
  count) · you haven't shared today (sharing days only) · weekly results are ready · achievement unlocked · your rank
  last week · new comments on your songs (a count). A bell shows the unread count; "read" means newer than the time
  you last opened the list. Each type can be switched off in Settings → Notifications. The app checks when the
  window regains focus and at most every 5 minutes while it's open. No streak notifications (D28).
- **D30 — Leaderboard periods and provisional rankings.** Periods: **This week** = the most recent closed week;
  **This month** = closed weeks whose lock falls in the current calendar month (party timezone); **All time**
  (the spec's "Overall" is the same as All time). Boards: Highest Average Received, Highest Average Given, Most Bops,
  Most Ratings, Crowd Favorites, Toughest Critic, Most Generous, Most Consistent, plus the existing ones. The
  minimum samples from the stats table apply in every period. People below the minimum are listed separately under
  **"Provisional"** with the rule shown ("needs 3 rated songs"), never ranked above someone who qualifies, so one
  10 can't beat 100 ratings averaging 9.5.
- **D31 — History metrics** (calendar, Day view, Week view; definitions go in `STATISTICS.md` in P13.8). A day is
  midnight to midnight in the week's timezone. Ratings count toward the day **the song was shared**. Only closed
  weeks show ratings; an open week's days show songs shared and "Results after ratings lock".
  - **Day:** songs shared, ratings on them, your average given, your average received, the Bop of the Day (D12),
    the lowest-rated song (≥ 3 ratings), rating distribution, group average (mean of all ratings on that day's
    songs), favorite artists only with ≥ 2 songs by an artist, your song's rank in its week.
  - **Week:** songs, ratings, average rating, best song, top artists (most songs shared, ties shared, top 3), most
    agreeable day (the day whose songs have the lowest average spread; songs with ≥ 4 ratings, ≥ 2 such songs), most
    divisive song (stats definition), and **"Your week"**: songs you rated, your averages given and received, your top
    song, achievements unlocked that week, and your rank by average received that week (needs 1 rated song; shown
    as "#3 of 12").
  - **Calendar marks:** a dot on days the party shared songs (a filled dot if you shared), ★ on days one of your
    songs got your best-ever song average, and a badge on lock days where you unlocked an achievement.
- **D32 — Navigation** (spec §27, §40). Desktop sidebar: Home, Today's Drop, History, Stats, Leaderboard,
  Achievements, Search, then Party, Members, Settings, then Profile. Mobile bottom bar: **Home · Drop · History ·
  Stats · Profile**. **Drop** is a hub with three tabs (Share · Rate · Results) that reuse the existing screens.
  The notifications bell and settings stay in the mobile header; Leaderboard and Achievements are reached from
  Stats and Profile. This replaces the layout notes in `docs/design/README.md`.
- **D33 — Search is party-scoped.** Search covers only your current party: its shared songs and artists, its
  members, and its weeks. Nothing outside the party and no external music search (finding a *new* song stays in
  Share's iTunes search). While a week is open, its songs appear without who shared them (D10). The party's songs
  are read with one key query (`PARTY#id`, songs only), capped and paginated. That's a documented exception to
  "no fetching everything to filter": DynamoDB has no text search, and a party adds about 5,000 songs a year at most.

## Statistics definitions (§17, §18)

All stats are labeled "calculated" in the UI and show their sample size ("Based on N …").
Stats use **closed weeks only** (open weeks' ratings are hidden, D9; "not enough songs" weeks are excluded).
Ties are shown as joint winners.
If the minimum sample isn't met, show "Not enough data yet" — never a number.

| Stat | Definition | Minimum sample |
|---|---|---|
| Song average | Mean of all ratings the song received | 1 rating |
| Average rating given | Mean of all ratings a user gave | 5 ratings |
| Average score received (= Average Recommendation Score) | Mean of the song averages of songs the user recommended | 3 rated songs |
| Generosity | User's average rating given − party's average rating given (positive = generous) | 10 ratings |
| Most generous voter / Toughest critic | Highest / lowest Generosity in the party | 10 ratings each |
| Highest-rated song / Crowd favorite | Highest song average (crowd favorite also requires ratings from ≥ 75% of that week's active raters — people who rated at least one song that week — not counting the recommender) | 3 ratings |
| Most divisive | Highest standard deviation of ratings | 4 ratings |
| Most controversial | Largest share of "extreme" ratings with both sides present: min(share ≤ 3, share ≥ 8) × 2 | 4 ratings |
| Everyone agreed | Lowest standard deviation of ratings | 4 ratings |
| Dark horse | Song whose average beats its recommender's average from earlier songs by the most (positive only) | song has 3 ratings; recommender has ≥ 3 earlier rated songs |
| Musical twin | Other member with the smallest mean absolute difference in ratings on songs you both rated | 5 shared songs |
| Most consistent | Lowest standard deviation of a user's song averages | 3 rated songs |
| Most surprising | Recommender with the most songs that beat their own earlier average by ≥ 1.0 point | 1 such song |
| Most popular | Most ratings ≥ 8 received across all recommendations | 3 songs shared |
| Favorite artists | Artists the user rated highest on average | 2 songs by the artist |

Standard deviation = population standard deviation. Genres are shown only if a provider supplies them.

## Out of scope for v1

Real-time updates, push/email notifications (in-app ones are in, D29), email invites, image uploads, chat (comments on songs are in, D25), public
profiles, host transfer, cross-party stats, native mobile apps, custom domain (Ethan, 2026-10-01: use the
free CloudFront URL for now; a domain can be added later without rebuilding).
