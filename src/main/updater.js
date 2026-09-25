// Automatic updates from the GitHub Releases page.
//
// The installed app checks for a newer release shortly after starting and every few hours,
// downloads it in the background (only the changed parts, using the .blockmap file), then
// offers to install it (onReady); otherwise it installs the next time the app closes.
// Settings, alarms, sign-ins and the wallpaper are stored separately from the app, so they are kept.
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

const FIRST_CHECK_MS = 30 * 1000;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

const state = { status: 'idle', version: null, error: null };  // idle | checking | downloading | ready | latest | error
let listeners = { onChange: () => {}, notify: () => {} };
let manualCheck = false;
let timer = null;

function set(status, extra = {}) {
    Object.assign(state, { status, error: null }, extra);
    listeners.onChange({ ...state });
}

function setup(handlers) {
    listeners = { ...listeners, ...handlers };

    // Automated tests point the updater at a local server and never install anything
    const testFeed = process.env.LWD_TEST_PROFILE && process.env.LWD_UPDATE_URL;
    if (!app.isPackaged && !testFeed) return false;  // development copies don't update themselves
    if (testFeed) {
        autoUpdater.setFeedURL({ provider: 'generic', url: process.env.LWD_UPDATE_URL });
        autoUpdater.forceDevUpdateConfig = true;
        autoUpdater.autoInstallOnAppQuit = false;
    } else {
        autoUpdater.autoInstallOnAppQuit = true;
    }
    autoUpdater.autoDownload = true;
    autoUpdater.logger = null;

    autoUpdater.on('checking-for-update', () => set('checking'));
    autoUpdater.on('update-available', info => {
        set('downloading', { version: info.version });
        if (manualCheck) listeners.notify('Update found', `Downloading version ${info.version} in the background.`);
    });
    autoUpdater.on('update-not-available', () => {
        set('latest');
        if (manualCheck) listeners.notify('You\'re up to date', `Live Wallpaper Dashboard ${app.getVersion()} is the latest version.`);
        manualCheck = false;
    });
    autoUpdater.on('update-downloaded', info => {
        set('ready', { version: info.version, notes: notesText(info.releaseNotes) });
        if (listeners.onReady) listeners.onReady({ version: state.version, notes: state.notes });
        else listeners.notify('Update ready', `Version ${info.version} will install when the app restarts.`);
        manualCheck = false;
    });
    autoUpdater.on('error', err => {
        set('error', { error: err?.message || String(err) });
        if (manualCheck) listeners.notify('Couldn\'t check for updates', 'Check your internet connection and try again later.');
        manualCheck = false;
    });

    timer = setTimeout(function loop() {
        check(false);
        timer = setTimeout(loop, CHECK_EVERY_MS);
    }, FIRST_CHECK_MS);
    return true;
}

/**
 * The release description from GitHub (HTML) as a few plain lines for the update card.
 * Bullet points in the release description become the "what's new" list.
 */
function notesText(releaseNotes) {
    let html = Array.isArray(releaseNotes) ? (releaseNotes[0]?.note || '') : (releaseNotes || '');
    html = String(html)
        .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, '')  // headings like "What's new" aren't list items
        .replace(/<\/(li|p|h[1-6]|div)>|<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');
    return html.split('\n').map(l => l.trim()).filter(Boolean)
        .slice(0, 8).map(l => (l.length > 140 ? `${l.slice(0, 137)}...` : l)).join('\n');
}

function check(manual = true) {
    if (state.status === 'ready') {
        if (manual && listeners.onReady) listeners.onReady({ version: state.version, notes: state.notes });
        return;
    }
    if (state.status === 'checking' || state.status === 'downloading') return;
    manualCheck = manual;
    autoUpdater.checkForUpdates().catch(() => { /* reported through the 'error' event */ });
}

/** Closes the app, installs the downloaded update and starts the new version. */
function restartAndInstall() {
    if (state.status !== 'ready') return;
    listeners.beforeInstall?.();
    // Silent install, then relaunch
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
}

function stop() {
    clearTimeout(timer);
}

module.exports = { setup, check, restartAndInstall, stop, notesText, state: () => ({ ...state }) };
