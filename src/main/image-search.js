// Wallpaper search across free, key-less sources.
//
//   Wallhaven          main source: high-resolution wallpapers, safe-for-work, anime + general
//   Wikipedia          lead image of matching articles (official character art, posters)
//   Wikimedia Commons  freely licensed images
//   Openverse          Creative Commons images
//
// All sources run in parallel; any of them may fail without breaking the search.
// Wallhaven results are re-ranked by their character tags, so "blossom buttercup" puts
// images of exactly those characters above group shots that also include others.

const USER_AGENT = 'LiveWallpaperDashboard/1.0 (personal project; https://github.com/rabiya43/custom-wallpaper)';
const TIMEOUT_MS = 8000;
const PAGE_SIZE = 30;
const MIN_WIDTH = 500;
const MIN_HEIGHT = 300;
const TAG_LOOKUPS = 10;        // only the top results get character tags
const TAG_CONCURRENCY = 4;
const WALLHAVEN_PER_MINUTE = 40;  // Wallhaven allows 45; keep a margin
const SEARCH_RESERVE = 6;         // tag lookups never use the last few requests, so searches keep working

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'from', 'in', 'on', 'wallpaper', 'wallpapers',
    'hd', '4k', 'png', 'image', 'images', 'picture', 'photo', 'character', 'movie', 'film', 'show']);
const JUNK_WORDS = ['logo', 'icon', 'flag', 'map', 'signature', 'symbol', 'badge', 'seal', 'coat of',
    'diagram', 'chart', 'stamp', 'banner', 'button', 'favicon', 'wordmark', 'infobox', 'silhouette', 'screenshot'];
const PHOTO_WORDS = ['cosplay', 'comic con', 'comiccon', 'dragon con', 'dragoncon', 'megacon', 'convention',
    'expo', 'festival', 'store', 'cafe', 'candy', 'ornament', 'chess', 'toy', 'figure', 'statue', 'costume',
    'premiere', 'exhibit', 'museum', 'street art', 'lego', 'theme park', 'disneyland'];

const searchCache = new Map();   // query|page -> { time, payload }
const tagCache = new Map();      // wallhaven id -> [{ name, category }]
const CACHE_TTL = 10 * 60 * 1000;

// ------------------------------------------------------------------ helpers

const tokenize = text => (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(t => !STOPWORDS.has(t));
const compact = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

function tokenHits(tokens, text) {
    const words = new Set(text.toLowerCase().match(/[a-z0-9]+/g) || []);
    const flat = compact(text);
    return tokens.filter(t => words.has(t) || (t.length >= 4 && flat.includes(t))).length;
}

function cleanTitle(raw) {
    return (raw || '')
        .replace(/^(File|Image):/i, '')
        .replace(/\.(png|jpe?g|webp|gif|svg|tiff?)$/i, '')
        .replace(/[_\s]+/g, ' ')
        .trim();
}

function mimeFromUrl(url) {
    const ext = url.toLowerCase().split('?')[0].split('.').pop();
    return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] || '';
}

async function getJson(url, params) {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const res = await fetch(u, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${u.host} returned ${res.status}`);
    return res.json();
}

function thumbUrl(original) {
    const m = original.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/(\w+)\/([0-9a-f]\/[0-9a-f]{2})\/(.+)$/);
    if (!m) return original;
    const [, project, path, name] = m;
    return `https://upload.wikimedia.org/wikipedia/${project}/thumb/${path}/${name}/400px-${name}`;
}

function candidate(o) {
    return { license: '', bonus: 0, trusted: false, tags: [], ...o, width: o.width || 0, height: o.height || 0 };
}

async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            try { out[i] = await fn(items[i]); } catch { out[i] = null; }
        }
    });
    await Promise.all(workers);
    return out;
}

// ------------------------------------------------------------------ Wallhaven rate limit

const wallhavenCalls = [];  // timestamps of requests in the last minute

function wallhavenBudget() {
    const cutoff = Date.now() - 60000;
    while (wallhavenCalls.length && wallhavenCalls[0] < cutoff) wallhavenCalls.shift();
    return WALLHAVEN_PER_MINUTE - wallhavenCalls.length;
}

async function wallhavenGet(url, params, { retry = false } = {}) {
    wallhavenCalls.push(Date.now());
    try {
        return await getJson(url, params);
    } catch (e) {
        if (!retry || !/ 429$/.test(e.message)) throw e;
        await new Promise(r => setTimeout(r, 2000));
        wallhavenCalls.push(Date.now());
        return getJson(url, params);
    }
}

// ------------------------------------------------------------------ sources

async function wallhavenTags(id) {
    if (tagCache.has(id)) return tagCache.get(id);
    if (wallhavenBudget() <= SEARCH_RESERVE) return null;  // rank without tags rather than block searches
    const data = await wallhavenGet(`https://wallhaven.cc/api/v1/w/${id}`, {});
    const tags = (data.data?.tags || []).map(t => ({ name: t.name, category: t.category }));
    tagCache.set(id, tags);
    return tags;
}

async function searchWallhaven(query, tokens, page) {
    // First ask for wallpapers matching every word; loosen only if that's thin
    const base = { categories: '110', purity: '100', atleast: '1280x720', sorting: 'relevance', page };
    const strictQ = tokens.length > 1 ? tokens.map(t => `+${t}`).join(' ') : query;
    const strict = await wallhavenGet('https://wallhaven.cc/api/v1/search', { ...base, q: strictQ }, { retry: true });
    let data = strict.data || [];
    const strictCount = data.length;
    let lastPage = strict.meta?.last_page || 1;
    if (strictCount < 8 && tokens.length > 1) {
        const loose = await wallhavenGet('https://wallhaven.cc/api/v1/search', { ...base, q: query }, { retry: true });
        const seen = new Set(data.map(d => d.id));
        data = data.concat((loose.data || []).filter(d => !seen.has(d.id)));
        lastPage = Math.max(lastPage, loose.meta?.last_page || 1);
    }

    // Character tags for the top results
    const tagLists = await mapLimit(data.slice(0, TAG_LOOKUPS), TAG_CONCURRENCY, d => wallhavenTags(d.id));

    const out = data.map((item, pos) => {
        const [w, h] = item.resolution.split('x').map(Number);
        let bonus = 45 - pos * 0.5 + (pos < strictCount ? 8 : 0);
        const tags = tagLists[pos] || [];
        const characters = tags.filter(t => /character/i.test(t.category)).map(t => t.name);
        if (characters.length) {
            // Reward images whose characters are the ones typed; penalise extra characters
            const matched = characters.filter(c => tokenHits(tokens, c) > 0);
            const extra = characters.length - matched.length;
            const coverage = tokenHits(tokens, matched.join(' ')) / tokens.length;
            bonus += coverage * 15 - extra * 6;
        }
        return candidate({
            title: characters.length ? characters.join(', ') : query,
            thumb: item.thumbs.large, full: item.path, width: w, height: h,
            mime: item.file_type || 'image/jpeg', source: 'Wallhaven', page: item.url,
            bonus, trusted: true, tags: characters,
        });
    });
    return { results: out, morePages: page < lastPage };
}

async function searchWikipedia(query, tokens) {
    const data = await getJson('https://en.wikipedia.org/w/api.php', {
        action: 'query', format: 'json', generator: 'search', gsrsearch: query,
        gsrlimit: 5, prop: 'pageimages', piprop: 'original|name', redirects: 1,
    });
    const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
    const out = [];
    pages.forEach((page, rank) => {
        if (tokenHits(tokens, page.title) < Math.max(1, tokens.length / 2)) return;  // off-topic article
        const orig = page.original;
        if (!orig?.source) return;
        out.push(candidate({
            title: page.title, thumb: thumbUrl(orig.source), full: orig.source,
            width: orig.width, height: orig.height, mime: mimeFromUrl(orig.source), source: 'Wikipedia',
            page: 'https://en.wikipedia.org/wiki/' + page.title.replace(/ /g, '_'),
            bonus: 25 - rank * 4, trusted: true,
        }));
    });
    return { results: out, morePages: false };
}

async function searchCommons(query) {
    const data = await getJson('https://commons.wikimedia.org/w/api.php', {
        action: 'query', format: 'json', generator: 'search', gsrnamespace: 6,
        gsrsearch: `${query} filetype:bitmap`, gsrlimit: 30,
        prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: 400,
    });
    const out = [];
    for (const page of Object.values(data.query?.pages || {})) {
        const info = page.imageinfo?.[0];
        if (!info) continue;
        out.push(candidate({
            title: cleanTitle(page.title), thumb: info.thumburl || info.url, full: info.url,
            width: info.width, height: info.height, mime: info.mime || '', source: 'Wikimedia Commons',
            page: info.descriptionurl || '', license: info.extmetadata?.LicenseShortName?.value || '',
        }));
    }
    return { results: out, morePages: false };
}

async function searchOpenverse(query, tokens, page) {
    const data = await getJson('https://api.openverse.org/v1/images/', {
        q: query, page_size: 20, page, mature: 'false', extension: 'png,jpg,jpeg,webp',
    });
    const out = (data.results || []).filter(i => i.url).map(item => {
        const tags = (item.tags || []).slice(0, 6).map(t => t.name).join(' ');
        return candidate({
            title: cleanTitle(item.title || tags), thumb: item.thumbnail || item.url, full: item.url,
            width: item.width, height: item.height, mime: mimeFromUrl(item.url) || 'image/jpeg',
            source: 'Openverse', page: item.foreign_landing_url || '',
            license: `${item.license || ''} ${item.license_version || ''}`.trim().toUpperCase(),
        });
    });
    return { results: out, morePages: page < (data.page_count || 1) };
}

// ------------------------------------------------------------------ ranking

function shapeOf(w, h) {
    if (!w || !h) return 'other';
    const r = w / h;
    if (r >= 1.4 && r <= 2.5) return 'wide';
    if (r < 0.9) return 'portrait';
    return 'other';
}

function score(c, tokens) {
    const coverage = c.trusted ? 1 : (tokens.length ? tokenHits(tokens, c.title) / tokens.length : 0);
    let s = coverage * 40 + c.bonus;
    if (c.width >= 3840) s += 12;
    else if (c.width >= 1920) s += 10;
    else if (c.width >= 1280) s += 6;
    else if (c.width >= 800) s += 2;
    if (shapeOf(c.width, c.height) === 'wide') s += 4;
    if (c.mime === 'image/png') s += 2;
    const lowered = c.title.toLowerCase();
    if (JUNK_WORDS.some(j => lowered.includes(j))) s -= 40;
    if (PHOTO_WORDS.some(p => lowered.includes(p))) s -= 25;
    return { s, coverage };
}

function isUsable(c) {
    if (!ALLOWED_MIME.has(c.mime)) return false;
    if (c.width < MIN_WIDTH || c.height < MIN_HEIGHT) return false;
    const r = c.width / c.height;
    return r >= 0.4 && r <= 3.0;
}

const dedupeKey = c => (c.source === 'Wallhaven' ? c.full : compact(c.title) + c.width);

/**
 * Search all sources. `page` starts at 1; page 2+ only asks sources that support paging.
 * Returns { query, page, results, failed_sources, has_more }.
 */
async function search(rawQuery, page = 1) {
    const query = rawQuery.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!query) return { query, page, results: [], failed_sources: [], has_more: false };

    const cacheKey = `${query.toLowerCase()}|${page}`;
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.payload;

    const tokens = tokenize(query).length ? tokenize(query) : query.toLowerCase().split(' ');
    const sources = page === 1
        ? { Wallhaven: searchWallhaven, Wikipedia: searchWikipedia, 'Wikimedia Commons': searchCommons, Openverse: searchOpenverse }
        : { Wallhaven: searchWallhaven, Openverse: searchOpenverse };

    const names = Object.keys(sources);
    const settled = await Promise.allSettled(names.map(n => sources[n](query, tokens, page)));
    const candidates = [];
    const failed = [];
    let hasMore = false;
    settled.forEach((r, i) => {
        if (r.status === 'fulfilled') {
            candidates.push(...r.value.results);
            hasMore = hasMore || r.value.morePages;
        } else {
            console.warn(`${names[i]} search failed:`, r.reason?.message);
            failed.push(names[i]);
        }
    });

    const scored = [];
    for (const c of candidates) {
        if (!isUsable(c)) continue;
        const { s, coverage } = score(c, tokens);
        if (!c.trusted && coverage < 0.5) continue;  // must mention what was typed
        if (s < 25) continue;
        scored.push({ ...c, score: Math.round(s * 10) / 10, shape: shapeOf(c.width, c.height) });
    }
    scored.sort((a, b) => b.score - a.score);

    const seen = new Set();
    const results = [];
    for (const c of scored) {
        const key = dedupeKey(c);
        if (seen.has(key)) continue;
        seen.add(key);
        const { title, thumb, full, width, height, source, page: link, license, shape, score: sc, tags } = c;
        results.push({ title, thumb, full, width, height, source, page: link, license, shape, score: sc, tags });
        if (results.length >= PAGE_SIZE) break;
    }

    const payload = { query, page, results, failed_sources: failed, has_more: hasMore };
    if (!failed.length) {
        if (searchCache.size >= 100) searchCache.delete(searchCache.keys().next().value);
        searchCache.set(cacheKey, { time: Date.now(), payload });
    }
    return payload;
}

module.exports = { search, ALLOWED_MIME, USER_AGENT };
