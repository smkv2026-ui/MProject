# Business Requirements Document — Sādhanā Practice Tracker

| | |
|---|---|
| **Document status** | Approved for v1 implementation |
| **Product** | Sādhanā — Practice Tracker (PWA) |
| **Prepared for** | smkv2026@gmail.com |
| **Date** | 2026-09-09 |

## 1. Background

Sādhanā began as a single self-contained HTML file for tracking daily
spiritual practice: japa (mantra counting), timed practice sessions, a
reading log, learning milestones, a shared library of Guru's teachings, and
a calendar/stats view, with a lightweight multiple-profile switcher (e.g.
one household, several family members). It relied on a `window.storage`
key-value API supplied by the environment it was originally built in. That
API does not exist in a normal browser, so outside that original
environment the app had no working persistence at all — nothing survived a
page reload.

## 2. Objective

Convert the existing application into a responsive, installable Progressive
Web App that:

1. Preserves the existing UI and functionality exactly as designed.
2. Adds real user authentication (no more implicit/anonymous local profiles
   at the account level).
3. Persists all data in a cloud database instead of ephemeral/non-existent
   local storage.
4. Makes data shared across every device and every person signed into the
   same household/account, rather than siloed per device.

## 3. Scope

### 3.1 In scope

- **Authentication**: email/password sign-up and sign-in, Google sign-in,
  password reset. One Firebase Auth account per person.
- **Shared workspace model**: on sign-up, a person either creates a new
  shared space (getting a short invite code) or joins an existing one with
  a code someone shares with them. Every device signed into accounts
  belonging to the same shared space sees the same profiles and data.
- **Cloud persistence**: all application data (profiles, japa counters and
  logs, practice sessions and logs, reading logs, learning tracks/notes,
  the shared Guru's Teachings library, theme preference) is stored in
  Firestore under the caller's shared space.
- **Cross-device behavior**: the profile list and the Guru's Teachings
  library live-update across devices in real time. All other data is
  fetched fresh whenever it's opened (on profile switch) and saved on
  change — see 6.2 for the consistency model.
- **PWA conversion**: web app manifest, installable icons, a service worker
  caching the app shell for instant/offline load of the app itself, and
  Firestore's own offline write queue/cache so the tracker keeps working
  (using the last-synced data) without a network connection.
- **Preserving existing features verbatim**: profile switcher, Today tab
  (Japa / Practice / Reading / Learning), Calendar tab with heatmap/search/
  stats, Guru's Teachings tab (CSV upload, per-guru images), fullscreen japa
  tap-counter with optional background image, Chakra Dharana fullscreen
  visualizer, light/dark theme toggle, and full JSON export/import.
- **Documentation**: this BRD, `CLAUDE.md` (engineering/architecture
  reference), and `README.md` (setup and deployment instructions).

### 3.2 Out of scope (v1)

- Per-field conflict resolution / merge for simultaneous edits to the same
  profile's tracker data from two devices at once (last-write-wins is
  accepted for v1 — see 6.2 and 8).
- Role-based permissions within a shared space (e.g. read-only members,
  removing a member). Every member of a shared space has full read/write
  access to all of its data.
- Migrating data out of the original file's non-functional local storage
  (there was nothing durable to migrate — see Background).
- Native mobile app store distribution (the PWA is installable from the
  browser on Android/iOS/desktop, which was judged sufficient for this
  scale of app).
- Server-side rendering, analytics, or a backend beyond Firebase Auth and
  Firestore.

## 4. Users / personas

- **Household member (primary user)** — uses the app daily to log practice.
  Wants their data available whether they pick up their phone or a tablet,
  and wants a family member's entries visible too.
- **Household admin (implicit)** — the person who first signs up and
  creates the shared space; responsible for sharing the invite code with
  the rest of the household.

There is no distinction enforced in the product between these two beyond
who happens to hold the invite code — see 3.2 on role-based permissions.

## 5. Functional requirements

| # | Requirement |
|---|---|
| FR-1 | A visitor can create an account with email + password, or with Google. |
| FR-2 | A returning user can sign in with the same method and land back on their shared space. |
| FR-3 | A user can request a password-reset email. |
| FR-4 | On first sign-up, a user chooses to start a new shared space or join an existing one via invite code. |
| FR-5 | Any signed-in member of a shared space can view its invite code and share it. |
| FR-6 | A signed-in member can move their account to a different shared space by entering another code. |
| FR-7 | All profile, tracker, and Guru's Teachings data reads/writes go through the shared space the signed-in user currently belongs to. |
| FR-8 | The profile list and Guru's Teachings library reflect changes made from another device within seconds, without a manual refresh. |
| FR-9 | Signing out returns the user to the sign-in screen and stops any in-progress timers/counters cleanly. |
| FR-10 | The app is installable (Add to Home Screen / desktop install) and opens in standalone display mode. |
| FR-11 | The app shell loads even without a network connection, after having been opened once online. |
| FR-12 | All pre-existing features (listed in 3.1) function identically to the original design. |

## 6. Non-functional requirements

### 6.1 Security

- Firestore security rules restrict every read/write to authenticated
  members of the relevant shared space; no data is readable by an
  unauthenticated request or by a user who is not a member (see
  `firestore.rules`).
- Shared-space invite codes are short (6 characters, ambiguity-free
  alphabet) and are looked up by exact document ID only — Firestore rules
  block listing/enumerating all shared spaces, so a code can't be
  discovered by browsing.
- The Firebase web config in `js/firebase-config.js` is a public client
  identifier, not a secret; it is safe to commit. Actual access control is
  enforced entirely by `firestore.rules` and by which Auth providers are
  enabled — see README for what must be configured in the Firebase
  console.

### 6.2 Consistency / offline behavior

- Profile list and Guru's Teachings: real-time (`onSnapshot`), eventually
  consistent within a couple of seconds across devices.
- Per-profile tracker data (japa/practice/reading/learning logs): loaded
  once when a profile is opened, saved on change with a short debounce.
  Two devices with the *same profile* open at the *same time* will
  overwrite each other's unsaved changes on next save (last-write-wins).
  Given the personal/household scale and typical one-active-device-at-a-time
  usage pattern, this tradeoff was accepted for v1 rather than building
  field-level merge logic (see 8, Risks).
- The app must remain usable read/write while offline, queuing writes for
  when connectivity returns (Firestore's built-in offline persistence).

### 6.3 Performance

- Initial load should render the sign-in screen without waiting on
  Firestore; app data should render within a couple of seconds on a normal
  connection.

### 6.4 Compatibility

- Works on evergreen browsers on desktop and mobile that support ES
  modules and service workers (Chrome, Edge, Firefox, Safari — current and
  last major version).

## 7. Assumptions

- The user (or their Firebase project owner) will create their own Firebase
  project and enable Email/Password and Google sign-in providers, and
  create a Firestore database, before first use — Claude Code cannot create
  cloud accounts or provision infrastructure on the user's behalf.
- Household scale: a handful of profiles and a handful of concurrent
  devices per shared space, not a multi-tenant SaaS product.
- Users trust everyone they give their shared-space invite code to with
  full read/write access to that space's data (see 3.2).

## 8. Risks / known limitations

- **Last-write-wins on tracker data** (6.2): a real risk only if the same
  profile is actively used on two devices at once; low likelihood at
  household scale but not eliminated.
- **Firestore per-document size limit (1 MiB)**: Guru pictures and japa
  background images are stored as resized base64 inside their JSON
  document. Fine for a modest number of images; would need to move to
  Firebase Storage if this library grows large. See `CLAUDE.md`.
- **Invite-code security is possession-based, not permissioned**: anyone
  who has the code has full access; there is no per-member removal or
  read-only mode in v1 (see 3.2).
- **Firebase costs**: Firestore/Auth usage beyond the free tier incurs
  cost; not expected at this scale but worth the project owner monitoring
  usage in the Firebase console.

## 9. Success criteria

- A new user can go from "opens the app for the first time" to "logging a
  japa count that's visible on a second device" in under two minutes,
  without any code changes — only Firebase console configuration.
- No feature present in the original design is missing or behaves
  differently after conversion.
- The app passes a basic installability check (Chrome DevTools ▸
  Application ▸ Manifest, and Lighthouse's PWA audit) and functions with
  the network disabled after first load.

---

# Addendum — Routine Scheduler module

| | |
|---|---|
| **Document status** | Approved for v1 implementation |
| **Date** | 2026-09-10 |

## A.1 Objective

Add a "Routine Scheduler" premium module on top of the existing tracker: a
visual, drag-and-drop daily/weekly timeline for planning custom activities
(exercise, work, family time, etc.) alongside the four existing mandatory
practices, without disturbing any existing functionality.

## A.2 Scope delivered

- A single reusable activity data model (`data.activities`) covering both
  scheduled and "flexible" (no fixed time) activities — no duplicate data
  source for the same activity, per the explicit requirement.
- Full activity authoring: name, description, icon, category, priority,
  accent color, estimated duration, start time, frequency (daily/weekdays/
  weekends/custom days). A Quick Add mode (name + time + duration, with
  clickable suggestions) and a Detailed mode with the full field set.
- **Today's Schedule**: a new section in the Today tab, after the four
  mandatory practices (which are untouched and still render first), listing
  the day's scheduled and flexible custom activities with the same Start/
  Pause/Resume/Complete controls.
- **Routine tab**: a visual daily timeline (4 AM–midnight, scrollable,
  auto-scrolls to the current time), with:
  - Blocks positioned and sized by time/duration, colored by category.
  - Drag-to-move (snapping to a configurable 15/30/60-minute grid) and
    drag-to-resize via a bottom-edge handle, both persisting immediately.
  - Overlapping activities render side-by-side (not stacked/hidden) and
    are flagged with a conflict warning; the expand panel names what it
    overlaps with.
  - A live current-time indicator line, and a live running-timer readout
    inside any block whose timer is active.
  - Click-to-expand panel: description, planned vs. actual duration,
    frequency, priority, and Start/Pause/Resume/Complete, Edit, Duplicate,
    Delete (mandatory blocks show a "🔒 Core Practice" badge and only
    expose a time/duration editor — no delete).
  - Gentle handling of a missed (time passed, not completed) activity:
    Mark Complete, Skip Today, Reschedule, Move to Tomorrow, or Convert to
    Flexible — never a silent "failed" state.
  - A **Flexible Activities** area for tasks with no fixed time, schedulable
    onto the timeline either by dragging (desktop) or picking a time (any
    device).
  - **Weekly view**: a 7-day grid showing each day's scheduled items;
    clicking a day jumps to its Daily view, clicking an item jumps there
    and opens its expand panel.
  - **Overview**: a Morning/Day/Evening/Night grouping of the day's
    activities as a readable chain.
  - **Templates**: save the current set of custom activities as a named,
    reusable template; rename/duplicate/delete/switch between templates;
    three starter presets (Spiritual Routine, Productive Work Day, Balanced
    Routine) that add activities without disturbing the current set.
  - **Analytics**: scheduled/completed/remaining time for the day, and a
    time-by-category breakdown (bars).
- Mandatory practices (Japa, Practice, Reading, Learning) remain
  undeletable and pinned first everywhere; Japa/Practice additionally gain
  a draggable/resizable *display* time and planned duration on the
  timeline (stored separately from, and without altering, their real
  timers/logs). Reading and Learning — which have no time-of-day concept
  in the existing app — appear in a "Mandatory Practices" status strip
  instead of being forced onto the timeline.
- Custom activities reuse the exact same timer plumbing
  (`runningTimers`) as the existing mandatory Practice timer; no second
  timer system was introduced.
- Guru's Teachings: a guru's photo, once added, now renders as a square
  thumbnail beside each of their quotes, instead of as a full-tab
  background image.

## A.3 Deliberate simplifications (see CLAUDE.md for the technical why)

- **Weekly view** is click-to-jump-and-edit rather than true drag-and-drop
  of activities across day columns; "Duplicate" from the expand panel is
  the practical equivalent of copying an activity to another day.
- **No separate multi-year Insights/Progress tab.** The brief described a
  full daily/weekly/monthly/yearly missed-and-pending analytics view; what
  shipped is a today-focused analytics summary in the Routine tab. A
  historical drill-down across arbitrary time ranges is a substantial
  feature in its own right and was out of scope for this pass.
- **No pinch/zoom** on the timeline; it scrolls vertically instead.
- Mandatory-practice "duration" on the timeline is a planning/display hint,
  not an enforced limit — the real timer remains exactly as it was.

## A.4 Non-functional notes

- No new data source was introduced for images/media; the existing
  Firestore document-size caveat (BRD §8) applies equally to activity
  data, which is small (text + short color/icon strings) and not a
  concern at this scale.
- All new interactions (drag, resize, click-to-expand) were built on the
  Pointer Events API so the same code path serves mouse and touch, per the
  mobile-responsiveness requirement.

## A.5 Success criteria

- Every pre-existing feature (mandatory practices, Calendar, Guru's
  Teachings, Chakra Dharana, export/import, theme toggle) works exactly as
  before, verified by re-running the original acceptance checks in
  §"Testing changes" of CLAUDE.md alongside the new ones.
- A user can create a custom activity, see it scheduled correctly for the
  right days, drag it to a new time, resize its duration, complete it, and
  see all of that reflected consistently in both the Today tab and the
  Routine tab, surviving a page reload.

---

# Addendum B — Calendar Dashboard, Reminders, Login Photo Fix

| | |
|---|---|
| **Document status** | Approved for v1 implementation |
| **Date** | 2026-09-10 |

## B.1 Objective

Three follow-on requests: replace the Calendar tab's plain consistency-%
summary with a richer Daily/Weekly/Monthly/Yearly reporting dashboard; add
optional daily reminders to every task (mandatory and custom); and fix the
login screen's daily-quote guru photo to match the same square-thumbnail
treatment already applied to Guru's Teachings.

## B.2 Scope delivered

**Calendar Dashboard** (replaces the "X% consistency" stat cards shown in
the request; the filter/search/reset row and month heatmap grid below are
unrelated, pre-existing functionality and were left in place):
- **Daily**: the selected day's mandatory and custom activities, grouped
  into Morning/Afternoon/Evening/Night (plus Flexible), each row showing
  its scheduled time, planned vs. actual duration, and a Done/Running/
  Overdue/Pending status badge.
- **Weekly**: a 7-day strip with a stacked done/overdue/pending bar per
  day; clicking a day opens it in Daily.
- **Monthly**: scheduled/completed/missed/completion-rate totals plus a
  calendar grid colored by each day's completion rate — future days are
  left neutral rather than colored as if they'd already failed.
- **Yearly**: the same totals across a 12-month grid, with the same
  neutral treatment for months that haven't started yet; clicking a month
  opens it in Monthly.
- A new activity or mandatory counter is never retroactively "missed" for
  days before it was created (see A.3-style note in CLAUDE.md) — caught
  during testing, not part of the original ask, but necessary for the
  dashboard's numbers to be trustworthy.

**Reminders** (best-effort browser notifications, not a real alarm — see
below):
- Every mandatory item (each Japa/Practice sandhya, each Reading book,
  each Learning track) and every custom activity can have one optional
  daily `HH:MM` reminder, set from wherever that item is already edited.
  Editable and removable at any time, for mandatory and custom tasks
  alike, per the request.
- Fires as a real system notification via the service worker, once
  notification permission is granted (requested only when a reminder is
  first set), and re-arms itself daily automatically.

**Login screen photo fix**: the daily-quote card on the pre-login
user-select screen now shows the guru's photo as a small square thumbnail
beside the quote text, matching the fix already made to the Guru's
Teachings tab, instead of stretching it across the whole screen as a
background image.

## B.3 A note on "alarm"

The request asked for an alarm "in mobile." A genuine OS-level alarm —
guaranteed to fire at an exact time with sound/vibration/lock-screen
takeover, even if the browser has been fully closed for days — is not
achievable from a web app without a paid, actively-maintained backend
(Firebase Cloud Functions + Cloud Scheduler + Firebase Cloud Messaging,
sending a push per user per reminder on a schedule). This was put to the
user directly as a choice before building anything: best-effort browser
notifications (free, ships immediately, reliable while the browser/PWA has
been used recently on that device) versus the paid scheduled-push backend.
The user chose the free option. If real alarm-clock reliability becomes a
hard requirement later, building the scheduled-push backend is the correct
next step — it was scoped and explained, not silently declined.

## B.4 Success criteria

- The Calendar tab's new dashboard and its four period views load without
  errors, agree with the Routine tab's block data (no separate data
  source), and never color a future day/month as if it were already
  missed.
- A reminder set on any of the four mandatory task types or a custom
  activity persists across reopening its editor and across a reload, and
  can be cleared.
- The daily-quote card shows a photo (when the guru has one) as a bounded
  square image, never as a background covering the screen.

# Addendum C — Header Stats Strip, Journal Module

| | |
|---|---|
| **Document status** | Approved for v1 implementation |
| **Date** | 2026-09-10 |

## C.1 Objective

Two follow-on requests: surface today's total Practice and Japa time as a
one-line header summary visible from every tab; and add a Journaling tab
that is substantially more than a plain diary — a structured spiritual
self-observation practice organized around Observe → Reflect → Purify →
Learn → Practice → Grow, built from a very detailed 20-section brief.

## C.2 Scope delivered

**Header stats strip**: a single line above the header (`#statsStrip`),
present on every tab, showing "🧘 Practice today" and "📿 Japa today" as
short durations, updating live once a second while a practice/activity
timer is running and immediately on session completion.

**Journal tab** (fifth main tab, between Routine and Calendar), built from
the brief's sections as follows:
- **Core Daily Journal**: Thoughts for the Day, Positive Pointers, Negative
  Pointers, Spiritual Notes, and 3-slot Gratitude — free-form text per day.
- **Sankalpa (morning intention / evening outcome)** and a **Morning
  Journal** (feeling, today's mantra/shloka, what to be careful of) and
  **Evening Journal** (what happened, where awareness was lost/kept, what
  to practice tomorrow) — the brief's Morning & Evening Journal and
  Sankalpa sections, combined into one Today view rather than two separate
  screens, since both are edited on the same date's entry.
- **Structured Reflections** — one generic mechanism (not five separate
  features) covering the brief's Trigger→Reaction→Awareness, Experiences
  Journal, Seva Journal, Guru/Teaching Journal, and a Task Note type used
  to satisfy the explicit ask to "select the task and then add notes in
  the journaling section" (a 📝 icon next to every japa counter, practice,
  book, learning track, Today's Schedule/Routine activity row, and Routine
  block's expand panel opens a pre-filled note for that task).
- **Question of the Day / Self-Inquiry**: a deterministic daily question
  (same question on every device for a given date, via the same hashing
  approach already used for the daily Guru's-quote card) with a free-form
  answer field.
- **Spiritual Growth Dashboard**, delivered as trend-only period averages
  (7/30/90/365 days) of 5 self-observation ratings (Awareness, Discipline,
  Peace, Gratitude, Self-control) — explicitly **not** gamified: no points,
  streak counters, badges, or leaderboard framing, per the brief's own
  explicit caution against turning spirituality into competition.
- **Long-Term Spiritual Goals**: a simple categorized checklist, shown
  alongside the Growth view.
- **Timeline / Spiritual Diary + Search**: a reverse-chronological list of
  every day with journal content, showing a same-day summary (cross-
  referencing the existing Japa/Practice logs, not duplicating them) and
  text snippets, with full-text search across every field including
  structured reflections.
- **Privacy — App Lock**: an optional PIN (hashed, never stored in plain
  text) gates the Journal tab specifically, re-locking on switch-user and
  sign-out.

## C.3 Deliberate simplifications (see CLAUDE.md "Journal module" for the
technical why)

- **AI Reflection** — the brief itself framed this as optional, and it
  requires a real backend call (an LLM API), which is out of scope for a
  no-build, client-only app with no server component. Not built.
- **Device-level biometric unlock and field-level encryption** — the PIN
  lock covers the "shared household device, casual privacy" case the app
  is built for; true biometric auth and encrypted-at-rest journal data
  would need a key-management story this app doesn't have (and Firestore
  security rules already restrict reads to workspace members, which is the
  app's real access boundary).
- **"Witness Mode" as a separate, distinctly-branded mode** — its
  intent (observe first, without judgment, before reacting) is already the
  organizing idea behind the Evening Reflection and Trigger→Reaction→
  Awareness sections rather than a separate UI surface. A dedicated
  standalone mode is a reasonable future addition, not built in this pass.
- **Export / delete-permanently as Journal-specific controls** — the app's
  existing JSON export/import already covers the full profile blob
  (journal included); a Journal-only export/delete is a narrower cut of
  functionality that already exists at the profile level and wasn't
  duplicated.
- No ads exist anywhere in this app, so "no ads inside journal" was
  already satisfied without a specific change.

## C.4 Success criteria

- The header stats strip shows correct Practice/Japa totals for today on
  every tab, updates live while a timer is running, and matches the
  underlying logs after a reload.
- Every field in the Journal's Today view (Sankalpa, Morning, Thoughts,
  Pointers, Spiritual Notes, Gratitude, Question of the Day, Evening
  Reflection, 5 ratings) persists across a reload.
- All five structured-reflection types can be added, viewed, and deleted,
  and a Task Note opened from any of the linked task rows pre-fills with
  that task's name.
- The Growth view never displays points/streaks/leaderboard-style scoring
  — only period-averaged self-ratings and a plain goals checklist.
- The Timeline view lists every day with journal content and its search
  correctly filters by any word appearing in any field, including
  structured reflections.
- With a PIN set, the Journal tab requires it after every switch-user or
  sign-out, and never after simply switching tabs within the same
  session.

# Addendum D — Global Guru's Teachings, Admin Module

| | |
|---|---|
| **Document status** | Approved for v1 implementation |
| **Date** | 2026-09-18 |

## D.1 Objective

Two follow-on requests: make the Guru's Teachings library truly global
(a teaching added anywhere shows up for every account, including a brand
new signup, not just members of the same household workspace); and add a
password-gated Admin view, reachable from a top-right entry point, listing
every account ever created on the app with the ability to drill into a
selected account's profile details.

## D.2 Scope delivered

**Global Guru's Teachings**: moved from a per-workspace `kv` document to a
new top-level `globalKv` Firestore collection, readable and writable by any
signed-in account. No UI or feature change to Guru's Teachings itself —
the photo handling, teaching CRUD, and daily quote card all work exactly as
before; only where the data lives (and who it's shared with) changed.

**Admin module**: a "🛡 Admin" entry point on the auth screen, the
user-select screen, and the main app's header opens a password prompt
(password: `SriGuruBabaJi`). On success (and with an active sign-in — the
underlying data reads require Firebase Auth regardless of the password),
it opens a dashboard listing every account (from the `users` collection)
by email and shared-space code. Selecting an account loads its workspace's
profile list; selecting a profile loads that profile's full data —
practice/japa totals, reading/learning progress, custom activities,
long-term goals, and the complete Journal (every date, every field,
including structured reflections) — per the user's explicit choice to
include Journal contents rather than exclude them.

## D.3 The security trade-off (put to the user directly, not decided unilaterally)

Firestore security rules run entirely server-side and have no way to see
what was typed into the page's password field — that check only exists in
the browser. So making the Admin view's data actually loadable required
choosing between two real options, and both were put to the user as an
explicit choice before writing any rule changes:

1. **Open to any signed-in account** (chosen): Firestore allows any
   authenticated user to *read* every account's `users` doc and every kv
   document in every workspace. This matches the request as stated — anyone
   who knows the password sees everything — but as a direct consequence,
   any account that ever signs up for the app (whether or not they know
   the Admin password, or ever open the Admin UI at all) can technically
   read every other household's profile names, tracker data, and Journal
   entries directly via the Firestore SDK, bypassing the password and the
   UI entirely. `write` access was kept restricted to each account's own
   `users` doc and their own workspace's data, so a stranger can read but
   never modify or delete another household's information.
2. **Restrict to specific admin account(s)** (not chosen): Firestore rules
   check the signed-in account's email against an allowlist, so only
   pre-approved Google accounts could ever load this data server-side,
   with the password as a second factor on top. Not selected.

This is documented here, in CLAUDE.md ("Admin module"), and in
`firestore.rules` itself so the trade-off is visible wherever someone might
next touch this code — it should not be "discovered" later as if it were
an oversight, and should not be silently tightened or loosened without
checking with the user first.

## D.4 Success criteria

- A Guru's Teaching added from any account appears for every other account,
  including one that just signed up and hasn't joined any existing
  household's shared space.
- The Admin password gate rejects an incorrect password. (Its behavior
  with a correct password and no prior sign-in changed in Addendum E —
  see there for the current, final behavior.)
- With the correct password and an active session, the Admin dashboard
  lists every account that has ever signed up, and selecting one correctly
  loads that account's profiles and, per profile, its full tracker data
  including Journal entries.
- Regular (non-Admin) app usage is functionally unchanged: no new
  permission prompts, no behavior difference for someone who never opens
  the Admin view.

# Addendum E — Admin Fixes: Placement, Stale-Cache Reports, Password-Only Access

| | |
|---|---|
| **Document status** | Approved for v1 implementation |
| **Date** | 2026-09-18 |

## E.1 Objective

Follow-on bug reports and a UX correction on the Admin module (Addendum D):
the Admin button rendered in the wrong place, both the Admin dashboard and
the global Guru's Teachings library appeared "not working" after being
deployed, and — once those were fixed — a further explicit request that the
Admin password alone should be sufficient, with no separate sign-in step
first.

## E.2 Scope delivered

**Admin button placement**: replaced three separate per-screen buttons
(each `position:absolute` inside its own screen's layout, which could
render inconsistently — one report had it appearing inline next to the
login form) with a single button fixed to the actual top-right of the
viewport, present identically on every screen.

**Stale-cache "not working" reports**: root-caused to the service worker's
cache-first app-shell strategy, which served a returning visitor's
*previous* cached version on their first reload after any deploy (the
network fetch that refreshed the cache happened too late to affect that
load) — a second reload was needed to see a change. This looked identical
to a broken deploy for both the Admin dashboard and global Guru's
Teachings, even though both had shipped correctly. Switched to
network-first (always fetch fresh when online; fall back to cache only
when offline) so a deploy is visible on the very next load. Also added a
visible error (not just a console log) when a Guru's Teaching fails to
save, since a silent permission-denied error (e.g. from `firestore.rules`
not yet being redeployed) looked identical to "nothing happened."

**Password-only Admin access**: the user reported that requiring a sign-in
before the password prompt would work defeated the point — clicking Admin,
entering the password, and pressing enter should be sufficient by itself.
Implemented via Firebase Anonymous Authentication: `attemptAdminLogin()`
now calls `signInAnonymously()` automatically the moment the password
matches, if nobody is already signed in, then opens the dashboard —
matching the requested one-step flow. `js/auth-ui.js`'s auth-state handling
was updated to ignore this anonymous session (it has no profile or
workspace and shouldn't trigger the normal sign-in UI flow).

## E.3 A further security trade-off (flagged before shipping, not silent)

This was raised with the user directly before implementation, since it
widens the trade-off already made in Addendum D one step further, and
required a manual decision:

Firestore's rules can only ever check *whether* a request is authenticated
(`request.auth != null`), never *what a user typed into the page* — so
"password alone, no account" can only be built by having the app sign
someone in through some real (if minimal) auth mechanism the instant the
password matches. Anonymous Authentication is that mechanism: no email, no
password, no signup, from the visitor's side. The direct consequence:
**any visitor to the site — with no account, ever created — can reach the
exact same cross-account read access Admin has**, either through the
password prompt or by opening the browser's developer console and calling
Firebase's `signInAnonymously()` directly, bypassing the password entirely.
Previously (Addendum D), reaching that data required *some* signed-up
account, even though any account could then see everything; this removes
even that minimal step.

Two alternatives were offered alongside this one:
1. A hardcoded admin email/password Firebase account, auto-signed-into
   behind the password prompt — comparable exposure (credentials visible
   to anyone reading the client code) but no new sign-in provider to
   enable in Firebase.
2. Keep requiring a real account first, but streamline that step (e.g. a
   sign-in form inside the same Admin modal) rather than sending the user
   away to hunt for the normal sign-in screen.

Anonymous Authentication was the option chosen. It requires enabling
"Anonymous" as a sign-in provider in the Firebase console (see README.md
step 2) — without it, the Admin password prompt shows a specific "enable
Anonymous sign-in" error rather than a silent or generic failure.

## E.4 Success criteria

- (Superseded by Addendum F: the Admin button was removed entirely in
  favor of a credential check on the normal sign-in form.)
- A code change deployed to the live site is visible on the very next page
  load for a returning visitor, not the load after that.
- A Guru's Teaching that fails to save shows a visible error rather than
  silently disappearing.
- (Superseded by Addendum F: no password prompt exists anymore — see
  there for the current Admin entry flow.)
- If Anonymous sign-in isn't enabled on the Firebase project, attempting
  Admin sign-in shows a specific, actionable error instead of a generic
  one (still true — see Addendum F for where this error now surfaces).
- Exiting Admin when no real account was ever signed in returns to the
  sign-in screen, not an empty (broken-looking) profile-picker screen.

# Addendum F — Admin Access Moved Into the Normal Sign-In Form

| | |
|---|---|
| **Document status** | Approved for v1 implementation |
| **Date** | 2026-09-18 |

## F.1 Objective

A further, final correction to the Admin module (Addenda D and E): remove
the dedicated Admin button and password modal entirely. Instead, typing
username `admin` and password `SriGuruBabaJi` into the app's *existing*,
ordinary sign-in form should log into Admin directly — no separate button,
icon, or modal anywhere in the UI.

## F.2 Scope delivered

- Removed the fixed top-right Admin button and its password modal
  (`#adminBtn`, `#adminLoginModal` and everything in it) from `index.html`,
  and the corresponding `ADMIN_PASSWORD` / `attemptAdminLogin()` /
  `openAdminLoginModal()` code from `js/app.js`.
- The ordinary `#loginForm` submit handler in `js/auth-ui.js` now checks
  for the admin username/password *before* attempting a normal Firebase
  sign-in; on a match it signs in anonymously (same mechanism as Addendum
  E — still required, since Firestore's rules need a real session) and
  dispatches a new `sadhana-admin-ready` event that `js/app.js` listens for
  to open the dashboard. Anything else falls through to the normal
  sign-in path, completely unchanged.
- `#loginEmail` changed from `type="email"` to `type="text"`, since a
  browser's built-in `type="email"` validation silently blocks a form from
  submitting a bare value like `admin` (no `@`) — this would have made the
  admin credential check impossible to trigger at all.
- The Admin dashboard screen itself (account list, per-profile detail,
  Journal included) is unchanged from Addenda D/E — only how you reach it
  changed.

## F.3 Trade-offs (unchanged from Addendum E, still applies)

The security trade-off from Addendum E is unaffected by this change: the
credential check is still plain client-side JavaScript that Firestore's
rules can't see, anonymous sign-in still requires no real account, and any
visitor to the site can still reach the same cross-account read access
either through this form or by calling Firebase's sign-in API directly
from the browser console. Moving the check from a separate button/modal
into the normal login form doesn't change what it grants access to or who
can reach it — it only changes the UI path to get there, per the user's
explicit preference for "log in normally" over a distinct Admin button.

## F.4 Success criteria

- No Admin button, icon, or modal is visible or discoverable anywhere in
  the app's UI.
- Submitting the normal sign-in form with username `admin` and the correct
  password opens the Admin dashboard directly, in one step.
- Submitting that same form with username `admin` and an incorrect
  password fails exactly like any other failed sign-in attempt — no hint
  that "admin" is treated specially.
- A normal account's email/password sign-in continues to work exactly as
  before, unaffected by this change.
- If Anonymous sign-in isn't enabled on the Firebase project, attempting
  the admin credentials shows a specific, actionable error in the same
  place normal sign-in errors appear, rather than a generic failure.
