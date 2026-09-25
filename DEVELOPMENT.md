# Development

Notes for building, releasing and changing Live Wallpaper Dashboard. For how to use the app, see the [README](README.md).

## Run and build

Requires [Node.js](https://nodejs.org) 20 or later, on Windows 10 or 11.

```bash
npm install
npm start        # run the app
npm run dist     # build the installer into dist/
```

Run `electron . --quit` (or the installed app with `--quit`) to close a running copy.

## Setting up Google sign-in

Google needs to know which app is asking for calendar access. This is a one-time, free setup in a Google account.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create or pick a project. Billing is not needed; ignore any prompts to enable it.
2. Enable the [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com).
3. [Google Auth Platform → Overview](https://console.cloud.google.com/auth/overview): app name "Live Wallpaper Dashboard", audience **External**, your email as support and contact.
4. [Data access](https://console.cloud.google.com/auth/scopes): add these scopes (paste them under "Manually add scopes" if the list is empty), then **Save**:
   ```
   https://www.googleapis.com/auth/calendar.readonly
   https://www.googleapis.com/auth/calendar.events
   ```
5. [Audience](https://console.cloud.google.com/auth/audience): add the Google accounts that will use the app as **test users** (up to 100 while the app is in testing).
6. [Clients](https://console.cloud.google.com/auth/clients): **Create client**, type **Desktop app**, then download the JSON.
7. Save it as `src/main/google-oauth.json` (see `google-oauth.example.json`). Windows hides file extensions, so check it isn't saved as `google-oauth.json.json`. The file is ignored by git on purpose.

While the app is in testing:
- Only listed test users can sign in; others see "access blocked".
- Everyone sees "Google hasn't verified this app" once (click **Continue**).
- Google expires sign-ins after 7 days, so users are asked to sign in again weekly.

Submitting the app for verification (Audience → Publish app, then the verification steps) removes all three. Google reviews apps that use calendar scopes, which can take a few weeks and needs a privacy policy page.

## Releasing a new version

Installed copies (1.2.0 and later) update themselves from GitHub Releases, so every release reaches users automatically.

**Automatically with GitHub Actions**

1. Once: add a repository secret named `GOOGLE_OAUTH_JSON` (Settings → Secrets and variables → Actions) containing the whole `google-oauth.json` file.
2. Change `"version"` in `package.json` (for example `1.2.1`) and commit.
3. `git tag v1.2.1` then `git push origin v1.2.1`.

`.github/workflows/release.yml` checks the tag matches `package.json`, builds the installer on Windows and publishes the release.

**By hand**

Run `npm run dist`, then attach **all three** files from `dist/` to a new GitHub release tagged `v<version>`:

- `Live-Wallpaper-Dashboard-Setup-<version>.exe`
- `Live-Wallpaper-Dashboard-Setup-<version>.exe.blockmap`
- `latest.yml`

The updater reads `latest.yml` to find new versions, and the blockmap lets it download only what changed. Once the new version has downloaded, the app shows an update card (`src/renderer/update.html`) with the release description: write it as a short bullet list of what's new, because those bullets are what people see. The installer's name has no spaces so it still matches `latest.yml` after uploading (GitHub turns spaces into dots).

## Website

`site/` is the app's website (home page and privacy policy), plain HTML and CSS. It's deployed on Vercel as its own project with **Root Directory** set to `site`, so every push to `main` updates it. The privacy policy page is the one linked from Google's consent screen, so keep it accurate when the app starts using data differently.

To refresh the screenshots in `site/images/`, take them from a throwaway profile with sample data, never from a real calendar.

## How it works

**Behind the icons.** Explorer draws the desktop icons in a window called `SHELLDLL_DefView`. The app asks Explorer to create a `WorkerW` layer between the icons and the static wallpaper, then places its own window there. On Windows 11 24H2 and later the window goes inside `Progman`, just below the icons. If Explorer restarts, the app re-attaches. On quit it asks Windows to repaint the normal wallpaper. See `src/main/desktop-host.js`.

**Windows.** The same page (`src/renderer/index.html`) runs in three modes: `wallpaper` (behind the icons), `editor` (on top, above the taskbar) and `popup` (one panel over the desktop). Both are served from a custom `app://` scheme so they share storage. The editor fills the work area and the wallpaper keeps widgets out of the taskbar's area, so positions match exactly.

**Desktop clicks.** The wallpaper window ignores the mouse, so Explorer keeps every click. `desktop-input.js` registers for Raw Input with `RIDEV_INPUTSINK`, which sends the wallpaper window a copy of mouse input in the background (no hook, nothing is blocked). A click is passed to the page only if the window under the cursor is the desktop (`WindowFromPoint`), no icon is hot when the button goes down (`LVM_GETHOTITEM`), the mouse barely moved, and no icon is selected once Explorer has handled it (`LVM_GETSELECTEDCOUNT`). The page finds the widget under the point and acts. Anything that needs typing opens a `popup` window: a transparent window over the work area that shows only that panel (or the reminders box in its usual place), takes the foreground with `AttachThreadInput`, and hides when the panel closes or it loses focus. It's created on first use and reused. The tray's **Clickable widgets on the desktop** turns it off.

**Wallpaper search** (`src/main/image-search.js`) queries several free sources in parallel with no API keys:

| Source | Used for |
|---|---|
| [Wallhaven](https://wallhaven.cc) | Main source: high-resolution wallpapers, safe-for-work only |
| Wikipedia | Lead image of the matching article (official art, posters) |
| Wikimedia Commons | Freely licensed images |
| Openverse | Creative Commons images |

Multi-word searches first require every word; Wallhaven results are re-ranked by character tags; logos, icons and small images are dropped. Requests stay under Wallhaven's 45-per-minute limit. A source that fails is skipped.

**Alarms** are scheduled in the main process (`alarms.js`), so they ring whenever the app runs. **Calendar**: Google via the Calendar API with PKCE sign-in and a refresh token encrypted by Windows (`google.js`); other calendars as iCal links or `.ics` files with repeats expanded (`calendars.js`). Event reminder emails are sent by Google itself. **Typed dates** use chrono-node plus some clean-up (`when.js`); ambiguous dates follow the Windows short-date setting.

**Safety.** Anything downloaded from a URL (images, calendar links) must resolve to a public address, re-checked on every redirect (`net-safety.js`). Remote web pages in the search window run sandboxed with no access to the app.

## Project layout

```
src/
  main/
    main.js              windows, tray, web search window, alarm window
    desktop-host.js      places the wallpaper behind the desktop icons (Win32 via koffi)
    desktop-input.js     passes clicks on empty desktop to the wallpaper's widgets
    api.js               app:// scheme: serves the dashboard and its /api/* endpoints
    image-search.js      multi-source wallpaper search and ranking
    alarms.js            alarm schedule, snooze, custom sounds
    calendars.js         calendar links and .ics files, repeating events
    google.js            Google sign-in and Calendar read/write
    when.js              typed dates and times ("tomorrow 7am", "every weekday")
    updater.js           automatic updates from GitHub Releases
    windows-location.js  exact location from Windows' Location service
    net-safety.js        only public addresses are downloaded
    config.js            settings file
    preload.js           bridge between pages and the main process
  renderer/
    index.html, script.js, style.css   the dashboard (wallpaper and editor modes)
    web.html, web.js                   toolbar of the web search window
    alarm.html, alarm.js, sounds.js    ringing window and alarm tones
build/icon.png
site/                    the website: index.html, privacy.html, style.css, images/
.github/workflows/release.yml
```

## Tech

Electron, JavaScript, HTML, CSS, koffi (Win32 calls), electron-updater, Google Calendar API, chrono-node, node-ical, Open-Meteo (weather), ipwho.is (approximate location), Wallhaven, Wikipedia and Openverse APIs, Font Awesome.
