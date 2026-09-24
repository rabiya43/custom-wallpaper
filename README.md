# Live Wallpaper Dashboard

A customizable desktop-style dashboard that runs in the browser: clock, date, weather, calendar, reminders, alarm, and themeable wallpapers. Type a character, movie, or show, pick a wallpaper from the results, and the whole dashboard recolors to match it.

Plain HTML, CSS, and JavaScript, with a small Python (Flask) server for wallpaper search.

## Features

- **Wallpaper search.** Type something like `Elsa Frozen` or `Studio Ghibli` and get a grid of matching wallpapers to choose from. Filter by wide (fills the screen) or portrait (centered art). Pick one and it is downloaded at full size and saved in your browser.
- **Automatic theme.** Colors are extracted from the chosen image so widgets and text match it. Eight presets and custom color pickers are also available.
- **Upload or drag and drop** your own image (PNG, JPG, WebP, GIF).
- **Widgets you can move and resize.** Double-click a widget to edit it, drag it anywhere, resize from the corner, or press Esc to finish. Layout, sizes, and hidden widgets are saved. "Reset layout" restores the defaults.
- **Live weather** from [Open-Meteo](https://open-meteo.com/) (no API key). Uses your location, or falls back to Lahore.
- **Alarm.** Click the bell to pick a time, right-click to turn it off. Rings with a sound, an animation, and a browser notification.
- **Reminders.** Add, check off, and delete. Saved locally.
- **Calendar** with event dots from `.ics` files (optional).
- Works on small screens: widgets stack vertically.

## Run it

```bash
pip install -r requirements.txt
python server.py
```

Then open http://localhost:5000. On Windows you can double-click `start-calendar-sync.bat` instead.

The clock, weather, alarm, reminders, and uploads also work if you just open `index.html` directly. Wallpaper search needs the server.

## How the search works

`image_search.py` queries several free sources at once, with no API keys:

| Source | Used for |
|---|---|
| [Wallhaven](https://wallhaven.cc) | Main source: high-resolution wallpapers, safe-for-work only, anime and general categories |
| Wikipedia | Lead image of the matching article (official character art, posters) |
| Wikimedia Commons | Freely licensed images |
| Openverse | Creative Commons images |

Results are merged, then filtered and ranked:

- Multi-word searches first ask Wallhaven for images matching **every** word, and only fall back to a looser search if that returns too few.
- Sources without their own ranking must actually mention your keywords, so unrelated images are dropped.
- Logos, icons, banners, and tiny images are removed. Photos of costumes, toys, and events rank below real artwork.
- Higher resolution and wallpaper-shaped images score higher.
- Duplicates are removed, and a source that is down or blocked on your network is skipped without breaking the search.

Picked images are fetched through the local server, which only downloads public `http(s)` images and refuses local and private addresses.

Images belong to their creators and are meant for personal use.

## Optional: calendar events and reminder backup

Put `.ics` files (exported from Outlook, Google Calendar, etc.) in a `calendars/` folder next to `server.py`, or set the `ICS_DIR` environment variable to another folder. Days with events show a dot, and hovering shows the titles. Recurring events are not expanded.

Reminders are also mirrored to `reminders.json`, which is used to restore them if the browser data is cleared.

## Tech

HTML, CSS, vanilla JavaScript, Flask, Open-Meteo, Wallhaven, Wikipedia and Openverse APIs, Font Awesome.
