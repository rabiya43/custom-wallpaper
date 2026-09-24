// Understands dates and times typed the way people write them, like Outlook's date boxes:
//   "tomorrow 7am", "next fri 3:30pm", "in 20 min", "25/12 8pm", "7p", "tmrw 8",
//   "day after tomorrow 6am", "sept 30 9am", "3-4pm", "every weekday 7:30"
// Ambiguous dates like 5/6 follow the order in the Windows short-date setting.
const chrono = require('chrono-node');

const DAY_WORDS = {
    sun: 0, sunday: 0, sundays: 0, mon: 1, monday: 1, mondays: 1, tue: 2, tues: 2, tuesday: 2, tuesdays: 2,
    wed: 3, weds: 3, wednesday: 3, wednesdays: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, thursdays: 4,
    fri: 5, friday: 5, fridays: 5, sat: 6, saturday: 6, saturdays: 6,
};

let parser = chrono.en.GB;

/** monthFirst: true for M/d (US style), false for d/M. */
function setDateOrder(monthFirst) {
    parser = monthFirst ? chrono.en : chrono.en.GB;
}

/** Reads the date order from Windows' regional settings (Control Panel > Region > Short date). */
function useWindowsDateOrder() {
    try {
        const out = require('child_process').execFileSync('reg', ['query', 'HKCU\\Control Panel\\International', '/v', 'sShortDate'],
            { encoding: 'utf8', windowsHide: true, timeout: 3000 });
        const pattern = (out.match(/sShortDate\s+REG_SZ\s+(\S+)/) || [])[1] || '';
        setDateOrder(/^M/.test(pattern));
    } catch {
        // Keep day-first
    }
}

function normalize(text) {
    return ` ${text.toLowerCase()} `
        .replace(/\s+/g, ' ')
        .replace(/\b(tmrw|tmr|tmw|tomo|tomm?orow)\b/g, 'tomorrow')
        .replace(/\bday after tomorrow\b/g, 'in 2 days')
        .replace(/\bsept\b/g, 'sep')
        // "sep 30" -> "30 sep" (otherwise it can be read as September 2030)
        .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?![\d:])/g, '$2 $1')
        .replace(/\b(tues|thurs|weds)\b/g, m => ({ tues: 'tue', thurs: 'thu', weds: 'wed' })[m])
        .replace(/\b(\d{1,2}(?::\d{2})?)\s*([ap])\.?\b(?!m)/g, '$1$2m')          // 7p -> 7pm
        .replace(/\b(\d+)\s*(?:h|hr|hrs)\b/g, '$1 hours')
        .replace(/\b(\d+)\s*(?:m|min|mins)\b/g, '$1 minutes')
        .replace(/\bnoon\b/g, '12pm')
        .replace(/\bmidnight\b/g, '12am')
        .trim();
}

/** "every weekday", "daily", "weekends", "every mon and wed" -> [0-6] days, or null. */
function repeatDays(text) {
    const t = text.toLowerCase();
    if (/\b(every ?day|daily)\b/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
    if (/\b(every |each )?week ?days?\b/.test(t)) return [1, 2, 3, 4, 5];
    if (/\b(every )?weekends?\b/.test(t)) return [0, 6];
    const every = t.match(/\b(?:every|each)\b(.*)/);
    const scope = every ? every[1] : (/\b\w+days\b/.test(t) ? t : '');  // "mondays and fridays"
    if (!scope) return null;
    const days = new Set();
    for (const w of scope.match(/[a-z]+/g) || []) if (w in DAY_WORDS) days.add(DAY_WORDS[w]);
    return days.size ? [...days].sort() : null;
}

/**
 * Parses free text. Returns null if nothing was understood, otherwise
 * { start, end, hasTime, hasDate, days, matched } where start/end are ISO strings.
 * `mode` is 'alarm' (a single moment, may repeat) or 'event' (may have an end).
 */
function parse(text, { now = new Date(), mode = 'alarm' } = {}) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const days = mode === 'alarm' ? repeatDays(raw) : null;

    // Remove the repeat words so they aren't read as a date
    const cleaned = days
        ? raw.replace(/\b(every ?day|daily|every|each|week ?days?|weekends?|and|on)\b/gi, ' ')
            .replace(/\b(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(day)?s?\b/gi, ' ')
        : raw;
    const input = normalize(cleaned);

    const results = parser.parse(input, now, { forwardDate: true });
    let start, end = null, hasTime = false, hasDate = false, matched = '';

    if (results.length) {
        // chrono sometimes reads "sep 30 9am" as two pieces; take the day from one and the time from the other
        const r = results.find(x => x.start.isCertain('day') || x.start.isCertain('weekday')) || results[0];
        const timePart = r.start.isCertain('hour') ? null : results.find(x => x !== r && x.start.isCertain('hour'));
        const s = r.start;
        start = s.date();
        hasTime = s.isCertain('hour');
        hasDate = s.isCertain('day') || s.isCertain('weekday') || /\b(today|tonight|tomorrow|in \d+|next|this)\b/.test(input);
        matched = r.text;
        if (timePart) {
            const t = timePart.start.date();
            start.setHours(t.getHours(), t.getMinutes(), 0, 0);
            hasTime = true;
            matched = `${r.text} ${timePart.text}`;
            if (timePart.end) {
                end = new Date(start);
                end.setHours(timePart.end.date().getHours(), timePart.end.date().getMinutes(), 0, 0);
            }
        }
        if (r.end && !end) end = r.end.date();

        // "tomorrow 8": a bare number next to a date word is the hour
        if (!hasTime) {
            const rest = input.replace(r.text, ' ');
            const bare = rest.match(/(?:^|\s)(\d{1,2})(?::(\d{2}))?(?=\s|$)/);
            if (bare && Number(bare[1]) < 24) {
                start.setHours(Number(bare[1]), Number(bare[2] || 0), 0, 0);
                hasTime = true;
            }
        }
    } else {
        // A bare time like "730" or "7"
        const m = input.match(/^(\d{1,2})(?::?(\d{2}))?$/);
        if (!m || Number(m[1]) > 23 || Number(m[2] || 0) > 59) return days ? { days, hasTime: false, hasDate: false } : null;
        start = new Date(now);
        start.setHours(Number(m[1]), Number(m[2] || 0), 0, 0);
        if (start <= now) start.setDate(start.getDate() + 1);
        hasTime = true;
        matched = m[0];
    }

    if (!hasTime && mode === 'alarm') start.setHours(7, 0, 0, 0);  // "monday" alarm -> 7:00 AM
    start.setSeconds(0, 0);
    if (end) end.setSeconds(0, 0);
    // A plain time that has already passed today means tomorrow
    if (!hasDate && hasTime && start <= now) start.setDate(start.getDate() + 1);

    return {
        start: start.toISOString(),
        end: end ? end.toISOString() : null,
        hasTime,
        hasDate,
        days,
        matched,
    };
}

module.exports = { parse, setDateOrder, useWindowsDateOrder };
