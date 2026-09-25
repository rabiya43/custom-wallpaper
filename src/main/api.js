// Serves the dashboard over the app:// scheme and answers its /api/* requests.
// Using one origin for every window means they all share localStorage and IndexedDB.
const path = require('path');
const fs = require('fs');
const { protocol } = require('electron');
const imageSearch = require('./image-search');
const calendars = require('./calendars');
const alarms = require('./alarms');
const { safeFetch } = require('./net-safety');
const windowsLocation = require('./windows-location');

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const STATIC_FILES = {
    'index.html': 'text/html', 'script.js': 'text/javascript', 'style.css': 'text/css',
    'web.html': 'text/html', 'web.js': 'text/javascript',
    'alarm.html': 'text/html', 'alarm.js': 'text/javascript', 'sounds.js': 'text/javascript',
    'update.html': 'text/html', 'update.js': 'text/javascript',
};
const SOUND_TYPES = {
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
    '.aac': 'audio/aac', '.flac': 'audio/flac',
};
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function registerScheme() {
    protocol.registerSchemesAsPrivileged([{
        scheme: 'app',
        privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
    }]);
}

const json = (data, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

/** Downloads an image from a public address. */
async function fetchImage(raw) {
    const res = await safeFetch(raw, { headers: { 'User-Agent': imageSearch.USER_AGENT } });
    if (!res.ok) throw Object.assign(new Error(`Image server returned ${res.status}`), { status: 502 });
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!imageSearch.ALLOWED_MIME.has(type)) throw Object.assign(new Error('Not a supported image'), { status: 415 });
    if (Number(res.headers.get('content-length') || 0) > MAX_IMAGE_BYTES) {
        throw Object.assign(new Error('Image too large'), { status: 413 });
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('Image too large'), { status: 413 });
    return { buf, type };
}

let cachedIpLocation = null;  // { time, value }
async function ipLocation() {
    if (cachedIpLocation && Date.now() - cachedIpLocation.time < 60 * 60 * 1000) return cachedIpLocation.value;
    const res = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (!data.success) throw new Error('Location lookup failed');
    cachedIpLocation = { time: Date.now(), value: { lat: data.latitude, lon: data.longitude, name: data.city } };
    return cachedIpLocation.value;
}

function distanceKm(a, b) {
    const rad = d => d * Math.PI / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
        + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * Windows' Location service when it's on (exact), otherwise an approximate location from the
 * internet connection. `windows` tells the dashboard whether Windows Location could be used;
 * 'pending' means Windows hasn't answered yet (it can take several seconds), so ask again soon.
 * Windows gives no place name, so the city comes from the internet connection when it's nearby.
 */
async function location() {
    const win = await Promise.race([windowsLocation.get(), new Promise(r => setTimeout(r, 2500, null))]);
    const ip = await ipLocation().catch(() => null);
    if (win?.status === 'ok') {
        const name = ip && distanceKm(ip, win) < 60 ? ip.name : '';
        return { lat: win.lat, lon: win.lon, name, source: 'windows', windows: 'ok' };
    }
    if (!ip) throw new Error('Location lookup failed');
    return { ...ip, source: 'ip', windows: win ? win.status : 'pending' };
}

async function handle(request) {
    const url = new URL(request.url);
    const route = url.pathname;

    try {
        if (route === '/api/search') {
            const q = (url.searchParams.get('q') || '').trim();
            if (q.length < 2) return json({ error: 'Type at least 2 characters' }, 400);
            const page = Math.max(1, Math.min(20, Number(url.searchParams.get('page')) || 1));
            return json(await imageSearch.search(q, page));
        }
        if (route === '/api/image') {
            const { buf, type } = await fetchImage(url.searchParams.get('url') || '');
            return new Response(buf, { headers: { 'Content-Type': type } });
        }
        if (route === '/api/calendar/events') {
            return json(await calendars.allEvents({ force: url.searchParams.get('refresh') === '1' }));
        }
        if (route === '/api/alarm-sound') {
            const file = alarms.soundFile(url.searchParams.get('name') || '');
            if (!file) return json({ error: 'Sound not found' }, 404);
            return new Response(fs.readFileSync(file), {
                headers: { 'Content-Type': SOUND_TYPES[path.extname(file)] || 'application/octet-stream' },
            });
        }
        if (route === '/api/location') return json(await location());

        const file = route.replace(/^\/+/, '') || 'index.html';
        if (STATIC_FILES[file]) {
            return new Response(fs.readFileSync(path.join(RENDERER_DIR, file)), {
                headers: { 'Content-Type': `${STATIC_FILES[file]}; charset=utf-8` },
            });
        }
        return json({ error: 'Not found' }, 404);
    } catch (e) {
        return json({ error: e.message }, e.status || 500);
    }
}

function registerHandler() {
    protocol.handle('app', handle);
}

module.exports = { registerScheme, registerHandler, fetchImage };
