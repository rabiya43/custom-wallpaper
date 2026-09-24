// Calendar events from the user's calendars.
//
// Feeds are private iCal links ("secret address in iCal format" in Google Calendar,
// "Publish calendar" ICS link in Outlook), refreshed every few minutes. A folder of .ics
// files is also supported. Repeating events are expanded into real dates.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ical = require('node-ical');
const config = require('./config');
const { safeFetch } = require('./net-safety');

const REFRESH_MS = 10 * 60 * 1000;
const MAX_ICS_BYTES = 15 * 1024 * 1024;
const PAST_DAYS = 45;       // enough for the month shown on the calendar
const FUTURE_DAYS = 90;
const COLORS = ['#7AB8FF', '#FF8FA3', '#8FE3B0', '#FFD166', '#C3A6FF', '#FF9F6B'];

const cache = new Map();  // feed id -> { time, events, error }

function feeds() {
    return (config.get('calendarFeeds') || []).map(f => ({ ...f }));
}

function normalizeUrl(raw) {
    const url = String(raw || '').trim().replace(/^webcals?:\/\//i, 'https://');
    try {
        const u = new URL(url);
        if (!['http:', 'https:'].includes(u.protocol)) return null;
        return u.toString();
    } catch {
        return null;
    }
}

/** Adds a feed after checking that the link really is a calendar. Returns the saved feed. */
async function addFeed({ name, url }) {
    const clean = normalizeUrl(url);
    if (!clean) throw new Error('That doesn\'t look like a calendar link');
    const list = feeds();
    if (list.some(f => f.url === clean)) throw new Error('That calendar is already connected');
    if (list.length >= 10) throw new Error('You can connect up to 10 calendars');

    const feed = {
        id: crypto.randomUUID(),
        name: String(name || '').trim().slice(0, 40),
        url: clean,
        color: COLORS[list.length % COLORS.length],
    };
    let loaded;
    try {
        loaded = await loadFeed(feed);  // throws if it isn't a working calendar
    } catch (e) {
        if (e.message === 'URL not allowed') {
            throw new Error('That link points to a local or private network address. Use your calendar\'s public iCal link.');
        }
        if (e.name === 'TimeoutError' || /fetch failed/.test(e.message)) {
            throw new Error('Couldn\'t reach that calendar. Check the link and your internet connection.');
        }
        throw e;
    }
    const { events, calName } = loaded;
    if (!feed.name) feed.name = (calName || 'Calendar').slice(0, 40);
    cache.set(feed.id, { time: Date.now(), events, error: null });
    config.set('calendarFeeds', [...list, feed]);
    return feed;
}

function removeFeed(id) {
    config.set('calendarFeeds', feeds().filter(f => f.id !== id));
    cache.delete(id);
}

async function loadFeed(feed) {
    const res = await safeFetch(feed.url, { headers: { Accept: 'text/calendar, */*' } });
    if (res.status === 404 || res.status === 401 || res.status === 403) {
        throw new Error('The calendar link was refused. Copy the private (secret) iCal link again.');
    }
    if (!res.ok) throw new Error(`The calendar server returned ${res.status}`);
    const text = await res.text();
    if (text.length > MAX_ICS_BYTES) throw new Error('That calendar is too large');
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('That link isn\'t an iCal calendar (it should end in .ics)');
    const data = ical.sync.parseICS(text);
    const calName = Object.values(data).find(v => v.type === 'VCALENDAR')?.['WR-CALNAME']
        || (text.match(/^X-WR-CALNAME:(.+)$/m) || [])[1]?.trim();
    return { events: expand(data, feed), calName };
}

const pad = n => String(n).padStart(2, '0');
const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function toEvent(ev, start, end, allDay, source) {
    return {
        title: String(ev.summary?.val ?? ev.summary ?? 'Event').slice(0, 120),
        start: start.toISOString(),
        end: end.toISOString(),
        date: localDate(start),  // local calendar day, used for the dots
        allDay,
        calendar: source.name,
        color: source.color,
    };
}

/** Turns parsed iCal data into concrete events within the window, including repeats. */
function expand(data, source) {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - PAST_DAYS);
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + FUTURE_DAYS);
    const out = [];

    for (const ev of Object.values(data)) {
        if (ev.type !== 'VEVENT' || !ev.start || ev.status === 'CANCELLED') continue;
        const allDay = ev.datetype === 'date';
        const duration = ev.end ? ev.end - ev.start : (allDay ? 86400000 : 3600000);

        if (!ev.rrule) {
            const end = new Date(ev.start.getTime() + duration);
            if (end >= from && ev.start <= to) out.push(toEvent(ev, ev.start, end, allDay, source));
            continue;
        }

        const exdates = new Set(Object.values(ev.exdate || {}).map(d => new Date(d).getTime()));
        for (const occ of ev.rrule.between(from, to, true)) {
            // All-day repeats come back as local midnight; keep them on that calendar day
            const start = allDay
                ? new Date(occ.getFullYear(), occ.getMonth(), occ.getDate())
                : new Date(occ.getTime());
            if (exdates.has(start.getTime())) continue;

            const override = ev.recurrences?.[localDate(start)] || ev.recurrences?.[start.toISOString().slice(0, 10)];
            if (override) {
                if (override.status === 'CANCELLED' || !override.start) continue;
                const oEnd = override.end || new Date(override.start.getTime() + duration);
                out.push(toEvent(override, override.start, oEnd, override.datetype === 'date', source));
                continue;
            }
            out.push(toEvent(ev, start, new Date(start.getTime() + duration), allDay, source));
        }
    }
    return out;
}

function folderEvents() {
    const dir = config.get('calendarDir');
    if (!dir || !fs.existsSync(dir)) return [];
    const source = { name: path.basename(dir), color: '' };  // no color: the dashboard uses its accent color
    const out = [];
    for (const name of fs.readdirSync(dir)) {
        if (!name.toLowerCase().endsWith('.ics')) continue;
        try {
            out.push(...expand(ical.sync.parseFile(path.join(dir, name)), source));
        } catch (e) {
            console.warn(`Skipping ${name}:`, e.message);
        }
    }
    return out;
}

/** All events from every source. Feeds are refreshed when their copy is older than REFRESH_MS. */
async function allEvents({ force = false } = {}) {
    const list = feeds();
    const status = [];
    const events = [];
    await Promise.all(list.map(async feed => {
        let entry = cache.get(feed.id);
        if (force || !entry || Date.now() - entry.time > REFRESH_MS) {
            try {
                const { events: evs } = await loadFeed(feed);
                entry = { time: Date.now(), events: evs, error: null };
            } catch (e) {
                // Keep showing the last good copy if a refresh fails
                entry = { time: Date.now(), events: entry?.events || [], error: e.message };
            }
            cache.set(feed.id, entry);
        }
        events.push(...entry.events);
        status.push({ id: feed.id, name: feed.name, color: feed.color, error: entry.error, updated: new Date(entry.time).toISOString() });
    }));
    events.push(...folderEvents());
    events.sort((a, b) => a.start.localeCompare(b.start));
    return { events, feeds: status, folder: config.get('calendarDir') || '' };
}

module.exports = { feeds, addFeed, removeFeed, allEvents, expand };
