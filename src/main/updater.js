// Automatic updates from the GitHub Releases page.
//
// The installed app checks for a newer release shortly after starting and every few hours,
// downloads it in the background (only the changed parts, using the .blockmap file), and
// installs it the next time the app restarts. Settings, alarms, sign-ins and the wallpaper
// are stored separately from the app, so they are kept.
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
        set('ready', { version: info.version });
        listeners.notify('Update ready', `Version ${info.version} will install when the app restarts. Use "Restart to update" in the tray menu to do it now.`);
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

function check(manual = true) {
    if (state.status === 'ready') {
        if (manual) listeners.notify('Update ready', `Version ${state.version} is downloaded. Use "Restart to update" in the tray menu.`);
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

module.exports = { setup, check, restartAndInstall, stop, state: () => ({ ...state }) };
