# Sādhanā — Practice Tracker

A daily sādhanā (spiritual practice) tracker — japa counters, timed
practice, a reading log, learning milestones, a shared Guru's Teachings
library, and a calendar/stats view — packaged as an installable, responsive
PWA. Multiple people can share one household's data across all of their
devices by signing into the same "shared space".

No build step: it's plain HTML/CSS/JS loaded as ES modules, backed by
[Firebase](https://firebase.google.com) Authentication and Firestore.

## 1. Create your Firebase project (one-time)

You need your own Firebase project — Claude Code cannot create cloud
accounts or provision infrastructure for you.

1. Go to the [Firebase console](https://console.firebase.google.com/) and
   click **Add project** (the free Spark plan is enough to start).
2. Once created, click the **`</>`** (web) icon on the project overview page
   to register a web app. Give it any nickname; you don't need Firebase
   Hosting checked yet (you can add it later).
3. Firebase will show you a `firebaseConfig` object. Copy it.
4. Open `js/firebase-config.js` in this repo and replace the placeholder
   values with the real ones from step 3. This file is safe to commit — a
   Firebase web config is a public client identifier, not a secret; actual
   security comes from the steps below.

## 2. Enable sign-in methods

In the Firebase console: **Build ▸ Authentication ▸ Sign-in method**, enable:

- **Email/Password**
- **Google**

(You can enable only one if you prefer — the corresponding UI on the sign-in
screen will just fail gracefully if you skip a provider, but enabling both
matches what's built.)

## 3. Create the Firestore database

**Build ▸ Firestore Database ▸ Create database**. Choose a location close to
your users, and start in **production mode** (the security rules in this
repo — `firestore.rules` — are the real access control, not "test mode").

## 4. Deploy the security rules

Using the [Firebase CLI](https://firebase.google.com/docs/cli):

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # pick your project, give it an alias
firebase deploy --only firestore:rules
```

Without this step, Firestore will reject every read/write from the app.

## 5. Run it locally

Because the app uses ES modules and a service worker, it must be served
over HTTP (not opened as a `file://` path). Any static file server works:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open the printed local URL. Sign up for an account — you'll be asked
to either start a new shared space or join one with an invite code.

## 6. Deploy it somewhere your household can reach

**Option A — Firebase Hosting** (simplest, same project as your data):

```bash
firebase deploy --only hosting
```

**Option B — any static host** (GitHub Pages, Netlify, Vercel, etc.): just
publish the repository's files as-is; there's nothing to build. Make sure
the host serves `service-worker.js` from the site root (not a subpath) so
its scope covers the whole app.

## Using the app

- **Sign up** → choose **Start a new shared space** (you'll get an invite
  code) or **Join an existing shared space** (enter a code someone gave
  you).
- The **⚙ account icon** (top-right, once signed in) shows your invite code
  and lets you copy it to share with family, switch to a different shared
  space, or sign out.
- Everything else — profiles, Japa/Practice/Reading/Learning, the Calendar,
  Guru's Teachings, the fullscreen japa counter, Chakra Dharana, theme
  toggle, and JSON export/import — works exactly as it did before, except
  it now actually persists, and persists to everyone in your shared space.
- **Routine Scheduler** (the **Routine** tab) lets you add your own daily
  activities beyond the four mandatory practices — set a time, duration,
  and repeat pattern, then drag them around a visual daily timeline or
  browse a weekly/overview view. Scheduled activities also show up in
  Today's Schedule, below the mandatory sections.
- **Calendar → Daily/Weekly/Monthly/Yearly** gives a reporting view of
  what's done, overdue, or pending, without changing any of the original
  month-view/search/filter tools further down the same tab.
- **Reminders** (🔔 icon next to any task) send a browser notification once
  a day at a time you set. These are best-effort, browser-based reminders,
  not guaranteed OS alarms — they work reliably while you've used the
  app/browser recently on that device, but a browser that's been fully
  closed for a long time (especially on iOS, unless the app is added to
  your Home Screen) may not deliver them. The first reminder you set will
  prompt for notification permission.
- A one-line strip above the header always shows today's total **Practice**
  and **Japa** time, updating live while a session is running.
- **Journal** (the **Journal** tab) is a structured spiritual journal, not
  a plain diary: a daily Sankalpa/Morning/Evening flow, Thoughts/Pointers/
  Spiritual Notes/Gratitude, a daily self-inquiry question, structured
  reflections (Trigger→Reaction→Awareness, Experiences, Seva, Guru
  Teachings, and task-linked notes — tap the 📝 icon next to any japa
  counter, practice, book, learning track, or Routine activity to add a
  note for that item), a trend-only Growth view of self-ratings over time
  plus a long-term goals checklist, a searchable Timeline of past entries,
  and an optional PIN lock (🔒 icon) that gates just the Journal tab on a
  shared device.

## Project layout

See `CLAUDE.md` for the full architecture reference (file-by-file
breakdown, data model, event contract, and conventions to preserve when
making changes). See `BRD.md` for the requirements this conversion was
built against.

## Troubleshooting

- **"Missing or insufficient permissions" in the console** — you likely
  skipped step 4 (deploying `firestore.rules`), or `js/firebase-config.js`
  still has placeholder values pointing at no real project.
- **Google sign-in popup closes immediately / does nothing** — check that
  Google is enabled as a sign-in provider (step 2) and that you're serving
  the app over `http://localhost` or `https://`, not `file://`.
- **Nothing loads offline on first try** — the service worker only caches
  the app shell after your *first* successful online visit; reload once
  online, then try offline.
