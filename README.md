# Live Wallpaper Dashboard

A customizable desktop-style dashboard that runs in the browser: clock, date, weather, calendar, reminders, alarm, and themeable wallpapers. Plain HTML, CSS, and JavaScript, with an optional Python helper for calendar events.

## Features

- **Widgets you can move and resize.** Double-click a widget to edit it, drag it anywhere, resize from the corner, or press Esc to finish. Layout, sizes, and hidden widgets are saved in the browser. "Reset layout" restores the defaults.
- **Live weather.** Temperature, humidity, and conditions from [Open-Meteo](https://open-meteo.com/) (no API key). Uses your location, or falls back to Lahore.
- **Alarm.** Click the bell to pick a time, right-click to turn it off. It rings with a sound, an animation, and a browser notification.
- **Reminders.** Add, check off, and delete. Saved locally.
- **Themes.** Eight character palettes, custom gradient colors, or type a name to generate a palette.
- **Wallpaper.** Upload or drag and drop any image (PNG, JPG, WebP, GIF). Stored in IndexedDB, switchable between centered art and full-screen cover.
- **Battery status** where the browser supports it.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
```

Then visit http://localhost:8000.

## Optional: calendar events and reminder backup

The dashboard works fully offline. To show calendar events as dots on the calendar and mirror reminders to `reminders.json`, run the local helper:

```bash
pip install -r requirements.txt
python calendar_sync.py
```

On Windows you can double-click `start-calendar-sync.bat`.

Put `.ics` files (exported from Outlook, Google Calendar, etc.) in a `calendars/` folder next to the script, or set the `ICS_DIR` environment variable to another folder. Recurring events are not expanded.

## Tech

HTML, CSS, vanilla JavaScript, Flask (optional helper), Open-Meteo API, Font Awesome.
