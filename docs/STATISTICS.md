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

## Leaderboards

| Leaderboard | Definition | Needs |
|---|---|---|
| Highest Average Song Rating | Songs ranked by average rating | 3 ratings |
| Highest Average Recommendation Score | Average rating received by songs the user recommended | 3 rated songs |
| Most Consistent | Smallest spread between the averages of a user's songs | 3 rated songs |
| Most Surprising | Number of a user's songs that beat their own earlier average by 1 point or more | 1 such song |
| Most Popular | Number of ratings of 8 or higher received | 3 songs shared |

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
