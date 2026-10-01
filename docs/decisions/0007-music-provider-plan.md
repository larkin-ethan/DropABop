# ADR-0007: v1 music plan: iTunes Search for songs, member-pasted Spotify/YouTube links

- **Status:** Proposed. Needs Ethan's approval (it changes what song cards show and how sharing works).
- **Date:** 2026-10-01
- **Spec sections:** §10, §11, §12, §14 · Decisions D20, D21, D22 · Details: `docs/MUSIC_PROVIDERS.md`

## Context

The group uses a mix of Spotify, Apple Music, and YouTube (D20). v1 needs one search with no end-user login and no
paid developer account, plus official "Open in…" links so everyone can listen in their own app. Research of current
official docs and terms (2026-10-01, `docs/MUSIC_PROVIDERS.md`) found:

- **iTunes Search API:** free, no key, ~20 calls/min; returns Apple Music links and artwork; artwork is promotional
  content to show next to an Apple store badge.
- **Spotify:** search works server-side, but a Development Mode app now requires the owner to have **Premium**, and
  the terms allow only *temporary* caching and forbid products "integrated with streams or content from another
  service". Our stored per-song snapshot and mixed-service lists conflict with that.
- **Apple Music API:** **$99/yr**; terms tie metadata and art to playback.
- **YouTube:** **100 searches/day**; stored data must be refreshed or deleted within 30 days.
- **Odesli/song.link API:** retired 2026-07-31.

## Decision (proposed)

1. **Search: iTunes Search API**, server-side in Lambda, results cached briefly, `country=us`, 10 results.
2. **Snapshot per shared song** from iTunes: id, title, artist, album, duration, release date, artwork URL,
   `trackViewUrl` (Apple Music link). No preview audio stored.
3. **Every song card shows a "Listen on Apple Music" badge** linking to the track (iTunes terms; Apple branding rules).
4. **Spotify/YouTube links are pasted by the sharer** (optional) when sharing. The server validates the URL pattern
   (`https://open.spotify.com/track/<id>`, `https://www.youtube.com/watch?v=<id>`, `https://youtu.be/<id>`,
   `https://music.youtube.com/watch?v=<id>`) and stores just the URL. No Spotify/YouTube metadata or artwork is
   fetched or stored. Cards show a branded "Open in Spotify" / "Watch on YouTube" button when a link exists, and a
   plain "Search on Spotify/YouTube" link (artist + title) when it doesn't.
5. **D22 (preferred app):** the preferred service's button is shown first.
6. **Deferred:** Spotify API, YouTube API, Apple Music API, in-app playback, account connections. Revisit if the group
   wants automatic Spotify/YouTube matching enough to accept Premium, registrations, and the terms questions.

Schema impact (P6.3): `submitRecommendationRequestSchema` becomes
`{ provider: 'appleMusic', providerSongId: <iTunes trackId>, links?: { spotify?: url, youtube?: url } }`.

## Cost

- **AWS:** a few extra Lambda calls and small cached-result items in DynamoDB; effectively $0.
- **Providers:** $0. No accounts or registrations.
- **Risk:** iTunes' ~20 calls/min. Mitigated with search on submit (not every keystroke) plus a short cache.

## Consequences

- People who prefer Spotify or YouTube get a one-tap link only if the sharer pasted one; otherwise a search link.
- A song not in Apple's catalog can't be shared in v1 (rare for mainstream music). A paste-only fallback could be added.
- If Apple asks us to remove promotional content, we remove artwork and links for affected songs.
- Unconfirmed items to watch: re-hosting artwork (we don't), badge wording, whether the "search on Spotify/YouTube"
  URL formats are officially supported.
