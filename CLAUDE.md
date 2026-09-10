# CLAUDE.md

Guidance for Claude Code (or any future contributor) working in this repository.

## What this is

Sādhanā is a personal/household daily-practice tracker: japa (mantra) counters,
timed practice sessions, a reading log, learning milestones/notes, a shared
"Guru's Teachings" quote library, and a monthly calendar/stats view. It ships
as an installable, responsive PWA with no build step — plain HTML/CSS/JS
loaded as ES modules, backed by Firebase Auth + Firestore for cross-device
sync.

It was converted from a single self-contained HTML file (originally built
inside a sandboxed environment providing a `window.storage` key-value API)
into this multi-file static app. That `window.storage` API never existed
outside that sandbox, so the original file could not actually persist
anything once run on its own — the cloud layer added here is what makes the
app work at all outside that original environment, not just an enhancement.

## Architecture

```
index.html              Markup only: auth screen, profile-select screen,
                         main app screen, fullscreen overlays, account modal.
css/styles.css           All styling (unchanged from the original design).
js/firebase-config.js    Firebase project config (public client values —
                         see README for how to fill these in).
js/firebase-init.js      Initializes the Firebase app, Auth, and Firestore
                         (with offline persistence). Everything else imports
                         `auth`/`db` from here rather than re-initializing.
js/cloud-store.js        Firestore-backed replacement for the old
                         `window.storage.get/set(key, shared)` API, scoped to
                         the signed-in user's "workspace" (see Data model).
js/auth-ui.js            Sign in / create account / Google sign-in / password
                         reset / sign-out / workspace invite-code UI. Talks to
                         app.js only via DOM CustomEvents (see Event contract)
                         — the two files do not import each other.
js/app.js                The tracker UI logic: profiles, japa, practice,
                         reading, learning, calendar (including the
                         Daily/Weekly/Monthly/Yearly Calendar Dashboard),
                         Guru's Teachings, the fullscreen japa counter, the
                         Chakra Dharana iframe, the Routine Scheduler
                         (Today's Schedule section, the Routine tab's
                         timeline/weekly/overview views, activity CRUD,
                         templates), and reminders (best-effort browser
                         notifications). One file, one module scope — see
                         "Routine Scheduler module" below for
                         why it wasn't split out.
js/chakra-data.js        A large base64-encoded standalone HTML document
                         (the "Chakra Dharana" visualizer) rendered in an
                         iframe via a data: URL. Kept as its own module so it
                         doesn't bloat app.js; do not hand-edit the base64 —
                         regenerate it from the source HTML if it ever needs
                         to change.
manifest.webmanifest     PWA manifest.
service-worker.js        App-shell cache (see PWA behavior below).
icons/                   Generated PWA icons (mala-bead motif, app palette).
firestore.rules          Security rules enforcing workspace membership.
firebase.json            Hosting + Firestore deploy config.
BRD.md                   Business requirements document.
README.md                Setup and deployment instructions.
```

## Data model (Firestore)

```
users/{uid}                    { email, workspaceId, updatedAt }
workspaces/{code}              { members: [uid, ...], createdAt, createdBy }
workspaces/{code}/kv/{key}     { value: "<JSON string>", updatedAt }
```

A "workspace" is the shared space a household joins together via a short
invite code (shown in the account panel, ⚙ icon). Every profile
(`sadhana-users`), each profile's tracker log (`sadhana-data-<profileId>`),
and the shared Guru's Teachings library (`sadhana-gurus`) are stored as `kv`
documents under the caller's current workspace — same keys the original code
used, just persisted centrally instead of nowhere. This is what makes data
shared across every device signed into (or invited into) that workspace.

Do not confuse a Firebase Auth **account** (one human, one login) with an
in-app **profile** (the Aditya/Radhika-style cards on the user-select
screen) — multiple people can share one workspace and therefore see the same
set of profiles and data, without sharing a login.

Each profile's `sadhana-data-<profileId>` blob additionally holds (added by
the Routine Scheduler, see below): `activities` (custom/flexible activity
definitions), `templates` + `activeTemplateId` (saved routine snapshots),
and `mandatorySchedule` (optional display-time/duration overrides for the
Japa/Practice sandhyas, used only to position them on the timeline). New
profiles get these via `defaultData()`; profiles created before this
feature existed are back-filled by `normalizeData()` the first time they're
loaded — always route a freshly-fetched profile blob through
`normalizeData()` rather than using `JSON.parse()` directly.

## Routine Scheduler module

Added after the initial PWA conversion. Lives entirely inside `js/app.js`
(same module scope as everything else) rather than a separate file,
because it needs direct read/write access to the same `data` object,
`runningTimers` map, and helpers (`save()`, `todayStr()`, `escapeHtml()`,
etc.) that the rest of the tracker uses — splitting it out would have meant
either duplicating that state or wiring up another cross-module event
contract for what is, conceptually, one feature area of one tracker.

Key design decisions, in case they need revisiting:

- **One activity model, no duplicate data sources.** A "flexible" (no
  fixed time) activity is just one whose `schedule.startTime` is `null` —
  there's no separate flexible-tasks array. The four mandatory practices
  are *not* stored as `activities` entries; `getMandatoryBlocksForDate()`
  computes their timeline blocks live from the real `data.japa`/
  `data.practice` arrays (with the sandhya's default time, or an override
  from `mandatorySchedule`, if set). This was a deliberate choice over
  syncing mirror entries in `data.activities`, which would have created
  exactly the duplicate-state problem the feature brief warned against.
- **Reading and Learning have no time-of-day concept in the existing app**
  (Reading is a per-day page count, Learning is milestones/notes with no
  daily log at all) — so they are *not* forced onto the timeline. They
  appear in the "Mandatory Practices" pinned strip at the top of the
  Routine tab as a status summary instead. Don't invent a timer or a
  schedule for them; if a real requirement for that shows up, it needs its
  own design discussion, not a bolt-on.
- **Timers are reused, not reinvented.** `startActivityTimer` /
  `pauseActivityTimer` / `completeActivityTimer` (next to `stopPractice`)
  key into the *same* `runningTimers` map as the mandatory Practice timer,
  using `'activity|<id>'` keys. `finalizeAllRunning()` dispatches on the
  key prefix — if you ever add a third kind of timer sharing this map,
  update that function too, or timers of the new kind will silently be
  routed through `stopPractice()` on sign-out/switch-user.
- **Mandatory blocks are draggable/resizable but not deletable.** Dragging
  a Japa/Practice block writes into `data.mandatorySchedule[kind][sandhya]`
  (`{time, durationMin}`), purely for timeline display/planning — it does
  not change how the real timer behaves. The "duration" for a mandatory
  block is therefore a planning hint, not an enforced limit.
- **Overlap layout.** `layoutBlocksForOverlap()` gives each cluster of
  time-overlapping blocks side-by-side columns (classic calendar-app
  layout), computed independently of `markConflicts()`'s conflict
  flagging. Without this, two overlapping blocks fully cover each other
  and the bottom one becomes unclickable — this was caught by testing, not
  designed in from the start, so don't remove it as "simplification."
- **Click-vs-drag disambiguation.** Both `wireBlockDrag()` and
  `wireBlockResize()` require the pointer to move past a small threshold
  (4px / 3px) before treating the gesture as a drag/resize; below that,
  pointerup is a no-op and the block's own `click` listener (which opens
  the expand panel) fires normally. Removing the threshold reintroduces a
  real bug: every click re-renders the timeline (via
  `applyBlockTimeChange`) before the `click` event can reach the
  (now-replaced) DOM node, so the expand panel silently never opens.

**Simplified vs. the full original feature brief** (documented here so it
isn't mistaken for an oversight):
- **Weekly view** is click-a-day-to-jump-to-Daily-view (where the full
  drag/resize/expand toolset is available), plus "Duplicate" from the
  expand panel to copy an activity elsewhere — not true drag-and-drop
  across weekday columns.
- **`renderRoutineAnalytics()`** (inside the Routine tab) covers the
  current day only (scheduled/completed/remaining time, a category
  breakdown). The multi-timeframe drill-down lives in the **Calendar
  Dashboard** instead (see below) — the two are deliberately separate:
  Routine's analytics is "how is today going", the Calendar Dashboard is
  "how did I do historically."
- **Pinch/zoom** on the timeline was not implemented; the daily timeline
  scrolls vertically instead (`#timelineWrap`, max-height with
  `overflow-y:auto`, auto-scrolls to the current time on open).

## Calendar Dashboard

Added after the Routine Scheduler, in the Calendar tab. Replaces the
original plain "X% consistency" stat cards with a Daily/Weekly/Monthly/
Yearly reporting view — read-only, no Start/Pause/Complete controls (those
stay exclusive to Today and the Routine tab). Built on the *same* block
functions as the Routine tab (`getMandatoryBlocksForDate()` /
`getCustomBlocksForDate()`), so there is no second data source to keep in
sync.

- `computeBlockStatus(block, dateStr)` classifies a block as `done` /
  `in-progress` / `overdue` / `pending` for *any* date, not just today —
  unlike `isActivityMissed()` (Routine tab), which only ever evaluates
  today and drives actionable UI (Skip/Reschedule/etc.). A past day that
  was never completed is `overdue`; a future day is always `pending`,
  never `overdue`, no matter how empty it is.
- `bucketForStartTime()` / `BUCKET_ICON` give the Daily view's Morning/
  Afternoon/Evening/Night grouping — shared with the Routine tab's
  Overview, which was renamed from Morning/**Day**/Evening/Night to
  Morning/**Afternoon**/Evening/Night for consistency.
- **A block can't be "due" before it existed.** `isActivityDueOn()` (custom
  activities) and `getMandatoryBlocksForDate()` (Japa/Practice) both check
  the item's `createdAt` against the date being evaluated and skip it if
  the item didn't exist yet. Without this, creating a new daily activity
  today would retroactively render as "missed" for every matching weekday
  going back through the calendar — this was caught by testing (the Yearly
  view showed a brand-new account as having failed every month of the
  year), not designed in from the start. Counters/activities that predate
  this field (no `createdAt`) are treated as always-due, for backward
  compatibility.
- **A future period is never colored like a missed one.** The Monthly grid
  and Yearly grid explicitly null out a day/month's completion percentage
  if it hasn't happened yet, rather than showing 0% (which would render
  with the same "missed" color as a genuinely incomplete past day/month).
  This was also caught by testing, not obvious from the data model alone —
  don't "simplify" this check away.
- The existing filter/search/trace controls (`calTypeTabs`/`calSearch`/
  `calReset`) and the month heatmap grid below the dashboard are unrelated,
  pre-existing functionality and were deliberately left untouched — they
  serve "find this specific activity across the month," which the
  dashboard doesn't replace.
- Clicking a day (Weekly strip, Monthly grid) or a month (Yearly grid)
  jumps to a more detailed view (Daily, or Monthly) rather than opening
  another panel in place — consistent with the Routine tab's weekly→daily
  jump pattern.

## Reminders (best-effort browser notifications — not real alarms)

Every mandatory practice (Japa/Practice per sandhya, Reading per book,
Learning per track) and every custom activity can have one daily `HH:MM`
reminder, settable/removable from wherever that item is already edited
(the activity panel, a mandatory block's expand panel on the Routine
timeline, or inline next to each book/learning track). Storage:
`activity.reminderTime` for custom activities;
`data.mandatorySchedule.<kind>[<sandhya-or-item-id>].reminderTime` for
everything mandatory (reusing the same `mandatorySchedule` bucket the
Routine timeline already uses for display times).

**This is explicitly not a real OS alarm**, and the user was asked and
chose this over the alternative before it was built: a true
guaranteed-timing alarm (fires even if the browser has been closed for
days, with sound/vibration/lock-screen takeover) needs a server that pushes
notifications on a schedule — Firebase Cloud Functions + Cloud Scheduler +
FCM, a paid (Blaze plan) addition this app does not have. What's built
instead:

- `rebuildReminderSchedule()` (called after every successful `save()` and
  once when a profile is selected) clears all pending timers and, if
  Notification permission is `granted`, sets a fresh `setTimeout` per
  reminder via `collectReminders()` for its next occurrence
  (`msUntilNextOccurrence()`).
- When a timer fires, `fireReminder()` calls
  `navigator.serviceWorker.ready.then(reg => reg.showNotification(...))`
  (falling back to `new Notification(...)` if no service worker), then
  immediately re-arms itself for +24h via `scheduleReminder()`.
- Permission is requested lazily, only when the user actually sets their
  first reminder (`ensureNotificationPermission()`), not on app load.
- Timers are cleared on switch-user and sign-out (`clearAllReminderTimers()`
  in the `switchUserBtn` handler and `resetAppState()`) so a previous
  profile's or account's reminders don't keep firing.
- **Real-world reliability depends on the browser/OS keeping the page or
  service worker alive.** It works well on desktop browsers and installed
  Android PWAs that stay backgrounded. On iOS Safari, web notifications
  only fire at all once the app has been added to the Home Screen (Apple
  restriction, not something this app can work around). If a user reports
  reminders not firing, this is the first thing to check — it is not
  necessarily a bug.

## Event contract between auth-ui.js and app.js

Because auth and the tracker UI are separate modules with no imports between
them, they communicate via `document.dispatchEvent(new CustomEvent(...))`:

- `sadhana-auth-ready` — dispatched once a user is signed in AND attached to
  a workspace. app.js listens and calls `initApp()`.
- `sadhana-workspace-changed` — dispatched after the user switches to a
  different shared space from the account panel. app.js resets in-memory
  state and reloads from the new workspace.
- `sadhana-before-signout` — dispatched just before `signOut()` is called.
  app.js stops any running timers/counters and clears in-memory state.
- `sadhana-signed-out` — dispatched once Firebase confirms the user is
  signed out.

If you add new cross-module behavior, prefer adding another named event over
importing between auth-ui.js and app.js — it keeps the auth flow swappable
without app.js needing to know about it.

## Conventions to preserve

- **No build step.** Everything is loaded directly by the browser as ES
  modules (`<script type="module">`) and CDN imports pinned to an exact
  Firebase SDK version in `js/firebase-init.js`. Keep it that way unless
  there's a strong reason to add a bundler.
- **Don't touch the UI/CSS of the original tracker** (Today's mandatory
  sections, Calendar, Guru's Teachings, the fullscreen japa counter, Chakra
  Dharana) unless a change is explicitly requested — its visual design,
  class names, and DOM ids are preserved from the original single-file app
  so behavior stays exactly the same. Most `id`/`class` attributes there
  are relied on by `js/app.js`'s `getElementById`/`querySelector` calls;
  renaming one means updating the other. New UI added for the Routine
  Scheduler follows the same design language (fonts, palette, `.pill`/
  `.item-row`/`.add-form` patterns) intentionally, so it reads as part of
  the same app rather than a bolted-on feature.
- **Real-time sync is intentionally partial.** The profile list and the
  shared Guru's Teachings library live-update across devices via Firestore
  `onSnapshot` listeners (see `initApp()` in app.js). Per-profile tracker
  data (japa counts, practice timers, reading/learning logs) is loaded once
  per profile switch and saved with the original 250ms debounce — it is
  last-write-wins, not merged, and not live-synced while another device has
  the same profile open. This is a deliberate scope decision (see BRD.md);
  don't add live sync for it without checking that concurrent-edit conflicts
  are handled.
- **Firestore document size.** Guru profile pictures and japa fullscreen
  background images are stored as base64 `data:` URLs inside their JSON
  blob, resized client-side before upload (see `resizeImageFile` in
  app.js). Firestore documents cap out at 1 MiB — fine for a handful of
  images at personal/household scale, but don't remove the resize step or
  let this grow into a general file-upload feature without moving images to
  Firebase Storage instead.

## Local development

No build/watch step is needed. Serve the directory with any static file
server (the browser must load it over HTTP, not `file://`, for ES modules
and the service worker to work) — e.g. `npx serve .` or `python3 -m http.server`.
Fill in `js/firebase-config.js` with a real Firebase project's config first
(see README.md) or the auth screen will fail on load.

## Testing changes

There is no automated test suite. After any change, manually verify in a
browser:
1. Sign up creates a new workspace; the invite code appears in the account
   panel (⚙).
2. A second account signing up with that code lands on the same profile
   list.
3. Adding a profile, a japa counter, a practice session, a book, and a
   learning track all persist across a page reload.
4. The app still opens (from cache) with the network disabled, after having
   loaded it once online.
5. Routine Scheduler: add a custom activity with a start time — it appears
   in both Today's Schedule (after the mandatory sections) and the Routine
   tab's timeline, positioned/sized correctly. Start/Pause/Resume/Complete
   works from both places and agrees on state. Dragging a block changes its
   time; dragging its bottom edge changes its duration; both persist across
   a reload. Two overlapping blocks render side-by-side and show a conflict
   warning. An activity with no start time shows up under "Flexible" in
   both Today and the Routine tab, and scheduling it (via the time input or
   dragging it onto the timeline) moves it into the timed list.
6. Deleting one of the four mandatory practices is not possible anywhere in
   the UI; their Routine-tab blocks show a "🔒 Core" badge and only expose
   a time/duration editor, never a delete action.
7. Calendar Dashboard: with at least one mandatory item and one custom
   activity scheduled, open Calendar → Daily and confirm items appear
   under the correct Morning/Afternoon/Evening/Night bucket with a Done/
   Overdue/Pending badge. Switch to Weekly (7 columns, click one jumps to
   Daily), Monthly (grid colored only for past/today, future days neutral,
   click a day jumps to Daily), and Yearly (12 months, future months
   neutral, click one jumps to Monthly). Create a brand-new activity and
   confirm the Yearly view does *not* show earlier months as missed for
   it. The old filter/search/reset row and the month heatmap grid below
   the dashboard should be untouched.
8. Reminders: set a reminder time on a custom activity, a mandatory Japa/
   Practice sandhya (via its Routine-tab expand panel), a book, and a
   learning track. Reopen each editor and confirm the time persisted.
   Grant notification permission and confirm no console errors — actually
   waiting for a reminder to fire in real time is impractical to test
   quickly; trust the persistence check plus a code read of
   `rebuildReminderSchedule()`/`collectReminders()` instead.
9. Login screen: with a guru photo set, sign out and back in — the daily
   quote card on the user-select screen shows the photo as a small square
   beside the quote text, not as a full-screen background.

During development this was exercised with Playwright against a mocked
Firebase (Auth + Firestore) backend rather than a real project — see the
approach in prior session scratch work if you need to rebuild that harness;
it isn't checked into the repo.
