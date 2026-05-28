# Gym Warden PWA v0.3

Strict, flexible weekly weight-training accountability app.

## v0.3 changes

- Removed start proof + finish gate.
- Removed timer.
- Removed fixed workout list / workout schedule.
- Uses one action: **Log completed workout**.
- Week starts on Sunday by default.
- Default target: 4 completed weight-training days per week.
- Default debt: $100 per missed workout.
- Fixed debt bug so old/past weeks are not retroactively counted.
- Added backfill logging by date for workouts already completed this week.
- Added proof types:
  - gym/equipment photo
  - Apple Health / Fitness screenshot or exercise minutes
  - workout app screenshot
  - manual/no-photo attestation
- Makes validation limits explicit: the app does not auto-validate photos.
- Keeps health/sick week controls.
- Keeps weekly adherence trend.

## Deployment

Upload the files in this folder to the root of the GitHub repo, replacing the existing files.

Required structure:

```text
index.html
styles.css
app.js
manifest.webmanifest
service-worker.js
README.md
icons/icon-192.png
icons/icon-512.png
```

Then wait for GitHub Pages to refresh. If the old app persists on iPhone, delete the Home Screen icon, clear Safari website data for the site, then re-add the app from Safari.

## Privacy

All data is stored locally in the browser by default. Phone numbers and proof images are not committed to GitHub.
