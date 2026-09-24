// The desktop app serves this page over app:// and opens it in one of two modes:
//   wallpaper  behind the desktop icons, display only
//   editor     on top of everything, for customizing
// Opened directly in a browser the page is fully interactive, but search needs the app.
const pageParams = new URLSearchParams(location.search);
const IS_APP = location.protocol === 'app:';
const MODE = IS_APP ? (pageParams.get('mode') || 'editor') : 'browser';
document.body.classList.add(`mode-${MODE}`);

const dashboard = document.querySelector('.dashboard-container');
if (IS_APP) {
    // Keep widgets out from under the taskbar
    [['t', 'top'], ['l', 'left'], ['r', 'right'], ['b', 'bottom']].forEach(([key, side]) => {
        dashboard.style[side] = (Number(pageParams.get(key)) || 0) + 'px';
    });
}

// --- Draggable, Resizable, & Edit Mode ---
document.addEventListener('dblclick', (e) => {
    if (MODE === 'wallpaper') return;
    const widget = e.target.closest('.drag-widget');
    if (widget) {
        document.querySelectorAll('.drag-widget').forEach(w => w.classList.remove('edit-mode'));
        widget.classList.add('edit-mode');
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.drag-widget') && !e.target.closest('.close-btn')) {
        document.querySelectorAll('.drag-widget').forEach(w => w.classList.remove('edit-mode'));
    }
});

function makeDraggable(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    elmnt.onmousedown = function(e) {
        // ONLY allow dragging if in edit mode
        if (!elmnt.classList.contains('edit-mode')) return;
        
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('.interactive-btn') || e.target.closest('.todo-item') || e.target.closest('.close-btn')) {
            return;
        }
        
        const rect = elmnt.getBoundingClientRect();
        const isResizeHandle = (e.clientX > rect.right - 25 && e.clientY > rect.bottom - 25);
        if (isResizeHandle) return;

        elmnt.style.transition = 'none';

        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    };

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
        elmnt.style.right = "auto";
        elmnt.style.bottom = "auto";
    }
    
    function closeDragElement() { 
        document.onmouseup = null; 
        document.onmousemove = null; 

        const snapDistance = 60; 
        const edgePadding = 40;  
        
        // Snap to the dashboard's edges (which exclude the taskbar in the app)
        const box = dashboard.getBoundingClientRect();
        const r = elmnt.getBoundingClientRect();
        const left = r.left - box.left, top = r.top - box.top;
        elmnt.style.transition = 'top 0.3s ease, left 0.3s ease';

        if (left < snapDistance) {
            elmnt.style.left = edgePadding + 'px';
        } else if (box.width - (left + r.width) < snapDistance) {
            elmnt.style.left = (box.width - r.width - edgePadding) + 'px';
        }

        if (top < snapDistance) {
            elmnt.style.top = edgePadding + 'px';
        } else if (box.height - (top + r.height) < snapDistance) {
            elmnt.style.top = (box.height - r.height - edgePadding) + 'px';
        }
        
        setTimeout(() => {
            elmnt.style.transition = 'background 0.4s ease, border-color 0.4s ease';
        }, 300);
    }
}

document.querySelectorAll('.drag-widget').forEach(makeDraggable);

// --- Layout persistence (position, size, hidden widgets) ---
const LAYOUT_KEY = 'dashboard-layout';
let layoutState = {};
try { layoutState = JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch (e) { layoutState = {}; }

function saveWidget(widget, hidden = false) {
    const id = widget.dataset.id;
    if (!id) return;
    const s = widget.style;
    layoutState[id] = { top: s.top, left: s.left, right: s.right, bottom: s.bottom, width: s.width, height: s.height, hidden };
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layoutState));
}

function restoreLayout() {
    document.querySelectorAll('.drag-widget[data-id]').forEach(widget => {
        const saved = layoutState[widget.dataset.id];
        if (!saved) return;
        if (saved.hidden) { widget.style.display = 'none'; return; }
        ['top', 'left', 'right', 'bottom', 'width', 'height'].forEach(prop => {
            if (saved[prop]) widget.style[prop] = saved[prop];
        });
        // Keep widgets reachable if the screen is smaller than when the layout was saved
        const box = dashboard.getBoundingClientRect();
        const rect = widget.getBoundingClientRect();
        if (rect.right > box.right) widget.style.left = Math.max(0, box.width - rect.width - 20) + 'px';
        if (rect.bottom > box.bottom) widget.style.top = Math.max(0, box.height - rect.height - 20) + 'px';
    });
}
restoreLayout();

// Save after a drag or resize finishes
// (delayed so the edge-snap animation has settled)
document.addEventListener('mouseup', () => {
    setTimeout(() => {
        document.querySelectorAll('.drag-widget.edit-mode').forEach(w => saveWidget(w));
    }, 350);
});

// Close button hides the widget (and remembers it)
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.close-btn');
    if (!btn) return;
    const widget = btn.closest('.drag-widget');
    if (widget) {
        widget.style.display = 'none';
        widget.classList.remove('edit-mode');
        saveWidget(widget, true);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.drag-widget').forEach(w => w.classList.remove('edit-mode'));
});

const resetLayoutBtn = document.getElementById('reset-layout-btn');
if (resetLayoutBtn) {
    resetLayoutBtn.addEventListener('click', () => {
        localStorage.removeItem(LAYOUT_KEY);
        location.reload();
    });
}

// --- HIGH-RELIABILITY INDEXEDDB WALLPAPER STORAGE (Supports 4K images & GIFs) ---
const WallpaperDB = {
    dbName: 'DashboardDB',
    storeName: 'wallpapers',
    open() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(this.storeName);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },
    async save(dataUrl) {
        try {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                tx.objectStore(this.storeName).put(dataUrl, 'currentWallpaper');
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        } catch(e) {
            console.warn('IndexedDB save failed:', e);
        }
    },
    async load() {
        try {
            const db = await this.open();
            return new Promise((resolve) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const req = tx.objectStore(this.storeName).get('currentWallpaper');
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        } catch(e) {
            return null;
        }
    },
    async clear() {
        try {
            const db = await this.open();
            return new Promise((resolve) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                tx.objectStore(this.storeName).delete('currentWallpaper');
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            });
        } catch(e) {}
    }
};

// --- CURATED COLOR PALETTES (Tailored Aesthetic & HCI Contrast) ---
const CHARACTER_PALETTES = {
    'buttercup': {bg1:'#2D5A46', bg2:'#509F8C', widgetBg:'rgba(0,0,0,0.25)', accent:'#A5C271', glow:'#E2F3B9', text:'#FFF'},
    'blossom':   {bg1:'#882D46', bg2:'#E06B78', widgetBg:'rgba(60,15,25,0.4)', accent:'#FFB6C1', glow:'#FFE4E1', text:'#FFF'},
    'bubbles':   {bg1:'#204060', bg2:'#4A8AB7', widgetBg:'rgba(15,30,50,0.4)', accent:'#87CEEB', glow:'#E0FFFF', text:'#FFF'},
    'snow white':{bg1:'#1C2A4A', bg2:'#C2943A', widgetBg:'rgba(15,25,45,0.45)', accent:'#FFD166', glow:'#FFE4A0', text:'#FFF'},
    'tweety':    {bg1:'#B8860B', bg2:'#2980B9', widgetBg:'rgba(60,45,10,0.45)', accent:'#FFE169', glow:'#FFF9C4', text:'#FFF'},
    'annabelle': {bg1:'#220606', bg2:'#6B1818', widgetBg:'rgba(30,5,5,0.6)', accent:'#E55353', glow:'#FF8A80', text:'#FFF'},
    'midnight':  {bg1:'#11141A', bg2:'#2C3240', widgetBg:'rgba(15,18,25,0.5)', accent:'#90CAF9', glow:'#E3F2FD', text:'#FFF'},
    'cyberpunk': {bg1:'#2B0B3F', bg2:'#007B8C', widgetBg:'rgba(35,10,50,0.5)', accent:'#00E5FF', glow:'#E1BEE7', text:'#FFF'},
    'mario':     {bg1:'#8B1E1E', bg2:'#1A4480', widgetBg:'rgba(50,10,10,0.5)', accent:'#FFC107', glow:'#FFECB3', text:'#FFF'},
    'batman':    {bg1:'#15171C', bg2:'#383C4A', widgetBg:'rgba(15,18,24,0.6)', accent:'#F4D03F', glow:'#F9E79F', text:'#FFF'},
    'elsa':      {bg1:'#1B4B6E', bg2:'#8BBBD9', widgetBg:'rgba(15,35,55,0.45)', accent:'#87CEFA', glow:'#F0F8FF', text:'#FFF'}
};

function applyPalette(palette, activeName = '') {
    const root = document.documentElement;
    const bg1 = palette.bg1 || '#2D5A46';
    const bg2 = palette.bg2 || '#509F8C';
    root.style.setProperty('--bg-color-1', bg1);
    root.style.setProperty('--bg-color-2', bg2);
    root.style.setProperty('--widget-bg', palette.widgetBg || 'rgba(0,0,0,0.25)');
    root.style.setProperty('--accent-color', palette.accent || '#A5C271');
    root.style.setProperty('--glow-color', palette.glow || '#E2F3B9');
    root.style.setProperty('--primary-text', palette.text || '#FFF');
    
    document.body.style.background = `radial-gradient(circle at 50% 30%, rgba(255,255,255,0.08) 0%, transparent 60%), linear-gradient(135deg, ${bg1}, ${bg2})`;

    // Sync HTML color pickers if values are hex
    const p1 = document.getElementById('bg-color-1-picker');
    const p2 = document.getElementById('bg-color-2-picker');
    if (p1 && bg1.startsWith('#')) p1.value = bg1;
    if (p2 && bg2.startsWith('#')) p2.value = bg2;

    // Update active chip state
    document.querySelectorAll('.palette-chip').forEach(chip => {
        const char = chip.getAttribute('data-char');
        chip.classList.toggle('active', !!(activeName && char === activeName));
    });

    localStorage.setItem('dashboard-palette', JSON.stringify({ name: activeName, palette }));
}

// --- WALLPAPER DISPLAY & LOCAL UPLOAD PIPELINE ---

function setWallpaperDisplay(dataUrl) {
    const wpImg = document.getElementById('character-wallpaper-img');
    if (!wpImg) return;
    if (dataUrl) {
        wpImg.onload = () => wpImg.classList.add('loaded');
        wpImg.onerror = () => wpImg.classList.remove('loaded');
        wpImg.classList.remove('loaded');
        wpImg.src = dataUrl;
    } else {
        wpImg.classList.remove('loaded');
        wpImg.src = '';
    }
}

async function handleNewWallpaperFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        showToast('Please choose an image file (PNG, JPG, WebP, GIF).');
        return;
    }
    try {
        await applyWallpaperBlob(file);
    } catch (e) {
        showToast("Couldn't read that image");
    }
}

// 1. File Input Upload Listener
const fileInput = document.getElementById('wallpaper-file-input');
if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleNewWallpaperFile(e.target.files[0]);
        }
    });
}

// 2. Full-Screen Drag-and-Drop Listeners
const dropOverlay = document.getElementById('drag-drop-overlay');
let dragCounter = 0;

window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dropOverlay) dropOverlay.classList.add('active');
});

window.addEventListener('dragover', (e) => {
    e.preventDefault();
});

window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
        dragCounter = 0;
        if (dropOverlay) dropOverlay.classList.remove('active');
    }
});

window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCounter = 0;
    if (dropOverlay) dropOverlay.classList.remove('active');
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleNewWallpaperFile(e.dataTransfer.files[0]);
    }
});

// 3. Clear Wallpaper Button
const clearBtn = document.getElementById('clear-wallpaper-btn');
if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
        setWallpaperDisplay('');
        await WallpaperDB.clear();
    });
}

// 4. Fit Mode Toggle Button (Center Character Art vs Full Cover)
const toggleFitBtn = document.getElementById('toggle-fit-btn');
const fitLabel = document.getElementById('fit-label');
const wpContainer = document.getElementById('character-wallpaper');

function setFitMode(mode) {
    if (!wpContainer) return;
    if (mode === 'cover') {
        wpContainer.classList.remove('mode-center');
        wpContainer.classList.add('mode-cover');
        if (fitLabel) fitLabel.textContent = 'Center art';
    } else {
        wpContainer.classList.remove('mode-cover');
        wpContainer.classList.add('mode-center');
        if (fitLabel) fitLabel.textContent = 'Fill screen';
    }
    localStorage.setItem('wallpaper-fit-mode', mode);
}

if (toggleFitBtn) {
    toggleFitBtn.addEventListener('click', () => {
        const isCurrentlyCenter = wpContainer?.classList.contains('mode-center');
        setFitMode(isCurrentlyCenter ? 'cover' : 'center');
    });
}

// 5. Preset Palette Chips Click Listeners
document.querySelectorAll('.palette-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        const char = chip.getAttribute('data-char');
        if (CHARACTER_PALETTES[char]) {
            applyPalette(CHARACTER_PALETTES[char], char);
        }
    });
});

// 6. Live Color Pickers Listeners
const color1Picker = document.getElementById('bg-color-1-picker');
const color2Picker = document.getElementById('bg-color-2-picker');

function updateCustomColors() {
    const c1 = color1Picker ? color1Picker.value : '#2D5A46';
    const c2 = color2Picker ? color2Picker.value : '#509F8C';
    const customPalette = {
        bg1: c1, bg2: c2,
        widgetBg: 'rgba(0,0,0,0.25)',
        accent: c2,
        glow: c1,
        text: '#FFF'
    };
    applyPalette(customPalette, '');
}

if (color1Picker) color1Picker.addEventListener('input', updateCustomColors);
if (color2Picker) color2Picker.addEventListener('input', updateCustomColors);

// 7. Wallpaper search (runs in the desktop app)
const wpForm = document.getElementById('wp-search-form');
const wpInput = document.getElementById('wp-search-input');
const wpModal = document.getElementById('wp-modal');
const wpGrid = document.getElementById('wp-grid');
const wpStatus = document.getElementById('wp-status');
const wpQuery = document.getElementById('wp-query');
const wpFilters = document.querySelectorAll('.wp-filter');
const wpMore = document.getElementById('wp-more');
const wpWeb = document.getElementById('wp-web');
const toastEl = document.getElementById('toast');

let wpResults = [];
let wpShape = 'all';
let wpAbort = null;
let wpCurrentQuery = '';
let wpPage = 1;
let toastTimer = null;

function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4000);
}

function openWpModal(query) {
    wpQuery.textContent = query;
    wpModal.hidden = false;
    document.getElementById('wp-close').focus();
}

function closeWpModal() {
    if (wpAbort) wpAbort.abort();
    wpModal.hidden = true;
    wpInput.focus();
}

function renderSkeletons() {
    wpGrid.innerHTML = '';
    for (let i = 0; i < 8; i++) {
        const sk = document.createElement('div');
        sk.className = 'wp-card wp-skeleton';
        wpGrid.appendChild(sk);
    }
}

function renderMessage(title, detail) {
    wpGrid.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'wp-empty';
    const h = document.createElement('strong');
    h.textContent = title;
    const p = document.createElement('p');
    p.textContent = detail;
    box.append(h, p);
    wpGrid.appendChild(box);
}

function renderResults() {
    const shown = wpShape === 'all' ? wpResults : wpResults.filter(r => r.shape === wpShape);
    wpFilters.forEach(b => b.classList.toggle('active', b.dataset.shape === wpShape));
    if (shown.length === 0) {
        renderMessage('Nothing in this shape', 'Try "All" or a different search.');
        return;
    }
    wpGrid.innerHTML = '';
    shown.forEach(item => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'wp-card';
        card.title = `${item.width}×${item.height} · ${item.source}`;

        const img = document.createElement('img');
        img.src = item.thumb;
        img.alt = item.title;
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => card.remove();

        const meta = document.createElement('span');
        meta.className = 'wp-meta';
        const who = item.tags && item.tags.length ? item.tags.slice(0, 3).join(', ') : '';
        meta.textContent = who ? `${who} · ${item.width}×${item.height}` : `${item.width}×${item.height} · ${item.source}`;

        card.append(img, meta);
        card.addEventListener('click', () => applyRemoteWallpaper(item, card));
        wpGrid.appendChild(card);
    });
}

async function runWallpaperSearch(query, page = 1) {
    if (wpAbort) wpAbort.abort();
    wpAbort = new AbortController();
    const signal = wpAbort.signal;
    const timeout = setTimeout(() => wpAbort.abort(), 30000);

    if (page === 1) {
        wpShape = 'all';
        wpResults = [];
        wpCurrentQuery = query;
        openWpModal(query);
        renderSkeletons();
        wpStatus.textContent = 'Searching...';
    } else {
        wpMore.disabled = true;
        wpMore.textContent = 'Loading...';
    }
    wpMore.hidden = true;

    try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&page=${page}`, { signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Search failed');

        // Page 2+ may repeat images from earlier pages
        const seen = new Set(wpResults.map(r => r.full));
        wpResults = wpResults.concat(data.results.filter(r => !seen.has(r.full)));
        wpPage = page;
        wpMore.hidden = !data.has_more;

        if (wpResults.length === 0) {
            wpStatus.textContent = 'No matches';
            renderMessage('No wallpapers found',
                'Try just the character or the movie name, or use "Search the whole web" above.');
            return;
        }
        const note = data.failed_sources.length ? ` (${data.failed_sources.join(', ')} unavailable)` : '';
        wpStatus.textContent = `${wpResults.length} results${note}`;
        renderResults();
    } catch (e) {
        if (wpAbort.signal !== signal || wpModal.hidden) return;  // superseded by a newer search, or closed
        if (page > 1) {
            showToast("Couldn't load more results");
            wpMore.hidden = false;
            return;
        }
        wpStatus.textContent = 'Search unavailable';
        if (e.name === 'AbortError') {
            renderMessage('The search took too long', 'Check your internet connection and try again.');
        } else if (!IS_APP) {
            renderMessage('Search runs in the desktop app',
                'Install Live Wallpaper Dashboard to search for wallpapers. You can still upload or drag in your own image.');
        } else {
            renderMessage('Something went wrong', e.message);
        }
    } finally {
        clearTimeout(timeout);
        wpMore.disabled = false;
        wpMore.textContent = 'Load more';
    }
}

// Downscale huge images (8K wallpapers) so they stay smooth and fit in storage
async function prepareImage(blob) {
    const MAX = 3840;
    const bitmap = await createImageBitmap(blob);
    if (bitmap.width <= MAX) return { blob, bitmap };
    const scale = MAX / bitmap.width;
    const canvas = document.createElement('canvas');
    canvas.width = MAX;
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const resized = await new Promise(resolve => canvas.toBlob(resolve, type, 0.92));
    return { blob: resized || blob, bitmap };
}

// Pick theme colors from the image: dominant saturated hue -> dark background, light accent
function extractPalette(bitmap) {
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, size, size);
    const px = ctx.getImageData(0, 0, size, size).data;

    const bins = Array.from({ length: 12 }, () => ({ weight: 0, s: 0, l: 0, n: 0 }));
    let lightSum = 0, counted = 0;
    for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 128) continue;
        const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        lightSum += l; counted++;
        const d = max - min;
        if (d < 0.08 || l < 0.12 || l > 0.9) continue;  // skip grays, near-black, near-white
        const s = d / (1 - Math.abs(2 * l - 1));
        let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
        const bin = bins[Math.floor(h / 30) % 12];
        // Mostly area (so a big green background beats a small vivid face), nudged toward vivid mid-tones
        const w = (0.3 + 0.7 * s) * (1 - Math.abs(l - 0.5));
        bin.weight += w; bin.s += s * w; bin.l += l * w; bin.n++;
        bin.hue = (bin.hue || 0) + h * w;
    }
    const ranked = bins.map((b, i) => ({ ...b, i })).filter(b => b.weight > 0).sort((a, b) => b.weight - a.weight);

    if (ranked.length === 0) {  // grayscale image
        const gray = Math.round((counted ? lightSum / counted : 0.3) * 30);
        return {
            bg1: `hsl(220, 8%, ${Math.max(10, gray)}%)`, bg2: `hsl(220, 8%, ${Math.max(18, gray + 12)}%)`,
            widgetBg: 'rgba(15,18,25,0.5)', accent: 'hsl(210, 60%, 80%)', glow: 'hsl(210, 70%, 90%)', text: '#FFF'
        };
    }
    const hueOf = b => Math.round(b.hue / b.weight);
    const primary = ranked[0];
    const secondary = ranked.find(b => Math.abs(b.i - primary.i) >= 2 && Math.abs(b.i - primary.i) <= 10) || primary;
    const h1 = hueOf(primary), h2 = hueOf(secondary);
    const s1 = Math.min(70, Math.max(35, Math.round(primary.s / primary.weight * 100)));
    const s2 = Math.min(70, Math.max(35, Math.round(secondary.s / secondary.weight * 100)));
    return {
        bg1: `hsl(${h1}, ${s1}%, 22%)`,
        bg2: `hsl(${h2}, ${s2}%, 34%)`,
        widgetBg: `hsla(${h1}, ${Math.min(s1, 50)}%, 12%, 0.5)`,
        accent: `hsl(${h2}, 85%, 76%)`,
        glow: `hsl(${h2}, 90%, 86%)`,
        text: '#FFF'
    };
}

/** Shows an image as the wallpaper, saves it, picks fill mode from its shape and matches colors to it. */
async function applyWallpaperBlob(sourceBlob) {
    const { blob, bitmap } = await prepareImage(sourceBlob);
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    setWallpaperDisplay(dataUrl);
    await WallpaperDB.save(dataUrl);
    const ratio = bitmap.width / bitmap.height;
    setFitMode(ratio >= 1.3 ? 'cover' : 'center');
    applyPalette(extractPalette(bitmap), '');
    const small = bitmap.width < 1000;
    bitmap.close?.();
    showToast(small
        ? 'Wallpaper applied. It is a small image, so it may look blurry; try opening the full-size version.'
        : 'Wallpaper applied. Colors were matched to the image.');
}

async function applyRemoteWallpaper(item, card) {
    if (card.classList.contains('loading')) return;
    card.classList.add('loading');
    wpStatus.textContent = 'Downloading full-size image...';
    try {
        const res = await fetch(`/api/image?url=${encodeURIComponent(item.full)}`);
        if (!res.ok) throw new Error('Could not download that image');
        await applyWallpaperBlob(await res.blob());
        wpModal.hidden = true;
    } catch (e) {
        card.classList.remove('loading');
        wpStatus.textContent = 'That one failed. Try another image.';
        showToast(e.message || 'Could not apply that image');
    }
}

if (wpForm) {
    wpForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = wpInput.value.trim();
        if (q.length < 2) { wpInput.focus(); return; }
        runWallpaperSearch(q);
    });
}
wpMore.addEventListener('click', () => runWallpaperSearch(wpCurrentQuery, wpPage + 1));
wpFilters.forEach(btn => btn.addEventListener('click', () => { wpShape = btn.dataset.shape; renderResults(); }));

// "Search the whole web": a browser window where any image can be right-clicked -> Set as wallpaper
if (IS_APP && window.desktop) {
    wpWeb.addEventListener('click', () => window.desktop.openWebSearch(wpCurrentQuery, 'google'));
    window.desktop.onApplyImage(async ({ bytes, type }) => {
        try {
            await applyWallpaperBlob(new Blob([bytes], { type }));
            wpModal.hidden = true;
        } catch (e) {
            showToast("Couldn't use that image");
        }
    });
} else {
    wpWeb.hidden = true;
}
document.getElementById('wp-close').addEventListener('click', closeWpModal);
wpModal.addEventListener('click', (e) => { if (e.target === wpModal) closeWpModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !wpModal.hidden) closeWpModal(); });

// --- INITIALIZATION ON STARTUP ---
async function initDashboardTheme() {
    // 1. Restore fit mode
    const savedFit = localStorage.getItem('wallpaper-fit-mode') || 'center';
    setFitMode(savedFit);

    // 2. Restore color palette
    const savedPaletteData = localStorage.getItem('dashboard-palette');
    if (savedPaletteData) {
        try {
            const parsed = JSON.parse(savedPaletteData);
            applyPalette(parsed.palette, parsed.name);
        } catch(e) {
            applyPalette(CHARACTER_PALETTES['buttercup'], 'buttercup');
        }
    } else {
        applyPalette(CHARACTER_PALETTES['buttercup'], 'buttercup');
    }

    // 3. Restore the uploaded wallpaper from IndexedDB (no image = plain gradient)
    const savedWp = await WallpaperDB.load();
    if (savedWp) setWallpaperDisplay(savedWp);
}

initDashboardTheme();


// --- 12-Hour Format Time & Basic Functionality ---

function updateTimeAndDate() {
    const now = new Date();
    
    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    const minutes = now.getMinutes().toString().padStart(2, '0');
    
    document.getElementById('time-display').innerText = `${hours}:${minutes}`;
    document.getElementById('ampm-display').innerText = ampm;
    
    document.getElementById('date-display').innerText = now.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
    setTimeout(updateTimeAndDate, (60 - now.getSeconds()) * 1000 - now.getMilliseconds());
}
updateTimeAndDate();

const pad2 = n => String(n).padStart(2, '0');
const localDay = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function format12(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return `${h % 12 || 12}:${pad2(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Runs fn on a single click only, so a double-click can still enter widget edit mode. */
function onSingleClick(el, fn) {
    let timer = null;
    el.addEventListener('click', (e) => {
        if (e.detail > 1 || e.target.closest('.close-btn') || el.closest('.edit-mode')) { clearTimeout(timer); return; }
        clearTimeout(timer);
        timer = setTimeout(() => fn(e), 260);
    });
    el.addEventListener('dblclick', () => clearTimeout(timer));
}
// --- Alarms ---
const alarmWidget = document.getElementById('alarm-widget');
const alarmTimeText = document.getElementById('alarm-time');
const alarmInput = document.getElementById('alarm-input');

if (!IS_APP) {
    // In a plain browser: one simple alarm that rings while the page is open
    let savedAlarm = localStorage.getItem('dashboard-alarm') || '';
    let lastRungMinute = '';

    const setAlarm = (value) => {
        savedAlarm = value;
        if (value) localStorage.setItem('dashboard-alarm', value);
        else localStorage.removeItem('dashboard-alarm');
        alarmTimeText.innerText = value ? format12(value) : 'Off';
        alarmWidget.classList.toggle('alarm-on', !!value);
    };

    setInterval(() => {
        if (!savedAlarm) return;
        const now = new Date();
        const current = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
        if (current === savedAlarm && lastRungMinute !== current) {
            lastRungMinute = current;
            alarmWidget.classList.add('alarm-ringing');
            const stop = window.AlarmSound.play('chime', { loop: true });
            setTimeout(() => { stop(); alarmWidget.classList.remove('alarm-ringing'); }, 30000);
        }
    }, 5000);

    alarmWidget.addEventListener('click', () => {
        alarmInput.value = savedAlarm || '07:00';
        if (alarmInput.showPicker) alarmInput.showPicker(); else alarmInput.click();
    });
    alarmWidget.addEventListener('contextmenu', (e) => { e.preventDefault(); setAlarm(''); });
    alarmInput.addEventListener('change', () => setAlarm(alarmInput.value));
    setAlarm(savedAlarm);
}

// In the desktop app the app itself keeps the alarms and rings them (see src/main/alarms.js)
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const alarmsModal = document.getElementById('alarms-modal');
const alarmForm = document.getElementById('alarm-form');
const alarmList = document.getElementById('alarm-list');
const afTime = document.getElementById('af-time');
const afLabel = document.getElementById('af-label');
const afSound = document.getElementById('af-sound');
const afDays = document.querySelectorAll('#af-days button');
let alarmsCache = [];
let editingAlarmId = null;
let customSound = null;       // { sound, soundName } picked for the alarm being edited
let stopPreview = null;

function daysSummary(days) {
    if (!days.length) return 'Once';
    if (days.length === 7) return 'Every day';
    const key = [...days].sort().join('');
    if (key === '12345') return 'Weekdays';
    if (key === '06') return 'Weekends';
    return [1, 2, 3, 4, 5, 6, 0].filter(d => days.includes(d)).map(d => DAY_NAMES[d]).join(', ');
}

function soundLabel(a) {
    return a.sound.startsWith('file:') ? a.soundName || 'Custom sound' : window.AlarmSound.LABELS[a.sound] || 'Chime';
}

async function refreshAlarms() {
    if (!IS_APP || !window.desktop) return;
    const { alarms, next } = await window.desktop.getAlarms();
    alarmsCache = alarms;

    // Widget: next alarm, e.g. "7:30 AM" with "Tue" underneath
    if (next) {
        const at = new Date(next.at);
        const today = localDay(new Date());
        const tomorrow = localDay(new Date(Date.now() + 86400000));
        const when = localDay(at) === today ? '' : localDay(at) === tomorrow ? 'Tomorrow' : DAY_NAMES[at.getDay()];
        alarmTimeText.innerHTML = '';
        alarmTimeText.append(format12(`${pad2(at.getHours())}:${pad2(at.getMinutes())}`));
        if (when || next.snoozed) {
            const small = document.createElement('small');
            small.className = 'alarm-when';
            small.textContent = next.snoozed ? 'Snoozed' : when;
            alarmTimeText.append(small);
        }
        alarmWidget.classList.add('alarm-on');
        document.getElementById('alarms-next').textContent =
            `Next: ${at.toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}${next.label ? ` (${next.label})` : ''}`;
    } else {
        alarmTimeText.textContent = 'Off';
        alarmWidget.classList.remove('alarm-on');
        document.getElementById('alarms-next').textContent = alarms.length ? 'All alarms are off' : 'No alarms yet';
    }
    if (!alarmsModal.hidden) renderAlarmList();
}

function renderAlarmList() {
    alarmList.innerHTML = '';
    if (!alarmsCache.length) {
        const empty = document.createElement('p');
        empty.className = 'panel-empty';
        empty.textContent = 'No alarms yet. Press "Add alarm" to create one.';
        alarmList.appendChild(empty);
        return;
    }
    const sorted = [...alarmsCache].sort((a, b) => a.time.localeCompare(b.time));
    for (const a of sorted) {
        const row = document.createElement('div');
        row.className = 'panel-row' + (a.enabled ? '' : ' is-off');

        const main = document.createElement('button');
        main.type = 'button';
        main.className = 'panel-row-main';
        main.title = 'Edit';
        const t = document.createElement('span');
        t.className = 'alarm-row-time';
        t.textContent = format12(a.time);
        const info = document.createElement('span');
        info.className = 'panel-row-info';
        const l1 = document.createElement('b');
        l1.textContent = a.label || 'Alarm';
        const l2 = document.createElement('small');
        l2.textContent = `${daysSummary(a.days)} · ${soundLabel(a)}`;
        info.append(l1, l2);
        main.append(t, info);
        main.addEventListener('click', () => openAlarmForm(a));

        const toggle = document.createElement('label');
        toggle.className = 'switch';
        toggle.title = a.enabled ? 'Turn off' : 'Turn on';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = a.enabled;
        cb.setAttribute('aria-label', `${a.label || 'Alarm'} at ${format12(a.time)}`);
        cb.addEventListener('change', () => saveAlarmList(alarmsCache.map(x => x.id === a.id ? { ...x, enabled: cb.checked } : x)));
        const knob = document.createElement('span');
        toggle.append(cb, knob);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'icon-only-btn';
        del.setAttribute('aria-label', 'Delete alarm');
        del.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        del.addEventListener('click', () => saveAlarmList(alarmsCache.filter(x => x.id !== a.id)));

        row.append(main, toggle, del);
        alarmList.appendChild(row);
    }
}

async function saveAlarmList(list) {
    alarmsCache = await window.desktop.saveAlarms(list);
    await refreshAlarms();
    renderAlarmList();
}

function fillSoundOptions(selected) {
    afSound.innerHTML = '';
    for (const key of window.AlarmSound.TONES) {
        afSound.add(new Option(window.AlarmSound.LABELS[key], key, false, key === selected));
    }
    if (customSound) afSound.add(new Option(customSound.soundName, customSound.sound, false, customSound.sound === selected));
}

function openAlarmForm(alarm) {
    editingAlarmId = alarm ? alarm.id : null;
    customSound = alarm && alarm.sound.startsWith('file:') ? { sound: alarm.sound, soundName: alarm.soundName } : null;
    const inAnHour = new Date(Date.now() + 3600000);
    afTime.value = alarm ? alarm.time : `${pad2(inAnHour.getHours())}:00`;
    afLabel.value = alarm ? alarm.label : '';
    const days = alarm ? alarm.days : [];
    afDays.forEach(b => b.classList.toggle('active', days.includes(Number(b.dataset.day))));
    fillSoundOptions(alarm ? alarm.sound : 'chime');
    alarmForm.hidden = false;
    afTime.focus();
}

function closeAlarmForm() {
    stopSoundPreview();
    alarmForm.hidden = true;
    editingAlarmId = null;
}

function stopSoundPreview() {
    if (stopPreview) { stopPreview(); stopPreview = null; }
    document.getElementById('af-preview').innerHTML = '<i class="fa-solid fa-play"></i> Preview';
}

if (IS_APP && window.desktop) {
    afDays.forEach(b => b.addEventListener('click', () => b.classList.toggle('active')));
    document.getElementById('alarm-add-btn').addEventListener('click', () => openAlarmForm(null));
    document.getElementById('af-cancel').addEventListener('click', closeAlarmForm);
    document.getElementById('af-pick-sound').addEventListener('click', async () => {
        const picked = await window.desktop.pickAlarmSound();
        if (!picked) return;
        if (picked.error) { showToast(picked.error); return; }
        customSound = picked;
        fillSoundOptions(picked.sound);
    });
    document.getElementById('af-preview').addEventListener('click', () => {
        if (stopPreview) { stopSoundPreview(); return; }
        stopPreview = window.AlarmSound.play(afSound.value, { loop: true });
        document.getElementById('af-preview').innerHTML = '<i class="fa-solid fa-stop"></i> Stop';
        setTimeout(stopSoundPreview, 8000);
    });
    afSound.addEventListener('change', () => { if (stopPreview) stopSoundPreview(); });
    alarmForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const chosenSound = afSound.value;
        const alarm = {
            id: editingAlarmId || undefined,
            time: afTime.value,
            label: afLabel.value.trim(),
            days: [...afDays].filter(b => b.classList.contains('active')).map(b => Number(b.dataset.day)),
            enabled: true,
            sound: chosenSound,
            soundName: chosenSound.startsWith('file:') && customSound ? customSound.soundName : '',
        };
        const list = editingAlarmId
            ? alarmsCache.map(a => a.id === editingAlarmId ? { ...alarm, id: a.id } : a)
            : [...alarmsCache, alarm];
        closeAlarmForm();
        await saveAlarmList(list);
        showToast(`Alarm set for ${format12(alarm.time)}${alarm.days.length ? `, ${daysSummary(alarm.days).toLowerCase()}` : ''}`);
    });

    window.desktop.onAlarmsChanged(refreshAlarms);
    setInterval(refreshAlarms, 30000);

    // Move an alarm set in an earlier version (stored only in this page) into the app
    (async () => {
        const old = localStorage.getItem('dashboard-alarm');
        await refreshAlarms();
        if (old && MODE === 'editor' && !alarmsCache.length) {
            await saveAlarmList([{ time: old, label: '', days: [], enabled: true, sound: 'chime' }]);
        }
        if (old && MODE === 'editor') localStorage.removeItem('dashboard-alarm');
    })();

    if (MODE === 'editor') {
        alarmWidget.title = 'Alarms';
        onSingleClick(alarmWidget, () => openPanel('alarms'));
    }
}

// --- Panels (alarms, calendars) in the editor ---
function openPanel(name) {
    const modal = document.getElementById(`${name}-modal`);
    if (!modal) return;
    document.querySelectorAll('.wp-modal').forEach(m => { if (m !== modal) m.hidden = true; });
    modal.hidden = false;
    if (name === 'alarms') { renderAlarmList(); refreshAlarms(); }
    if (name === 'calendars') renderCalendarPanel();
    modal.querySelector('[data-close]').focus();
}

function closePanel(modal) {
    if (modal.id === 'alarms-modal') closeAlarmForm();
    modal.hidden = true;
}

document.querySelectorAll('#alarms-modal, #calendars-modal').forEach(modal => {
    modal.querySelector('[data-close]').addEventListener('click', () => closePanel(modal));
    modal.addEventListener('click', (e) => { if (e.target === modal) closePanel(modal); });
});
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('#alarms-modal, #calendars-modal').forEach(m => { if (!m.hidden) closePanel(m); });
});

// --- Calendar ---
let calendarEvents = [];
let calendarStatus = [];
let calendarsConnected = false;
let renderedDay = '';

function renderCalendar() {
    const now = new Date();
    renderedDay = localDay(now);
    document.getElementById('calendar-month').innerText = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][now.getMonth()];
    let startDayIndex = (new Date(now.getFullYear(), now.getMonth(), 1).getDay() || 7) - 1;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    for (let i = 0; i < startDayIndex; i++) grid.appendChild(document.createElement('span'));
    for (let i = 1; i <= daysInMonth; i++) {
        const span = document.createElement('span'); span.innerText = i;
        if (i === now.getDate()) span.classList.add('active-day');
        grid.appendChild(span);
    }
    markCalendarEvents();
    renderAgenda();
}

function eventTimeLabel(ev) {
    if (ev.allDay) return 'All day';
    return new Date(ev.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Dots on days with events; hovering (in the editor) lists them
function markCalendarEvents() {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-`;
    const days = document.querySelectorAll('#calendar-grid span:not(:empty)');
    days.forEach(cell => { cell.classList.remove('has-event'); cell.removeAttribute('title'); cell.style.removeProperty('--event-color'); });
    for (const ev of calendarEvents) {
        if (!ev.date.startsWith(prefix)) continue;
        const cell = days[parseInt(ev.date.slice(8, 10), 10) - 1];
        if (!cell) continue;
        if (!cell.classList.contains('has-event')) cell.style.setProperty('--event-color', ev.color);
        cell.classList.add('has-event');
        const line = `${eventTimeLabel(ev)}  ${ev.title}`;
        cell.title = cell.title ? `${cell.title}\n${line}` : line;
    }
}

// "Upcoming" widget: what's left today and the next few days
function renderAgenda() {
    const list = document.getElementById('agenda-list');
    const widget = document.querySelector('[data-id="agenda"]');
    widget.classList.toggle('agenda-unused', !calendarsConnected);
    list.innerHTML = '';

    if (!calendarsConnected) {
        const p = document.createElement('div');
        p.className = 'agenda-empty';
        p.textContent = 'Connect Google Calendar or Outlook to see your events here.';
        if (MODE === 'editor') {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'agenda-connect';
            b.textContent = 'Connect a calendar';
            b.addEventListener('click', () => openPanel('calendars'));
            p.appendChild(b);
        }
        list.appendChild(p);
        return;
    }

    const now = new Date();
    const today = localDay(now);
    const tomorrow = localDay(new Date(now.getTime() + 86400000));
    const upcoming = calendarEvents
        .filter(ev => new Date(ev.end) > now && ev.date <= localDay(new Date(now.getTime() + 14 * 86400000)))
        .slice(0, 8);

    if (!upcoming.length) {
        const p = document.createElement('div');
        p.className = 'agenda-empty';
        p.textContent = 'Nothing in the next two weeks.';
        list.appendChild(p);
        return;
    }

    let lastDay = '';
    for (const ev of upcoming) {
        const day = ev.date < today ? today : ev.date;  // multi-day events that started earlier
        if (day !== lastDay) {
            lastDay = day;
            const h = document.createElement('div');
            h.className = 'agenda-day';
            const [y, m, d] = day.split('-').map(Number);
            h.textContent = day === today ? 'Today' : day === tomorrow ? 'Tomorrow'
                : new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
            list.appendChild(h);
        }
        const item = document.createElement('div');
        item.className = 'agenda-item';
        item.style.setProperty('--event-color', ev.color);
        const t = document.createElement('span');
        t.className = 'agenda-time';
        t.textContent = eventTimeLabel(ev);
        const title = document.createElement('span');
        title.className = 'agenda-title';
        title.textContent = ev.title;
        title.title = `${ev.title} (${ev.calendar})`;
        item.append(t, title);
        list.appendChild(item);
    }
}

async function refreshCalendarEvents(force = false) {
    if (!IS_APP) return;
    try {
        const res = await fetch(`/api/calendar/events${force ? '?refresh=1' : ''}`);
        const data = await res.json();
        calendarEvents = data.events || [];
        calendarsConnected = (data.feeds || []).length > 0 || !!data.folder;
        calendarStatus = data.feeds || [];
    } catch (e) {
        // Keep whatever was shown before
    }
    markCalendarEvents();
    renderAgenda();
    if (!document.getElementById('calendars-modal').hidden) renderCalendarPanel();
}

renderCalendar();
if (IS_APP) {
    refreshCalendarEvents();
    setInterval(refreshCalendarEvents, 5 * 60 * 1000);
    if (window.desktop) window.desktop.onCalendarsChanged(() => refreshCalendarEvents());
} else {
    document.querySelector('[data-id="agenda"]').classList.add('agenda-unused');
    renderAgenda();
}

// The wallpaper stays open for days: redraw the calendar when the date changes, and keep "Upcoming" current
setInterval(() => {
    if (localDay(new Date()) !== renderedDay) renderCalendar();
    else renderAgenda();
}, 60000);

// --- Calendars panel ---
function timeAgo(iso) {
    const mins = Math.round((Date.now() - new Date(iso)) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.round(mins / 60)} h ago`;
}

async function renderCalendarPanel() {
    if (!window.desktop) return;
    const { feeds, folder } = await window.desktop.getCalendars();
    const list = document.getElementById('calendar-list');
    list.innerHTML = '';
    if (!feeds.length) {
        const p = document.createElement('p');
        p.className = 'panel-empty';
        p.textContent = 'No calendars connected yet.';
        list.appendChild(p);
    }
    for (const f of feeds) {
        const status = calendarStatus.find(s => s.id === f.id);
        const row = document.createElement('div');
        row.className = 'panel-row';
        const dot = document.createElement('span');
        dot.className = 'cal-dot';
        dot.style.background = f.color;
        const info = document.createElement('span');
        info.className = 'panel-row-info';
        const name = document.createElement('b');
        name.textContent = f.name;
        const sub = document.createElement('small');
        if (status?.error) {
            sub.className = 'is-error';
            sub.textContent = status.error;
        } else {
            sub.textContent = `${f.host}${status ? ` · updated ${timeAgo(status.updated)}` : ''}`;
        }
        info.append(name, sub);
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'panel-small-btn';
        del.textContent = 'Remove';
        del.addEventListener('click', async () => {
            await window.desktop.removeCalendar(f.id);
            renderCalendarPanel();
        });
        row.append(dot, info, del);
        list.appendChild(row);
    }
    document.getElementById('calendar-folder').textContent = folder || 'Not set';
    document.getElementById('cal-folder-clear').hidden = !folder;
}

if (IS_APP && window.desktop) {
    const calForm = document.getElementById('calendar-form');
    const calError = document.getElementById('cf-error');
    const calSubmit = document.getElementById('cf-submit');
    calForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        calError.textContent = '';
        calSubmit.disabled = true;
        calSubmit.textContent = 'Checking...';
        const result = await window.desktop.addCalendar({
            url: document.getElementById('cf-url').value,
            name: document.getElementById('cf-name').value,
        });
        calSubmit.disabled = false;
        calSubmit.textContent = 'Connect';
        if (result.error) {
            calError.textContent = result.error;
            return;
        }
        calForm.reset();
        showToast(`Connected "${result.feed.name}"`);
        await refreshCalendarEvents();
        renderCalendarPanel();
    });
    document.getElementById('cal-folder-btn').addEventListener('click', async () => {
        if (await window.desktop.chooseCalendarFolder()) renderCalendarPanel();
    });
    document.getElementById('cal-folder-clear').addEventListener('click', async () => {
        await window.desktop.clearCalendarFolder();
        renderCalendarPanel();
    });

    if (MODE === 'editor') {
        onSingleClick(document.querySelector('[data-id="calendar"]'), () => openPanel('calendars'));
        document.getElementById('editor-alarms-btn').addEventListener('click', () => openPanel('alarms'));
        document.getElementById('editor-calendars-btn').addEventListener('click', () => openPanel('calendars'));
        window.desktop.onOpenPanel(openPanel);
    }
}

async function updateBattery() {
    if ('getBattery' in navigator) {
        const battery = await navigator.getBattery();
        const update = () => {
            document.getElementById('battery-level').innerText = `${Math.round(battery.level * 100)}%`;
            document.getElementById('battery-icon').className = 'fa-solid ' + (battery.charging || battery.level > 0.75 ? 'fa-battery-full' : battery.level > 0.5 ? 'fa-battery-three-quarters' : battery.level > 0.25 ? 'fa-battery-half' : 'fa-battery-quarter');
        };
        update();
        battery.addEventListener('levelchange', update);
        battery.addEventListener('chargingchange', update);
    }
}
updateBattery();

// --- Reminders ---
const todoInput = document.getElementById('todo-input');
const todoListContainer = document.getElementById('todo-list-container');
let reminders = [];
try { reminders = JSON.parse(localStorage.getItem('dashboard-reminders')) || []; } catch (e) { reminders = []; }

function renderReminders() {
    todoListContainer.innerHTML = '';
    reminders.forEach((r, i) => {
        const div = document.createElement('div'); div.className = 'todo-item' + (r.checked ? ' checked' : '');
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = r.checked;
        cb.onchange = () => { r.checked = !r.checked; saveReminders(); };
        const txt = document.createElement('span'); txt.className = 'task-text'; txt.innerText = r.text;
        const del = document.createElement('button'); del.className = 'delete-btn'; del.setAttribute('aria-label', 'Delete reminder'); del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        del.onclick = () => { reminders.splice(i, 1); saveReminders(); };
        div.append(cb, txt, del); todoListContainer.appendChild(div);
    });
}

function saveReminders() {
    localStorage.setItem('dashboard-reminders', JSON.stringify(reminders));
    renderReminders();
}

function addTodo() {
    const val = todoInput.value.trim();
    if (val) {
        reminders.push({text: val, checked: false});
        todoInput.value = '';
        saveReminders();
    }
}
todoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });
renderReminders();


// --- Weather (Open-Meteo, no API key) ---
const WEATHER_CODES = {
    0: ['Clear sky', '☀️', 'rgba(255,215,0,0.2)'],
    1: ['Mainly clear', '🌤️', 'rgba(255,215,0,0.1)'],
    2: ['Partly cloudy', '⛅', 'rgba(200,200,200,0.2)'],
    3: ['Overcast', '☁️', 'rgba(150,150,150,0.3)'],
    45: ['Foggy', '🌫️', 'rgba(200,200,200,0.4)'],
    48: ['Rime fog', '🌫️', 'rgba(200,200,200,0.4)'],
    51: ['Light drizzle', '🌦️', 'rgba(100,150,255,0.2)'],
    53: ['Drizzle', '🌧️', 'rgba(100,150,255,0.3)'],
    55: ['Dense drizzle', '🌧️', 'rgba(100,150,255,0.4)'],
    56: ['Freezing drizzle', '🌧️', 'rgba(150,200,255,0.3)'],
    57: ['Freezing drizzle', '🌧️', 'rgba(150,200,255,0.4)'],
    61: ['Light rain', '🌦️', 'rgba(100,150,255,0.2)'],
    63: ['Rain', '🌧️', 'rgba(100,150,255,0.3)'],
    65: ['Heavy rain', '🌧️', 'rgba(100,150,255,0.5)'],
    66: ['Freezing rain', '🌧️', 'rgba(150,200,255,0.3)'],
    67: ['Freezing rain', '🌧️', 'rgba(150,200,255,0.5)'],
    71: ['Light snow', '🌨️', 'rgba(255,255,255,0.3)'],
    73: ['Snow', '❄️', 'rgba(255,255,255,0.4)'],
    75: ['Heavy snow', '❄️', 'rgba(255,255,255,0.5)'],
    77: ['Snow grains', '❄️', 'rgba(255,255,255,0.3)'],
    80: ['Light showers', '🌦️', 'rgba(100,150,255,0.2)'],
    81: ['Showers', '🌧️', 'rgba(100,150,255,0.35)'],
    82: ['Violent showers', '🌧️', 'rgba(100,150,255,0.5)'],
    85: ['Snow showers', '🌨️', 'rgba(255,255,255,0.3)'],
    86: ['Heavy snow showers', '❄️', 'rgba(255,255,255,0.5)'],
    95: ['Thunderstorm', '⛈️', 'rgba(100,50,150,0.4)'],
    96: ['Thunderstorm, hail', '⛈️', 'rgba(100,50,150,0.5)'],
    99: ['Severe thunderstorm', '⛈️', 'rgba(100,50,150,0.6)'],
};

const DEFAULT_LOCATION = { lat: 31.5204, lon: 74.3587, name: 'Lahore' };

async function fetchWeather(lat, lon, fallbackName) {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto`);
        const data = await res.json();
        const current = data.current;

        document.getElementById('weather-temp').innerHTML = `${Math.round(current.temperature_2m)}&deg;`;
        document.getElementById('humidity-level').innerText = `${current.relative_humidity_2m}%`;

        const [desc, emoji, tint] = WEATHER_CODES[current.weather_code] || ['Unknown', '🌡️', 'transparent'];
        document.getElementById('weather-desc').innerText = desc;
        document.getElementById('weather-emoji').innerText = emoji;
        document.getElementById('weather-container').style.backgroundImage = `linear-gradient(135deg, ${tint}, transparent)`;

        document.getElementById('weather-loc').innerText = fallbackName || 'Your location';
        if (!fallbackName) {
            try {
                const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
                const geoData = await geoRes.json();
                const a = geoData.address || {};
                document.getElementById('weather-loc').innerText = a.city || a.town || a.village || 'Your location';
            } catch (e) { /* keep the generic label */ }
        }
    } catch (e) {
        document.getElementById('weather-desc').innerText = 'Unavailable';
    }
}

async function loadWeather() {
    const useDefault = () => fetchWeather(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.name);
    if (IS_APP) {
        // Desktop apps don't get browser geolocation; use an approximate location from the IP address
        try {
            const res = await fetch('/api/location');
            if (!res.ok) throw new Error();
            const loc = await res.json();
            return fetchWeather(loc.lat, loc.lon, loc.name);
        } catch (e) {
            return useDefault();
        }
    }
    if (!navigator.geolocation) return useDefault();
    navigator.geolocation.getCurrentPosition(
        p => fetchWeather(p.coords.latitude, p.coords.longitude),
        useDefault,
        { timeout: 8000 }
    );
}
loadWeather();
setInterval(loadWeather, 30 * 60 * 1000);

// --- Editor toolbar (desktop app) ---
if (MODE === 'editor' && window.desktop) {
    document.getElementById('editor-done-btn').addEventListener('click', () => window.desktop.closeEditor());
    document.getElementById('editor-web-btn').addEventListener('click', () =>
        window.desktop.openWebSearch(wpInput.value.trim(), 'google'));
}
