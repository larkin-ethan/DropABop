# API compliance

The spec v2 §3.4 / §43 checklist for every third-party service Drop a Bop uses. This records what the official
documents say and how we follow them. It is **not** a legal certification (spec §3.4). If a provider's terms
change, flag the section here for review **before** changing the integration (§43).

**Last full review: 2026-10-09** (P13.2). Decisions: ADR-0007 (iTunes, links), ADR-0011 (YouTube embed), D27.

## Summary

| Provider / API | Used for | Account or key | Status |
|---|---|---|---|
| iTunes Search API | Song search and details, Apple Music link | None | Live since P6 |
| YouTube IFrame Player API | Playing videos that a sharer linked | None | Building in Phase 13 |
| Spotify | A link the sharer pastes; no API calls | None | Live (links only) |
| Apple MusicKit on the Web / Apple Music API | — | Paid Apple Developer membership | **Deferred** (P13.L) |
| YouTube Data API | — | Google Cloud key | **Not used** (D27) |

## iTunes Search API

| Item | Detail |
|---|---|
| Docs / terms | https://performance-partners.apple.com/search-api (re-checked 2026-10-09; page shows no date) |
| Approved use | Searching the catalog to pick a song; showing its details next to an Apple Music badge |
| Endpoints | `GET https://itunes.apple.com/search` and `/lookup`, called from Lambda only |
| Authentication / consent | None |
| Subscription | None |
| Playback | None. We don't play iTunes 30-second previews (the terms would require "provided courtesy of iTunes" and stream-only) |
| Metadata and artwork | Promotional use only, next to a store badge that links to the item. Every song shows "Listen on Apple Music". We store the artwork **URL**, never the image |
| Branding | Apple Music badge per Apple's identity guidelines (MUSIC_PROVIDERS.md) |
| Rate limit | "approximately 20 calls per minute (subject to change)". A 10-minute in-memory cache per Lambda instance cuts repeat calls; the route throttle (P9.1) is looser than Apple's limit, so the real safeguard is that a rate-limit reply becomes a friendly "busy, try again" error, never a retry loop |
| Caching / retention | "Large websites should set up caching logic". The song snapshot stays with the song in the party's history (ADR-0007) |
| Privacy | Our server sends only the search text. Album art is loaded by the browser from Apple's servers, which see the viewer's IP address (disclosed in PRIVACY.md) |
| Revocation / disconnection | Not applicable (no accounts) |
| Known limitations | US catalog; no ISRC; no genre on old songs (genre stored from P13.7) |
| Compliance tests | Provider unit tests use recorded fixtures, never live calls (`providers/itunes.test.ts`) |

## YouTube IFrame Player API

Full decision and sources: ADR-0011.

| Item | Detail |
|---|---|
| Docs / terms (all checked 2026-10-09) | Developer Policies (updated 2026-09-14), Required Minimum Functionality (2026-09-14), API Services Terms of Service (2026-09-14), IFrame Player API reference (2026-09-29), Player parameters (2026-09-16), Branding Guidelines (2025-08-20) — URLs in ADR-0011 |
| Approved use | Playing, inside the app, a video a member linked when sharing a song |
| Endpoints / SDKs | `https://www.youtube.com/iframe_api` (script) and the player iframe it creates. Nothing else |
| Authentication / consent | No API key, no Google sign-in. Users agree to our privacy policy and terms (which bind them to the YouTube Terms of Service, §III.A.1) before using it: sign-up checkbox; one-time prompt for existing members |
| Subscription | None |
| Playback rules | Player ≥ 200 × 200 px, visible, nothing in front of it, never hidden or in the background, no autoplay on load, no mouseover/touch-triggered actions, one player at a time, player not modified |
| Metadata and thumbnails | None fetched from YouTube. The card shows the iTunes artwork; the player shows YouTube's own |
| Branding | YouTube's branding inside the player is never hidden. "YouTube" isn't part of our app name; no implied endorsement; any YouTube logo links to the YouTube content |
| Rate limits / quotas | None for the embedded player. The script loads once, on the first Play |
| Caching / retention | We keep the URL the member pasted, as the member's own content. **In-app play is offered only for songs shared in the last 30 days** (cautious reading of the 30-day rule). Whether keeping the URL is fine is open question 1 |
| Identification | Our origin is sent as the Referer (`strict-origin-when-cross-origin`) and as the `origin` player parameter |
| Privacy | YouTube may set cookies and collect playback data once a video loads; disclosed in PRIVACY.md with links to YouTube's Terms and Google's Privacy Policy |
| Revocation / disconnection | No account to disconnect. The "Play videos in Drop a Bop" setting turns the player off |
| Errors | 100, 101, 150, 2, 5, 153 → "We couldn't play this here" + the song's links |
| Known limitations | Only songs with a pasted YouTube link; the video may not be the official recording (labelled "YouTube video linked by the sharer"); browsers may block unmuted autoplay, so play always starts from a tap |
| Compliance tests | Planned in P13.3 / P13.4: mocked `window.YT` unit tests (lazy load, one at a time, error → fallback, cleanup, size); one manual check with a real and an embed-disabled video. Results recorded here when run |

## Spotify (links only)

| Item | Detail |
|---|---|
| What we do | Store and show an `open.spotify.com/track/…` link that the sharer pasted; a "Search on Spotify" link otherwise |
| API calls | **None** (no Web API, no oEmbed, no Web Playback SDK) — spec v2 §4: no Spotify integration in the first release |
| Terms | Not an API client, so the Spotify Developer Terms don't apply to plain links (reasoning in MUSIC_PROVIDERS.md, checked 2026-10-01) |

## Apple MusicKit on the Web / Apple Music API (deferred)

Recorded so it can be added later (P13.L). Checked 2026-10-09:
- **Membership:** "To make requests to the Apple Music API, you need to authorize yourself as a trusted developer and
  member of the Apple Developer Program" — https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens
  ($99/year, https://developer.apple.com/programs/).
- **Developer token:** a JWT signed with **ES256** using a MusicKit private key; header `alg`, `kid` (10-character key
  id); claims `iss` (Team ID), `iat`, `exp` — at most **15,777,000 seconds (6 months)** ahead; optional `origin`
  array so the token only works from our site (same page). Must be signed on our server; the private key never
  reaches the browser.
- **User token:** MusicKit on the Web obtains the Music User Token when the user authorizes and attaches it to
  Apple Music API requests itself — https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit.
  It stays in the browser; our server never receives or stores it.
- **Not yet confirmed from official docs:** what non-subscribers can play (full tracks vs previews) and the MusicKit
  JS v3 script URL — the MusicKit JS docs page (https://js-cdn.music.apple.com/musickit/v3/docs/index.html) didn't
  render for the fetch tool. Confirm in P13.L before building.

## Open questions

1. **Do member-pasted YouTube video ids count as "API data" under the 30-day rule?** The Developer Policies' 30-day
   limit covers data obtained through YouTube API Services; our ids come from a member's paste. Not stated either
   way. Handling: in-app play only for songs shared in the last 30 days (Ethan, 2026-10-09). Could be relaxed if
   YouTube confirms.
2. **Does embedding alone make us an "API Client" that needs an API project?** The Developer Policies say an API
   Client must create exactly one API project for its credentials; we use no credentials. Handling: we follow all
   the API Client rules anyway (privacy policy, agreement, identification) and register nothing. If YouTube ever
   requires a project for embeds, that's a [HUMAN] registration.
3. **Privacy-enhanced embeds (`youtube-nocookie.com`).** Not described on the pages reviewed; we use the documented
   `www.youtube.com` host. Revisit if documented.

## Compliance test results

None run yet for YouTube (built in P13.3–P13.4). This section lists only tests that were actually run.
