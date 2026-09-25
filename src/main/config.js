// Small JSON settings file in the app's user-data folder.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = { paused: false, calendarDir: '', desktopClicks: true };
let cache = null;

const file = () => path.join(app.getPath('userData'), 'settings.json');

function load() {
    if (cache) return cache;
    try {
        cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
    } catch {
        cache = { ...DEFAULTS };
    }
    return cache;
}

function get(key) {
    return load()[key];
}

function set(key, value) {
    load()[key] = value;
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
}

module.exports = { get, set };
