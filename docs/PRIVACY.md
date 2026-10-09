# Privacy

Two parts: the **privacy policy and terms of use** people see in the app (built in P13.2a as one page reachable
without signing in), and **notes for developers** on keeping it true. Spec v2 §36; YouTube's privacy-policy rules (ADR-0011).

Policy version: **2026-10-09**. When the policy text changes in a way users should know about, bump the version;
the app then asks everyone to agree again (P13.2a).

---

## Privacy policy and terms of use (text shown in the app)

**Drop a Bop** is a small, private, invite-only app where a group of friends share songs and rate each other's
picks. It's run by one person for a small group; it isn't a company and doesn't sell anything.

### What we collect and why

- **Your email and password** — to sign you in. They're kept by Amazon Cognito (AWS's sign-in service). Your password
  is never sent to us; only a protected form is stored. Your email isn't shown to anyone.
- **Your display name, avatar colour and optional profile picture** — so your party knows who you are. A profile
  picture is shrunk to a small copy in your browser before it's uploaded; the original never leaves your device.
- **Your settings** — preferred music app, whether videos play in Drop a Bop, notification choices, and when you
  agreed to this policy.
- **What you do in a party** — the parties you belong to, the songs you share (with any links you paste), your
  ratings and your comments. Your party uses these for results and stats.
- **Basic request logs** — time, which feature was used, whether it worked, and a random user id (not your email).
  Kept for 30 days. Never your password or sign-in tokens.

We don't collect your location, contacts, or listening history from any music service, and we don't use
advertising or analytics trackers.

### Who can see it

Only members of your parties see your name, picture, shared songs, comments, achievements and stats. Ratings stay
hidden until the week's ratings lock, and after that individual ratings are shown only if your party's host turned
that on. Nobody outside your parties can see anything.

### Services we use

- **Amazon Web Services** (sign-in, database, servers) and, currently, **Cloudflare Pages** (delivers the website)
  process data to run the app.
- **Apple (iTunes Search and album art)** — when you search for a song, our server sends the search words to Apple.
  Album artwork is loaded by your browser straight from Apple's servers, which (like any website) see your IP
  address and browser type.
- **YouTube** — Drop a Bop uses **YouTube API Services** to find and play videos for shared songs. When you choose
  a song to share, our server asks YouTube for matching videos, sending only the song's artist and title. Videos
  kept with a song are forgotten 29 days after it was shared. In your browser, nothing is loaded from YouTube until
  you press Play. Once a video loads, YouTube may set cookies and collect data about the playback, as
  it does on any site with a YouTube video. That's covered by the **YouTube Terms of Service**
  (https://www.youtube.com/t/terms) and the **Google Privacy Policy** (https://www.google.com/policies/privacy).
  You can switch in-app videos off in Settings → Music and use links instead.
- **Links to Apple Music, Spotify and YouTube Music** open those services, which have their own privacy policies.

We don't sell or share your data with anyone else, and we don't connect to your music accounts.

### Cookies and storage

Drop a Bop itself doesn't use cookies. Your browser stores your sign-in session and a few app preferences (like
the party you last opened, or an invite link you're in the middle of using) in its local and session storage.
YouTube's player may set its own cookies when you play a video.

### Your choices

- Change your name, picture and settings any time.
- Leave a party any time, unless you're its host (your past songs and ratings stay in that party's history, so its
  results stay correct).

### Terms of use

Drop a Bop is a free, private app for friends, provided as is. Be kind in comments and only share links to real
music. The host of a party can remove members and comments.

**YouTube:** Drop a Bop's video player uses YouTube API Services. By using Drop a Bop, you agree to be bound by the
**YouTube Terms of Service** (https://www.youtube.com/t/terms).

### Contact

Questions or complaints about privacy: **droppa.bop@gmail.com**.

---

## Notes for developers

- **Keep the policy true.** Any change to what's stored (DATABASE.md), who sees it, or which services we call
  must update this file, `SECURITY.md` "What we store" and, if users should know, the policy version.
- **YouTube rules this page satisfies** (Developer Policies, checked 2026-10-09, ADR-0011): says we use YouTube
  API Services; links YouTube's Terms of Service and Google's Privacy Policy; explains what we collect and share;
  discloses third-party cookies; gives a contact; is reachable at all times (no sign-in needed); users agree before
  using the features (sign-up checkbox + one-time prompt for existing members) [III.A.2]. Our terms of use link the
  YouTube Terms of Service and say users agree to be bound by them [III.A.1]. We use no Google "Authorized Data",
  so the revoke-access link requirement doesn't apply.
- **Settings named in the policy:** the "Play videos in Drop a Bop" switch (Settings → Music) and notification
  choices arrive in P13.6 / P13.10. The player itself (P13.3–P13.4) ships no earlier than that switch, so the
  policy is accurate by the time videos can play; don't deploy P13.4 to prod before P13.6.
- **Policy version:** the YouTube search wording was added on 2026-10-09 before the policy was ever deployed, so the
  version stayed 2026-10-09. After it's live, any such change bumps the version.
- **Data minimisation:** no listening history, no provider tokens (no accounts are connected), no IP addresses in
  our logs. The agreement is stored as a timestamp + policy version on the user's profile.
- **No account deletion is offered yet** (Ethan, 2026-10-09). If that changes, first decide what is removed (D17 keeps
  a leaver's songs and ratings so others' results stay correct), add a runbook, then update this policy and bump the
  version.
- **Hosting:** if the website moves from Cloudflare Pages to CloudFront (P9.2), update "Services we use" and bump
  the version.
- Log retention numbers must match `infra/template.yaml` (14 days dev, 30 days prod).
