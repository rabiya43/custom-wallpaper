// The app downloads URLs that come from web pages and from the user (images, calendar links).
// Only public http(s) addresses are allowed, so nothing can make the app read the local network.
const dns = require('dns').promises;
const net = require('net');

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

/**
 * fetch() that re-checks every redirect hop. Returns the final Response.
 * Throws an Error with .status for refused or failed requests.
 */
async function safeFetch(raw, { headers = {}, timeout = 15000 } = {}) {
    let url = raw;
    for (let hop = 0; hop < 5; hop++) {
        if (!(await isPublicUrl(url))) throw Object.assign(new Error('URL not allowed'), { status: 400 });
        const res = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
            url = new URL(res.headers.get('location'), url).toString();
            continue;
        }
        return res;
    }
    throw Object.assign(new Error('Too many redirects'), { status: 502 });
}

module.exports = { isPublicUrl, safeFetch };
