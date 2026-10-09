# Statistics

Every number Drop a Bop shows about you or your party, how it's calculated, and how much data it
needs before it appears. Source of truth: the stats table in `PRODUCT_DECISIONS.md`. Code:
`services/api/src/domain/stats.ts` (each function's comment matches a row below).

## Ground rules

- **Closed weeks only.** Ratings are hidden while a week is open, so stats only use weeks that have ended.
  Weeks that closed with fewer than 2 songs don't count.
- **No number without enough data.** Below the minimum, the app shows *"Not enough data yet"* and how much more
  is needed, never a guess. Every stat shows what it's based on ("Based on 12 ratings").
- **Ties are shared.** If two people or songs are equal, both are shown as winners. In leaderboards, ties share a
  rank and the next rank skips (1, 2, 2, 4).
- **Your own songs don't count as your ratings.** You can't rate your own songs, so they never affect your
  rating stats or your generosity.
- **Averages** are shown to 1 decimal place. **Spread** means population standard deviation: how far ratings
  typically sit from their average (0 = everyone gave the same rating).

## Personal stats

| Stat | What it means | How it's calculated | Needs |
|---|---|---|---|
| Average rating given | How you usually rate | Mean of all ratings you gave | 5 ratings |
| Average score received | How the group rates your picks | Mean of the averages of your rated songs | 3 rated songs |
| Songs recommended | How many songs you've shared | Count | — |
| Highest / lowest rated recommendation | Your best and worst received picks | Your song(s) with the highest / lowest average | 1 rated song |
| Generosity | Do you rate higher or lower than the group? | Your average given − the party's average given. +1.2 = you rate 1.2 points above the group | 10 ratings |
| Rating distribution | Which ratings you hand out | Count of each rating 1–10 you gave | 1 rating |
| Favorite artists | Artists you rate highest | Your average rating per artist, top 3 | 2 songs by that artist |
| Musical twin | Whose taste matches yours (note: a gap of 0 reveals that you and your twin rated those songs identically, even if the party hides who rated what; it uses closed weeks only) | The member whose ratings differ least from yours on songs you both rated (average gap in points; 0 = identical) | 5 shared songs |

## Group stats

| Stat | What it means | How it's calculated | Needs |
|---|---|---|---|
| Highest-rated song | Best average ever | Song with the highest average | 3 ratings |
| Crowd favorite | Loved *and* widely heard | Highest average among songs rated by at least 75% of that week's active raters (not counting whoever shared it) | 3 ratings |
| Most divisive | Ratings all over the place | Song with the largest spread | 4 ratings |
| Most controversial | Love it or hate it | Song with the most even split between low (1–3) and high (8–10) ratings. Score = 2 × min(share low, share high); 1.0 = perfectly split. Needs both lows and highs | 4 ratings |
| Everyone agreed | Ratings almost identical | Song with the smallest spread | 4 ratings |
| Dark horse | The surprise hit | Song that beat its recommender's average from earlier songs by the most | 3 ratings, and the recommender has 3 earlier rated songs |
| Most generous voter / Toughest critic | Who rates highest / lowest | Highest / lowest generosity | 10 ratings |

## More group stats (P13.11)

| Stat | What it means | How it's calculated | Needs |
|---|---|---|---|
| Members | Who's in the party now | Count of current members | — |
| Group average | How the party rates | Mean of every rating | 1 rating |
| Ratings the group gives | Which ratings get handed out | Count of each rating 1–10, everyone | 1 rating |
| Top artists | Who gets shared most | Artists by songs shared (spelling-insensitive), top 3; everyone tied with 3rd is shown | 1 song |
| Most consistent | Reliably good picks | Lowest spread of a person's song averages | 3 rated songs |
| Weekly activity | How busy each week was | Songs, ratings and average rating per closed week, latest 12 | — |
| Monthly activity | The same by month | Closed weeks grouped by the month their ratings locked (party timezone), latest 12 | — |

## Your profile and Home (P13.11)

| Stat | What it means | How it's calculated | Needs |
|---|---|---|---|
| Ratings given | How many ratings you've given | Count of your valid ratings | — |
| Favorite genres | Genres you rate highest | Your average rating per genre (spelling-insensitive), top 3. Only songs shared since genres were added (P13.7) have one | 2 songs in that genre |
| Recent bops | Your latest songs | Your newest 5 songs from closed weeks, with their average | — |
| Last finished week's rank | Your place last week | Sharers of the most recent closed week ranked by average received (as shown, ties share a rank), e.g. "#2 of 4" | 1 rated song that week |
| Recent achievement | Your newest badge | The unlocked achievement with the latest unlock date | — |

Home's main button follows what you can actually do now: **share** (a sharing day you haven't shared on) → **rate**
(songs left) → a calm "All caught up" message; between weeks or while paused it opens last week's results, or says
you're waiting if there are none yet. Code: `apps/web/src/lib/home-action.ts`.

## Leaderboards

Code: the `…Board` functions in `stats.ts` (D30).

**Periods.** *This week* = the most recent closed week. *This month* = closed weeks whose ratings locked in the current
calendar month, in the party's timezone (a week locking at the end of Sunday 31 May counts for May). *All time* =
every closed week (the spec's "Overall" is the same). Every number on the board is worked out from that period only;
for generosity that includes the party's average it's compared with, and for Most Surprising the "earlier average"
comes from earlier songs in the same period (so in a single week that board is usually empty).

**Provisional.** The minimums apply in every period. People below a board's minimum (but with some data) are listed
apart under *Provisional* with the rule ("needs 3 rated songs") and how far they are ("2 of 3"), never with a value
and never ranked, so one rating of 10 can't beat 100 ratings averaging 9.5. People with no data aren't listed.

| Leaderboard | Definition | Needs |
|---|---|---|
| Highest Average Received | Average rating received by songs the person shared (= Average Recommendation Score) | 3 rated songs |
| Highest Average Given | Mean of the ratings the person gave | 5 ratings |
| Most Bops | Songs shared | 1 song |
| Most Ratings | Ratings given | 1 rating |
| Crowd Favorites | Songs rated by at least 75% of that week's active raters (not counting the sharer), by average | 3 ratings (per song) |
| Highest Average Song Rating | Songs ranked by average rating | 3 ratings (per song) |
| Most Generous / Toughest Critic | Highest / lowest generosity (average given − the party's average given) | 10 ratings |
| Most Consistent | Smallest spread between the averages of a person's songs | 3 rated songs |
| Most Surprising | Number of a person's songs that beat their own earlier average by 1 point or more | 1 such song |
| Most Popular | Number of ratings of 8 or higher received | 3 songs shared |

Song boards have no provisional list: songs with too few ratings simply aren't on them.

## History (calendar, Day view, Week view)

Code: `services/api/src/domain/history.ts` (P13.8, D31). Same ground rules as above: ratings only for weeks whose
ratings have locked; an open week shows how many songs were shared each day and nothing else. Ratings count toward
the day **the song was shared**. Averages are shown to 1 decimal place. Ties are joint winners: every song or day
tied for Bop of the Day, best song, lowest rated, most divisive or most agreeable day is listed.

| Number | What it means | How it's calculated | Needs |
|---|---|---|---|
| Songs (day / week) | How many songs were shared | Count | — |
| Ratings (day / week) | How many ratings those songs got | Count of valid ratings | — |
| Group average (day) / Average rating (week) | How the group rated them | Mean of every rating on those songs | 1 rating |
| Songs you rated (day) | How many of that day's songs you rated | Count | — |
| Your average given (day) | How you rated that day's songs | Mean of your ratings on them | 1 rating |
| Your average received (day) | How your song(s) that day did | Mean of the averages of your rated songs that day | 1 rated song |
| Bop of the Day | The day's winner (D12) | Highest average that day; ties share it | 1 rating |
| Lowest rated (day) | The day's least liked song | Lowest average that day (not if it's also the top) | 3 ratings |
| Favourite artists (day) | An artist the group picked more than once | Artists with at least 2 songs that day (spelling-insensitive) | 2 songs |
| Best song (week) | The week's #1 | Rank 1 in the week's results; ties share it | 1 rating |
| Top artists (week) | Who got shared most | Artists by songs shared, top 3 (ties at 3rd all shown) | — |
| Most agreeable day (week) | The day people agreed most | Lowest mean spread of that day's songs | songs with 4 ratings, at least 2 of them that day |
| Most divisive (week) | The week's most split song | Largest spread | 4 ratings |
| Your week: songs rated, average given | Your ratings that week | Count and mean of your valid ratings | 1 rating for the average |
| Your week: average received | How your songs did | Mean of your rated songs' averages | 1 rated song |
| Your week: rank | Your place among that week's sharers | Sharers ranked by average received (shown values), ties share a rank | 1 rated song |
| Calendar ★ | Your best song yet | Days where one of your songs got your best-ever song average (shown value; ties all count), across every closed week | 1 rated song |

## Achievements

Code: `services/api/src/domain/achievements.ts` (P13.9). The list and exact rules are D28 in `PRODUCT_DECISIONS.md`.
How they're worked out:

- **Closed weeks only.** Nothing from a week whose ratings haven't locked counts yet (D9). Weeks without results
  (fewer than 2 songs) don't count and don't break a run of weeks.
- **Unlock date** = when ratings locked on the first week that earned it. Closed weeks are replayed oldest first,
  and after each one every achievement is checked against everything up to that week.
- **Once unlocked, always unlocked**, even if a number later drifts back (e.g. your generosity).
- **Not stored as awards**: worked out on request, so there's nothing to duplicate or fake.
- **Same rules as the stats above**: valid ratings only (no self-ratings, none after the lock), generosity compared
  with the party's average given at that point, ties count (a shared #1 is a Top Bop for everyone tied).
- **"Took part in a week"** = shared or rated at least one song that week. **"In a row"** = consecutive weeks that
  had results.
- **Thresholds are compared as shown** (1 decimal place), like every other stat: a generosity of +0.96 shows as
  +1.0 and unlocks Generous Voter; a 0.34 gap shows as 0.3 and counts for Balanced Judge.
- **Progress** shows how close you are ("7 of 10 weeks", "+0.4 compared with the group (needs +1.0)").
- **The unlock day** is the day ratings locked, in the party's timezone (shown on the calendar as 🏆).
- **Other members' badges:** you can see which they've unlocked, but First 1, First 10 and Full House show no date,
  because the week would reveal how they rated particular songs (D11).
- **If history changes** (for example a member's songs or ratings are removed), achievements are worked out again
  from what's left, so an unlock date can move or a badge can disappear. Rare; nothing is announced for it.
- **The banner** ("Achievement unlocked") lists achievements unlocked after you last opened them; the very first
  time nothing old is announced.
