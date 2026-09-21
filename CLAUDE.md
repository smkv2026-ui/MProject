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
                         Also exposes global (cross-workspace) kv helpers
                         and the read-only, cross-account helpers backing
                         the Admin module (see below).
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
                         templates), reminders (best-effort browser
                         notifications), the header stats strip
                         (Practice/Japa time today), and the Journal tab
                         (spiritual journaling — see "Journal module"
                         below). One file, one module scope — see
                         "Routine Scheduler module" below for
                         why it wasn't split out.
js/chakra-data.js        A large base64-encoded standalone HTML document
                         (the "Chakra Dharana" visualizer) rendered in an
                         iframe via a data: URL. Kept as its own module so it
                         doesn't bloat app.js; do not hand-edit the base64 —
                         regenerate it from the source HTML if it ever needs
                         to change.
manifest.webmanifest     PWA manifest.
service-worker.js        App-shell cache (see "PWA app-shell caching" below).
icons/                   Generated PWA icons (mala-bead motif, app palette).
assets/                  Static media too large for base64/Firestore —
                         currently just kriya-practice.mp4 (see "Kriya
                         Practice module" below).
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
globalKv/{key}                 { value: "<JSON string>", updatedAt }
```

A "workspace" is the shared space a household joins together via a short
invite code (shown in the account panel, ⚙ icon). Every profile
(`sadhana-users`) and each profile's tracker log (`sadhana-data-<profileId>`)
are stored as `kv` documents under the caller's current workspace — same
keys the original code used, just persisted centrally instead of nowhere.
This is what makes data shared across every device signed into (or invited
into) that workspace.

`globalKv` is a separate, top-level collection for data meant to be shared
across **every** workspace/account, not just one household's. The only
thing stored there today is the Guru's Teachings library (`sadhana-gurus`,
same key name as before) — see "Guru's Teachings is global" below for why
it moved out of per-workspace storage.

Do not confuse a Firebase Auth **account** (one human, one login) with an
in-app **profile** (the Aditya/Radhika-style cards on the user-select
screen) — multiple people can share one workspace and therefore see the same
set of profiles and data, without sharing a login.

Each profile's `sadhana-data-<profileId>` blob additionally holds (added by
the Routine Scheduler, see below): `activities` (custom/flexible activity
definitions), `templates` + `activeTemplateId` (saved routine snapshots),
and `mandatorySchedule` (optional display-time/duration overrides for the
Japa/Practice sandhyas, used only to position them on the timeline). It also
holds (added by the Journal module, see below): `journal` (one entry object
per date, keyed by `dateStr`) and `journalGoals` (a flat array of long-term
spiritual goals). New profiles get all of these via `defaultData()`;
profiles created before a given feature existed are back-filled by
`normalizeData()` the first time they're loaded — always route a
freshly-fetched profile blob through `normalizeData()` rather than using
`JSON.parse()` directly.

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

## Header stats strip

A one-line bar (`#statsStrip` in index.html, styled by `.stats-strip` in
css/styles.css) sits above the header, visible on every tab, showing
**Practice today** and **Japa today** as short durations (`fmtShort()`, e.g.
`42m`).

- `computeTodayKindSeconds(kind)` (kind is `'practice'` or `'japa'`) sums
  `data.logs[todayStr()][kind]` seconds across all counters/sandhyas, plus —
  for `'practice'` only — the live elapsed time of any currently-running
  practice timer. Japa's running timer only ever exists inside the
  fullscreen japa counter (which covers the whole screen, hiding this strip
  anyway), so its live elapsed time isn't added; the persisted total is
  refreshed the moment that overlay closes.
- `renderStatsStrip()` writes both values and is called from `renderAll()`
  plus every place that already ticks the visible timers or commits a
  session (`startPractice`'s interval, `stopPractice`, the activity timer
  interval, `closeJapaFullscreen`) — it does not have its own timer loop.

## Journal module

Added after the Routine Scheduler and Calendar Dashboard, as a fifth main
tab (`#tab-journal`, nav order Today / Routine / **Journal** / Calendar /
Guru's Teachings). Lives in the same `js/app.js` module scope as everything
else, for the same reason the Routine Scheduler does (direct access to
`data`, `save()`, `todayStr()`, `escapeHtml()`, `uid()`, `dailySeed()`,
without a second cross-module event contract).

**Data model** — one entry object per calendar date, keyed by `dateStr`,
under `data.journal[dateStr]` (back-filled to `{}` by `normalizeData()` for
profiles created before this feature existed — always go through
`getJournalEntry(dateStr, createIfMissing)` rather than touching
`data.journal[...]` directly, so a missing date is created with the full
default shape instead of `undefined` field accesses blowing up). Each entry
(`defaultJournalEntry()`) holds: `sankalpa` (morning intention/evening
outcome/learning), `morning` (feeling/mantra/what to be careful of),
`thoughts`, `positivePointers`, `negativePointers`, `spiritualNotes`,
`gratitude` (3 slots), `evening` (what happened/lost awareness/remained
aware/tomorrow's practice), `ratings` (5 self-observation sliders, 0-10 or
`null` if unset — see Growth view below), `questionOfDay` +
`questionAnswer`, and `entries` (the structured-reflections list, see
below). `data.journalGoals` is a separate flat, manually-maintained array
(long-term spiritual goals), not linked to any specific date.

- **One generic mechanism for five entry types, not five.** Trigger →
  Reaction → Awareness, Experience, Seva, Guru Teaching, and Task Note are
  structurally identical — "a repeatable dated entry with a handful of text
  fields" — so they share one data shape (`{id, type, createdAt, ...fields}`
  pushed into `entry.entries`), one field-schema table
  (`JOURNAL_ENTRY_FIELD_DEFS`, keyed by type), and one render/CRUD path
  (`renderJournalEntriesList` / `renderJournalEntryCard` /
  `openJournalEntryForm`) instead of five near-duplicate ones. Adding a
  sixth entry type is a matter of adding one `JOURNAL_ENTRY_TYPES` /
  `JOURNAL_ENTRY_FIELD_DEFS` entry, not new UI code.
- **Simple field bindings via a lookup table.** `JOURNAL_TEXT_FIELDS` is a
  flat list of `[elementId, dotted-path-into-entry]` pairs, wired generically
  via `getDeep`/`setDeep` — this covers the many one-off textareas/inputs
  (Sankalpa, Morning, Thoughts, Pointers, Spiritual Notes, Evening
  Reflection, Question answer) without a repetitive block of
  `document.getElementById(...).addEventListener(...)` per field.
- **Task Note ties a journal entry back to whatever you were doing.**
  `openJournalNoteFor(taskName)` switches to the Journal tab, jumps to
  Today, and opens a pre-filled `taskNote` entry form. It's wired from a
  small 📝 icon-button next to: each japa counter and practice's row title,
  each book and learning track's row, every Today's Schedule / Routine
  activity row (`renderActivityRow`), and the Routine tab's block expand
  panel (`openBlockExpand`) — i.e. "select the task, then add notes in the
  journaling section," as opposed to a separate unlinked note field. It
  always opens on *today's* entry, even when triggered from a
  non-today Routine block — the task name still carries over as context.
- **Question of the Day is deterministic, not random.** `questionOfTheDay(
  dateStr)` reuses the same `dailySeed(str)` hash the daily Guru's-quote
  card already used, so every device shows the same self-inquiry question
  on a given date without needing to sync which question was "already
  shown."
- **Growth view is trend-only, on purpose.** `renderJournalGrowth()` shows
  period-averaged (7/30/90/365-day) bars for the 5 self-ratings via
  `journalRatingAverages(days)` — no point totals, streak counters, badges,
  or leaderboard-style scoring. This was an explicit requirement ("avoid
  making spirituality into a gamified competition"): the question the view
  answers is "am I becoming more aware?", not "how many points did I
  score?". Long-Term Spiritual Goals live in the same view as a plain
  checklist (`data.journalGoals`), not folded into the ratings chart.
- **PIN lock is a UI gate, not encryption.** `data.settings.journalPinHash`
  (SHA-256 of the PIN via `crypto.subtle.digest`, never the PIN itself) is
  checked by `isJournalLocked()`; `journalUnlockedThisSession` (module-level,
  in-memory only) stays true until switch-user or sign-out
  (`journalUnlockedThisSession = false` is set in both the `switchUserBtn`
  handler and `resetAppState()`, alongside the existing
  `clearAllReminderTimers()` call — same lifecycle). This locks the Journal
  *tab* on a shared device; it is explicitly documented in-app (the lock
  settings modal) as not being field-level encryption — a full data
  export/import still exposes journal contents in plaintext, same as every
  other tracker field.
- **Search and the diary/timeline view reuse the same data, no separate
  index.** `renderJournalTimeline()` iterates `data.journal` directly;
  `journalEntryMatchesQuery()` flattens every text field (including nested
  `entries`) into one lowercased haystack per date for substring search —
  there's no separate search index to keep in sync.
- **Deferred from the original brief, and why:** AI Reflection (the user
  explicitly framed this as optional, and it needs a real backend call —
  out of scope for a no-build, client-only app), device-level biometric
  unlock and field-level encryption (PIN lock covers the "shared device,
  casual privacy" case; true encryption would need a key-management story
  this app doesn't have), and "Witness Mode" as a distinct standalone mode
  (its spirit — observe-first, non-judgmental self-inquiry — is already the
  framing of the Evening Reflection and Trigger→Reaction→Awareness
  sections; a dedicated mode/UI for it is a future addition, not built
  here).

## Guru's Teachings is global

Originally the Guru's Teachings library (`sadhana-gurus`) was a per-workspace
`kv` document, like every other tracker key — shared across every device in
one household's workspace, but not across households. That was changed to a
true cross-workspace shared library: a teaching added from any profile, in
any workspace, now shows up for every signed-in account, including a brand
new signup that hasn't joined anyone's workspace.

- Storage moved from `workspaces/{code}/kv/sadhana-gurus` to
  `globalKv/sadhana-gurus` (same key name, same JSON shape — just a
  different collection). `js/cloud-store.js` exposes this as
  `globalGet`/`globalSet`/`subscribeGlobalKey`, parallel to the existing
  `cloudGet`/`cloudSet`/`subscribeKey` but never scoped to
  `setActiveWorkspace()`'s current workspace.
- `loadGurus()`/`saveGurus()`/the `unsubGurus` live-listener in `initApp()`
  (js/app.js) were switched from the workspace-scoped functions to the
  global ones — no other change to the Guru's Teachings feature itself
  (photo handling, teaching CRUD, the daily quote card) was needed, since
  they all go through those same three functions.
- Firestore rule: `globalKv/{key}` allows any signed-in user to read and
  write. Unlike the Admin trade-off below, this one has no meaningful
  downside — the library was always meant to be a shared spiritual-quote
  resource, not private data, so making it writable by any signed-in
  account (instead of just workspace members) matches its purpose.

## Admin module

A dashboard that lists every account ever created on the app and, per
account, every profile in its workspace with that profile's full tracker
data — Journal entries included. There is **no separate Admin UI element
anywhere** — no button, no icon, no extra screen to discover. Signing in on
the ordinary sign-in form (`#loginForm`) with email **`admin@sadhana.local`**
and password **`SriGuruBabaJi`** opens it instead of a normal account. This
was built at the user's explicit request, through two rounds of
correction — an earlier version had a top-right button + password modal
(removed: "log in normally, nothing else"), then a version using Anonymous
Auth with a bare `admin` username (replaced: the user's Firebase project
doesn't have Anonymous sign-in enabled and asked for a real email/password
account instead) — it is not a "hidden" feature and its trade-offs are
deliberate, not an oversight.

- **It's a credential check inside the normal login handler, not a separate
  flow.** `js/auth-ui.js`'s `loginForm` submit handler checks
  `email.toLowerCase() === 'admin@sadhana.local' && password === 'SriGuruBabaJi'`
  *before* calling the normal `signInWithEmailAndPassword` — if it matches,
  it signs into the dedicated admin account instead (see below); anything
  else falls through to the normal sign-in path unchanged. `#loginEmail` is
  back to `type="email"` (an earlier `admin`-only username needed
  `type="text"` to bypass the browser's built-in email-format validation;
  `admin@sadhana.local` is a real email shape, so that workaround is gone).
- **It's a real Firebase Auth account, not Anonymous Auth.** The first time
  anyone signs in with these exact credentials, `signInWithEmailAndPassword`
  fails (the account doesn't exist yet in a fresh Firebase project) and the
  handler falls back to `createUserWithEmailAndPassword` to create it once;
  every time after that, the normal sign-in succeeds directly. This needs
  **no extra Firebase console setup** beyond Email/Password already being
  enabled (step 2 in README.md) — unlike the Anonymous-Auth version this
  replaced, which required separately enabling that provider and failed
  with a confusing "isn't enabled" error until the user did.
- **The credential check cannot be a real Firestore-enforced gate.** It's
  plain client-side JavaScript — Firestore security rules have no way to
  see what was typed into a page's form. For the Admin view to actually be
  able to load every account's data, `firestore.rules` had to grant `read`
  on every `users/{uid}` doc and every `workspaces/{code}/kv/{key}` doc to
  **any signed-in user**, not just workspace members or whoever knows the
  credentials. Concretely: any account that signs up for this app can, via
  direct Firestore SDK calls (bypassing the UI and the credential check
  entirely), read every other household's profile names, tracker logs, and
  Journal entries. `write` stays restricted to a user's own `users` doc and
  their own workspace's `kv` — a signed-in stranger can read but never
  modify another household's data. This was put to the user directly as a
  choice (open-to-any-signed-in-account vs. restricting real access to
  specific admin email(s) via Firestore rules), and the simpler,
  broader-access option was chosen explicitly. If stronger isolation is
  ever needed, the fix is to replace the blanket `read: if request.auth !=
  null` rules with an email allowlist check (`request.auth.token.email in
  [...]`) — this was scoped and explained at the time, not silently
  deferred.
- **Using a real, guessable admin account is a narrower version of the same
  trade-off, not a new one.** Unlike a made-up Anonymous session, the admin
  account here is a normal, permanent `users/{uid}` doc like any other — so
  anyone who signs in with `admin@sadhana.local` / `SriGuruBabaJi` (this exact,
  publicly-documented pair) gets the same session a legitimate admin would,
  indistinguishable from it at the Firestore level. This is no *broader*
  than the "any signed-in account can read everything" trade-off already
  approved above — it doesn't require even the trivial step of creating an
  account, since these exact credentials are known — so treat it with the
  same care: don't relax `firestore.rules` further without revisiting this
  with the user, and don't assume this specific account name is a secret.
- **`onAuthStateChanged` routes this account to Admin, not the normal
  flow.** It checks `user.email && user.email.toLowerCase() ===
  'admin@sadhana.local'` right at the top of the handler (before the normal
  `attachWorkspace()` / user-select-screen logic runs) and dispatches a
  `sadhana-admin-ready` CustomEvent instead — this account has no workspace
  or profile of its own and must never run through the normal signup/join
  flow. `js/app.js`'s `sadhana-admin-ready` listener sets a module-level
  `adminSessionActive` flag (rather than duplicating the email string from
  auth-ui.js) so `closeAdminScreen()` knows to fall back to the sign-in
  screen, not the user-select screen, when exiting.
- **Journal is included, on request.** The Journal module's own PIN lock
  (`journalPinHash`/`isJournalLocked()`) only gates the Journal *tab* inside
  a normal profile session — it does nothing to stop the Admin view from
  reading `data.journal` directly out of the fetched profile blob, exactly
  like every other field. This was an explicit choice (the alternative —
  excluding Journal from Admin — was offered and not taken) so don't treat
  it as a gap to "fix" later without checking with the user first.
- **Data flow, no new data source.** `adminListAllUsers()` (a `getDocs` over
  the whole `users` collection) and `adminGetWorkspaceKv(workspaceCode, key)`
  (a direct `getDoc` on an arbitrary workspace's `kv` doc, not scoped to
  `setActiveWorkspace()`) live in `js/cloud-store.js` next to the normal
  per-workspace helpers. `js/app.js`'s Admin code (`openAdminScreen()` and
  everything it calls) reuses the *exact* same
  `normalizeData()`/`defaultData()`/rendering helpers (`escapeHtml`,
  `fmtShort`, `categoryLabel`, `JOURNAL_RATING_KEYS`,
  `JOURNAL_ENTRY_FIELD_DEFS`, `journalEntryTypeMeta`) as the profile's own
  views — there is no separate Admin-specific data model, just a read-only
  render of the same profile blob any device would load for that profile.
- **Exiting Admin restores the right screen.** `closeAdminScreen()` checks
  `currentUser` (an in-app profile is selected → back to the app screen)
  before falling back to the user-select or auth screen (see above) — it
  doesn't assume which screen was open before Admin, since Admin can be
  entered from any of them (in practice, only the auth screen, since that's
  where the sign-in form lives).

## Kriya Practice module

The sixth tab (`#tab-kriya`, after Chakra Dharana in the tab bar) plays a
practice video on loop at a user-chosen speed, counting completed
playthroughs and total elapsed time from Start to Done. Lives in `js/app.js`
like every other tab, for the same "shares helpers with the rest of the
tracker" reasoning as the Journal and Routine modules.

- **Password-gated, but with a fixed, non-configurable password.** Unlike
  the Journal's PIN (per-profile, user-set, hashed in `data.settings`),
  Kriya Practice's password (`SriGuruBabaJi` — the same literal string
  used for the Admin account, since the user specified it directly for
  both) is a hardcoded constant checked with a plain string comparison, no
  hashing, nothing persisted. `kriyaUnlockedThisSession` is a module-level
  flag exactly like `journalUnlockedThisSession` — unlocked once per
  profile session, reset to `false` (alongside `stopKriyaPractice()`, so a
  running loop/timer doesn't keep going into the next profile) in both the
  `switchUserBtn` handler and `resetAppState()`. Same caveat as everywhere
  else this pattern appears: it's a UI convenience, not real security — the
  password and the video file are both fully visible to anyone who reads
  the page's source.
- **The video is a real committed file, not base64/Firestore.** Unlike
  `js/chakra-data.js` (a small HTML animation, cheap to inline as base64)
  or guru photos/japa backgrounds (small images, resized and stored inline
  per Firestore's 1 MiB document cap), a practice video is too large for
  either approach. It's committed directly as `assets/kriya-practice.mp4`
  and referenced by a normal `<video><source src="assets/...">` tag —
  served as a static file by whatever's hosting the app (GitHub Pages /
  Firebase Hosting), no Firestore or base64 involved. Replacing the video
  is just replacing that one file; there's no encoding step.
- **Deliberately excluded from the service worker's `PRECACHE_URLS`.**
  Precaching forces every fresh install to download it before the app is
  usable at all, and `cache.addAll()` fails the *entire* install if any one
  resource fails — an 8+ MB video is a much likelier failure point than the
  KB-sized app-shell files that list currently contains. Left out, it's
  still cached automatically after the first time someone opens the tab
  (same opportunistic same-origin caching the network-first fetch handler
  already gives every other asset — see "PWA app-shell caching"), just not
  force-downloaded on every install.
- **Looping is manual, not the `loop` HTML attribute.** `kriyaVideo`'s
  `ended` event handler increments the loop counter, resets
  `currentTime = 0`, and calls `.play()` again — deliberately not using
  `<video loop>`, because a looping video seeks back to the start
  *without* ever firing `ended`, which would make counting completed
  playthroughs impossible. `.play()` calls are wrapped in
  `.catch(()=>{})` since calling `.pause()` (e.g. clicking Done) while a
  `.play()` promise is still pending is a normal, harmless race that
  otherwise surfaces as an unhandled-rejection console warning.
- **Speed control is one slider, not preset buttons.** `#kriyaSpeedSlider`
  is a single `<input type="range" min="0.25" max="2" step="0.01">`
  (`accent-color:var(--gold)` to match the Journal rating sliders' style);
  its `input` handler sets `kriyaVideo.playbackRate` and updates the
  `x.xx×` label immediately, live, whether or not a practice session is
  currently running.
- **Start/Done owns its own tiny timer, not `runningTimers`.** This isn't
  logged against any profile data (`data.logs`, `data.japa`, etc.) the way
  Japa/Practice/custom-activity sessions are — it's a live, in-the-moment
  loop counter and stopwatch shown only for the current session and
  summarized once on Done, not a historical record. Because of that, it
  deliberately does **not** join the shared `runningTimers` map
  (`'<id>|<sandhya>'` / `'activity|<id>'` keyed) that Japa/Practice/custom
  activities use — `kriyaState` is a private `{startTime, loopCount,
  tickHandle}` object instead. If a future request asks for Kriya practice
  history/stats, that's a real design decision (a new logged data source,
  or folding it into `runningTimers` with a `finalizeAllRunning()` case) —
  don't bolt it on without revisiting this.

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
- `sadhana-admin-ready` — dispatched once `onAuthStateChanged` sees the
  dedicated Admin account (`admin@sadhana.local`) signed in. app.js listens and
  calls `openAdminScreen()`. Deliberately **not** folded into
  `sadhana-auth-ready`, since the Admin account has no workspace/profile
  and must never run through `initApp()`'s normal profile-loading path.

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

## PWA app-shell caching (service-worker.js)

`service-worker.js` caches the app shell (markup, styles, script, icons —
`PRECACHE_URLS`) so the app opens instantly and still works with no network.
Its `fetch` handler for same-origin GET requests is **network-first**: try
the network, cache the fresh response on success, and only fall back to the
cached copy when the network request actually fails (offline). This was
changed from an earlier cache-first strategy that returned the cached
response immediately and updated the cache in the background — which meant
after every deploy, a returning visitor's *first* reload after that deploy
still showed the previous version (the fetch that would've refreshed the
cache happened, but too late to affect the response already returned), and
only a *second* reload showed the change. That looked exactly like "the new
feature isn't there" even though the deploy had succeeded — don't reintroduce
cache-first for the app shell without solving that staleness problem some
other way (e.g. an explicit "update available" prompt).

`CACHE_VERSION` still exists so the `activate` handler can evict old cache
entries when bumped — bump it when you want a clean cutover (e.g. after
removing a precached file from `PRECACHE_URLS`), but it is no longer what
makes updates show up; the network-first fetch handler does that on its own.

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
10. Header stats strip: start a practice session (or a custom activity) and
    confirm "Practice today" ticks up live once a second while it's
    running, and both "Practice today"/"Japa today" reflect the correct
    totals after completing a session and after a page reload.
11. Journal — Today: fill in Sankalpa, Morning, Thoughts, a Positive and a
    Negative Pointer, Spiritual Notes, all 3 Gratitude fields, the Question
    of the Day answer, Evening Reflection, and drag all 5 rating sliders.
    Reload and confirm every field persisted. Confirm the same Question of
    the Day text appears again after reload (deterministic, not re-rolled).
    Use the ‹ › day navigation to move to yesterday/tomorrow and back
    without losing today's unsaved-but-already-committed fields.
12. Journal — structured reflections: add one entry of each type (Trigger →
    Reaction → Awareness, Experience, Seva, Guru Teaching, Task Note),
    confirm each renders with its icon/label and only its own fields, then
    delete one and confirm it's removed.
13. Journal — task-linked notes: click the 📝 icon next to a japa counter, a
    practice, a book, a learning track, a Today's Schedule/Routine activity
    row, and a Routine-tab block's expand panel. Each should switch to the
    Journal tab, land on Today, and open a pre-filled Task Note form naming
    that task.
14. Journal — Timeline: with entries on at least two different dates, open
    the Timeline view and confirm both days list with correct date labels,
    Japa/Practice summary chips (cross-referenced from `data.logs`, not the
    journal itself), and text snippets. Search for a word that only appears
    on one day and confirm the list filters to just that day; clicking a
    day jumps to Journal → Today for that date.
15. Journal — Growth & Goals: with ratings saved on a few different days,
    switch between the 7/30/90/365-day tabs and confirm the bars/averages
    update. Add a long-term goal, check it done, and delete it — confirm
    the checklist state persists across a reload. Confirm the Growth view
    shows plain averages/checkboxes only — no points, streaks, or
    leaderboard-style score.
16. Journal — PIN lock: set a PIN from the 🔒 icon, reload, and confirm the
    Journal tab shows the locked screen until the correct PIN is entered;
    an incorrect PIN shows an error and stays locked. Switch profiles (or
    sign out and back in) and confirm the Journal is locked again on
    return. Remove the PIN and confirm the tab opens directly.
17. Guru's Teachings is global: add a teaching from one account/workspace,
    then sign up as a brand-new account (a new workspace, not joined via
    invite code) and confirm the same teaching appears — this is the one
    piece of data that should NOT be workspace-scoped, unlike everything
    else.
18. Admin — gate: confirm there is no Admin button/icon anywhere in the UI.
    On the ordinary sign-in form, type email `admin@sadhana.local` with an
    incorrect password and confirm it's rejected exactly like any other
    failed sign-in ("Email or password is incorrect", no hint that this
    email is special). With `admin@sadhana.local` / `SriGuruBabaJi`, confirm
    the Admin dashboard opens directly — no separate sign-in step or second
    prompt — the *first* time this is tried against a fresh Firebase
    project (the account gets auto-created) and every time after that
    (normal sign-in). "Exit Admin" from this state returns to the sign-in
    screen (not an empty profile-picker screen). Confirm a normal account's
    email/password sign-in still works unaffected, and that a real user
    signing up with the email `admin@sadhana.local` themselves is not possible
    (it already exists once anyone has triggered the Admin path once).
19. Admin — dashboard: confirm every account that has ever signed up appears
    in the account list (not just the current one). Select an account and
    confirm its profiles list correctly, and that switching between
    profiles reloads that profile's own summary stats and full Journal
    content (including structured reflections). "Exit Admin" returns to
    whichever screen makes sense (the app screen if a profile was open
    before entering Admin, otherwise the user-select or auth screen).
20. Kriya Practice — gate: click the "Kriya Practice" tab (after Chakra
    Dharana) and confirm it's locked with an incorrect password rejected
    and a correct one (`SriGuruBabaJi`) unlocking it for the rest of the
    session (switching tabs away and back stays unlocked; switching
    profiles or signing out re-locks it).
21. Kriya Practice — playback: with the video unlocked, drag the speed
    slider and confirm the label updates live (e.g. `0.67x`) and the
    video's actual played-back speed changes to match, both before and
    during a practice session. Click Start: confirm the video plays from
    the beginning, the loop/elapsed stats row appears, and Start is
    replaced by Done. Let it complete at least one full playthrough and
    confirm the loop counter increments and the video restarts
    automatically rather than stopping. Click Done at any point and
    confirm the video stops, a summary shows the correct loop count and
    total elapsed time, and Start reappears for another session. Switch
    profiles mid-session and confirm the loop/timer stop rather than
    continuing into the next profile.

During development this was exercised with Playwright against a mocked
Firebase (Auth + Firestore) backend rather than a real project — see the
approach in prior session scratch work if you need to rebuild that harness;
it isn't checked into the repo.
