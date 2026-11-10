# ryd-map

Expo (SDK 58) app for student life in Ryd, Linköping. Runs in **Expo Go**.

| Tab | What it does |
|---|---|
| 🗺️ Map | The original Ryd Walker: nearby amenities, walking routes, street-photo walk-through. Home is now saved; upcoming events show as 🎉 pins. |
| 🌸 Cycle | Period tracker (Flo-style): today ring, logging, predictions, fertile window, symptoms & mood, insights, reminders, optional Face ID lock, and food ideas for the current phase with the nearest places. All data stays on the phone. |
| 📚 Study | Courses, deadlines & exams with reminders, TimeEdit timetable (paste the .ics link), next-7-days agenda, Pomodoro timer. |
| 🎉 Events | Apple-Calendar-style month view (or list) of LiU / LinTek / M-sektionen / FR Ryd / Herrgården / Linköping city events from a daily feed + events you add. Reminders the evening before (1 h before for ⭐), and a 🆕 notification when new events appear. |

## Run

```bash
npm install          # new packages were added
npx expo start --clear
```

## Code layout

- `src/app/` — screens (Expo Router). `(tabs)/index.js` is the map.
- `src/lib/` — logic without UI: `cycle.js` (predictions), `food.js`, `study.js`, `events.js`, `ical.js`, `geo.js` (map data), `notify.js` (all reminders), `storage.js`.
- `src/components/` — shared UI and per-tab pieces.

## Events feed (one-time setup)

Most clubs post on Instagram/Facebook with no feed, so events come from two places:

1. `data/event-sources.json` — feeds the collector tries (iCal, WordPress events API, or pages with schema.org events). Ones that fail are listed under `sources` in `events.json`.
2. `data/events-manual.json` — events typed in by hand.

`scripts/collect-events.js` merges them into `events.json`. To run it automatically every morning:

1. Push this folder to a **public** GitHub repo (the workflow is in `.github/workflows/events.yml`).
2. GitHub → repo → Actions → "Collect student events" → **Run workflow** once.
3. Copy the raw link of `events.json` (`https://raw.githubusercontent.com/<user>/<repo>/main/events.json`) into `EVENTS_FEED_URL` in `src/lib/events.js`, or paste it in the app under Events → ⚙️.

Adding an event to `data/events-manual.json` and pushing also triggers a refresh.

**Linköping city events (optional):** get a free key at https://developer.ticketmaster.com, then add it as a repo secret named `TICKETMASTER_API_KEY` (GitHub → Settings → Secrets and variables → Actions). The collector then adds concerts, shows and sport within 20 km of Linköping as 🏙️ events. Locally: `TICKETMASTER_API_KEY=… node scripts/collect-events.js`.

**New-event notifications** need the feed link from step 3 — the app compares the feed with what it has already seen when it opens and every few hours in the background (iOS decides exactly when).
