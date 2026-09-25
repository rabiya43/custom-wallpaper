// Live Wallpaper Dashboard: Electron main process.
//
// Windows:
//   wallpaper  the dashboard rendered behind the desktop icons (clicks on empty desktop reach its widgets)
//   editor     the same dashboard as a normal window on top, for customizing
//   popup      one panel (alarms, a day, an event, reminders) over the desktop, opened by clicking a widget
//   web        a small browser for searching any site, with "Set as wallpaper" on right-click
const path = require('path');
const { app, BrowserWindow, WebContentsView, Menu, Tray, ipcMain, screen, dialog, nativeImage, Notification, shell } = require('electron');
const api = require('./api');
const config = require('./config');
const desktopHost = require('./desktop-host');
const desktopInput = require('./desktop-input');
const alarms = require('./alarms');
const calendars = require('./calendars');
const google = require('./google');
const when = require('./when');
const updater = require('./updater');

let updatesEnabled = false;

const APP_URL = 'app://dashboard/index.html';
const ICON = path.join(__dirname, '..', '..', 'build', 'icon.png');
const WEB_TOOLBAR_HEIGHT = 56;
const ENGINES = {
    google: q => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`,
    bing: q => `https://www.bing.com/images/search?q=${encodeURIComponent(q)}`,
    duckduckgo: q => `https://duckduckgo.com/?ia=images&iax=images&q=${encodeURIComponent(q)}`,
};

let tray = null;
let wallpaperWin = null;
let editorWin = null;
let popupWin = null;
let popupBusy = 0;  // a file dialog or Google sign-in is open from the popup, so it stays open
let webWin = null;
let webView = null;
let quitting = false;
let attachedProgman = 0;
let watchdog = null;

// Automated tests run with a throwaway profile so they never touch the user's wallpaper and settings
if (process.env.LWD_TEST_PROFILE) app.setPath('userData', process.env.LWD_TEST_PROFILE);

api.registerScheme();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');  // alarm sound

// Running the app again opens the editor; running it with --quit closes the running copy.
// A --quit launch must never start the app itself, even if the running copy has already exited.
const quitRequested = process.argv.includes('--quit');
const isPrimary = app.requestSingleInstanceLock() && !quitRequested;
if (!isPrimary) {
    app.exit(0);
} else {
    app.on('second-instance', (_e, argv) => {
        if (argv.includes('--quit')) app.quit();
        else openEditor();
    });
}

// ------------------------------------------------------------------ geometry

function targetDisplay() {
    return screen.getPrimaryDisplay();
}

/**
 * Where the dashboard's widgets may go, as insets in CSS pixels. The wallpaper covers the whole
 * screen, so it keeps widgets out from under the taskbar; the editor and popup windows already stop
 * at the taskbar (so the taskbar stays usable), so they need none. Either way widgets land in the same place.
 */
function layoutQuery(mode) {
    const d = targetDisplay();
    const b = d.bounds, w = d.workArea;
    const insets = mode !== 'wallpaper' ? { t: 0, l: 0, r: 0, b: 0 } : {
        t: w.y - b.y, l: w.x - b.x,
        r: (b.x + b.width) - (w.x + w.width), b: (b.y + b.height) - (w.y + w.height),
    };
    const q = new URLSearchParams({ mode, ...insets });
    return `${APP_URL}?${q}`;
}

// ------------------------------------------------------------------ wallpaper window

function createWallpaper() {
    if (wallpaperWin) return;
    const d = targetDisplay();

    wallpaperWin = new BrowserWindow({
        ...d.bounds,
        show: false,
        frame: false,
        thickFrame: false,  // otherwise Windows keeps an invisible 8px border around the page
        resizable: false,
        movable: false,
        focusable: false,
        skipTaskbar: true,
        hasShadow: false,
        backgroundColor: '#2D5A46',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            backgroundThrottling: false,
        },
    });
    wallpaperWin.setIgnoreMouseEvents(true);
    wallpaperWin.loadURL(layoutQuery('wallpaper'));

    wallpaperWin.once('ready-to-show', () => {
        const rect = screen.dipToScreenRect(null, d.bounds);
        const ok = desktopHost.attach(wallpaperWin, rect);
        attachedProgman = desktopHost.currentProgman();
        wallpaperWin.showInactive();
        startDesktopClicks();
        if (!ok) {
            notify('Could not place the wallpaper behind your icons',
                'Your version of Windows may not support it. The dashboard is still available from the tray icon.');
        }
    });

    wallpaperWin.on('closed', () => {
        wallpaperWin = null;
        // Explorer restarting takes our window with it; bring it back
        if (!quitting && !config.get('paused')) setTimeout(createWallpaper, 2000);
    });
}

function destroyWallpaper() {
    if (!wallpaperWin) return;
    desktopInput.stop();
    const win = wallpaperWin;
    wallpaperWin = null;
    win.removeAllListeners('closed');
    win.destroy();
    desktopHost.restoreSystemWallpaper();
}

/** Screen point (physical pixels) to a point on the wallpaper page, or null if it's off the wallpaper. */
function toPage(pt) {
    const p = screen.screenToDipPoint(pt);
    const b = targetDisplay().bounds;
    const x = p.x - b.x, y = p.y - b.y;
    return x >= 0 && y >= 0 && x < b.width && y < b.height ? { x, y } : null;
}

/** Clicks on empty desktop reach the wallpaper's widgets (see desktop-input.js). */
function startDesktopClicks() {
    desktopInput.stop();
    if (!wallpaperWin || !config.get('desktopClicks')) return;
    const send = (channel, pt) => {
        if (wallpaperWin && !wallpaperWin.isDestroyed()) wallpaperWin.webContents.send(channel, pt && toPage(pt));
    };
    desktopInput.start(wallpaperWin, {
        onClick: pt => send('desktop:click', pt),
        onHover: pt => send('desktop:hover', pt),
    });
}

let repositionTimer = null;
function repositionWallpaper() {
    // Display events come in bursts (resolution, scaling, taskbar); rebuild once they settle
    clearTimeout(repositionTimer);
    repositionTimer = setTimeout(() => {
        if (!wallpaperWin || quitting) return;
        destroyWallpaper();
        createWallpaper();
    }, 1000);
}

function startWatchdog() {
    clearInterval(watchdog);
    watchdog = setInterval(() => {
        if (!wallpaperWin || config.get('paused')) return;
        const progman = desktopHost.currentProgman();
        if (progman && progman !== attachedProgman) repositionWallpaper();  // Explorer restarted
    }, 5000);
}

// ------------------------------------------------------------------ editor window

function openEditor() {
    if (editorWin) {
        if (editorWin.isMinimized()) editorWin.restore();
        bringToFront(editorWin);
        return;
    }
    // The editor fills the screen above the taskbar, so the taskbar stays usable
    const area = targetDisplay().workArea;
    editorWin = new BrowserWindow({
        ...area,
        frame: false,
        thickFrame: false,
        resizable: false,
        minimizable: true,
        skipTaskbar: false,
        title: 'Customize wallpaper',
        icon: ICON,
        backgroundColor: '#2D5A46',
        show: false,
        webPreferences: { preload: path.join(__dirname, 'preload.js') },
    });
    editorWin.loadURL(layoutQuery('editor'));
    editorWin.once('ready-to-show', () => {
        editorWin.setBounds(area);
        bringToFront(editorWin);
    });
    editorWin.on('closed', () => {
        editorWin = null;
        if (webWin) webWin.close();
        // Pick up everything that changed
        if (wallpaperWin) wallpaperWin.reload();
        if (popupWin) popupWin.reload();
    });
}

// ------------------------------------------------------------------ popup window

/**
 * Shows one panel over the desktop, e.g. the alarms after clicking the bell on the wallpaper.
 * The window covers the work area like the editor (so the reminders box lands exactly on top of
 * the wallpaper's), but only the panel is visible. It's kept after the first use so it opens quickly.
 */
function openPopup(target) {
    if (editorWin) return openEditorPanel(target);  // while customizing, use the editor
    if (!popupWin) createPopup();
    const send = () => popupWin.webContents.send('popup:show', target);  // the page answers popup:ready
    if (popupWin.webContents.isLoading()) popupWin.webContents.once('did-finish-load', send);
    else send();
}

function createPopup() {
    popupWin = new BrowserWindow({
        ...targetDisplay().workArea,
        show: false,
        frame: false,
        thickFrame: false,
        transparent: true,
        backgroundColor: '#00000000',
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        skipTaskbar: true,
        hasShadow: false,
        title: 'Live Wallpaper Dashboard',
        icon: ICON,
        webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
    });
    popupWin.loadURL(layoutQuery('popup'));
    // Clicking anywhere else puts it away, unless it's waiting on a file dialog or Google sign-in
    popupWin.on('blur', () => setTimeout(() => {
        if (popupWin && !popupBusy && !popupWin.isFocused()) popupWin.hide();
    }, 150));
    popupWin.on('closed', () => { popupWin = null; });
}

/** Keeps the popup open while fn runs, if the request came from it (e.g. a file dialog). */
async function whileBusy(event, fn) {
    const fromPopup = popupWin && event.sender === popupWin.webContents;
    if (fromPopup) popupBusy++;
    try {
        return await fn();
    } finally {
        if (fromPopup) {
            popupBusy--;
            if (popupWin?.isVisible()) bringToFront(popupWin);
        }
    }
}

/**
 * Shows a window in front with the keyboard. Windows doesn't normally let a background app take
 * the foreground, and these windows are opened from the tray or a desktop click, when Explorer has it.
 */
function bringToFront(win) {
    win.setAlwaysOnTop(true);
    win.show();
    desktopHost.takeForeground(win);
    win.focus();
    win.setAlwaysOnTop(false);
}

// ------------------------------------------------------------------ web search window

function openWebSearch(query, engine = 'google') {
    const url = (ENGINES[engine] || ENGINES.google)(query || 'wallpaper');
    if (webWin) {
        webView.webContents.loadURL(url);
        webWin.webContents.send('web:state', { query, engine });
        webWin.show();
        webWin.focus();
        return;
    }

    webWin = new BrowserWindow({
        width: 1200, height: 820, minWidth: 700, minHeight: 500,
        title: 'Search the web',
        icon: ICON,
        parent: editorWin || undefined,
        backgroundColor: '#181b24',
        autoHideMenuBar: true,
        webPreferences: { preload: path.join(__dirname, 'preload.js') },
    });
    webWin.loadURL('app://dashboard/web.html');
    webWin.webContents.once('did-finish-load', () => webWin.webContents.send('web:state', { query, engine }));

    // Remote sites run in their own sandboxed view with no access to the app
    webView = new WebContentsView({
        webPreferences: { partition: 'persist:websearch', sandbox: true, contextIsolation: true },
    });
    webWin.contentView.addChildView(webView);
    const layout = () => {
        const [w, h] = webWin.getContentSize();
        webView.setBounds({ x: 0, y: WEB_TOOLBAR_HEIGHT, width: w, height: h - WEB_TOOLBAR_HEIGHT });
    };
    layout();
    webWin.on('resize', layout);

    const wc = webView.webContents;
    // Look like regular Chrome; search engines are quicker to show "unusual traffic" checks to Electron apps
    const chromeUA = wc.getUserAgent().split(' ').filter(t => !/^(Electron|live-wallpaper-dashboard|LiveWallpaperDashboard)\//i.test(t)).join(' ');
    wc.setUserAgent(chromeUA);
    wc.setWindowOpenHandler(({ url: target }) => {
        if (/^https?:/.test(target)) wc.loadURL(target);
        return { action: 'deny' };
    });
    wc.on('did-navigate', (_e, navUrl) => {
        webWin?.webContents.send('web:nav', { canGoBack: wc.navigationHistory.canGoBack() });
        if (/google\.[a-z.]+\/sorry\//.test(navUrl)) {
            webWin?.webContents.send('web:toast', 'Google wants a quick "I\'m not a robot" check. Solve it once, or switch to Bing.');
        }
    });
    wc.on('did-navigate-in-page', () => webWin?.webContents.send('web:nav', { canGoBack: wc.navigationHistory.canGoBack() }));
    wc.on('context-menu', (_e, params) => {
        const items = [];
        if (params.mediaType === 'image' && params.srcURL) {
            items.push({ label: 'Set as wallpaper', click: () => setWallpaperFromUrl(params.srcURL) });
            items.push({ type: 'separator' });
        }
        if (params.selectionText) items.push({ role: 'copy' });
        items.push({ label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() });
        items.push({ label: 'Reload', click: () => wc.reload() });
        Menu.buildFromTemplate(items).popup({ window: webWin });
    });
    wc.loadURL(url);

    webWin.on('closed', () => {
        webWin = null;
        webView = null;
    });
}

async function setWallpaperFromUrl(src) {
    try {
        let bytes, type;
        const m = src.match(/^data:(image\/[a-z+]+);base64,(.*)$/i);
        if (m) {
            type = m[1];
            bytes = Buffer.from(m[2], 'base64');
        } else {
            ({ buf: bytes, type } = await api.fetchImage(src));
        }
        if (!editorWin) openEditor();
        const send = () => editorWin.webContents.send('apply-image', { bytes, type });
        if (editorWin.webContents.isLoading()) editorWin.webContents.once('did-finish-load', send);
        else send();
        webWin?.webContents.send('web:toast', 'Wallpaper set. Close this window or keep browsing.');
    } catch (e) {
        webWin?.webContents.send('web:toast', `Couldn't use that image: ${e.message}`);
    }
}

// ------------------------------------------------------------------ tray

function notify(title, body) {
    if (Notification.isSupported()) new Notification({ title, body, icon: ICON }).show();
}

function buildTrayMenu() {
    const paused = config.get('paused');
    const login = app.getLoginItemSettings().openAtLogin;
    return Menu.buildFromTemplate([
        { label: 'Customize wallpaper', click: () => openEditor() },
        { label: 'Search the web for a wallpaper', click: () => { openEditor(); openWebSearch(''); } },
        { type: 'separator' },
        {
            label: paused ? 'Resume live wallpaper' : 'Pause live wallpaper',
            click: () => {
                config.set('paused', !paused);
                if (paused) createWallpaper(); else destroyWallpaper();
                tray.setContextMenu(buildTrayMenu());
            },
        },
        {
            label: 'Clickable widgets on the desktop', type: 'checkbox', checked: !!config.get('desktopClicks'),
            click: item => { config.set('desktopClicks', item.checked); startDesktopClicks(); },
        },
        {
            label: 'Start with Windows', type: 'checkbox', checked: login,
            click: item => { app.setLoginItemSettings({ openAtLogin: item.checked }); },
        },
        { type: 'separator' },
        { label: 'Alarms...', click: () => openPopup('alarms') },
        { label: 'Calendars...', click: () => openPopup('calendars') },
        { type: 'separator' },
        ...updateMenuItems(),
        { label: 'Quit', click: () => app.quit() },
    ]);
}

function updateMenuItems() {
    if (!updatesEnabled) return [];
    const u = updater.state();
    if (u.status === 'ready') {
        return [{ label: `Restart to update (version ${u.version})`, click: () => updater.restartAndInstall() }, { type: 'separator' }];
    }
    const label = u.status === 'checking' ? 'Checking for updates...'
        : u.status === 'downloading' ? `Downloading update ${u.version || ''}...`
        : 'Check for updates';
    return [
        { label, enabled: u.status !== 'checking' && u.status !== 'downloading', click: () => updater.check(true) },
        { label: `Version ${app.getVersion()}`, enabled: false },
        { type: 'separator' },
    ];
}

function updateTrayTooltip() {
    if (!tray) return;
    const n = alarms.next();
    let tip = 'Live Wallpaper Dashboard';
    if (n) {
        const d = new Date(n.at);
        tip += `\nNext alarm: ${d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
    }
    tray.setToolTip(tip);
}

function createTray() {
    const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.setContextMenu(buildTrayMenu());
    tray.on('double-click', () => openEditor());
    updateTrayTooltip();
}

/** Opens the editor with a panel showing: 'alarms', 'calendars', 'todo', { day } or { event }. */
function openEditorPanel(panel) {
    openEditor();
    const send = () => editorWin.webContents.send('editor:panel', panel);
    if (editorWin.webContents.isLoading()) editorWin.webContents.once('did-finish-load', send);
    else send();
}

/** Tells the dashboard windows that alarms or calendars changed, so their widgets update. */
function broadcast(channel) {
    for (const win of [wallpaperWin, editorWin, popupWin]) {
        if (win && !win.isDestroyed()) win.webContents.send(channel);
    }
}

// ------------------------------------------------------------------ alarms

const ringing = new Map();  // alarm id -> window

function ring(alarm) {
    if (ringing.has(alarm.id)) return;
    const d = targetDisplay().workArea;
    const width = 440, height = 300;
    const win = new BrowserWindow({
        width, height,
        x: Math.round(d.x + (d.width - width) / 2),
        y: Math.round(d.y + (d.height - height) / 2),
        show: false,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: false,
        title: `Alarm${alarm.label ? `: ${alarm.label}` : ''}`,
        icon: ICON,
        webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
    });
    win.setAlwaysOnTop(true, 'screen-saver');  // above full-screen apps too
    const q = new URLSearchParams({
        id: alarm.id, time: alarm.time, label: alarm.label, sound: alarm.sound, snooze: String(alarms.SNOOZE_MINUTES),
    });
    win.loadURL(`app://dashboard/alarm.html?${q}`);
    win.once('ready-to-show', () => { win.show(); win.focus(); win.flashFrame(true); });
    win.on('closed', () => ringing.delete(alarm.id));
    ringing.set(alarm.id, win);
    notify(alarm.label || 'Alarm', `It's ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
}

// ------------------------------------------------------------------ IPC

ipcMain.on('editor:close', () => editorWin?.close());
ipcMain.on('web:open', (_e, { query, engine }) => openWebSearch(query, engine));
ipcMain.on('web:back', () => webView?.webContents.navigationHistory.goBack());

ipcMain.handle('alarms:get', () => ({ alarms: alarms.list(), next: alarms.next(), snoozeMinutes: alarms.SNOOZE_MINUTES }));
ipcMain.handle('alarms:save', (_e, list) => alarms.save(list));
ipcMain.handle('alarms:pick-sound', async (event) => {
    const r = await whileBusy(event, () => dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
        title: 'Choose an alarm sound',
        properties: ['openFile'],
        filters: [{ name: 'Sounds', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] }],
    }));
    if (r.canceled || !r.filePaths[0]) return null;
    try {
        return alarms.importSound(r.filePaths[0]);
    } catch (e) {
        return { error: e.message };
    }
});
ipcMain.on('alarm:action', (event, { id, action }) => {
    if (action === 'snooze') alarms.snooze(id);
    BrowserWindow.fromWebContents(event.sender)?.close();
    broadcast('alarms:changed');
    updateTrayTooltip();
});

ipcMain.on('editor:minimize', () => editorWin?.minimize());

// A widget clicked on the desktop that needs a panel, e.g. to show a day or edit an event
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
ipcMain.on('popup:open', (_e, target) => {
    if (['alarms', 'calendars', 'todo'].includes(target)) return openPopup(target);
    if (DATE_RE.test(target?.day)) return openPopup({ day: target.day });
    const ev = target?.event;
    if (ev && typeof ev.id === 'string' && typeof ev.calendarId === 'string' && DATE_RE.test(ev.date)) {
        openPopup({ event: { id: ev.id, calendarId: ev.calendarId, date: ev.date } });
    }
});
ipcMain.on('popup:ready', () => {
    if (!popupWin) return;
    popupWin.setBounds(targetDisplay().workArea);
    bringToFront(popupWin);
});
ipcMain.on('popup:close', () => popupWin?.hide());

// Windows apps and settings pages the dashboard's widgets can open (a fixed list, nothing else)
const WINDOWS_LINKS = {
    weather: ['bingweather:', 'msnweather:', 'https://www.msn.com/weather'],
    battery: ['ms-settings:batterysaver'],
    location: ['ms-settings:privacy-location'],
};
function protocolRegistered(url) {
    const scheme = url.split(':')[0];
    if (scheme === 'https' || scheme === 'ms-settings') return true;
    try {
        require('child_process').execFileSync('reg', ['query', `HKCR\\${scheme}`], { windowsHide: true, stdio: 'ignore', timeout: 3000 });
        return true;
    } catch {
        return false;
    }
}
ipcMain.handle('windows:open', async (_e, target) => {
    const choices = WINDOWS_LINKS[target];
    if (!choices) return false;
    const url = choices.find(protocolRegistered);  // e.g. fall back to the MSN weather site without the app
    await shell.openExternal(url);
    return true;
});
ipcMain.handle('when:parse', (_e, { text, mode }) => when.parse(text, { mode }));

// Google Calendar
ipcMain.handle('google:status', () => ({ configured: google.isConfigured(), account: google.account() }));
ipcMain.handle('google:sign-in', (event) => whileBusy(event, async () => {
    const win = BrowserWindow.fromWebContents(event.sender);
    try {
        const account = await google.signIn();
        if (win && !win.isDestroyed()) bringToFront(win);
        broadcast('calendars:changed');
        return { account };
    } catch (e) {
        win?.focus();
        return { error: e.message };
    }
}));
ipcMain.handle('google:cancel-sign-in', () => google.cancelSignIn());
ipcMain.handle('google:sign-out', async () => {
    await google.signOut();
    broadcast('calendars:changed');
});
ipcMain.handle('google:calendars', async () => {
    try {
        return { calendars: await google.calendars() };
    } catch (e) {
        return { error: e.message };
    }
});
async function eventChange(fn) {
    try {
        const result = await fn();
        broadcast('calendars:changed');
        return { event: result || null };
    } catch (e) {
        return { error: e.message };
    }
}
ipcMain.handle('events:create', (_e, { calendarId, event }) => eventChange(() => google.createEvent(calendarId, event)));
ipcMain.handle('events:update', (_e, { calendarId, eventId, event }) => eventChange(() => google.updateEvent(calendarId, eventId, event)));
ipcMain.handle('events:delete', (_e, { calendarId, eventId }) => eventChange(() => google.deleteEvent(calendarId, eventId)));

ipcMain.handle('calendars:get', () => ({
    feeds: calendars.feeds().map(({ id, name, color, url }) => ({ id, name, color, host: new URL(url).host })),
    folder: config.get('calendarDir') || '',
}));
ipcMain.handle('calendars:add', async (_e, feed) => {
    try {
        const saved = await calendars.addFeed(feed);
        broadcast('calendars:changed');
        return { feed: { id: saved.id, name: saved.name, color: saved.color } };
    } catch (e) {
        return { error: e.message };
    }
});
ipcMain.handle('calendars:remove', (_e, id) => {
    calendars.removeFeed(id);
    broadcast('calendars:changed');
});
ipcMain.handle('calendars:choose-folder', async (event) => {
    const r = await whileBusy(event, () => dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
        properties: ['openDirectory'], title: 'Choose a folder with .ics calendar files',
    }));
    if (r.canceled || !r.filePaths[0]) return null;
    config.set('calendarDir', r.filePaths[0]);
    broadcast('calendars:changed');
    return r.filePaths[0];
});
ipcMain.handle('calendars:clear-folder', () => {
    config.set('calendarDir', '');
    broadcast('calendars:changed');
});

// ------------------------------------------------------------------ lifecycle

app.whenReady().then(() => {
    if (!isPrimary) return;
    app.setAppUserModelId('com.rabiyatahir.livewallpaperdashboard');
    when.useWindowsDateOrder();
    api.registerHandler();
    createTray();

    if (!config.get('paused')) createWallpaper();
    startWatchdog();
    alarms.start({
        onRing: ring,
        onChange: () => { broadcast('alarms:changed'); updateTrayTooltip(); },
    });
    setInterval(updateTrayTooltip, 60000);

    updatesEnabled = updater.setup({
        onChange: () => tray?.setContextMenu(buildTrayMenu()),
        notify,
        beforeInstall: () => { quitting = true; destroyWallpaper(); },
    });

    if (!config.get('welcomed')) {
        config.set('welcomed', true);
        openEditor();
    }

    screen.on('display-metrics-changed', repositionWallpaper);
    screen.on('display-added', repositionWallpaper);
    screen.on('display-removed', repositionWallpaper);
});

// Keep running in the tray when windows close
app.on('window-all-closed', () => {});

if (process.env.LWD_TEST_PROFILE) {
    global.lwdTest = {
        setWallpaperFromUrl, openWebSearch, openEditor, openEditorPanel, ring, fetchImage: api.fetchImage,
        alarms, calendars, ringing, config, google, when, updater, trayMenu: () => buildTrayMenu().items.map(i => i.label),
        desktopInput, toPage, startDesktopClicks, openPopup, desktopHost,
        windows: () => ({ wallpaperWin, editorWin, webWin, webView, popupWin }),
    };
}

app.on('before-quit', () => {
    quitting = true;
    clearInterval(watchdog);
    updater.stop();
    destroyWallpaper();
});
