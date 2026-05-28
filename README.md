# Gym Warden PWA v0.1

A no-subscription Overlord-lite workout accountability web app.

## What it does

- Tracks required lifting days.
- Requires start proof photo before a workout can begin.
- Requires a timer, at least 3 checked movements, and end proof before completion.
- Supports full session mode and emergency-save mode.
- Logs valid exceptions separately from skipped workouts.
- Calculates weekly adherence and accountability debt.
- Generates accountability messages and weekly reports you can copy/share.
- Stores data locally in your browser. Export/import is included for backup.

## Default schedule

- Monday: Glutes
- Tuesday: Shoulders & Triceps
- Thursday: Glutes & Hamstrings
- Saturday: Back & Rear Delts

You can change the schedule in Settings.

## Deploy with no MacBook

### Option A: Netlify drag-and-drop

1. Unzip this folder.
2. Go to Netlify.
3. Drag the folder into Netlify's deploy area.
4. Open the deployed URL on iPhone Safari.
5. Share -> Add to Home Screen.

### Option B: GitHub Pages

1. Create a new GitHub repo.
2. Upload all files in this folder.
3. Go to repo Settings -> Pages.
4. Publish from the main branch/root.
5. Open the Pages URL on iPhone Safari.
6. Share -> Add to Home Screen.

### Option C: Cloudflare Pages

1. Create a Cloudflare Pages project.
2. Upload this static folder directly or connect a GitHub repo.
3. Open the deployed URL on iPhone Safari.
4. Share -> Add to Home Screen.

## Limitations

- No native iOS app blocking.
- No automatic SMS/calls.
- No Apple HealthKit integration.
- No cross-device sync unless you add a backend.

This v0.1 is intentionally local-only and free to host.
