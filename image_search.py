"""Wallpaper image search across free, key-less sources.

Sources, in order of usefulness for character / movie wallpapers:
  1. Wallhaven          purpose-built wallpaper site, safe-for-work filter, high resolution
  2. Wikipedia          lead image of the matching article (official character art / posters)
  3. Wikimedia Commons  freely licensed photos and art
  4. Openverse          CC-licensed images from many sites

Every source runs in parallel and any of them may fail (or be blocked on the
user's network) without breaking the search. Results are merged, filtered for
relevance and quality, scored, de-duplicated and returned best-first.
"""
import re
import time
from concurrent.futures import ThreadPoolExecutor

import requests

USER_AGENT = 'LiveWallpaperDashboard/1.0 (personal project; https://github.com/rabiya43/custom-wallpaper)'
TIMEOUT = 7
MAX_RESULTS = 30
MIN_WIDTH = 500
MIN_HEIGHT = 300

WALLHAVEN_API = 'https://wallhaven.cc/api/v1/search'
WIKI_API = 'https://en.wikipedia.org/w/api.php'
COMMONS_API = 'https://commons.wikimedia.org/w/api.php'
OPENVERSE_API = 'https://api.openverse.org/v1/images/'

ALLOWED_MIME = {'image/png', 'image/jpeg', 'image/webp', 'image/gif'}
STOPWORDS = {'the', 'a', 'an', 'of', 'and', 'from', 'in', 'on', 'wallpaper', 'wallpapers',
             'hd', '4k', 'png', 'image', 'images', 'picture', 'photo', 'character', 'movie', 'film', 'show'}

# Filename / title fragments that mean "not something you'd want as a wallpaper"
JUNK_WORDS = ('logo', 'icon', 'flag', 'map', 'signature', 'symbol', 'badge', 'seal', 'coat of',
              'diagram', 'chart', 'stamp', 'banner', 'button', 'favicon', 'wordmark', 'infobox',
              'silhouette', 'screenshot')
# Real-world photos of merchandise / events: fine as results, but rank below actual art
PHOTO_WORDS = ('cosplay', 'comic con', 'comiccon', 'dragon con', 'dragoncon', 'megacon', 'convention',
               'expo', 'festival', 'store', 'cafe', 'candy', 'ornament', 'chess', 'toy', 'figure',
               'statue', 'costume', 'premiere', 'exhibit', 'museum', 'street art', 'lego', 'theme park',
               'disneyland', 'tokyo disney')

_session = requests.Session()
_session.headers.update({'User-Agent': USER_AGENT})

_cache = {}
CACHE_TTL = 600
CACHE_MAX = 100


# --------------------------------------------------------------------------- helpers

def tokenize(text):
    return [t for t in re.findall(r'[a-z0-9]+', text.lower()) if t not in STOPWORDS]


def compact(text):
    """Lowercase letters and digits only, so 'ElsaFrozen' and 'Elsa (Frozen)' both contain 'elsa'."""
    return re.sub(r'[^a-z0-9]+', '', text.lower())


def token_hits(tokens, text):
    """How many query tokens appear in text. Short tokens must be whole words, longer ones may be substrings."""
    words = set(re.findall(r'[a-z0-9]+', text.lower()))
    flat = compact(text)
    hits = 0
    for t in tokens:
        if t in words or (len(t) >= 4 and t in flat):
            hits += 1
    return hits


def clean_title(raw):
    name = re.sub(r'^(File|Image):', '', raw or '', flags=re.I)
    name = re.sub(r'\.(png|jpe?g|webp|gif|svg|tiff?)$', '', name, flags=re.I)
    return re.sub(r'[_\s]+', ' ', name).strip()


def get_json(url, params):
    resp = _session.get(url, params=params, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def mime_from_url(url):
    ext = url.lower().split('?')[0].rsplit('.', 1)[-1]
    return {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
            'webp': 'image/webp', 'gif': 'image/gif'}.get(ext, '')


def candidate(title, thumb, full, width, height, mime, source, page, license_name='', bonus=0, trusted=False):
    """trusted=True means the source already ranked this by relevance (skip our keyword check)."""
    return {'title': title, 'thumb': thumb, 'full': full, 'width': width or 0, 'height': height or 0,
            'mime': mime, 'source': source, 'page': page, 'license': license_name,
            'bonus': bonus, 'trusted': trusted}


# --------------------------------------------------------------------------- sources

def search_wallhaven(query, tokens):
    """General + anime categories only (no people photos), safe-for-work, at least 720p.

    First asks for wallpapers containing ALL keywords (+word +word); only if that is thin
    does it fall back to the looser search, so results match what was typed.
    """
    base = {'categories': '110', 'purity': '100', 'atleast': '1280x720', 'sorting': 'relevance'}
    strict_q = ' '.join(f'+{t}' for t in tokens) if len(tokens) > 1 else query
    data = get_json(WALLHAVEN_API, {**base, 'q': strict_q}).get('data', [])
    strict_count = len(data)
    if strict_count < 8 and len(tokens) > 1:
        loose = get_json(WALLHAVEN_API, {**base, 'q': query}).get('data', [])
        seen = {d['id'] for d in data}
        data += [d for d in loose if d['id'] not in seen]

    out = []
    for pos, item in enumerate(data):
        w, h = (int(x) for x in item['resolution'].split('x'))
        # earlier = more relevant; strict matches get an extra edge over loose ones
        bonus = 45 - pos * 0.5 + (8 if pos < strict_count else 0)
        out.append(candidate(
            title=f"{query} ({item['category']})", thumb=item['thumbs']['large'], full=item['path'],
            width=w, height=h, mime=item.get('file_type', 'image/jpeg'), source='Wallhaven',
            page=item['url'], bonus=bonus, trusted=True))
    return out


def search_wikipedia(query, tokens):
    """Lead image of articles whose *title* matches the query (character art, posters)."""
    data = get_json(WIKI_API, {
        'action': 'query', 'format': 'json', 'generator': 'search', 'gsrsearch': query,
        'gsrlimit': 5, 'prop': 'pageimages', 'piprop': 'original|name', 'redirects': 1,
    })
    pages = sorted(data.get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 99))
    out = []
    for rank, page in enumerate(pages):
        # Drop off-topic articles (e.g. an actor's page that merely mentions the character)
        if token_hits(tokens, page['title']) < max(1, len(tokens) / 2):
            continue
        orig = page.get('original')
        if not orig or not orig.get('source'):
            continue
        out.append(candidate(
            title=page['title'], thumb=thumb_url(orig['source']), full=orig['source'],
            width=orig.get('width'), height=orig.get('height'), mime=mime_from_url(orig['source']),
            source='Wikipedia', page='https://en.wikipedia.org/wiki/' + page['title'].replace(' ', '_'),
            bonus=25 - rank * 4, trusted=True))
    return out


def search_commons(query, tokens):
    data = get_json(COMMONS_API, {
        'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': 6,
        'gsrsearch': f'{query} filetype:bitmap', 'gsrlimit': 30,
        'prop': 'imageinfo', 'iiprop': 'url|size|mime|extmetadata', 'iiurlwidth': 400,
    })
    out = []
    for page in data.get('query', {}).get('pages', {}).values():
        info = (page.get('imageinfo') or [None])[0]
        if not info:
            continue
        meta = info.get('extmetadata', {})
        out.append(candidate(
            title=clean_title(page['title']), thumb=info.get('thumburl') or info['url'], full=info['url'],
            width=info.get('width'), height=info.get('height'), mime=info.get('mime', ''),
            source='Wikimedia Commons', page=info.get('descriptionurl', ''),
            license_name=meta.get('LicenseShortName', {}).get('value', '')))
    return out


def search_openverse(query, tokens):
    data = get_json(OPENVERSE_API, {
        'q': query, 'page_size': 20, 'mature': 'false', 'extension': 'png,jpg,jpeg,webp',
    })
    out = []
    for item in data.get('results', []):
        url = item.get('url')
        if not url:
            continue
        tags = ' '.join(t.get('name', '') for t in (item.get('tags') or [])[:6])
        out.append(candidate(
            title=clean_title(item.get('title') or tags), thumb=item.get('thumbnail') or url, full=url,
            width=item.get('width'), height=item.get('height'), mime=mime_from_url(url) or 'image/jpeg',
            source='Openverse', page=item.get('foreign_landing_url', ''),
            license_name=f"{item.get('license', '')} {item.get('license_version', '')}".strip().upper()))
    return out


def thumb_url(original):
    """Wikimedia thumbnails can be derived from the original URL."""
    m = re.match(r'https://upload\.wikimedia\.org/wikipedia/(\w+)/([0-9a-f]/[0-9a-f]{2})/(.+)$', original)
    if not m:
        return original
    project, path, name = m.groups()
    return f'https://upload.wikimedia.org/wikipedia/{project}/thumb/{path}/{name}/400px-{name}'


# --------------------------------------------------------------------------- ranking

def shape_of(width, height):
    if not width or not height:
        return 'other'
    ratio = width / height
    if 1.4 <= ratio <= 2.5:
        return 'wide'
    if ratio < 0.9:
        return 'portrait'
    return 'other'


def score(cand, tokens):
    """Returns (score, keyword coverage 0..1)."""
    if cand['trusted']:
        coverage = 1.0
    else:
        coverage = token_hits(tokens, cand['title']) / len(tokens) if tokens else 0
    s = coverage * 40 + cand['bonus']

    w, h = cand['width'], cand['height']
    if w >= 3840:
        s += 12
    elif w >= 1920:
        s += 10
    elif w >= 1280:
        s += 6
    elif w >= 800:
        s += 2
    if shape_of(w, h) == 'wide':
        s += 4
    if cand['mime'] == 'image/png':
        s += 2  # often transparent character art

    lowered = cand['title'].lower()
    if any(j in lowered for j in JUNK_WORDS):
        s -= 40
    if any(p in lowered for p in PHOTO_WORDS):
        s -= 25
    return s, coverage


def is_usable(cand):
    if cand['mime'] not in ALLOWED_MIME:
        return False
    if cand['width'] < MIN_WIDTH or cand['height'] < MIN_HEIGHT:
        return False
    ratio = cand['width'] / cand['height']  # banners and strips aren't wallpapers
    return 0.4 <= ratio <= 3.0


def dedupe_key(cand):
    if cand['source'] == 'Wallhaven':
        return cand['full']
    return compact(cand['title']) + str(cand['width'])


def search(query):
    query = re.sub(r'\s+', ' ', query).strip()[:120]
    if not query:
        return {'query': query, 'results': [], 'failed_sources': []}

    now = time.time()
    cached = _cache.get(query.lower())
    if cached and now - cached[0] < CACHE_TTL:
        return cached[1]

    tokens = tokenize(query) or query.lower().split()

    sources = {'Wallhaven': search_wallhaven, 'Wikipedia': search_wikipedia,
               'Wikimedia Commons': search_commons, 'Openverse': search_openverse}
    candidates, failed = [], []
    with ThreadPoolExecutor(max_workers=len(sources)) as pool:
        futures = {name: pool.submit(fn, query, tokens) for name, fn in sources.items()}
        for name, fut in futures.items():
            try:
                candidates.extend(fut.result(timeout=TIMEOUT * 2))
            except Exception as e:
                print(f'{name} search failed: {e}')
                failed.append(name)

    scored = []
    for cand in candidates:
        if not is_usable(cand):
            continue
        s, coverage = score(cand, tokens)
        # Sources without their own relevance ranking must actually mention what was typed
        if not cand['trusted'] and coverage < 0.5:
            continue
        if s < 25:
            continue
        cand['score'] = round(s, 1)
        cand['shape'] = shape_of(cand['width'], cand['height'])
        scored.append(cand)

    scored.sort(key=lambda c: c['score'], reverse=True)
    seen, results = set(), []
    for cand in scored:
        key = dedupe_key(cand)
        if key in seen:
            continue
        seen.add(key)
        results.append({k: cand[k] for k in
                        ('title', 'thumb', 'full', 'width', 'height', 'source', 'page', 'license', 'shape', 'score')})
        if len(results) >= MAX_RESULTS:
            break

    payload = {'query': query, 'results': results, 'failed_sources': failed}
    if not failed:  # don't cache partial results
        if len(_cache) >= CACHE_MAX:
            _cache.pop(next(iter(_cache)))
        _cache[query.lower()] = (now, payload)
    return payload
