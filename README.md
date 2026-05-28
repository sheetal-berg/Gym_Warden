# Gym Warden PWA v0.2

A local-only iPhone-installable accountability PWA for flexible weekly weight-training adherence.

## What changed in v0.2

- Removed fixed workout schedule.
- Removed exercise checklist.
- Removed workout names/movements.
- Removed workout timer.
- Removed Watch Mode language.
- Added black cat with yellow eyes icon/mascot.
- Default target is now 4 flexible weight-training days per week.
- Default stake/debt is now $50 per missed workout.
- Added week-over-week adherence trend.
- Added health/sick week controls:
  - reduce this week's target
  - skip entire week
  - clear adjustment
- Added accountability contact field and SMS helper.

## Important SMS limitation

This static GitHub Pages version cannot automatically send SMS messages in the background. It can copy the accountability text and open Messages to the first saved phone number. You still paste/send manually.

Automatic SMS requires a backend plus an SMS provider such as Twilio, Vonage, AWS SNS, etc.

## Deploy

Upload all files to the root of the GitHub repository used by GitHub Pages.

Expected structure:

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

Then open the GitHub Pages URL on iPhone Safari and use Share → Add to Home Screen.

## Privacy

Data is stored in the browser local storage on the device where the app is used. The public GitHub repo contains only app code, not your workout logs or phone numbers.
