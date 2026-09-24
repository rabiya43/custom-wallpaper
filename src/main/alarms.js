// Alarm scheduling. Alarms live in the settings file and are checked here in the main
// process, so they ring whenever the app is running, whether or not the editor is open.
//
// Alarm: { id, time: 'HH:MM', label, days: [0-6] (0 = Sunday; empty = ring once),
//          enabled, sound: 'chime' | 'beep' | 'digital' | 'gentle' | 'file:<name>', soundName }
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const config = require('./config');

const BUILTIN_SOUNDS = ['chime', 'beep', 'digital', 'gentle'];
const SOUND_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
const SNOOZE_MINUTES = 5;

let onRing = () => {};
let onChange = () => {};
const snoozed = [];      // { alarm, at }
const fired = new Set(); // "<id>|<yyyy-mm-dd HH:MM>" so an alarm rings once per minute slot
let timer = null;

const soundsDir = () => path.join(app.getPath('userData'), 'sounds');
const pad = n => String(n).padStart(2, '0');
const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function list() {
    return (config.get('alarms') || []).map(a => ({ ...a }));
}

function sanitize(a) {
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(a.time) ? a.time : '07:00';
    const days = Array.isArray(a.days) ? [...new Set(a.days.map(Number).filter(d => d >= 0 && d <= 6))].sort() : [];
    const isFile = typeof a.sound === 'string' && a.sound.startsWith('file:');
    const sound = isFile || BUILTIN_SOUNDS.includes(a.sound) ? a.sound : 'chime';
    return {
        id: typeof a.id === 'string' && a.id ? a.id : crypto.randomUUID(),
        time,
        label: String(a.label || '').slice(0, 60),
        days,
        enabled: a.enabled !== false,
        sound,
        soundName: isFile ? String(a.soundName || 'Custom sound').slice(0, 80) : '',
    };
}

function save(alarms) {
    const clean = (Array.isArray(alarms) ? alarms : []).slice(0, 30).map(sanitize);
    config.set('alarms', clean);
    // Drop snoozes of alarms that were deleted (a one-time alarm is disabled after ringing but can still be snoozed)
    for (let i = snoozed.length - 1; i >= 0; i--) {
        if (!clean.some(a => a.id === snoozed[i].alarm.id)) snoozed.splice(i, 1);
    }
    removeUnusedSounds(clean);
    onChange();
    return clean;
}

/** Copies a chosen sound file into the app's folder so it keeps working if the original moves. */
function importSound(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (!SOUND_EXTENSIONS.includes(ext)) throw new Error('Choose an MP3, WAV, OGG, M4A, AAC or FLAC file');
    if (fs.statSync(filePath).size > 20 * 1024 * 1024) throw new Error('That sound file is larger than 20 MB');
    fs.mkdirSync(soundsDir(), { recursive: true });
    const name = crypto.randomUUID() + ext;
    fs.copyFileSync(filePath, path.join(soundsDir(), name));
    return { sound: `file:${name}`, soundName: path.basename(filePath) };
}

/** Path of an imported sound, or null. Only files inside the app's sounds folder are ever served. */
function soundFile(name) {
    if (!/^[0-9a-f-]{36}\.[a-z0-9]+$/.test(name)) return null;
    const p = path.join(soundsDir(), name);
    return fs.existsSync(p) ? p : null;
}

function removeUnusedSounds(alarms) {
    const used = new Set(alarms.filter(a => a.sound.startsWith('file:')).map(a => a.sound.slice(5)));
    if (!fs.existsSync(soundsDir())) return;
    for (const f of fs.readdirSync(soundsDir())) {
        // Keep files imported in the last hour: they may belong to an alarm that hasn't been saved yet
        const full = path.join(soundsDir(), f);
        if (!used.has(f) && Date.now() - fs.statSync(full).mtimeMs > 3600000) fs.rmSync(full, { force: true });
    }
}

function snooze(id) {
    const alarm = list().find(a => a.id === id);
    if (alarm) snoozed.push({ alarm, at: Date.now() + SNOOZE_MINUTES * 60000 });
}

/** Next time any enabled alarm will ring, for the widget. */
function next(now = new Date()) {
    let best = null;
    for (const a of list()) {
        if (!a.enabled) continue;
        const [h, m] = a.time.split(':').map(Number);
        for (let offset = 0; offset < 8; offset++) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, h, m);
            if (d <= now) continue;
            if (a.days.length && !a.days.includes(d.getDay())) continue;
            if (!best || d < best.at) best = { at: d, alarm: a };
            break;
        }
    }
    for (const s of snoozed) {
        if (!best || s.at < best.at) best = { at: new Date(s.at), alarm: s.alarm, snoozed: true };
    }
    return best && { at: best.at.toISOString(), time: best.alarm.time, label: best.alarm.label, snoozed: !!best.snoozed };
}

function tick() {
    const now = new Date();
    const slot = `${dayKey(now)} ${hhmm(now)}`;
    let changed = false;

    const alarms = list();
    for (const a of alarms) {
        if (!a.enabled || a.time !== hhmm(now)) continue;
        if (a.days.length && !a.days.includes(now.getDay())) continue;
        const key = `${a.id}|${slot}`;
        if (fired.has(key)) continue;
        fired.add(key);
        if (!a.days.length) { a.enabled = false; changed = true; }  // one-time alarm
        onRing(a);
    }
    for (let i = snoozed.length - 1; i >= 0; i--) {
        if (snoozed[i].at <= now.getTime()) onRing(snoozed.splice(i, 1)[0].alarm);
    }
    if (changed) save(alarms);
    if (fired.size > 200) fired.clear();
}

function start(handlers) {
    onRing = handlers.onRing || onRing;
    onChange = handlers.onChange || onChange;
    clearInterval(timer);
    timer = setInterval(tick, 5000);
    tick();
}

module.exports = { start, list, save, importSound, soundFile, snooze, next, BUILTIN_SOUNDS, SNOOZE_MINUTES };
