# ADR-0011: Play sharer-linked YouTube videos in YouTube's embedded player

- **Status:** Accepted (Ethan's answers, 2026-10-09)
- **Date:** 2026-10-09
- **Spec sections:** SPEC_V2 §3, §4, §7, §13–§15, §28, §34–§36
- **Supersedes:** ADR-0007 decision 6 ("deferred: … in-app playback") **for YouTube only**. Everything else in
  ADR-0007 stands (iTunes search, Apple Music badge, pasted Spotify links, no YouTube Data API).

## Context

Spec v2 asks for in-app listening "when officially supported", with Apple Music and YouTube first and no Spotify
integration (§4). Ethan chose (2026-10-09): no paid Apple membership for now (Apple stays links only, D27), YouTube
"whichever is best", Spotify stays plain links.

Members can already paste a YouTube / YouTube Music link when sharing (D21); the server validates it and stores the
URL. The question is how to let people play those videos inside Drop a Bop within YouTube's rules.

## Options considered

1. **YouTube IFrame Player API on sharer-pasted links** — official, no API key, no Google Cloud project, no quota
   and no Google sign-in. Playback controls come from YouTube's own player. Cons: only songs with a pasted link play;
   the video might not be the official recording; the player must stay visible and large enough.
2. **YouTube Data API search + embed** — could find a video for every song. Cons: needs a Google Cloud project and
   key (a [HUMAN] registration), 100 searches/day (MUSIC_PROVIDERS.md), the 30-day refresh rule applies to every
   stored video id, and an automatic match could pick the wrong recording (spec §8 forbids unreliable merging).
3. **Do nothing (links only)** — compliant but misses the spec's in-app listening goal.

## Decision

Option 1. Songs whose sharer pasted a YouTube link get a **"▶ Play video"** control that opens **YouTube's embedded
player** (IFrame Player API, script `https://www.youtube.com/iframe_api`, loaded only on the first Play). It is
labelled **"YouTube video linked by the sharer"**. Rules we follow, from the official pages below:

- **Visible, big enough, nothing on top.** The player's viewport is at least **200 × 200 px** [RMF, PP] (we aim for
  16:9 at ≥ 480 × 270 where the screen allows, else full width with a 200 px minimum height). No overlays, frames
  or other elements in front of any part of the player, including its controls [RMF]. We don't modify or block any
  part of the player [DP].
- **No background or hidden playback** [DP]. The player is docked in the app shell so it keeps playing while you
  move between screens, but it is always on screen. Closing it stops the video. The mockups' tiny mini-bar is
  therefore **not used** for YouTube (it would be below 200 px tall).
- **No autoplay on page load.** Playback starts only from a user's tap, and never from a mouseover or touch on the
  player [RMF]. One player at a time (starting another song stops the last), which also satisfies "no more than one
  autoplaying player per page" [RMF].
- **Identify the app honestly.** The site already sends `Referrer-Policy: strict-origin-when-cross-origin`, so the
  embed receives our origin as the Referer (missing Referer → error 153) [IFA, RMF]; we also pass the `origin`
  player parameter [PP]. Nothing masks or fakes our identity [DP].
- **Errors fall back to links.** Errors 100 (not found), 101/150 (owner blocks embedding), 2, 5 and 153 show "We
  couldn't play this here" with the song's existing links [IFA].
- **Terms of use.** API Clients must link YouTube's Terms of Service and "state in their own terms of use that, by
  using those API Clients, users are agreeing to be bound by the YouTube Terms of Service" [DP §III.A.1]. Drop a Bop
  had no terms, so a short terms-of-use section is added to the privacy page and covered by the same agreement.
- **Privacy policy + agreement** [DP §III.A.2]. The Developer Policies require a privacy policy that says we use YouTube API
  Services, links YouTube's Terms of Service and Google's Privacy Policy, explains cookies/tracking by third-party
  content, and says how to contact us; users must agree to it before using the features [DP]. Ethan chose: a
  **privacy page** reachable without signing in, an **"I agree" checkbox at sign-up**, and a **one-time prompt for
  existing members**; contact **droppa.bop@gmail.com** (a dedicated address, meant to be public). See
  `docs/PRIVACY.md`.
- **30-day caution.** The Developer Policies say non-authorized API data (video ids included) may be stored at most
  30 days, then deleted or refreshed [DP]. Our video ids are pasted by members, not returned by a YouTube API, and
  the terms don't say whether that counts. Ethan chose the cautious reading: **the in-app player is offered only for
  songs shared in the last 30 days**; older songs keep the plain link (the member's own content), which needs no
  API. This limits *playing*; it doesn't settle *storing*: we keep the pasted URL (which contains the id) on the
  basis that it's the member's own content, not YouTube API data. That's the same unresolved point, listed as open
  question 1 in `docs/API_COMPLIANCE.md`.
- **Branding.** We don't use "YouTube" in the app's name or imply endorsement; any YouTube logo we show links to the
  YouTube content [BG]. The player's own YouTube branding is never hidden.
- **Opt-out.** A per-user "Play videos in Drop a Bop" setting (default on, once agreed) lets people use links only.

## Cost

No AWS change. The YouTube embed and links are free and need no key or registration. CSP gains the YouTube
script/frame hosts in P13.3 (a config change, checked with the `aws-change` skill for the CloudFront policy copy).

## Consequences

- Only songs with a pasted YouTube link (and shared in the last 30 days) can play in the app. That's stated in
  Settings → Music and the help page; the app never promises every song will play (spec §4).
- YouTube sets cookies / collects playback data once a video loads; the privacy page says so. Nothing loads from
  YouTube until someone presses Play.
- If YouTube's terms change, `docs/API_COMPLIANCE.md` is flagged for review before the integration changes (§43).
- Adding Apple MusicKit later (P13.L) plugs into the same player layer.

## References (all checked 2026-10-09)

- [DP] YouTube API Services Developer Policies, last updated 2026-09-14 —
  https://developers.google.com/youtube/terms/developer-policies
- [RMF] Required Minimum Functionality, last updated 2026-09-14 —
  https://developers.google.com/youtube/terms/required-minimum-functionality
- [TOS] YouTube API Services Terms of Service, last updated 2026-09-14 —
  https://developers.google.com/youtube/terms/api-services-terms-of-service
- [IFA] YouTube IFrame Player API reference, last updated 2026-09-29 —
  https://developers.google.com/youtube/iframe_api_reference
- [PP] Embedded players and player parameters, last updated 2026-09-16 —
  https://developers.google.com/youtube/player_parameters
- [BG] YouTube Branding Guidelines, last updated 2025-08-20 —
  https://developers.google.com/youtube/terms/branding-guidelines
