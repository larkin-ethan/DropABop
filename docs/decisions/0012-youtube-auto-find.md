# ADR-0012: Find a YouTube video automatically for the song being shared

- **Status:** Accepted (Ethan, 2026-10-09)
- **Date:** 2026-10-09
- **Spec sections:** SPEC_V2 §3, §4, §8, §11, §12, §35, §36
- **Changes:** D27 ("no YouTube Data API") and ADR-0011's "videos come only from links members paste". Everything
  else in ADR-0011 (the embedded play card and its rules) stands. ADR-0007 still decides song search: iTunes.

## Context

Ethan wants the YouTube video added automatically when someone picks a song, instead of pasting a link. Finding a
video means searching YouTube, and the only permitted way is the YouTube Data API (scraping YouTube is forbidden,
spec §3.2). He also asked whether song search itself should move to YouTube "if it makes sense with the usage
limits".

## Options considered

1. **YouTube for all song search** — rejected. Search runs as people type (3–10 searches per share), but the API
   allows **100 `search.list` calls per day** for the whole app [Q]. Everything it returns (titles, artwork) would
   also fall under the 30-day delete-or-refresh rule [DP §III.E.4], so song history would lose its details. iTunes
   gives clean title/artist/album, artwork we may keep next to an Apple badge, and no daily cap that low.
2. **One YouTube search per chosen song (chosen)** — iTunes search as today; when a song is picked, the server makes
   one `search.list` call for "artist title". About one call per share: a 20-person party sharing daily uses ~20 of
   the 100.
3. **A "Find on YouTube" button** that opens YouTube search for the sharer to copy a link — no key, but not
   automatic. Offered; Ethan chose option 2.

## Decision

- **Endpoint:** `GET /songs/youtube?providerSongId=<iTunes id>` (signed-in users). The server looks the song up in
  iTunes itself (so only real songs are searched, never free text) and calls `search.list` with `part=snippet`,
  `type=video`, `videoEmbeddable=true`, `videoCategoryId=10` (Music), `maxResults=3`, `safeSearch=moderate` [S].
  It returns up to 3 results **as YouTube returned them** (video id, title, channel; same order, text not
  changed) [DP §III.C.5], marked "From YouTube" [DP §III.F.2].
- **The sharer decides.** The share dialog pre-selects YouTube's first result, shows its real title and channel with
  a Play preview, and lets the sharer pick another result, paste their own link, or remove it. Nothing is attached
  until they press Share (their express choice, [DP §III.I.2]). It's still labelled "YouTube video linked by the
  sharer" because the sharer chose it.
- **Limits.** Each person can make at most **15 YouTube searches a day**, cached answers not counted (a counter item that DynamoDB deletes the
  next day), results are cached for an hour per song in the Lambda, and the route is throttled. If YouTube's daily
  quota is used up, or no key is set up yet, the dialog simply has no suggestion and sharing works as before.
- **30-day rule, for every YouTube video id.** From now on a song's YouTube video (found or pasted) is stored in its
  own small item with `expiresAt` = share time + 29 days; DynamoDB's TTL deletes it, and reads ignore expired ones
  before then. After that the song keeps its Apple/Spotify links and a YouTube Music *search* link. (Videos pasted
  before this change stay in the song, as the member's own content, ADR-0011.) This matches the in-app play window.
- **The key.** A Google Cloud API key for the YouTube Data API v3, created by Ethan, restricted to that one API
  (application restriction: none, because Lambda has no fixed IP). Stored as an SSM Parameter Store
  **SecureString** `/dropabop/<stage>/youtube-api-key` (standard tier, free), created by Ethan with the AWS CLI —
  the one value not in the template, because the repo is public. Only the search function may read it
  (`ssm:GetParameter` on that parameter; `kms:Decrypt` only via SSM for that parameter). It's read at runtime,
  cached in memory, never logged, never sent to the browser [DP §III.D.1]. One Google project for this app only.

## Cost

No new AWS resource type: one more Lambda + route in the existing HTTP API (free tier), one SSM standard parameter
(free), small DynamoDB items. The YouTube Data API has no charge; its quota is the limit. New runtime dependency:
`@aws-sdk/client-ssm` (same AWS SDK family already used; needed to read the key).

## Consequences

- One [HUMAN] step: create the key and store it (roadmap P13.4b). Until then the feature stays quietly off.
- A wrong match is possible (cover, live version, lyric video); the sharer sees the title and channel and can change
  or remove it. The app never claims it's the official recording.
- Watch: if the group grows past ~100 shares a day, suggestions stop for the rest of the day (sharing still works).
  More quota needs a YouTube API audit (a [HUMAN] application).

## References (checked 2026-10-09)

- [S] search.list reference, last updated 2026-09-14 — https://developers.google.com/youtube/v3/docs/search/list
- [Q] Quota and cost, last updated 2026-10-08 ("100 search.list calls … and 10,000 units per day combined for all
  other endpoints"; resets at midnight Pacific) — https://developers.google.com/youtube/v3/determine_quota_cost
- Revision history (2026-06-01: `search.list` and `videos.insert` get their own quota buckets) —
  https://developers.google.com/youtube/v3/revision_history
- [DP] Developer Policies, last updated 2026-09-14 (§III.C.5, §III.D.1, §III.E.4, §III.F.2, §III.I.2; section numbers
  read from the live page on 2026-10-09; the "express choice" reading of §III.I.2 is ours) —
  https://developers.google.com/youtube/terms/developer-policies
- API keys in a header (`x-goog-api-key`), last updated 2026-10-08 —
  https://docs.cloud.google.com/docs/authentication/api-keys-use (YouTube's pages show `?key=`; confirmed live in P13.4b)
- SSM SecureString / KMS — https://docs.aws.amazon.com/systems-manager/latest/userguide/secure-string-parameter-kms-encryption.html
