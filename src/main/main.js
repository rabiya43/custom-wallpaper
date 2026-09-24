// Live Wallpaper Dashboard: Electron main process.
//
// Windows:
//   wallpaper  the dashboard rendered behind the desktop icons (click-through)
//   editor     the same dashboard as a normal window on top, for customizing
//   web        a small browser for searching any site, with "Set as wallpaper" on right-click
const path = require('path');
const { app, BrowserWindow, WebContentsView, Menu, Tray, ipcMain, screen, dialog, nativeImage, Notification } = require('electron');
const api = require('./api');
const config = require('./config');
const desktopHost = require('./desktop-host');

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

/** Where the dashboard's widgets may go: the display minus the taskbar, as insets in CSS pixels. */
function layoutQuery(mode) {
    const d = targetDisplay();
    const b = d.bounds, w = d.workArea;
    const insets = {
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
    const win = wallpaperWin;
    wallpaperWin = null;
    win.removeAllListeners('closed');
    win.destroy();
    desktopHost.restoreSystemWallpaper();
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
        editorWin.show();
        editorWin.focus();
        return;
    }
    const d = targetDisplay();
    editorWin = new BrowserWindow({
        ...d.bounds,
        frame: false,
        thickFrame: false,
        resizable: false,
        skipTaskbar: false,
        title: 'Customize wallpaper',
        icon: ICON,
        backgroundColor: '#2D5A46',
        show: false,
        webPreferences: { preload: path.join(__dirname, 'preload.js') },
    });
    editorWin.loadURL(layoutQuery('editor'));
    editorWin.once('ready-to-show', () => {
        // Windows shrinks new windows to fit above the taskbar; the editor must match the wallpaper exactly
        editorWin.setBounds(d.bounds);
        editorWin.show();
    });
    editorWin.on('closed', () => {
        editorWin = null;
        if (webWin) webWin.close();
        if (wallpaperWin) wallpaperWin.reload();  // pick up everything that changed
    });
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
            label: 'Start with Windows', type: 'checkbox', checked: login,
            click: item => { app.setLoginItemSettings({ openAtLogin: item.checked }); },
        },
        {
            label: 'Calendar folder (.ics files)...',
            click: async () => {
                const r = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Choose a folder with .ics calendar files' });
                if (!r.canceled && r.filePaths[0]) {
                    config.set('calendarDir', r.filePaths[0]);
                    wallpaperWin?.reload();
                    editorWin?.reload();
                }
            },
        },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
    ]);
}

function createTray() {
    const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.setToolTip('Live Wallpaper Dashboard');
    tray.setContextMenu(buildTrayMenu());
    tray.on('double-click', () => openEditor());
}

// ------------------------------------------------------------------ IPC

ipcMain.on('editor:close', () => editorWin?.close());
ipcMain.on('web:open', (_e, { query, engine }) => openWebSearch(query, engine));
ipcMain.on('web:back', () => webView?.webContents.navigationHistory.goBack());

// ------------------------------------------------------------------ lifecycle

app.whenReady().then(() => {
    if (!isPrimary) return;
    app.setAppUserModelId('com.rabiyatahir.livewallpaperdashboard');
    api.registerHandler();
    createTray();

    if (!config.get('paused')) createWallpaper();
    startWatchdog();

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
        setWallpaperFromUrl, openWebSearch, openEditor, fetchImage: api.fetchImage,
        windows: () => ({ wallpaperWin, editorWin, webWin, webView }),
    };
}

app.on('before-quit', () => {
    quitting = true;
    clearInterval(watchdog);
    destroyWallpaper();
});
