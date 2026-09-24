# Live Wallpaper Dashboard

A live desktop wallpaper for Windows. It sits behind your desktop icons and shows a clock, date, weather, calendar, reminders and an alarm on top of any image you like. Type a character, movie or show to find a wallpaper, or browse Google Images and right-click any picture to use it. The whole dashboard recolors to match.

## Install

Download `Live Wallpaper Dashboard Setup.exe` from the [Releases](https://github.com/rabiya43/custom-wallpaper/releases) page and run it.

Windows may show "Windows protected your PC" because the installer isn't code-signed. Click **More info**, then **Run anyway**.

Requires Windows 10 or 11 (64-bit).

## Using it

After installing, the dashboard becomes your wallpaper and an icon appears in the system tray (bottom-right, near the clock).

- **Customize wallpaper** (tray menu, or double-click the tray icon) opens the editor on top of everything:
  - **Find a wallpaper:** type something like `Elsa Frozen` and pick from the results. Filter by wide or portrait, and use **Load more** for more.
  - **Search the whole web:** opens a browser window with Google, Bing or DuckDuckGo Images. Open any image, then **right-click → Set as wallpaper**.
  - **Upload or drag in** your own image.
  - **Move and resize widgets:** double-click a widget, drag it, resize from the corner, press Esc to finish. "Reset layout" restores the defaults.
  - Set an **alarm** (click the bell; right-click to turn it off) and add **reminders**.
  - Press **Done** to go back to your desktop.
- **Pause live wallpaper** brings back your normal Windows wallpaper until you resume.
- **Start with Windows** launches it automatically when you sign in.
- **Calendar folder** shows events from `.ics` files (exported from Outlook, Google Calendar, etc.) as dots on the calendar.
- **Quit** closes the app and restores your normal wallpaper.

Colors are picked from the image automatically, or choose a preset or your own colors in the editor.

## How the wallpaper search works

The quick picks come from several free sources at once, with no API keys:

| Source | Used for |
|---|---|
| [Wallhaven](https://wallhaven.cc) | Main source: high-resolution wallpapers, safe-for-work only |
| Wikipedia | Lead image of the matching article (official art, posters) |
| Wikimedia Commons | Freely licensed images |
| Openverse | Creative Commons images |

- Multi-word searches first look for images matching **every** word.
- Wallhaven images are ranked by their character tags, so `Elsa` puts pictures of Elsa alone above group shots.
- Logos, icons, banners and small images are removed; higher-resolution, wallpaper-shaped images rank higher.
- A source that is down or blocked on your network is skipped without breaking the search. Requests stay under Wallhaven's rate limit.

For anything the quick picks don't cover, **Search the whole web** gives you every image Google, Bing or DuckDuckGo can find. Images are downloaded only from public addresses.

Images belong to their creators and are meant for personal use.

## How it sits behind the icons

Explorer draws the desktop icons in a window called `SHELLDLL_DefView`. The app asks Explorer to create a `WorkerW` layer between the icons and the static wallpaper, then places its own window there (on Windows 11 24H2 and later, it is placed inside `Progman`, just below the icons). If Explorer restarts, the app re-attaches automatically. On quit, it tells Windows to repaint the normal wallpaper.

## Develop

Requires [Node.js](https://nodejs.org) 20 or later.

```bash
npm install
npm start        # run the app
npm run dist     # build the installer into dist/
```

Run `electron . --quit` (or the installed app with `--quit`) to close a running copy.

```
src/
  main/
    main.js          windows, tray, web search window
    desktop-host.js  places the wallpaper behind the desktop icons (Win32 via koffi)
    api.js           app:// scheme: serves the dashboard and its /api/* endpoints
    image-search.js  multi-source wallpaper search and ranking
    config.js        settings file
    preload.js       bridge between pages and the main process
  renderer/
    index.html, script.js, style.css   the dashboard (wallpaper and editor modes)
    web.html, web.js                   toolbar of the web search window
build/icon.png
```

## Tech

Electron, JavaScript, HTML, CSS, koffi (Win32 calls), Open-Meteo (weather), ipwho.is (approximate location), Wallhaven, Wikipedia and Openverse APIs, Font Awesome.
