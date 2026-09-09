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
