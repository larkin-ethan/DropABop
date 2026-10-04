# Music providers

How Drop a Bop finds songs and links people to them, what each music service allows, and how to add one.
Every fact below was checked against the provider's official documentation or terms on **2026-10-01** (sources at the
end). Provider rules change often: re-check before relying on anything here, and update the date.

**Decision:** [ADR-0007](decisions/0007-music-provider-plan.md), approved by Ethan on 2026-10-01.

## Summary

| | iTunes Search API | Spotify Web API | Apple Music API | YouTube Data API |
|---|---|---|---|---|
| Search without a user login | Yes | Yes (Client Credentials) | Yes (developer token) | Yes (API key) |
| Developer cost | None stated | **App owner needs Spotify Premium** (since Feb 2026) | **Apple Developer Program, $99/yr** | None stated |
| Registration | None | Developer app (Development Mode) | Apple Developer membership | Google Cloud project + key |
| Limits | ~20 calls/min | Undisclosed rolling limit; Dev Mode max 5 authorized users; search `limit` ≤ 10 | Undisclosed | **100 searches/day** (since Jun 2026) |
| Can we keep a permanent snapshot of metadata/art? | Allowed for promotion, next to a store badge; previews streamed only | **No.** "Temporary caching" only | **No.** Not separately from playback | **No.** Refresh or delete within 30 days |
| Same-track lookup by ISRC | No | Yes (`isrc:` search filter) | Yes (paid) | No |
| In-app playback | 30-second previews only | Web Playback SDK needs Premium per listener; 5-user cap | MusicKit JS for subscribers; needs $99 program | IFrame player (≥200×200, no overlays) |

**Third-party aggregator:** Odesli/song.link's public API was retired on 2026-07-31 (now 410 Gone). Don't depend on it.

## What this means for v1 (ADR-0007)

1. **Search uses the iTunes Search API**, called from Lambda (never from the browser), with results cached so the
   group stays far below ~20 calls/minute. No key, no account, no cost.
2. **Each shared song stores a snapshot from iTunes:** iTunes track id, title, artist, album, duration, release date,
   the artwork **URL** (not a copy of the image), and the track's Apple Music link (`trackViewUrl`, which opens
   music.apple.com).
3. **Every song shows a "Listen on Apple Music" badge** linking to that track. iTunes' terms treat artwork as
   promotional content that must sit next to a store badge.
4. **Spotify and YouTube links come from the person sharing.** When sharing, they can optionally paste their own
   Spotify and/or YouTube link to the same song. The server checks it's a real `open.spotify.com/track/…` or
   YouTube watch link and stores only the URL. Songs with a pasted link show "Open in Spotify" / "Watch on YouTube";
   otherwise the app shows a plain "Search on Spotify / YouTube" link built from artist + title.
5. **Deferred:** the Spotify API (Premium plus terms that forbid our snapshot and mixing services), the YouTube API
   (100 searches/day, 30-day refresh rule), the Apple Music API ($99/yr; terms tie it to playback), in-app playback,
   and per-user account connections.

This keeps v1 at **$0 with no developer registrations**, inside every provider's terms as we read them.

## Provider details

### iTunes Search API [ISA]
- `GET https://itunes.apple.com/search?term=…&media=music&entity=song&country=us&limit=10`, plus `/lookup?id=…`. No key.
- About 20 calls per minute ("subject to change"); heavy use is directed to Apple's partner feed.
- Returns `trackId`, `trackName`, `artistName`, `collectionName`, `trackTimeMillis`, `releaseDate`, `trackViewUrl`
  (observed on 2026-10-01 as a `music.apple.com` link), `artworkUrl100`, `previewUrl`. No ISRC.
- Terms: artwork and previews are "Promo Content" for promoting the store, shown near a store badge; previews must be
  streamed, never downloaded or cached; Apple can require removal. "Large websites should set up caching logic."
- Unconfirmed: whether re-hosting artwork copies is allowed (we store the URL instead); whether the current "Listen on
  Apple Music" badge satisfies the older "Download on iTunes" wording; larger artwork by changing the URL's size
  suffix (observed behaviour, not documented).

### Spotify Web API [SQ, SB, SMG, SCM, SS, SRL, ST, SP, SD, SWP, SOE]
- Client Credentials gives search without user login; secrets must stay on the server.
- Since 2026-02-11 (new apps) / 2026-03-09 (existing), a Development Mode app only works if its owner has **Premium**.
  Development Mode: up to 5 authorized users, non-commercial individual use. Extended Quota Mode needs a registered
  organisation with 250k+ monthly users.
- `GET /search` remains; max `limit` is now 10. `external_ids.isrc` was restored in March 2026; the `isrc:` filter works.
- Terms: "Do not locally cache any Spotify Content, except… temporary caching of metadata and cover art"; "Do not
  create any product or service which is integrated with streams or content from another service"; metadata and art
  must link back to Spotify, with Spotify branding rules (logo sizes, "Listen on Spotify" wording, no cropped art).
- oEmbed (`https://open.spotify.com/oembed?url=…`) needs no auth but is covered by the Developer Terms.

### Apple Music API / MusicKit [ADT, ASR, AISRC, AUT, AMK, APR, DPLA, AMIG]
- Developer token (ES256 JWT) required for every call; needs the **Apple Developer Program ($99/yr)**.
- Catalog search needs only the developer token; ISRC lookup via `filter[isrc]`.
- Program license §3.3.6 D: MusicKit is for facilitating access to users' Apple Music subscriptions; album art and
  text "may not be used separately from music playback or managing playlists".
- Branding: "Listen on Apple Music" badge, unmodified, minimum sizes; "Apple Music" written as two words.

### YouTube Data API v3 [YQ, YGS, YRH, YSL, YVL, YDP, YRMF, YTOS, YDOC]
- API key for public data. Since 2026-06-01: **100 `search.list` calls/day** by default (own bucket); `videos.list`
  costs 1 unit of 10,000/day. Resets at midnight Pacific.
- Stored API data must be refreshed or deleted within 30 days; audiovisual content can't be stored; YouTube results
  can't be mixed with other sources as YouTube results; YouTube branding required wherever its content appears.
- Embedded players: at least 200×200, no overlays. There is no official public YouTube Music API.

## How to add a provider (P6.3+)

1. Re-check the provider's current docs and terms; add a section above with sources and the date checked.
2. If it needs a paid account, a developer registration, or changes what we store or show, write or update an ADR and
   get Ethan's approval first.
3. Implement it behind the `MusicProvider` interface (`services/api/src/providers/`) with its capabilities
   (`canSearch`, `canPlayInApp`, `requiresSubscription`, `canOpenExternal`), server-side only, secrets in SSM.
4. Mock it in unit tests; add one opt-in live test.

## Sources (all checked 2026-10-01)

- [ISA] https://performance-partners.apple.com/search-api
- [SQ] https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- [SB] https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
- [SMG] https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- [SCM] https://developer.spotify.com/documentation/web-api/references/changes/march-2026
- [SCJ] https://developer.spotify.com/documentation/web-api/references/changes/july-2026
- [SS] https://developer.spotify.com/documentation/web-api/reference/search
- [SRL] https://developer.spotify.com/documentation/web-api/concepts/rate-limits
- [ST] https://developer.spotify.com/terms
- [SP] https://developer.spotify.com/policy
- [SD] https://developer.spotify.com/documentation/design
- [SWP] https://developer.spotify.com/documentation/web-playback-sdk
- [SOE] https://developer.spotify.com/documentation/embeds/reference/oembed
- [ADT] https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens
- [ASR] https://developer.apple.com/documentation/applemusicapi/search-for-catalog-resources-(by-type)
- [AISRC] https://developer.apple.com/documentation/applemusicapi/get-multiple-catalog-songs-by-isrc
- [AUT] https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit
- [AMK] https://developer.apple.com/musickit/
- [APR] https://developer.apple.com/programs/
- [DPLA] https://developer.apple.com/support/terms/apple-developer-program-license-agreement/ (updated 2026-08-18)
- [AMIG] https://marketing.services.apple/apple-music-identity-guidelines
- [YQ] https://developers.google.com/youtube/v3/determine_quota_cost
- [YGS] https://developers.google.com/youtube/v3/getting-started
- [YRH] https://developers.google.com/youtube/v3/revision_history
- [YSL] https://developers.google.com/youtube/v3/docs/search/list
- [YVL] https://developers.google.com/youtube/v3/docs/videos/list
- [YDP] https://developers.google.com/youtube/terms/developer-policies
- [YRMF] https://developers.google.com/youtube/terms/required-minimum-functionality
- [YTOS] https://developers.google.com/youtube/terms/api-services-terms-of-service
- [YDOC] https://developers.google.com/youtube/documentation/
- [LT] https://linktr.ee/help/en/articles/15201827-sunsetting-the-songlink-odesli-public-api
