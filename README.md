# Live Wallpaper Dashboard

A live desktop wallpaper for Windows. It sits behind your desktop icons and shows a clock, date, weather, calendar, reminders and an alarm on top of any image you like. Type a character, movie or show to find a wallpaper, or browse Google Images and right-click any picture to use it. The whole dashboard recolors to match.

## Install

Download the latest `Live Wallpaper Dashboard Setup.exe` from the [Releases](https://github.com/rabiya43/custom-wallpaper/releases) page and run it.

Windows may show "Windows protected your PC" because the installer isn't code-signed. Click **More info**, then **Run anyway**.

Requires Windows 10 or 11 (64-bit).

## Using it

After installing, the dashboard becomes your wallpaper and an icon appears in the system tray (bottom-right, near the clock).

- **Customize wallpaper** (tray menu, or double-click the tray icon) opens the editor on top of everything:
  - **Find a wallpaper:** type something like `Elsa Frozen` and pick from the results. Filter by wide or portrait, and use **Load more** for more.
  - **Search the whole web:** opens a browser window with Google, Bing or DuckDuckGo Images. Open any image, then **right-click → Set as wallpaper**.
  - **Upload or drag in** your own image.
  - **Move and resize widgets:** double-click a widget, drag it, resize from the corner, press Esc to finish. "Reset layout" restores the defaults.
  - Add **reminders**.
  - Press **Done** to go back to your desktop.
- **Alarms...** (tray menu, the bell widget, or the Alarms button in the editor):
  - Add as many alarms as you like, each with a time, label and repeat days (for example weekdays only), or ring once.
  - Pick a built-in tone (Chime, Beep, Digital clock, Gentle) or **your own sound** (MP3, WAV, OGG, M4A, AAC, FLAC), and preview it.
  - When an alarm goes off, a window pops up on top of everything and the sound fades in until you press **Snooze** (5 minutes) or **Dismiss**.
  - The bell widget and the tray tooltip show the next alarm.
  - Alarms ring while the app is running, even with the editor closed. Like most alarm apps, they can't wake a PC that is asleep or shut down.
- **Calendars...** shows your events on the wallpaper: dots on the calendar and an **Upcoming** list of today's and the next events. Repeating events, all-day events and time zones are handled. See [Connecting your calendar](#connecting-your-calendar).
- **Pause live wallpaper** brings back your normal Windows wallpaper until you resume.
- **Start with Windows** launches it automatically when you sign in.
- **Quit** closes the app and restores your normal wallpaper.

Colors are picked from the image automatically, or choose a preset or your own colors in the editor.

## Connecting your calendar

Paste your calendar's private iCal link into **Calendars → Connect a calendar**. The app checks the link, names it after the calendar, and refreshes it every 10 minutes.

- **Google Calendar** (on a computer): Settings → click your calendar under "Settings for my calendars" → *Integrate calendar* → copy **Secret address in iCal format**.
- **Outlook / Microsoft 365**: Settings → Calendar → *Shared calendars* → under "Publish a calendar", pick your calendar and *Can view all details* → Publish → copy the **ICS** link.
- **Apple iCloud**: share the calendar as a *Public Calendar* and copy the link (`webcal://` links work).

Keep the link private: anyone who has it can see your events. You can connect up to 10 calendars, each with its own color. A folder of `.ics` files also works.

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
    main.js          windows, tray, web search window, alarm window
    alarms.js        alarm schedule, snooze, custom sounds
    calendars.js     calendar links and .ics files, repeating events
    net-safety.js    only public addresses are downloaded
    desktop-host.js  places the wallpaper behind the desktop icons (Win32 via koffi)
    api.js           app:// scheme: serves the dashboard and its /api/* endpoints
    image-search.js  multi-source wallpaper search and ranking
    config.js        settings file
    preload.js       bridge between pages and the main process
  renderer/
    index.html, script.js, style.css   the dashboard (wallpaper and editor modes)
    web.html, web.js                   toolbar of the web search window
    alarm.html, alarm.js, sounds.js    ringing window and alarm tones
build/icon.png
```

## Tech

Electron, JavaScript, HTML, CSS, koffi (Win32 calls), Open-Meteo (weather), ipwho.is (approximate location), Wallhaven, Wikipedia and Openverse APIs, Font Awesome.
