# Live Wallpaper Dashboard

A live desktop wallpaper for Windows. It sits behind your desktop icons and shows a clock, date, weather, calendar, reminders and an alarm on top of any image you like. Type a character, movie or show to find a wallpaper, or browse Google Images and right-click any picture to use it. The whole dashboard recolors to match.

## Install

Download the latest `Live-Wallpaper-Dashboard-Setup-<version>.exe` from the [Releases](https://github.com/rabiya43/custom-wallpaper/releases) page and run it.

**Updates install themselves** (from version 1.2.0 on). The app checks for a new release shortly after it starts and every few hours, downloads it in the background, and installs it the next time the app restarts. To update right away, use **Restart to update** in the tray menu; **Check for updates** checks now. Your wallpaper, alarms, calendar sign-in and layout are kept.

Windows may show "Windows protected your PC" because the installer isn't code-signed. Click **More info**, then **Run anyway**.

Requires Windows 10 or 11 (64-bit).

## Using it

After installing, the dashboard becomes your wallpaper and an icon appears in the system tray (bottom-right, near the clock).

- **Customize wallpaper** (tray menu, or double-click the tray icon) opens the editor on top of everything:
  - **Find a wallpaper:** type something like `Elsa Frozen` and pick from the results. Filter by wide or portrait, and use **Load more** for more.
  - **Search the whole web:** opens a browser window with Google, Bing or DuckDuckGo Images. Open any image, then **right-click → Set as wallpaper**.
  - **Built-in wallpapers:** six designs (green hills, sunset, ocean, aurora, starry night, blossom) drawn at your screen's exact resolution, so they're always sharp.
  - **Upload or drag in** your own image.
  - **Fill screen or Centered:** choose it next to your current wallpaper, or with **Show as** when picking a search result. Wide images fill the screen and tall ones are centered by default.
  - **Move and resize widgets:** double-click a widget, drag it, resize from the corner, press Esc to finish. "Reset layout" restores the defaults.
  - Add **reminders**.
  - Press **Done** to go back to your desktop.
- **Alarms...** (tray menu, the bell widget, or the Alarms button in the editor):
  - Add as many alarms as you like, each with a time, label and repeat days (for example weekdays only), or ring once on a chosen **date** (tomorrow, next week, any day).
  - **Type when it should ring**, like in Outlook: `tomorrow 7am`, `fri 6:30pm`, `in 20 min`, `25/12 8pm`, `every weekday 7:30`, `mondays 8pm`. The app shows how it understood it and fills in the boxes. Ambiguous dates like `5/6` follow your Windows date order.
  - Pick a built-in tone (Chime, Beep, Digital clock, Gentle) or **your own sound** (MP3, WAV, OGG, M4A, AAC, FLAC), and preview it.
  - When an alarm goes off, a window pops up on top of everything and the sound fades in until you press **Snooze** (5 minutes) or **Dismiss**.
  - The bell widget and the tray tooltip show the next alarm.
  - Alarms ring while the app is running, even with the editor closed. Like most alarm apps, they can't wake a PC that is asleep or shut down.
- **Calendars...** shows your events on the wallpaper: dots on the calendar and an **Upcoming** list of today's and the next events. See [Connecting your calendar](#connecting-your-calendar).
  - **Sign in with Google** to **add, edit and delete** events from the app. Changes appear in Google Calendar on all your devices.
  - Click a **date** on the calendar to see that day and add an event. Click an event in **Upcoming** to edit it.
  - Type when an event happens, like `tomorrow 3-4:30pm`, `fri 10am` or `25/12 all day`.
- **Pause live wallpaper** brings back your normal Windows wallpaper until you resume.
- **Start with Windows** launches it automatically when you sign in.
- **Quit** closes the app and restores your normal wallpaper.

The editor stops at the taskbar, so the taskbar stays usable while you customize. Colors are picked from the wallpaper automatically.

## Connecting your calendar

**Google Calendar (editable):** open **Calendars** and press **Sign in with Google**. Google's own sign-in page opens in your browser; the app never sees your password. Your sign-in is kept encrypted by Windows and you can sign out any time, which also removes the app's access.

**Other calendars (read-only):** paste a private iCal link under **Other calendars**. The app checks the link, names it after the calendar, and refreshes it every 10 minutes. These can be shown but not edited.

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

## Setting up Google sign-in (for whoever builds the app)

Google needs to know which app is asking for calendar access. This is a one-time setup in your Google account; it's free.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project (for example "Live Wallpaper Dashboard").
2. **APIs & Services → Library**: search for **Google Calendar API** and press **Enable**.
3. **APIs & Services → OAuth consent screen** (called **Google Auth Platform** in newer consoles):
   - User type **External**, app name "Live Wallpaper Dashboard", your email as support and developer contact.
   - **Scopes / Data access**: add `.../auth/calendar.readonly` and `.../auth/calendar.events`.
   - **Test users / Audience**: add the Google accounts that will use the app (up to 100 while the app is in testing).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**, application type **Desktop app**. Download the JSON.
5. Save that file as `src/main/google-oauth.json` (see `google-oauth.example.json`), then `npm start` or `npm run dist`. The file is left out of git on purpose.

While the app is in "Testing", Google shows a "Google hasn't verified this app" screen during sign-in (click **Continue**), and only the test users you listed can sign in. To let anyone sign in, submit the app for verification under the consent screen settings; Google reviews apps that use calendar scopes, which can take a few weeks.

## Releasing a new version

1. Change `"version"` in `package.json` (for example `1.2.1`) and commit.
2. Tag and push: `git tag v1.2.1` then `git push origin v1.2.1`.
3. GitHub Actions (`.github/workflows/release.yml`) builds the installer on Windows and publishes the release. Installed copies pick it up automatically.

For Google sign-in in these builds, add a repository secret named `GOOGLE_OAUTH_JSON` (Settings → Secrets and variables → Actions) containing the whole `google-oauth.json` file.

**Releasing by hand instead:** run `npm run dist`, then attach **all three** files from `dist/` to the GitHub release: `Live-Wallpaper-Dashboard-Setup-<version>.exe`, its `.exe.blockmap`, and `latest.yml`. The updater reads `latest.yml` to find new versions, and the blockmap lets it download only what changed.

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
    google.js        Google sign-in (PKCE, encrypted token) and Calendar read/write
    when.js          understands typed dates and times ("tomorrow 7am", "every weekday")
    updater.js       automatic updates from GitHub Releases
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

Electron, JavaScript, HTML, CSS, koffi (Win32 calls), Google Calendar API, chrono-node (typed dates), node-ical, Open-Meteo (weather), ipwho.is (approximate location), Wallhaven, Wikipedia and Openverse APIs, Font Awesome.
