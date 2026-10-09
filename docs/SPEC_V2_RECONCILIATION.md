# Spec v2 reconciliation

How each section of `docs/SPEC_V2.md` (pasted by Ethan, 2026-10-09) maps onto the app that already exists.
Written in P13.1 from an inspection of `main` @ `b4dd6d7` (prod live, roadmap Phases 0–12 done except the
items waiting on AWS or Ethan).

**Status key:** **Done** = already built and kept · **Adapt** = built, changed to fit the weekly model or a
provider rule · **New** = to build (task in roadmap Phase 13) · **Deferred** = recorded, not built now (reason given)
· **Process** = how to work, not a feature.

The guiding rule is spec §1 ("do not replace working functionality"): the weekly model (ADR-0004), lazy weeks
(ADR-0003), stats from closed weeks (ADR-0006) and the AWS footprint all stay. Decisions D26–D33 in
`PRODUCT_DECISIONS.md` record the choices below.

| § | Section | Status | How it maps / reason | Task |
|---|---|---|---|---|
| 1 | Role and objective | Process | Inspect → plan → build incrementally. This file is the inspection output. | P13.1 |
| 2 | Product overview | Adapt | A "round" is the week, a "day" a sharing day (D26). Everything in the requirements list exists or is in Phase 13; notifications in-app only (D29). | — |
| 3 | API terms and compliance | New | Official docs re-read and cited; checklist per provider in `API_COMPLIANCE.md`; no workarounds. | P13.2 |
| 4 | Provider strategy | Adapt | Apple: links only, MusicKit deferred (paid membership). YouTube: sharer-pasted link + official embed, no Data API. Spotify: plain pasted links stay, no integration (D27). | P13.2–P13.4 |
| 5 | Visual design | Done | Existing tokens and components (`docs/design/README.md`); new mockup sheets added there. | — |
| 6 | Technical architecture | Done | Same stack. Only new Lambdas/routes in the existing HTTP API; no new AWS resource types. | — |
| 7 | Provider abstraction | New | `apps/web/src/player/`: one active-song state, a YouTube player, explicit capabilities, an Apple slot. | P13.3 |
| 8 | Song data model | Adapt | The song snapshot already separates metadata from links (`links.appleMusic/spotify/youtube`). Adds `genre` from iTunes; the YouTube video id is read from the pasted link, not stored separately. No cross-provider merging (nothing is matched automatically). | P13.4, P13.7 |
| 9 | Music Services settings | New | `/settings/music`: per provider what actually works today, the "Play videos" toggle, the preferred app. No Connect buttons for services we don't connect to. | P13.6 |
| 10 | Account authorization | Deferred | Nothing needs a provider account now (YouTube embeds need none; Apple MusicKit deferred). The security rules are written into P13.L for when MusicKit is added. | P13.L |
| 11 | Recommend a song | Done | Share screen: iTunes search + paste-a-link, one song per sharing day, server-validated. YouTube search not added (would need a key and quota; D27). | — |
| 12 | Song confirmation | Done / Adapt | Exists. Preview plays only if the sharer pasted a YouTube link; never required to submit. | P13.4 |
| 13 | Voting with embedded player | Adapt | Rate cards get "▶ Play video" when a YouTube link exists; controls shown only if the player supports them. One rating per song already enforced. | P13.4 |
| 14 | Playback fallbacks | New | Loading / can't play here / provider failure states, showing only links that exist. | P13.3 |
| 15 | Player lifecycle | New | Player lives in the app shell (survives navigation); starting a song stops the last; cleaned up on close. No background playback (YouTube forbids hidden players; confirmed in P13.2). | P13.3 |
| 16 | Calendar history | New | Calendar + Day + Week views from closed weeks (D31), one new read route. The old list stays as "List". | P13.8 |
| 17 | Achievements | New | 26 achievements derived on the server from closed weeks (D28); week streaks, not daily ones. | P13.9 |
| 18 | Profile | Adapt | Profile becomes a stats page (badges, top artists/genres, recent songs); editing moves to Settings. | P13.11 |
| 19 | Group stats | Adapt | Exists; adds counts, activity by week/month and top artists. | P13.11 |
| 20 | Leaderboard | Adapt | Exists; adds periods, more boards and a "Provisional" list (D30). | P13.11 |
| 21 | Song details | New | `/songs/:week/:song` reusing results/week data; open weeks show only your own rating (D9). | P13.5 |
| 22 | Notifications | New | In-app, derived on read, bell + list, per-type switches (D29). | P13.10 |
| 23 | Weekly summary | Adapt | "Your week" section of the Week view (D26, D31). | P13.8 |
| 24 | Global search | Adapt | Party-scoped only (D33); "Users" = your party's members. | P13.12 |
| 25 | Party management | Done | Create / join / invite / settings / members exist (P8.2–P8.10). Start/End Round are automatic (D26). | — |
| 26 | Home dashboard | Adapt | Exists; adds averages, latest achievement and last week's rank; the main button follows the real state. | P13.11 |
| 27 | Mobile design | Adapt | Bottom bar becomes Home · Drop · History · Stats · Profile (D32). All 7 widths already tested. | P13.13, P13.14 |
| 28 | Mobile player | Adapt | YouTube needs a visible player of at least 200 × 200 px, so the tiny mini-bar is replaced by a docked, visible player above the bottom bar (to be confirmed in P13.2). One playback session. | P13.3 |
| 29 | Settings | New | Settings hub with sections; only working controls (change password, notifications, music, party, help, about). | P13.6 |
| 30 | Help and onboarding | Done / Adapt | `/how-it-works` exists; adds how music playback works and why some songs can't play here. | P13.6 |
| 31 | Empty and error states | Done | Every screen already has them (P8.12); new screens follow the same pattern. | each task |
| 32 | Database design | Adapt | Same single table. New attributes only: song `genre`, user `playInApp` + notification switches, membership `achievementsSeenAt`, user `notificationsSeenAt`. No achievement or notification items (derived). | P13.6–P13.10 |
| 33 | Auth and security | Done | Cognito JWT, membership checks in every handler, zod validation, throttles. New routes follow the same checklist. | each task |
| 34 | Provider capabilities | New | `capabilities.ts`, values from the P13.2 research. | P13.3 |
| 35 | Quotas, caching, rate limits | Done / New | iTunes limits already documented and handled (ADR-0007). The YouTube embed has no quota; the IFrame script loads only on first Play. | P13.2 |
| 36 | Privacy and retention | New | `docs/PRIVACY.md`, including what YouTube's player collects and links to Google's policies. | P13.2 |
| 37 | Accessibility | Done / New | Existing pass (P8.12); new screens get keyboard checks and text tables for charts. | P13.14 |
| 38 | Performance | Done / New | Player script lazy-loaded; history limited to a month per request; no polling beyond D29. | P13.3, P13.8 |
| 39 | Screen inventory | Adapt | Most screens exist; new: Song Details, Music Services, Calendar/Day/Week, Achievements (+ detail, toast), Notifications, Search. "Vote Submitted" and "Waiting for Everyone" stay inline states. | Phase 13 |
| 40 | Navigation | Adapt | D32. | P13.13 |
| 41 | Testing | Process | Unit + integration + e2e at 7 widths; player tested with a mocked YouTube API; results recorded only when run. | each task |
| 42 | AWS cost | Done | Budget and alarms exist; same footprint; YouTube embed and links cost nothing. | — |
| 43 | Documentation | New | Add `PRIVACY.md`, `API_COMPLIANCE.md`; update the rest. | P13.2, P13.15 |
| 44 | Implementation workflow | Process | Roadmap Phase 13, one task per commit (`/next-task`). | — |
| 45 | AI rules | Process | Already in `CLAUDE.md`. | — |
| 46 | Acceptance criteria | Process | Checked at the end of Phase 13; "Apple Music uses an official integration when permitted" is met by links until MusicKit is funded. | P13.16 |
| 47 | Product vision | — | Flows covered by Song Details (P13.5), Music Services (P13.6) and History (P13.8). | — |

## New mockup sheets

Three sheets came with spec v2 and are saved in `docs/design/` (`mockup-v3-history.webp`,
`mockup-v3-music.webp`, `mockup-v3-screens.webp`). Their screen-by-screen adaptations are in
`docs/design/README.md` → "Mockup v3 (2026-10-09)".
