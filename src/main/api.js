// Serves the dashboard over the app:// scheme and answers its /api/* requests.
// Using one origin for every window means they all share localStorage and IndexedDB.
const path = require('path');
const fs = require('fs');
const dns = require('dns').promises;
const net = require('net');
const { protocol } = require('electron');
const imageSearch = require('./image-search');
const config = require('./config');

const RENDERER_DIR = path.join(__dirname, '..', 'renderer');
const STATIC_FILES = {
    'index.html': 'text/html', 'script.js': 'text/javascript', 'style.css': 'text/css',
    'web.html': 'text/html', 'web.js': 'text/javascript',
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

function isPrivateAddress(ip) {
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split('.').map(Number);
        return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
    }
    const v6 = ip.toLowerCase();
    if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
    return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

/** Only http(s) URLs that resolve to public addresses, so a page can't make the app read the local network. */
async function isPublicUrl(raw) {
    let url;
    try { url = new URL(raw); } catch { return false; }
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    try {
        const addrs = await dns.lookup(url.hostname, { all: true });
        return addrs.length > 0 && !addrs.some(a => isPrivateAddress(a.address));
    } catch {
        return false;
    }
}

/** Downloads an image from the internet, following a few redirects and re-checking each hop. */
async function fetchImage(raw) {
    let url = raw;
    for (let hop = 0; hop < 4; hop++) {
        if (!(await isPublicUrl(url))) throw Object.assign(new Error('URL not allowed'), { status: 400 });
        const res = await fetch(url, {
            headers: { 'User-Agent': imageSearch.USER_AGENT }, redirect: 'manual', signal: AbortSignal.timeout(15000),
        });
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
            url = new URL(res.headers.get('location'), url).toString();
            continue;
        }
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
    throw Object.assign(new Error('Too many redirects'), { status: 502 });
}

async function calendarEvents() {
    const dir = config.get('calendarDir');
    if (!dir || !fs.existsSync(dir)) return [];
    const ical = require('node-ical');
    const events = [];
    for (const name of fs.readdirSync(dir)) {
        if (!name.toLowerCase().endsWith('.ics')) continue;
        try {
            const data = ical.sync.parseFile(path.join(dir, name));
            for (const ev of Object.values(data)) {
                if (ev.type !== 'VEVENT' || !ev.start) continue;
                const start = new Date(ev.start);
                // Local date, so the dashboard can match it against the calendar grid
                const ymd = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
                events.push({ title: String(ev.summary || 'Event'), start: ymd });
            }
        } catch (e) {
            console.warn(`Skipping ${name}:`, e.message);
        }
    }
    return events;
}

let cachedLocation = null;
async function approximateLocation() {
    if (cachedLocation) return cachedLocation;
    const res = await fetch('https://ipwho.is/', { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (!data.success) throw new Error('Location lookup failed');
    cachedLocation = { lat: data.latitude, lon: data.longitude, name: data.city };
    return cachedLocation;
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
        if (route === '/api/calendar/events') return json(await calendarEvents());
        if (route === '/api/location') return json(await approximateLocation());

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
