// Google Calendar: sign in, read events, and add / edit / delete them.
//
// Sign-in uses Google's recommended flow for desktop apps: the system browser opens Google's
// own sign-in page and sends the result back to a temporary local address (127.0.0.1) with
// PKCE. The app never sees the password. The refresh token is stored encrypted with Windows'
// data protection (Electron safeStorage).
//
// The app's Google client ID lives in google-oauth.json next to this file (see the README).
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { app, shell, safeStorage } = require('electron');

const SCOPES = [
    'openid',
    'email',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
];
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const EVENTS_TTL_MS = 5 * 60 * 1000;

// Endpoints can be pointed at a local fake server by the automated tests
const ENDPOINTS = {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    revoke: 'https://oauth2.googleapis.com/revoke',
    api: 'https://www.googleapis.com/calendar/v3',
    ...(process.env.LWD_TEST_PROFILE && process.env.LWD_GOOGLE_ENDPOINTS ? JSON.parse(process.env.LWD_GOOGLE_ENDPOINTS) : {}),  // tests only
};

// Automated tests use a fake Google server and "visit" the sign-in page themselves instead of opening a browser
const TESTING = !!(process.env.LWD_TEST_PROFILE && process.env.LWD_GOOGLE_ENDPOINTS);
const openBrowser = TESTING ? url => fetch(url).catch(() => {}) : url => shell.openExternal(url);

let session = null;        // { refreshToken, email, accessToken, expiresAt }
let pendingSignIn = null;  // { server, reject }
let calendarCache = null;  // { time, items }
const eventCache = new Map();

const authFile = () => path.join(app.getPath('userData'), 'google-auth.bin');

function clientConfig() {
    if (process.env.LWD_GOOGLE_CLIENT_ID) {
        return { client_id: process.env.LWD_GOOGLE_CLIENT_ID, client_secret: process.env.LWD_GOOGLE_CLIENT_SECRET || '' };
    }
    try {
        const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'google-oauth.json'), 'utf8'));
        const c = cfg.installed || cfg;  // accepts the JSON file downloaded from Google Cloud as-is
        return c.client_id ? { client_id: c.client_id, client_secret: c.client_secret || '' } : null;
    } catch {
        return null;
    }
}

const isConfigured = () => !!clientConfig();

// ------------------------------------------------------------------ stored sign-in

function loadSession() {
    if (session) return session;
    try {
        const raw = fs.readFileSync(authFile());
        const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
        const data = JSON.parse(text);
        if (data.refreshToken) session = { refreshToken: data.refreshToken, email: data.email || '' };
    } catch {
        session = null;
    }
    return session;
}

function storeSession() {
    const text = JSON.stringify({ refreshToken: session.refreshToken, email: session.email });
    const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8');
    fs.mkdirSync(path.dirname(authFile()), { recursive: true });
    fs.writeFileSync(authFile(), data);
}

function clearSession() {
    session = null;
    calendarCache = null;
    eventCache.clear();
    fs.rmSync(authFile(), { force: true });
}

function account() {
    const s = loadSession();
    return s ? { email: s.email } : null;
}

// ------------------------------------------------------------------ sign in / out

const base64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function emailFromIdToken(idToken) {
    try {
        return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')).email || '';
    } catch {
        return '';
    }
}

async function tokenRequest(params) {
    const client = clientConfig();
    const body = new URLSearchParams({ client_id: client.client_id, ...params });
    if (client.client_secret) body.set('client_secret', client.client_secret);
    const res = await fetch(ENDPOINTS.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error_description || data.error || `Google returned ${res.status}`);
        err.code = data.error;
        throw err;
    }
    return data;
}

const pageHtml = (title, text) => `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="font-family:Segoe UI,sans-serif;background:#1d2029;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center;max-width:420px"><h2>${title}</h2><p style="opacity:.75">${text}</p></div></body>`;

/** Opens Google's sign-in page in the browser and waits for the user to finish. */
function signIn() {
    if (!isConfigured()) return Promise.reject(new Error('Google sign-in is not set up in this copy of the app.'));
    if (pendingSignIn) {
        pendingSignIn.reject(new Error('Sign-in restarted'));
        pendingSignIn.server.close();
        pendingSignIn = null;
    }

    const verifier = base64url(crypto.randomBytes(48));
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    const state = base64url(crypto.randomBytes(16));

    return new Promise((resolve, reject) => {
        let redirectUri = '';
        const server = http.createServer(async (req, res) => {
            const url = new URL(req.url, redirectUri);
            if (url.pathname !== '/') { res.writeHead(404).end(); return; }
            if (url.searchParams.get('state') !== state) { res.writeHead(400).end('Invalid request'); return; }

            const error = url.searchParams.get('error');
            const code = url.searchParams.get('code');
            try {
                if (error || !code) {
                    throw new Error(error === 'access_denied' ? 'Sign-in was cancelled.' : `Google sign-in failed (${error || 'no code'}).`);
                }
                const tokens = await tokenRequest({
                    grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri,
                });
                if (!tokens.refresh_token) throw new Error('Google did not grant offline access. Please try again.');
                session = {
                    refreshToken: tokens.refresh_token,
                    email: emailFromIdToken(tokens.id_token || ''),
                    accessToken: tokens.access_token,
                    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
                };
                storeSession();
                calendarCache = null;
                eventCache.clear();
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
                    .end(pageHtml('You\'re signed in', 'You can close this tab and go back to Live Wallpaper Dashboard.'));
                finish(null, account());
            } catch (e) {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
                    .end(pageHtml('Sign-in didn\'t finish', `${e.message} You can close this tab and try again from the app.`));
                finish(e);
            }
        });

        const timer = setTimeout(() => finish(new Error('Sign-in timed out. Please try again.')), SIGN_IN_TIMEOUT_MS);
        function finish(err, value) {
            clearTimeout(timer);
            server.close();
            pendingSignIn = null;
            if (err) reject(err); else resolve(value);
        }
        pendingSignIn = { server, reject: e => finish(e) };

        server.listen(0, '127.0.0.1', () => {
            redirectUri = `http://127.0.0.1:${server.address().port}`;
            const auth = new URL(ENDPOINTS.auth);
            auth.search = new URLSearchParams({
                client_id: clientConfig().client_id,
                redirect_uri: redirectUri,
                response_type: 'code',
                scope: SCOPES.join(' '),
                code_challenge: challenge,
                code_challenge_method: 'S256',
                state,
                access_type: 'offline',
                prompt: 'consent select_account',
            }).toString();
            openBrowser(auth.toString());
        });
    });
}

function cancelSignIn() {
    if (pendingSignIn) pendingSignIn.reject(new Error('Sign-in was cancelled.'));
}

async function signOut() {
    const s = loadSession();
    if (s) {
        fetch(`${ENDPOINTS.revoke}?token=${encodeURIComponent(s.refreshToken)}`, { method: 'POST' }).catch(() => {});
    }
    clearSession();
}

// ------------------------------------------------------------------ API calls

async function accessToken() {
    const s = loadSession();
    if (!s) throw new Error('Not signed in to Google');
    if (s.accessToken && s.expiresAt > Date.now() + 60000) return s.accessToken;
    try {
        const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: s.refreshToken });
        s.accessToken = t.access_token;
        s.expiresAt = Date.now() + (t.expires_in || 3600) * 1000;
        return s.accessToken;
    } catch (e) {
        if (e.code === 'invalid_grant') {
            clearSession();
            throw new Error('Your Google sign-in expired. Please sign in again.');
        }
        throw e;
    }
}

async function api(method, route, body) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(`${ENDPOINTS.api}${route}`, {
            method,
            headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(20000),
        });
        if (res.status === 401 && attempt === 0) { session.accessToken = null; continue; }
        if (res.status === 204) return null;
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error?.message || `Google Calendar returned ${res.status}`);
        return data;
    }
}

async function calendars({ force = false } = {}) {
    if (!force && calendarCache && Date.now() - calendarCache.time < EVENTS_TTL_MS) return calendarCache.items;
    const data = await api('GET', '/users/me/calendarList?minAccessRole=reader&maxResults=100');
    const items = (data.items || [])
        .filter(c => !c.hidden && !c.deleted)
        .map(c => ({
            id: c.id,
            name: c.summaryOverride || c.summary || c.id,
            color: c.backgroundColor || '#7AB8FF',
            primary: !!c.primary,
            writable: c.accessRole === 'owner' || c.accessRole === 'writer',
            shown: c.selected !== false,
            defaultReminders: c.defaultReminders || [],
        }))
        .sort((a, b) => (b.primary - a.primary) || (b.writable - a.writable) || a.name.localeCompare(b.name));
    calendarCache = { time: Date.now(), items };
    return items;
}

const pad = n => String(n).padStart(2, '0');
const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function toEvent(ev, cal) {
    const allDay = !!ev.start?.date;
    // All-day dates are calendar days: build them in local time so they don't shift
    const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
    const start = allDay ? parseDay(ev.start.date) : new Date(ev.start.dateTime);
    const end = allDay ? parseDay(ev.end.date) : new Date(ev.end?.dateTime || ev.start.dateTime);
    return {
        id: ev.id,
        calendarId: cal.id,
        source: 'google',
        title: (ev.summary || '(No title)').slice(0, 200),
        start: start.toISOString(),
        end: end.toISOString(),
        date: localDate(start),
        allDay,
        location: ev.location || '',
        description: (ev.description || '').slice(0, 2000),
        calendar: cal.name,
        color: cal.color,
        editable: cal.writable && !ev.locked,
        recurring: !!ev.recurringEventId,
        reminder: readReminder(ev, cal),
    };
}

/** Events from every shown calendar between from and to (Dates). Repeats come back as separate events. */
async function events(from, to, { force = false } = {}) {
    const key = `${from.toISOString()}|${to.toISOString()}`;
    const cached = eventCache.get(key);
    if (!force && cached && Date.now() - cached.time < EVENTS_TTL_MS) return cached.items;

    const cals = (await calendars({ force })).filter(c => c.shown);
    const all = [];
    await Promise.all(cals.map(async cal => {
        let pageToken = '';
        for (let page = 0; page < 5; page++) {
            const q = new URLSearchParams({
                singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
                timeMin: from.toISOString(), timeMax: to.toISOString(),
            });
            if (pageToken) q.set('pageToken', pageToken);
            const data = await api('GET', `/calendars/${encodeURIComponent(cal.id)}/events?${q}`);
            for (const ev of data.items || []) if (ev.status !== 'cancelled' && ev.start) all.push(toEvent(ev, cal));
            pageToken = data.nextPageToken;
            if (!pageToken) break;
        }
    }));
    eventCache.clear();
    eventCache.set(key, { time: Date.now(), items: all });
    return all;
}

/**
 * The event's reminder as the dashboard shows it: { minutes, email, popup } or null for none.
 * Events that use the calendar's default reminders report those defaults.
 */
function readReminder(ev, cal) {
    const list = ev.reminders?.useDefault === false ? (ev.reminders.overrides || []) : (cal.defaultReminders || []);
    if (!list.length) return null;
    const minutes = Math.min(...list.map(r => r.minutes));
    return {
        minutes,
        email: list.some(r => r.method === 'email'),
        popup: list.some(r => r.method === 'popup'),
    };
}

/** Google's reminder settings from { minutes, email, popup } (null = no reminder). */
function reminderBody(r) {
    if (!r || r.minutes === null || r.minutes === undefined || (!r.email && !r.popup)) return { useDefault: false, overrides: [] };
    const minutes = Math.max(0, Math.min(40320, Math.round(Number(r.minutes) || 0)));  // Google allows up to 4 weeks
    const overrides = [];
    if (r.email) overrides.push({ method: 'email', minutes });
    if (r.popup) overrides.push({ method: 'popup', minutes });
    return { useDefault: false, overrides };
}

/** Google's event body from the dashboard's form: { title, start, end, allDay, location, description } */
function eventBody(e) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const body = { summary: String(e.title || '').slice(0, 200) || '(No title)' };
    if (e.location !== undefined) body.location = String(e.location).slice(0, 500);
    if (e.description !== undefined) body.description = String(e.description).slice(0, 5000);
    if (e.reminder !== undefined) body.reminders = reminderBody(e.reminder);
    if (e.allDay) {
        // start/end are local calendar days 'YYYY-MM-DD'; Google's end date is exclusive
        const [y, m, d] = e.endDate.split('-').map(Number);
        body.start = { date: e.startDate };
        body.end = { date: localDate(new Date(y, m - 1, d + 1)) };
    } else {
        body.start = { dateTime: new Date(e.start).toISOString(), timeZone: tz };
        body.end = { dateTime: new Date(e.end).toISOString(), timeZone: tz };
    }
    return body;
}

async function writableCalendar(id) {
    const cal = (await calendars()).find(c => c.id === id);
    if (!cal || !cal.writable) throw new Error('You can\'t add or change events in that calendar');
    return cal;
}

async function createEvent(calendarId, e) {
    const cal = await writableCalendar(calendarId);
    const ev = await api('POST', `/calendars/${encodeURIComponent(cal.id)}/events`, eventBody(e));
    eventCache.clear();
    return toEvent(ev, cal);
}

async function updateEvent(calendarId, eventId, e) {
    const cal = await writableCalendar(calendarId);
    const ev = await api('PATCH', `/calendars/${encodeURIComponent(cal.id)}/events/${encodeURIComponent(eventId)}`, eventBody(e));
    eventCache.clear();
    return toEvent(ev, cal);
}

async function deleteEvent(calendarId, eventId) {
    const cal = await writableCalendar(calendarId);
    await api('DELETE', `/calendars/${encodeURIComponent(cal.id)}/events/${encodeURIComponent(eventId)}`);
    eventCache.clear();
}

module.exports = {
    isConfigured, account, signIn, cancelSignIn, signOut,
    calendars, events, createEvent, updateEvent, deleteEvent,
};
