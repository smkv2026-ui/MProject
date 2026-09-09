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
js/app.js                The original tracker UI logic (profiles, japa,
                         practice, reading, learning, calendar, Guru's
                         Teachings, the fullscreen japa counter and the
                         Chakra Dharana iframe), adapted to call
                         cloud-store.js instead of window.storage.
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
- **Don't touch the UI/CSS** unless a change is explicitly requested — the
  visual design, class names, and DOM ids are preserved verbatim from the
  original file so behavior stays exactly the same. Most `id`/`class`
  attributes are relied on by `js/app.js`'s `getElementById`/`querySelector`
  calls; renaming one means updating the other.
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
