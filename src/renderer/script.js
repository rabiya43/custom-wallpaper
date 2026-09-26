// The desktop app serves this page over app:// and opens it in one of three modes:
//   wallpaper  behind the desktop icons; clicks on empty desktop reach the widgets
//   editor     on top of everything, for customizing
//   popup      just one panel over the desktop (alarms, a day, an event, reminders)
// Opened directly in a browser the page is fully interactive, but search needs the app.
const pageParams = new URLSearchParams(location.search);
const IS_APP = location.protocol === 'app:';
const MODE = IS_APP ? (pageParams.get('mode') || 'editor') : 'browser';
document.body.classList.add(`mode-${MODE}`);
const INTERACTIVE = MODE === 'editor' || MODE === 'popup';  // panels can be used

const dashboard = document.querySelector('.dashboard-container');
if (IS_APP) {
    // Keep widgets out from under the taskbar
    [['t', 'top'], ['l', 'left'], ['r', 'right'], ['b', 'bottom']].forEach(([key, side]) => {
        dashboard.style[side] = (Number(pageParams.get(key)) || 0) + 'px';
    });
}

// --- Draggable, Resizable, & Edit Mode ---
document.addEventListener('dblclick', (e) => {
    if (MODE === 'wallpaper' || (MODE === 'popup' && !document.body.classList.contains('popup-layout'))) return;
    const widget = e.target.closest('.drag-widget');
    if (widget) {
        document.querySelectorAll('.drag-widget').forEach(w => w.classList.remove('edit-mode'));
        widget.classList.add('edit-mode');
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.drag-widget') && !e.target.closest('.widget-controls') && !e.target.closest('.format-menu')) {
        document.querySelectorAll('.drag-widget').forEach(w => w.classList.remove('edit-mode'));
    }
});

function makeDraggable(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    elmnt.onmousedown = function(e) {
        // ONLY allow dragging if in edit mode
        if (!elmnt.classList.contains('edit-mode')) return;
        
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('.interactive-btn') || e.target.closest('.todo-item') || e.target.closest('.widget-controls')) {
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
const LAYOUT_PROPS = ['top', 'left', 'right', 'bottom', 'width', 'height'];
// Where each widget starts, from index.html, for "Original size" and when the layout changes elsewhere
const DEFAULT_LAYOUT = {};
document.querySelectorAll('.drag-widget[data-id]').forEach(w => {
    DEFAULT_LAYOUT[w.dataset.id] = Object.fromEntries(LAYOUT_PROPS.map(p => [p, w.style[p]]));
});
let layoutState = {};
try { layoutState = JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch (e) { layoutState = {}; }

function saveWidget(widget, hidden = false) {
    const id = widget.dataset.id;
    if (!id) return;
    const s = widget.style;
    layoutState[id] = { top: s.top, left: s.left, right: s.right, bottom: s.bottom, width: s.width, height: s.height, hidden };
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layoutState));
}

const MIN_WIDGET_HEIGHT = 120;

function restoreLayout() {
    document.querySelectorAll('.drag-widget[data-id]').forEach(widget => {
        const saved = layoutState[widget.dataset.id];
        // The Customize panel holds Done, so it can't stay hidden (older versions let you hide it)
        if (saved?.hidden && widget.dataset.id !== 'panel') { widget.style.display = 'none'; return; }
        if (saved) {
            LAYOUT_PROPS.forEach(prop => {
                if (saved[prop]) widget.style[prop] = saved[prop];
            });
        }
        // Keep widgets on screen when it's smaller than the layout was made for (a small laptop,
        // or large display scaling): shrink a widget that runs off the bottom, then move it if needed
        const box = dashboard.getBoundingClientRect();
        let rect = widget.getBoundingClientRect();
        if (rect.bottom > box.bottom - 20 && widget.style.height) {
            widget.style.height = Math.max(MIN_WIDGET_HEIGHT, box.bottom - 20 - rect.top) + 'px';
            rect = widget.getBoundingClientRect();
        }
        if (rect.right > box.right) widget.style.left = Math.max(0, box.width - rect.width - 20) + 'px';
        if (rect.bottom > box.bottom) widget.style.top = Math.max(0, box.height - rect.height - 20) + 'px';
    });
}
restoreLayout();

/** Applies the saved layout again from scratch, e.g. after it was changed in another window. */
function reloadLayout() {
    try { layoutState = JSON.parse(localStorage.getItem(LAYOUT_KEY)) || {}; } catch (e) { layoutState = {}; }
    document.querySelectorAll('.drag-widget[data-id]').forEach(w => {
        const d = DEFAULT_LAYOUT[w.dataset.id] || {};
        LAYOUT_PROPS.forEach(p => { w.style[p] = d[p] || ''; });
        w.style.display = '';
    });
    restoreLayout();
}
window.addEventListener('storage', (e) => {
    if (e.key === LAYOUT_KEY || e.key === null) reloadLayout();
});

// Save after a drag or resize finishes
// (delayed so the edge-snap animation has settled)
document.addEventListener('mouseup', () => {
    setTimeout(() => {
        document.querySelectorAll('.drag-widget.edit-mode').forEach(w => saveWidget(w));
    }, 350);
});

// A widget's buttons while editing it: × hides it (and remembers), the other one puts it back
// to its original size
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.wc-btn');
    const widget = btn?.closest('.drag-widget');
    if (!widget) return;
    if (btn.classList.contains('wc-close')) {
        widget.style.display = 'none';
        widget.classList.remove('edit-mode');
        saveWidget(widget, true);
    } else if (btn.classList.contains('wc-restore')) {
        const d = DEFAULT_LAYOUT[widget.dataset.id] || {};
        widget.style.transition = 'width 0.25s ease, height 0.25s ease';
        widget.style.width = d.width || '';
        widget.style.height = d.height || '';
        saveWidget(widget);
        setTimeout(() => { widget.style.transition = ''; }, 300);
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

// --- Colors: picked from the wallpaper automatically (see extractPalette); this is the starting look ---
const DEFAULT_PALETTE = { bg1: '#2D5A46', bg2: '#509F8C', widgetBg: 'rgba(0,0,0,0.25)', accent: '#A5C271', glow: '#E2F3B9', text: '#FFF' };

function applyPalette(palette) {
    const root = document.documentElement;
    const bg1 = palette.bg1 || DEFAULT_PALETTE.bg1;
    const bg2 = palette.bg2 || DEFAULT_PALETTE.bg2;
    root.style.setProperty('--bg-color-1', bg1);
    root.style.setProperty('--bg-color-2', bg2);
    root.style.setProperty('--widget-bg', palette.widgetBg || DEFAULT_PALETTE.widgetBg);
    root.style.setProperty('--accent-color', palette.accent || DEFAULT_PALETTE.accent);
    root.style.setProperty('--glow-color', palette.glow || DEFAULT_PALETTE.glow);
    root.style.setProperty('--primary-text', palette.text || '#FFF');
    document.body.style.background = `radial-gradient(circle at 50% 30%, rgba(255,255,255,0.08) 0%, transparent 60%), linear-gradient(135deg, ${bg1}, ${bg2})`;
    localStorage.setItem('dashboard-palette', JSON.stringify({ palette }));
}

// --- Wallpaper display ---
const wpContainer = document.getElementById('character-wallpaper');
const currentThumb = document.getElementById('current-wp-thumb');

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
        wpImg.removeAttribute('src');
    }
    if (currentThumb) {
        currentThumb.style.backgroundImage = dataUrl ? `url("${dataUrl}")` : '';
        currentThumb.classList.toggle('empty', !dataUrl);
    }
    document.getElementById('current-wp')?.classList.toggle('no-image', !dataUrl);
}

/** 'cover' fills the screen (may crop), 'center' shows the whole image in the middle. */
function setFitMode(mode) {
    if (!wpContainer) return;
    wpContainer.classList.toggle('mode-cover', mode === 'cover');
    wpContainer.classList.toggle('mode-center', mode !== 'cover');
    document.querySelectorAll('#current-wp .fit-toggle button').forEach(b => b.classList.toggle('active', b.dataset.fit === mode));
    localStorage.setItem('wallpaper-fit-mode', mode);
}
document.querySelectorAll('#current-wp .fit-toggle button').forEach(b => b.addEventListener('click', () => setFitMode(b.dataset.fit)));

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

const fileInput = document.getElementById('wallpaper-file-input');
if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) handleNewWallpaperFile(e.target.files[0]);
        e.target.value = '';
    });
}

// Drag an image from File Explorer onto the screen
const dropOverlay = document.getElementById('drag-drop-overlay');
let dragCounter = 0;
window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    if (dropOverlay) dropOverlay.classList.add('active');
});
window.addEventListener('dragover', (e) => e.preventDefault());
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
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) handleNewWallpaperFile(e.dataTransfer.files[0]);
});

const clearBtn = document.getElementById('clear-wallpaper-btn');
if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
        setWallpaperDisplay('');
        await WallpaperDB.clear();
    });
}

// --- Built-in wallpapers: drawn at the screen's own resolution, so they are always sharp ---
function seededRandom(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function vGradient(ctx, h, stops, y0 = 0, y1 = h) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(([at, c]) => g.addColorStop(at, c));
    return g;
}

function drawStars(ctx, w, h, rnd, count, maxY = 1) {
    const s = w / 1920;
    for (let i = 0; i < count; i++) {
        const r = (rnd() < 0.92 ? 0.6 + rnd() * 0.8 : 1.5 + rnd() * 1.2) * s;
        ctx.globalAlpha = 0.35 + rnd() * 0.65;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(rnd() * w, rnd() * h * maxY, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

/** A soft ridge line: sum of sines plus a little noise, filled down to the bottom. */
function drawRidge(ctx, w, h, rnd, baseY, amp, color, freqs = [1.3, 3.1, 7.7]) {
    const phases = freqs.map(() => rnd() * Math.PI * 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += Math.max(2, w / 480)) {
        let y = 0;
        freqs.forEach((f, i) => { y += Math.sin((x / w) * Math.PI * 2 * f + phases[i]) / (i + 1); });
        ctx.lineTo(x, baseY + y * amp);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
}

const BUILTIN_WALLPAPERS = [
    {
        id: 'hills', name: 'Green hills',
        draw(ctx, w, h, rnd) {
            ctx.fillStyle = vGradient(ctx, h, [[0, '#cfe8c8'], [0.45, '#8fc79a'], [1, '#2d5a46']]);
            ctx.fillRect(0, 0, w, h);
            const sun = ctx.createRadialGradient(w * 0.72, h * 0.28, 0, w * 0.72, h * 0.28, h * 0.35);
            sun.addColorStop(0, 'rgba(255,250,220,0.9)');
            sun.addColorStop(1, 'rgba(255,250,220,0)');
            ctx.fillStyle = sun;
            ctx.fillRect(0, 0, w, h);
            const layers = ['#a9d3a4', '#86bd8a', '#63a274', '#46865e', '#2f6a4a', '#1f4d37'];
            layers.forEach((c, i) => drawRidge(ctx, w, h, rnd, h * (0.45 + i * 0.09), h * (0.06 - i * 0.004), c));
        },
    },
    {
        id: 'sunset', name: 'Sunset',
        draw(ctx, w, h, rnd) {
            ctx.fillStyle = vGradient(ctx, h, [[0, '#2b1055'], [0.45, '#b33c6e'], [0.7, '#f28f5c'], [1, '#fcd29f']]);
            ctx.fillRect(0, 0, w, h);
            const sun = ctx.createRadialGradient(w * 0.5, h * 0.66, 0, w * 0.5, h * 0.66, h * 0.4);
            sun.addColorStop(0, 'rgba(255,236,190,1)');
            sun.addColorStop(0.18, 'rgba(255,214,150,0.95)');
            sun.addColorStop(0.2, 'rgba(255,190,130,0.45)');
            sun.addColorStop(1, 'rgba(255,160,120,0)');
            ctx.fillStyle = sun;
            ctx.fillRect(0, 0, w, h);
            ['#8a3b6b', '#5e2a5e', '#3b1c4a', '#221233'].forEach((c, i) =>
                drawRidge(ctx, w, h, rnd, h * (0.62 + i * 0.08), h * (0.07 - i * 0.012), c, [1.1, 2.9, 9.5]));
        },
    },
    {
        id: 'ocean', name: 'Ocean',
        draw(ctx, w, h, rnd) {
            ctx.fillStyle = vGradient(ctx, h, [[0, '#9fd3f7'], [0.5, '#dff1fb'], [0.52, '#3f8fc0'], [1, '#0b3a5c']]);
            ctx.fillRect(0, 0, w, h);
            const blues = ['#5aa7d4', '#468fc0', '#3378aa', '#236290', '#154c75', '#0b3a5c'];
            blues.forEach((c, i) => drawRidge(ctx, w, h, rnd, h * (0.55 + i * 0.075), h * (0.008 + i * 0.006), c, [4, 9, 17]));
        },
    },
    {
        id: 'aurora', name: 'Aurora',
        draw(ctx, w, h, rnd) {
            ctx.fillStyle = vGradient(ctx, h, [[0, '#040716'], [0.6, '#0a1d33'], [1, '#0d2e3a']]);
            ctx.fillRect(0, 0, w, h);
            drawStars(ctx, w, h, rnd, Math.round(420 * (w * h) / (1920 * 1080)), 0.8);
            ctx.globalCompositeOperation = 'lighter';
            ctx.filter = `blur(${Math.round(28 * w / 1920)}px)`;
            [['rgba(80,255,170,', 0.3], ['rgba(60,200,255,', 0.4], ['rgba(170,110,255,', 0.26]].forEach(([c, y0]) => {
                const p = rnd() * Math.PI * 2;
                const f = 1 + rnd() * 1.5;
                const top = x => h * y0 + Math.sin((x / w) * Math.PI * 2 * f + p) * h * 0.07;
                const g = ctx.createLinearGradient(0, h * (y0 - 0.1), 0, h * (y0 + 0.35));
                g.addColorStop(0, `${c}0)`);
                g.addColorStop(0.25, `${c}0.55)`);
                g.addColorStop(1, `${c}0)`);
                ctx.fillStyle = g;
                ctx.beginPath();
                for (let x = 0; x <= w; x += w / 240) ctx.lineTo(x, top(x));
                for (let x = w; x >= 0; x -= w / 240) ctx.lineTo(x, top(x) + h * 0.3);
                ctx.closePath();
                ctx.fill();
            });
            ctx.filter = 'none';
            ctx.globalCompositeOperation = 'source-over';
            drawRidge(ctx, w, h, rnd, h * 0.88, h * 0.03, '#030a12', [2, 6, 13]);
        },
    },
    {
        id: 'night', name: 'Starry night',
        draw(ctx, w, h, rnd) {
            ctx.fillStyle = vGradient(ctx, h, [[0, '#0f0c29'], [0.55, '#302b63'], [1, '#24243e']]);
            ctx.fillRect(0, 0, w, h);
            drawStars(ctx, w, h, rnd, Math.round(900 * (w * h) / (1920 * 1080)));
            const mx = w * 0.78, my = h * 0.24, mr = h * 0.07;
            const glow = ctx.createRadialGradient(mx, my, mr, mx, my, mr * 5);
            glow.addColorStop(0, 'rgba(255,248,220,0.35)');
            glow.addColorStop(1, 'rgba(255,248,220,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#fbf3d5';
            ctx.beginPath();
            ctx.arc(mx, my, mr, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(15,12,41,0.9)';
            ctx.beginPath();
            ctx.arc(mx + mr * 0.45, my - mr * 0.2, mr * 0.92, 0, Math.PI * 2);
            ctx.fill();
        },
    },
    {
        id: 'blossom', name: 'Blossom',
        draw(ctx, w, h, rnd) {
            ctx.fillStyle = vGradient(ctx, h, [[0, '#ffe3ec'], [0.5, '#f7a8c4'], [1, '#b8578a']]);
            ctx.fillRect(0, 0, w, h);
            ctx.globalCompositeOperation = 'lighter';
            const s = w / 1920;
            for (let i = 0; i < 70; i++) {
                const r = (20 + rnd() * 120) * s;
                const x = rnd() * w, y = rnd() * h;
                const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, `rgba(255,255,255,${0.08 + rnd() * 0.16})`);
                g.addColorStop(0.7, `rgba(255,220,235,${0.05 + rnd() * 0.08})`);
                g.addColorStop(1, 'rgba(255,220,235,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over';
        },
    },
];

function renderBuiltin(item, w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    item.draw(canvas.getContext('2d'), w, h, seededRandom(item.id.length * 7919 + item.id.charCodeAt(0)));
    return canvas;
}

async function applyBuiltin(item) {
    const dpr = window.devicePixelRatio || 1;
    let w = Math.round(screen.width * dpr), h = Math.round(screen.height * dpr);
    if (w > 3840) { h = Math.round(h * 3840 / w); w = 3840; }
    const canvas = renderBuiltin(item, w, h);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.93));
    await applyWallpaperBlob(blob, 'cover', { quiet: true });
    showToast(`${item.name} wallpaper applied`);
}

const builtinGrid = document.getElementById('builtin-grid');
if (builtinGrid && MODE !== 'wallpaper') {
    const uploadTile = builtinGrid.querySelector('.builtin-upload');
    for (const item of BUILTIN_WALLPAPERS) {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'builtin-tile';
        tile.title = item.name;
        tile.setAttribute('aria-label', `${item.name} wallpaper`);
        tile.style.backgroundImage = `url("${renderBuiltin(item, 192, 120).toDataURL('image/jpeg', 0.85)}")`;
        tile.addEventListener('click', () => applyBuiltin(item));
        builtinGrid.insertBefore(tile, uploadTile);
    }
}

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

        // Pictures much smaller than the screen will look blurry when they fill it
        const lowRes = item.width < SCREEN_WIDTH * 0.8;
        card.classList.toggle('wp-lowres', lowRes);
        const meta = document.createElement('span');
        meta.className = 'wp-meta';
        const who = item.tags && item.tags.length ? item.tags.slice(0, 3).join(', ') : '';
        meta.textContent = (lowRes ? 'May look blurry · ' : '') + (who ? `${who} · ${item.width}×${item.height}` : `${item.width}×${item.height} · ${item.source}`);

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

// The screen's real width in pixels, to spot pictures that would look blurry on it
const SCREEN_WIDTH = Math.round(screen.width * (window.devicePixelRatio || 1));

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

/**
 * Shows an image as the wallpaper, saves it and matches the colors to it.
 * fit: 'cover' (fill screen), 'center', or 'auto' (fill for wide images, center tall ones).
 */
async function applyWallpaperBlob(sourceBlob, fit = 'auto', { quiet = false } = {}) {
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
    setFitMode(fit === 'auto' ? (ratio >= 1.3 ? 'cover' : 'center') : fit);
    applyPalette(extractPalette(bitmap));
    const small = bitmap.width < SCREEN_WIDTH * 0.6;
    bitmap.close?.();
    if (quiet) return;
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
        await applyWallpaperBlob(await res.blob(), wpFit);
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

// "Show as" in the results: how the picked image will be shown
let wpFit = 'auto';
document.querySelectorAll('#wp-fit-toggle button').forEach(b => b.addEventListener('click', () => {
    wpFit = b.dataset.fit;
    document.querySelectorAll('#wp-fit-toggle button').forEach(x => x.classList.toggle('active', x === b));
}));

// "Search the whole web": a browser window where any image can be right-clicked -> Set as wallpaper
if (IS_APP && window.desktop) {
    wpWeb.addEventListener('click', () => window.desktop.openWebSearch(wpCurrentQuery, 'google'));
    window.desktop.onApplyImage(async ({ bytes, type }) => {
        try {
            await applyWallpaperBlob(new Blob([bytes], { type }), wpFit);
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
    setFitMode(localStorage.getItem('wallpaper-fit-mode') || 'cover');

    let palette = DEFAULT_PALETTE;
    try { palette = JSON.parse(localStorage.getItem('dashboard-palette')).palette || DEFAULT_PALETTE; } catch (e) { /* first run */ }
    applyPalette(palette);
    if (MODE === 'popup') return;  // shows only a panel, never the picture

    const savedWp = await WallpaperDB.load();
    if (savedWp) {
        setWallpaperDisplay(savedWp);
    } else {
        setWallpaperDisplay('');
        // First run: start with a built-in wallpaper instead of a plain color
        if (MODE === 'editor' && !localStorage.getItem('wallpaper-initialized')) {
            localStorage.setItem('wallpaper-initialized', '1');
            await applyBuiltin(BUILTIN_WALLPAPERS[0]).catch(() => {});
        }
    }
}

initDashboardTheme();


// --- 12-Hour Format Time & Basic Functionality ---

// Clock formats, chosen from the Format button while editing the date or time widget
const CLOCK_KEY = 'dashboard-clock';
const TIME_FORMATS = {
    h12: { seconds: false, h24: false },
    h12s: { seconds: true, h24: false },
    h24: { seconds: false, h24: true },
    h24s: { seconds: true, h24: true },
};
const DATE_FORMATS = {
    short: d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' }),
    long: d => `${d.toLocaleDateString('en-US', { weekday: 'long' })}, ${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'long' })}`,
    medium: d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    numeric: d => d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' }),  // Windows' own order
    weekday: d => d.toLocaleDateString('en-US', { weekday: 'long' }),
};
const CLOCK_FONTS = {
    playful: { label: 'Playful', family: "'Chewy', cursive" },
    clean: { label: 'Clean', family: "'Inter', sans-serif" },
    elegant: { label: 'Elegant', family: "'Playfair Display', serif" },
    modern: { label: 'Modern', family: "'Space Grotesk', sans-serif" },
    digital: { label: 'Digital', family: "'Orbitron', sans-serif" },
    script: { label: 'Script', family: "'Pacifico', cursive" },
};
function clockFormats() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(CLOCK_KEY)) || {}; } catch (e) { /* default */ }
    const font = k => (CLOCK_FONTS[saved[k]] ? saved[k] : 'playful');
    return {
        time: TIME_FORMATS[saved.time] ? saved.time : 'h12',
        date: DATE_FORMATS[saved.date] ? saved.date : 'short',
        timeFont: font('timeFont'),
        dateFont: font('dateFont'),
    };
}
function timeParts(d, key) {
    const f = TIME_FORMATS[key];
    let h = d.getHours();
    const suffix = f.h24 ? '' : (h >= 12 ? 'PM' : 'AM');
    if (!f.h24) h = h % 12 || 12;
    const text = `${f.h24 ? String(h).padStart(2, '0') : h}:${String(d.getMinutes()).padStart(2, '0')}${f.seconds ? ':' + String(d.getSeconds()).padStart(2, '0') : ''}`;
    return { text, suffix };
}

/**
 * Wide fonts and seconds can make the date or time wider than its widget: shrink the text to fit
 * (never above the size it was designed at).
 */
const CLOCK_TEXT = [
    { el: () => document.getElementById('date-display'), box: () => document.querySelector('[data-id="date"]'), size: ['date-display'] },
    { el: () => document.querySelector('.time-display'), box: () => document.querySelector('[data-id="time"]'), size: ['time-display', 'ampm-display'] },
];
const clockBaseSizes = {};
function fitClock() {
    for (const c of CLOCK_TEXT) {
        const el = c.el(), box = c.box();
        if (!el || !box || !box.clientWidth) continue;
        // Start from the designed sizes (from index.html), then scale down if it doesn't fit
        c.size.forEach(id => {
            const t = document.getElementById(id);
            clockBaseSizes[id] ??= parseFloat(t.style.fontSize) || 3;
            t.style.fontSize = `${clockBaseSizes[id]}rem`;
        });
        const room = box.clientWidth - 8;
        // Natural width of the text (right-aligned overflow isn't counted in scrollWidth)
        const prevWidth = el.style.width, prevDisplay = el.style.display;
        el.style.width = 'max-content';
        if (getComputedStyle(el).display === 'block') el.style.display = 'inline-block';
        const needed = el.getBoundingClientRect().width;
        el.style.width = prevWidth;
        el.style.display = prevDisplay;
        if (needed > room) {
            const ratio = Math.max(0.35, room / needed);
            c.size.forEach(id => { document.getElementById(id).style.fontSize = `${(clockBaseSizes[id] * ratio).toFixed(3)}rem`; });
        }
    }
}
if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => fitClock());
    ['date', 'time'].forEach(id => { const w = document.querySelector(`[data-id="${id}"]`); if (w) ro.observe(w); });
}
document.fonts?.addEventListener?.('loadingdone', () => fitClock());

let clockTimer = null;
function updateTimeAndDate() {
    clearTimeout(clockTimer);
    const now = new Date();
    const fmt = clockFormats();
    const { text, suffix } = timeParts(now, fmt.time);
    document.getElementById('time-display').innerText = text;
    const ampm = document.getElementById('ampm-display');
    ampm.innerText = suffix;
    ampm.hidden = !suffix;
    document.getElementById('date-display').innerText = DATE_FORMATS[fmt.date](now);
    document.getElementById('date-display').style.fontFamily = CLOCK_FONTS[fmt.dateFont].family;
    document.querySelector('.time-display').style.fontFamily = CLOCK_FONTS[fmt.timeFont].family;
    fitClock();
    // Next second or next minute, whichever the format needs
    const wait = TIME_FORMATS[fmt.time].seconds ? 1000 - now.getMilliseconds() : (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    clockTimer = setTimeout(updateTimeAndDate, wait);
}
updateTimeAndDate();
window.addEventListener('storage', (e) => { if (e.key === CLOCK_KEY) updateTimeAndDate(); });

// The Format menu
let formatMenu = null;
function closeFormatMenu() {
    formatMenu?.remove();
    formatMenu = null;
}
function openFormatMenu(btn) {
    closeFormatMenu();
    const kind = btn.closest('.drag-widget').dataset.id;  // 'date' or 'time'
    const fmt = clockFormats();
    const sample = new Date();
    const formats = kind === 'time'
        ? Object.keys(TIME_FORMATS).map(k => { const p = timeParts(sample, k); return { key: k, label: `${p.text}${p.suffix ? ' ' + p.suffix : ''}` }; })
        : Object.keys(DATE_FORMATS).map(k => ({ key: k, label: DATE_FORMATS[k](sample) }));
    const fonts = Object.entries(CLOCK_FONTS).map(([k, f]) => ({ key: k, label: f.label, family: f.family }));
    formatMenu = document.createElement('div');
    formatMenu.className = 'format-menu';
    formatMenu.setAttribute('role', 'menu');
    const section = (title, setting, items) => {
        const h = document.createElement('div');
        h.className = 'format-menu-title';
        h.textContent = title;
        formatMenu.appendChild(h);
        for (const opt of items) {
            const item = document.createElement('button');
            item.type = 'button';
            item.setAttribute('role', 'menuitemradio');
            item.setAttribute('aria-checked', String(fmt[setting] === opt.key));
            item.innerHTML = '<i class="fa-solid fa-check"></i><span></span>';
            item.querySelector('span').textContent = opt.label;
            if (opt.family) item.querySelector('span').style.fontFamily = opt.family;  // each font shown in itself
            item.addEventListener('click', () => {
                localStorage.setItem(CLOCK_KEY, JSON.stringify({ ...fmt, [setting]: opt.key }));
                updateTimeAndDate();
                closeFormatMenu();
            });
            formatMenu.appendChild(item);
        }
    };
    section('Format', kind, formats);
    section('Font', kind === 'time' ? 'timeFont' : 'dateFont', fonts);
    document.body.appendChild(formatMenu);
    const r = btn.getBoundingClientRect();
    formatMenu.style.top = `${r.bottom + 6}px`;
    formatMenu.style.left = `${Math.max(8, Math.min(r.right - formatMenu.offsetWidth, innerWidth - formatMenu.offsetWidth - 8))}px`;
    formatMenu.querySelector('[aria-checked="true"]')?.focus();
}
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.wc-format');
    if (btn) { if (formatMenu) closeFormatMenu(); else openFormatMenu(btn); return; }
    if (formatMenu && !e.target.closest('.format-menu')) closeFormatMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && formatMenu) { e.stopImmediatePropagation(); closeFormatMenu(); } }, true);

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
        if (e.detail > 1 || e.target.closest('.widget-controls') || el.closest('.edit-mode')) { clearTimeout(timer); return; }
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
const afDate = document.getElementById('af-date');
const afWhen = document.getElementById('af-when');
const afWhenPreview = document.getElementById('af-when-preview');
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

/** "Today", "Tomorrow" or "Fri, 25 Sep" for a 'YYYY-MM-DD' date */
function friendlyDate(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const today = localDay(new Date());
    if (ymd === today) return 'Today';
    if (ymd === localDay(new Date(Date.now() + 86400000))) return 'Tomorrow';
    return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(y !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}

function repeatLabel(a) {
    return a.days.length ? daysSummary(a.days) : `Once${a.date ? `, ${friendlyDate(a.date)}` : ''}`;
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
        const daysAway = (at - new Date()) / 86400000;
        const when = localDay(at) === today ? '' : localDay(at) === tomorrow ? 'Tomorrow'
            : daysAway < 6 ? DAY_NAMES[at.getDay()] : friendlyDate(localDay(at));
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
        l2.textContent = `${repeatLabel(a)} · ${soundLabel(a)}`;
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

/** The next day a time will come round: today if it's still ahead, otherwise tomorrow. */
function nextDateFor(time) {
    const [h, m] = time.split(':').map(Number);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
    return localDay(today > now ? today : new Date(today.getTime() + 86400000));
}

function selectedDays() {
    return [...afDays].filter(b => b.classList.contains('active')).map(b => Number(b.dataset.day));
}

// The date only matters for alarms that ring once
function syncDateField() {
    document.getElementById('af-date-field').hidden = selectedDays().length > 0;
}

function openAlarmForm(alarm) {
    editingAlarmId = alarm ? alarm.id : null;
    customSound = alarm && alarm.sound.startsWith('file:') ? { sound: alarm.sound, soundName: alarm.soundName } : null;
    const inAnHour = new Date(Date.now() + 3600000);
    afTime.value = alarm ? alarm.time : `${pad2(inAnHour.getHours())}:00`;
    afDate.value = alarm && alarm.date ? alarm.date : nextDateFor(afTime.value);
    afLabel.value = alarm ? alarm.label : '';
    afWhen.value = '';
    afWhenPreview.textContent = '';
    afWhenPreview.classList.remove('is-error');
    const days = alarm ? alarm.days : [];
    afDays.forEach(b => b.classList.toggle('active', days.includes(Number(b.dataset.day))));
    syncDateField();
    fillSoundOptions(alarm ? alarm.sound : 'chime');
    alarmForm.hidden = false;
    afWhen.focus();
}

// Typed "when": fills in the time, date and repeat days, and says how it was understood
let whenTimer = null;
async function readTypedWhen() {
    const text = afWhen.value.trim();
    afWhenPreview.classList.remove('is-error');
    if (!text) { afWhenPreview.textContent = ''; return; }
    const r = await window.desktop.parseWhen(text, 'alarm');
    if (afWhen.value.trim() !== text) return;  // typed more since
    if (!r || (!r.start && !r.days)) {
        afWhenPreview.textContent = 'Not sure what that means. Try "tomorrow 7am", "fri 6:30pm" or "every weekday 7:30".';
        afWhenPreview.classList.add('is-error');
        return;
    }
    if (r.start) {
        const at = new Date(r.start);
        afTime.value = `${pad2(at.getHours())}:${pad2(at.getMinutes())}`;
        afDate.value = localDay(at);
    }
    afDays.forEach(b => b.classList.toggle('active', !!r.days && r.days.includes(Number(b.dataset.day))));
    syncDateField();
    const time = format12(afTime.value);
    afWhenPreview.textContent = r.days
        ? `${daysSummary(r.days)} at ${time}`
        : `${friendlyDate(afDate.value)} at ${time}`;
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
    afDays.forEach(b => b.addEventListener('click', () => { b.classList.toggle('active'); syncDateField(); }));
    afWhen.addEventListener('input', () => { clearTimeout(whenTimer); whenTimer = setTimeout(readTypedWhen, 150); });
    afWhen.addEventListener('keydown', (e) => {
        // Enter in the "when" box reads it instead of saving straight away
        if (e.key === 'Enter') { e.preventDefault(); clearTimeout(whenTimer); readTypedWhen(); }
    });
    afTime.addEventListener('change', () => { if (!afWhen.value.trim()) afDate.value = nextDateFor(afTime.value); });
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
        const days = selectedDays();
        if (!days.length) {
            const [y, mo, d] = (afDate.value || nextDateFor(afTime.value)).split('-').map(Number);
            const [h, m] = afTime.value.split(':').map(Number);
            if (new Date(y, mo - 1, d, h, m) <= new Date()) {
                showToast('That time has already passed. Pick a later time or date.');
                return;
            }
        }
        const alarm = {
            id: editingAlarmId || undefined,
            time: afTime.value,
            date: days.length ? '' : (afDate.value || nextDateFor(afTime.value)),
            label: afLabel.value.trim(),
            days,
            enabled: true,
            sound: chosenSound,
            soundName: chosenSound.startsWith('file:') && customSound ? customSound.soundName : '',
        };
        const list = editingAlarmId
            ? alarmsCache.map(a => a.id === editingAlarmId ? { ...alarm, id: a.id } : a)
            : [...alarmsCache, alarm];
        closeAlarmForm();
        await saveAlarmList(list);
        const whenText = alarm.days.length ? daysSummary(alarm.days).toLowerCase() : friendlyDate(alarm.date);
        showToast(`Alarm set for ${format12(alarm.time)}, ${/^(Today|Tomorrow)$/.test(whenText) ? whenText.toLowerCase() : whenText}`);
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

// --- Panels (alarms, calendars, a day's events, event editor) in the editor ---
const PANELS = '#alarms-modal, #calendars-modal, #day-modal, #event-modal';

function openPanel(name) {
    const modal = document.getElementById(`${name}-modal`);
    if (!modal) return;
    document.querySelectorAll('.wp-modal').forEach(m => { if (m !== modal) m.hidden = true; });
    modal.hidden = false;
    if (name === 'alarms') { renderAlarmList(); refreshAlarms(); }
    if (name === 'calendars') renderCalendarPanel();
    if (name !== 'event') modal.querySelector('[data-close]').focus();
}

function closePanel(modal) {
    if (modal.id === 'alarms-modal') closeAlarmForm();
    modal.hidden = true;
    // Closing the event editor goes back to the day it came from
    if (modal.id === 'event-modal' && eventReturnDay) {
        const day = eventReturnDay;
        eventReturnDay = null;
        openDay(day);
    }
    closePopupIfDone();
}

document.querySelectorAll(PANELS).forEach(modal => {
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closePanel(modal)));
    modal.addEventListener('click', (e) => { if (e.target === modal) closePanel(modal); });
});
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll(PANELS).forEach(m => { if (!m.hidden) closePanel(m); });
});

// --- Calendar ---
let calendarEvents = [];
let calendarStatus = [];
let googleState = null;     // { email, error } when signed in to Google
let eventReturnDay = null;  // day view to go back to after editing an event
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

// Events marked as done in "Upcoming" (kept for 60 days, on this PC)
const DONE_KEY = 'dashboard-done-events';
let doneEvents = new Map();
function loadDone() {
    try { doneEvents = new Map(Object.entries(JSON.parse(localStorage.getItem(DONE_KEY)) || {})); } catch (e) { doneEvents = new Map(); }
    const cutoff = Date.now() - 60 * 86400000;
    for (const [k, t] of doneEvents) if (t < cutoff) doneEvents.delete(k);
}
loadDone();
const doneKey = ev => `${ev.calendarId || ev.calendar || ''}|${ev.id || ev.title}|${ev.start}`;
function toggleDone(key) {
    if (doneEvents.has(key)) doneEvents.delete(key); else doneEvents.set(key, Date.now());
    localStorage.setItem(DONE_KEY, JSON.stringify(Object.fromEntries(doneEvents)));
    renderAgenda();
}
window.addEventListener('storage', (e) => { if (e.key === DONE_KEY) { loadDone(); renderAgenda(); } });

// "Upcoming" widget: what's left today and the next few days
function renderAgenda() {
    const list = document.getElementById('agenda-list');
    const widget = document.querySelector('[data-id="agenda"]');
    widget.classList.toggle('agenda-unused', !calendarsConnected);
    list.innerHTML = '';

    if (!calendarsConnected) {
        const p = document.createElement('div');
        p.className = 'agenda-empty';
        p.textContent = 'Sign in with Google to see and edit your events here.';
        if (MODE === 'editor') {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'agenda-connect';
            b.textContent = 'Connect Google Calendar';
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
        Object.assign(item.dataset, { eventId: ev.id || '', calendarId: ev.calendarId || '', date: ev.date });
        // Tick an event off, e.g. an assignment you've handed in (remembered on this PC only)
        const key = doneKey(ev);
        const check = document.createElement('button');
        check.type = 'button';
        check.className = 'agenda-check';
        check.dataset.doneKey = key;
        check.setAttribute('aria-label', `Mark "${ev.title}" as done`);
        check.title = 'Mark as done';
        check.innerHTML = '<i class="fa-solid fa-check"></i>';
        item.prepend(check);
        item.classList.toggle('is-done', doneEvents.has(key));
        if (MODE !== 'wallpaper') check.addEventListener('click', (e) => { e.stopPropagation(); toggleDone(key); });
        if (MODE === 'editor') {
            item.classList.add('is-clickable');
            item.tabIndex = 0;
            item.setAttribute('role', 'button');
            const open = () => (ev.editable ? openEventEditor({ event: ev }) : openDay(ev.date));
            item.addEventListener('click', open);
            item.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
        }
        list.appendChild(item);
    }
}

async function refreshCalendarEvents(force = false) {
    if (!IS_APP) return;
    try {
        const res = await fetch(`/api/calendar/events${force ? '?refresh=1' : ''}`);
        const data = await res.json();
        calendarEvents = data.events || [];
        googleState = data.google || null;
        calendarsConnected = !!googleState || (data.feeds || []).length > 0 || !!data.folder;
        calendarStatus = data.feeds || [];
    } catch (e) {
        // Keep whatever was shown before
    }
    markCalendarEvents();
    renderAgenda();
    if (!document.getElementById('calendars-modal').hidden) renderCalendarPanel();
}

renderCalendar();
let firstCalendarLoad = Promise.resolve();
if (IS_APP) {
    firstCalendarLoad = refreshCalendarEvents();
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
    renderGoogleSection();
    const { feeds, folder } = await window.desktop.getCalendars();
    const list = document.getElementById('calendar-list');
    list.innerHTML = '';
    if (feeds.length || folder) document.getElementById('other-calendars').open = true;
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
        // Click a date to see and edit that day; click elsewhere on the calendar for calendar settings
        onSingleClick(document.querySelector('[data-id="calendar"]'), (e) => {
            const cell = e.target.closest('#calendar-grid span:not(:empty)');
            if (cell) {
                const now = new Date();
                openDay(localDay(new Date(now.getFullYear(), now.getMonth(), Number(cell.textContent))));
            } else {
                openPanel('calendars');
            }
        });
        document.getElementById('editor-alarms-btn').addEventListener('click', () => openPanel('alarms'));
        document.getElementById('editor-calendars-btn').addEventListener('click', () => openPanel('calendars'));
        window.desktop.onOpenPanel(showEditorTarget);
    }
}

/** What the editor shows when opened from the tray or a widget clicked on the desktop. */
async function showEditorTarget(target) {
    if (target === 'todo') {
        document.querySelectorAll(PANELS).forEach(m => { m.hidden = true; });
        todoInput.focus();
    } else if (typeof target === 'string') {
        openPanel(target);
    } else if (target?.day) {
        await firstCalendarLoad;
        openDay(target.day);
    } else if (target?.event) {
        await firstCalendarLoad;
        const { id, calendarId, date } = target.event;
        const ev = calendarEvents.find(e => e.id === id && e.calendarId === calendarId);
        if (ev?.editable) openEventEditor({ event: ev });
        else openDay(date);
    }
}

// --- Google Calendar sign-in (Calendars panel) ---
async function renderGoogleSection() {
    if (!window.desktop) return;
    const { configured, account } = await window.desktop.googleStatus();
    document.getElementById('google-signed-out').hidden = !!account;
    document.getElementById('google-signed-in').hidden = !account;
    document.getElementById('google-sign-in').hidden = !configured;
    document.getElementById('google-not-set-up').hidden = configured;
    if (!account) return;

    document.getElementById('google-email').textContent = account.email || 'Signed in';
    const syncError = document.getElementById('google-sync-error');
    syncError.textContent = googleState?.error || '';

    const box = document.getElementById('google-calendars');
    const { calendars, error } = await window.desktop.googleCalendars();
    box.innerHTML = '';
    if (error) { syncError.textContent = error; return; }
    for (const c of calendars.filter(x => x.shown)) {
        const chip = document.createElement('span');
        chip.className = 'google-cal-chip';
        const dot = document.createElement('i');
        dot.style.background = c.color;
        chip.append(dot, c.name + (c.writable ? '' : ' (view only)'));
        box.appendChild(chip);
    }
}

// --- One day's events ---
let dayViewDate = null;

function openDay(ymd) {
    dayViewDate = ymd;
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    document.getElementById('day-title').textContent = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const events = calendarEvents
        .filter(ev => ev.date === ymd || (ev.allDay && ev.date < ymd && localDay(new Date(new Date(ev.end).getTime() - 1)) >= ymd))
        .sort((a, b) => (b.allDay - a.allDay) || a.start.localeCompare(b.start));
    document.getElementById('day-subtitle').textContent =
        events.length ? `${events.length} event${events.length > 1 ? 's' : ''}` : 'No events';
    document.getElementById('day-add-btn').hidden = !googleState;

    const list = document.getElementById('day-list');
    list.innerHTML = '';
    if (!events.length) {
        const p = document.createElement('p');
        p.className = 'panel-empty';
        p.textContent = googleState ? 'Nothing planned. Press "Add event" to add something.' : 'Nothing planned.';
        list.appendChild(p);
    }
    for (const ev of events) {
        const row = document.createElement(ev.editable ? 'button' : 'div');
        if (ev.editable) { row.type = 'button'; row.title = 'Edit event'; }
        row.className = 'panel-row day-event' + (ev.editable ? ' is-clickable' : '');
        row.style.setProperty('--event-color', ev.color || 'var(--accent-color)');
        const time = document.createElement('span');
        time.className = 'day-event-time';
        time.textContent = ev.allDay ? 'All day'
            : `${eventTimeLabel(ev)} – ${new Date(ev.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
        const info = document.createElement('span');
        info.className = 'panel-row-info';
        const t = document.createElement('b');
        t.textContent = ev.title;
        const sub = document.createElement('small');
        sub.textContent = [ev.location, ev.calendar, ev.editable ? '' : 'view only'].filter(Boolean).join(' · ');
        info.append(t, sub);
        row.append(time, info);
        if (ev.editable) row.addEventListener('click', () => openEventEditor({ event: ev, returnDay: ymd }));
        list.appendChild(row);
    }
    if (!googleState) {
        const p = document.createElement('p');
        p.className = 'field-hint';
        p.innerHTML = '';
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'link-btn';
        link.textContent = 'Sign in with Google';
        link.addEventListener('click', () => openPanel('calendars'));
        p.append(link, ' to add and edit events.');
        list.appendChild(p);
    }
    openPanel('day');
}

// --- Add / edit an event (Google Calendar) ---
const eventForm = document.getElementById('event-form');
const ef = {
    title: document.getElementById('ef-title'),
    when: document.getElementById('ef-when'),
    preview: document.getElementById('ef-when-preview'),
    date: document.getElementById('ef-date'),
    start: document.getElementById('ef-start'),
    end: document.getElementById('ef-end'),
    allDay: document.getElementById('ef-allday'),
    location: document.getElementById('ef-location'),
    calendar: document.getElementById('ef-calendar'),
    notes: document.getElementById('ef-notes'),
    reminder: document.getElementById('ef-reminder'),
    remindEmail: document.getElementById('ef-remind-email'),
    remindPopup: document.getElementById('ef-remind-popup'),
    error: document.getElementById('ef-error'),
    del: document.getElementById('ef-delete'),
    save: document.getElementById('ef-save'),
};
let editingEvent = null;
let deleteArmed = false;

const hhmmOf = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

function syncAllDay() {
    document.querySelectorAll('#event-form .ef-time').forEach(el => { el.hidden = ef.allDay.checked; });
}

// Reminder: pick a time before the event, then how (email and/or phone notification)
const DEFAULT_REMINDER = { minutes: 30, email: true, popup: true };

function setReminderFields(r) {
    const minutes = r ? String(r.minutes) : '';
    if (minutes && ![...ef.reminder.options].some(o => o.value === minutes)) {
        // Keep an unusual reminder from Google (e.g. 45 minutes) as its own option
        const m = Number(minutes);
        const label = m % 1440 === 0 ? `${m / 1440} days before` : m % 60 === 0 ? `${m / 60} hours before` : `${m} minutes before`;
        ef.reminder.add(new Option(label, minutes));
    }
    ef.reminder.value = minutes;
    ef.remindEmail.checked = !!(r && r.email);
    ef.remindPopup.checked = !!(r && r.popup);
    syncReminder();
}

function syncReminder() {
    const off = ef.reminder.value === '';
    ef.remindEmail.disabled = off;
    ef.remindPopup.disabled = off;
    document.querySelector('#event-form .reminder-row').classList.toggle('reminder-off', off);
    const hint = document.getElementById('ef-reminder-hint');
    hint.textContent = off ? 'No reminder for this event.'
        : ef.remindEmail.checked ? `Google emails ${googleState?.email || 'you'} at that time, even if this computer is off.`
        : ef.remindPopup.checked ? 'Google Calendar notifies you on your phone and in the browser at that time.'
        : 'Tick "Email me" or "Notify on my phone" to get this reminder.';
}

function readReminderFields() {
    if (ef.reminder.value === '' || (!ef.remindEmail.checked && !ef.remindPopup.checked)) return null;
    return { minutes: Number(ef.reminder.value), email: ef.remindEmail.checked, popup: ef.remindPopup.checked };
}

async function openEventEditor({ event = null, date = null, returnDay = null } = {}) {
    if (!googleState) {
        showToast('Sign in with Google to add events');
        openPanel('calendars');
        return;
    }
    const { calendars, error } = await window.desktop.googleCalendars();
    if (error) { showToast(error); return; }
    const writable = calendars.filter(c => c.writable);
    if (!writable.length) { showToast('None of your Google calendars can be edited'); return; }

    editingEvent = event;
    eventReturnDay = returnDay;
    deleteArmed = false;
    ef.error.textContent = '';
    ef.preview.textContent = '';
    ef.when.value = '';
    ef.calendar.innerHTML = '';
    for (const c of writable) ef.calendar.add(new Option(c.name, c.id));

    if (event) {
        const s = new Date(event.start), e = new Date(event.end);
        ef.title.value = event.title === '(No title)' ? '' : event.title;
        ef.date.value = event.date;
        ef.allDay.checked = event.allDay;
        ef.start.value = event.allDay ? '09:00' : hhmmOf(s);
        ef.end.value = event.allDay ? '10:00' : hhmmOf(e);
        ef.location.value = event.location || '';
        ef.notes.value = event.description || '';
        ef.calendar.value = event.calendarId;
        ef.calendar.disabled = true;  // moving events between calendars isn't supported here
        setReminderFields(event.reminder || null);
        document.getElementById('event-title').textContent = 'Edit event';
        document.getElementById('event-subtitle').textContent = event.calendar;
    } else {
        const next = new Date();
        next.setMinutes(0, 0, 0);
        next.setHours(next.getHours() + 1);
        ef.title.value = '';
        ef.date.value = date || localDay(next);
        ef.allDay.checked = false;
        ef.start.value = hhmmOf(next);
        ef.end.value = hhmmOf(new Date(next.getTime() + 3600000));
        ef.location.value = '';
        ef.notes.value = '';
        ef.calendar.disabled = false;
        setReminderFields(DEFAULT_REMINDER);
        document.getElementById('event-title').textContent = 'New event';
        document.getElementById('event-subtitle').textContent = googleState.email || 'Google Calendar';
    }
    document.getElementById('ef-recurring-note').hidden = !(event && event.recurring);
    ef.del.hidden = !event;
    ef.del.innerHTML = '<i class="fa-solid fa-trash-can"></i> Delete';
    syncAllDay();
    openPanel('event');
    ef.title.focus();
}

let efWhenTimer = null;
async function readEventWhen() {
    const text = ef.when.value.trim();
    ef.preview.classList.remove('is-error');
    if (!text) { ef.preview.textContent = ''; return; }
    const r = await window.desktop.parseWhen(text, 'event');
    if (ef.when.value.trim() !== text) return;
    if (!r || !r.start) {
        ef.preview.textContent = 'Not sure what that means. Try "tomorrow 3pm", "fri 10-11am" or "25/12".';
        ef.preview.classList.add('is-error');
        return;
    }
    const start = new Date(r.start);
    ef.date.value = localDay(start);
    const allDay = !r.hasTime || /\ball[- ]?day\b/i.test(text);
    ef.allDay.checked = allDay;
    if (!allDay) {
        ef.start.value = hhmmOf(start);
        ef.end.value = hhmmOf(r.end ? new Date(r.end) : new Date(start.getTime() + 3600000));
    }
    syncAllDay();
    ef.preview.textContent = allDay
        ? `${friendlyDate(ef.date.value)}, all day`
        : `${friendlyDate(ef.date.value)}, ${format12(ef.start.value)} – ${format12(ef.end.value)}`;
}

if (IS_APP && window.desktop && INTERACTIVE) {
    const googleError = document.getElementById('google-error');
    const waiting = document.getElementById('google-waiting');
    const signInBtn = document.getElementById('google-sign-in');

    signInBtn.addEventListener('click', async () => {
        googleError.textContent = '';
        signInBtn.disabled = true;
        waiting.hidden = false;
        const result = await window.desktop.googleSignIn();
        signInBtn.disabled = false;
        waiting.hidden = true;
        if (result.error) {
            if (!/cancelled|restarted/i.test(result.error)) googleError.textContent = result.error;
            return;
        }
        showToast(`Signed in as ${result.account.email || 'your Google account'}`);
        await refreshCalendarEvents(true);
        renderCalendarPanel();
    });
    document.getElementById('google-cancel').addEventListener('click', () => window.desktop.googleCancelSignIn());
    document.getElementById('google-sign-out').addEventListener('click', async () => {
        await window.desktop.googleSignOut();
        showToast('Signed out of Google');
        await refreshCalendarEvents();
        renderCalendarPanel();
    });
    document.getElementById('google-add-event').addEventListener('click', () => openEventEditor());
    document.getElementById('day-add-btn').addEventListener('click', () => openEventEditor({ date: dayViewDate, returnDay: dayViewDate }));

    ef.allDay.addEventListener('change', syncAllDay);
    [ef.reminder, ef.remindEmail, ef.remindPopup].forEach(el => el.addEventListener('change', syncReminder));
    ef.when.addEventListener('input', () => { clearTimeout(efWhenTimer); efWhenTimer = setTimeout(readEventWhen, 150); });
    ef.when.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); clearTimeout(efWhenTimer); readEventWhen(); }
    });
    // Moving the start keeps the event's length
    ef.start.addEventListener('change', () => {
        if (!ef.start.dataset.prev) return;
        const [ph, pm] = ef.start.dataset.prev.split(':').map(Number);
        const [sh, sm] = ef.start.value.split(':').map(Number);
        const [eh, em] = ef.end.value.split(':').map(Number);
        const shift = (sh * 60 + sm) - (ph * 60 + pm);
        const endMin = Math.min(23 * 60 + 59, Math.max(0, eh * 60 + em + shift));
        ef.end.value = `${pad2(Math.floor(endMin / 60))}:${pad2(endMin % 60)}`;
        ef.start.dataset.prev = ef.start.value;
    });
    ef.start.addEventListener('focus', () => { ef.start.dataset.prev = ef.start.value; });

    eventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        ef.error.textContent = '';
        const payload = {
            title: ef.title.value.trim(),
            location: ef.location.value.trim(),
            description: ef.notes.value.trim(),
            allDay: ef.allDay.checked,
            reminder: readReminderFields(),
        };
        if (!payload.title) { ef.error.textContent = 'Give the event a title.'; ef.title.focus(); return; }
        if (!ef.date.value) { ef.error.textContent = 'Pick a date.'; return; }
        if (payload.allDay) {
            payload.startDate = ef.date.value;
            payload.endDate = ef.date.value;
        } else {
            const [y, m, d] = ef.date.value.split('-').map(Number);
            const [sh, sm] = ef.start.value.split(':').map(Number);
            const [eh, em] = ef.end.value.split(':').map(Number);
            const start = new Date(y, m - 1, d, sh, sm);
            const end = new Date(y, m - 1, d, eh, em);
            if (end <= start) { ef.error.textContent = 'The end time has to be after the start time.'; return; }
            payload.start = start.toISOString();
            payload.end = end.toISOString();
        }

        ef.save.disabled = true;
        ef.save.textContent = 'Saving...';
        const result = editingEvent
            ? await window.desktop.updateEvent(editingEvent.calendarId, editingEvent.id, payload)
            : await window.desktop.createEvent(ef.calendar.value, payload);
        ef.save.disabled = false;
        ef.save.textContent = 'Save';
        if (result.error) { ef.error.textContent = result.error; return; }

        const r = payload.reminder;
        const reminderNote = r && r.email ? ` You'll get an email ${r.minutes ? `${ef.reminder.selectedOptions[0].text.toLowerCase()}` : 'when it starts'}.` : '';
        showToast((editingEvent ? 'Event updated.' : `Added "${payload.title}" to Google Calendar.`) + reminderNote);
        await refreshCalendarEvents(true);
        closePanel(document.getElementById('event-modal'));
    });

    ef.del.addEventListener('click', async () => {
        if (!editingEvent) return;
        // Two presses, so an event isn't deleted by accident
        if (!deleteArmed) {
            deleteArmed = true;
            ef.del.textContent = 'Press again to delete';
            setTimeout(() => {
                deleteArmed = false;
                ef.del.innerHTML = '<i class="fa-solid fa-trash-can"></i> Delete';
            }, 4000);
            return;
        }
        const result = await window.desktop.deleteEvent(editingEvent.calendarId, editingEvent.id);
        if (result.error) { ef.error.textContent = result.error; return; }
        showToast('Event deleted');
        await refreshCalendarEvents(true);
        closePanel(document.getElementById('event-modal'));
    });
}

// --- Battery (from Windows); clicking it in the editor opens Settings > Power & battery ---
function durationText(seconds) {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

async function updateBattery() {
    if (!('getBattery' in navigator)) return;
    const battery = await navigator.getBattery();
    const widget = document.getElementById('battery-widget');
    const update = () => {
        const pct = Math.round(battery.level * 100);
        document.getElementById('battery-level').innerText = `${pct}%`;
        document.getElementById('battery-icon').className = 'fa-solid ' + (battery.level > 0.9 ? 'fa-battery-full' : battery.level > 0.6 ? 'fa-battery-three-quarters' : battery.level > 0.35 ? 'fa-battery-half' : battery.level > 0.1 ? 'fa-battery-quarter' : 'fa-battery-empty');
        widget.classList.toggle('is-charging', battery.charging);
        widget.classList.toggle('is-low', !battery.charging && battery.level <= 0.2);
        let tip = battery.charging ? `Charging, ${pct}%` : `On battery, ${pct}%`;
        if (battery.charging && Number.isFinite(battery.chargingTime) && battery.chargingTime > 0) tip += ` (full in ${durationText(battery.chargingTime)})`;
        if (!battery.charging && Number.isFinite(battery.dischargingTime)) tip += ` (about ${durationText(battery.dischargingTime)} left)`;
        widget.title = MODE === 'editor' ? `${tip}. Click for battery settings.` : tip;
    };
    update();
    ['levelchange', 'chargingchange', 'chargingtimechange', 'dischargingtimechange'].forEach(ev => battery.addEventListener(ev, update));
}
updateBattery();

if (MODE === 'editor' && window.desktop) {
    const batteryWidget = document.getElementById('battery-widget');
    batteryWidget.classList.add('interactive-btn');
    onSingleClick(batteryWidget, () => window.desktop.openWindows('battery'));
}

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
// Reminders added or ticked in another window (the popup, the editor or on the desktop) show up here too
window.addEventListener('storage', (e) => {
    if (e.key !== 'dashboard-reminders') return;
    try { reminders = JSON.parse(e.newValue) || []; } catch (err) { reminders = []; }
    renderReminders();
});


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
        // Windows Location when it's on; otherwise an approximate location from the internet connection
        try {
            const res = await fetch('/api/location');
            if (!res.ok) throw new Error();
            const loc = await res.json();
            showLocationSource(loc);
            if (loc.windows === 'pending') setTimeout(loadWeather, 15000);  // switch to the exact location once Windows answers
            return fetchWeather(loc.lat, loc.lon, loc.name || undefined);
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
function showLocationSource(loc) {
    const exact = loc.source === 'windows';
    const hint = document.getElementById('weather-location-hint');
    const widget = document.getElementById('weather-container');
    widget.classList.toggle('location-exact', exact);
    if (MODE === 'editor') {
        // Offer to turn on Windows Location when the weather is only approximate
        hint.hidden = exact;
        widget.title = exact
            ? 'Weather for your location from Windows. Click to open the Weather app.'
            : 'Approximate location from your internet connection. Click to open the Weather app, or the pin to turn on Windows Location for exact weather.';
    } else {
        widget.title = exact ? 'Weather for your location (Windows Location)' : 'Weather for your approximate location';
    }
}

if (MODE !== 'popup') {
    loadWeather();
    setInterval(loadWeather, 30 * 60 * 1000);
}

// In the editor: the weather widget opens the Windows Weather app; the pin opens Location settings
if (MODE === 'editor' && window.desktop) {
    const weatherWidget = document.getElementById('weather-container');
    weatherWidget.classList.add('interactive-btn');
    onSingleClick(weatherWidget, (e) => {
        if (e.target.closest('#weather-location-hint')) return;
        window.desktop.openWindows('weather');
    });
    document.getElementById('weather-location-hint').addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.desktop.openWindows('location');
        showToast('Turn on "Location services" and "Let desktop apps access your location", then the weather updates within a minute.');
        // Check again shortly, so switching it on takes effect without restarting
        setTimeout(loadWeather, 60000);
    });
}

// --- Editor toolbar (desktop app) ---
if (MODE === 'editor' && window.desktop) {
    document.getElementById('editor-done-btn').addEventListener('click', () => window.desktop.closeEditor());
    document.getElementById('editor-web-btn').addEventListener('click', () =>
        window.desktop.openWebSearch(wpInput.value.trim(), 'google'));
}

// --- Clicks on the desktop (wallpaper mode) ---
// The app passes on clicks that land on empty desktop, not on an icon or a window (see
// src/main/desktop-input.js), so the widgets work right on the wallpaper. Anything that needs
// typing opens just that panel over the desktop (popup mode below).
function desktopAction(x, y) {
    const el = document.elementFromPoint(x, y);
    const widget = el?.closest('.drag-widget');
    if (!widget) return null;
    const open = target => () => window.desktop.openPopup(target);

    const todo = el.closest('.todo-item');
    if (todo) return { el: todo, run: () => todo.querySelector('input[type="checkbox"]').click() };
    const day = el.closest('#calendar-grid span:not(:empty)');
    if (day) {
        const now = new Date();
        return { el: day, run: open({ day: localDay(new Date(now.getFullYear(), now.getMonth(), Number(day.textContent))) }) };
    }
    const tick = el.closest('.agenda-check');
    if (tick) return { el: tick, run: () => toggleDone(tick.dataset.doneKey) };
    const item = el.closest('.agenda-item');
    if (item) {
        const { eventId, calendarId, date } = item.dataset;
        return { el: item, run: open(eventId && calendarId ? { event: { id: eventId, calendarId, date } } : { day: date }) };
    }
    const alarm = el.closest('#alarm-widget');
    if (alarm) return { el: alarm, run: open('alarms') };
    const battery = el.closest('#battery-widget');
    if (battery) return { el: battery, run: () => window.desktop.openWindows('battery') };

    switch (widget.dataset.id) {
        case 'weather': return { el: widget, run: () => window.desktop.openWindows('weather') };
        case 'calendar':
        case 'agenda': return { el: widget, run: open('calendars') };
        case 'todo': return { el: widget, run: open('todo') };
        default: return null;  // time and date
    }
}

if (MODE === 'wallpaper' && window.desktop?.onDesktopClick) {
    let hovered = null;
    window.desktop.onDesktopHover((pt) => {
        const el = (pt && desktopAction(pt.x, pt.y)?.el) || null;
        if (el === hovered) return;
        hovered?.classList.remove('desktop-hover');
        el?.classList.add('desktop-hover');
        hovered = el;
    });

    // A double-click on a widget edits it (move, resize, hide) right on the desktop. So single
    // clicks wait a moment to see whether a second click follows.
    const DOUBLE_CLICK_MS = 400;
    let pending = null;
    window.desktop.onDesktopClick((pt) => {
        if (!pt) return;
        const widget = document.elementFromPoint(pt.x, pt.y)?.closest('.drag-widget[data-id]');
        if (!widget) return;
        if (pending && pending.widget === widget) {
            clearTimeout(pending.timer);
            pending = null;
            window.desktop.openPopup({ layout: widget.dataset.id });
            return;
        }
        if (pending) clearTimeout(pending.timer);
        const action = desktopAction(pt.x, pt.y);
        if (action) {
            action.el.classList.add('desktop-pressed');
            setTimeout(() => action.el.classList.remove('desktop-pressed'), 180);
        }
        pending = { widget, timer: setTimeout(() => { pending = null; action?.run(); }, DOUBLE_CLICK_MS) };
    });

    // While the widgets are being edited in the popup, it shows them; don't show them twice
    window.desktop.onLayoutEditing((editing) => {
        dashboard.style.visibility = editing ? 'hidden' : '';
        if (!editing) reloadLayout();
    });
}

// --- Popup: one panel over the desktop ---
// Opened by clicking a widget on the desktop. Closing the panel (Esc, x, clicking outside it)
// puts the popup away, and you're back on the desktop.
let popupOpening = false;

function closePopupIfDone() {
    if (MODE !== 'popup' || popupOpening) return;
    if (document.body.classList.contains('popup-todo') || document.body.classList.contains('popup-layout')) return;
    if ([...document.querySelectorAll(PANELS)].every(m => m.hidden)) window.desktop.closePopup();
}

if (MODE === 'popup' && window.desktop) {
    window.desktop.onPopup(async (target) => {
        popupOpening = true;
        eventReturnDay = null;
        closeAlarmForm();
        document.querySelectorAll(PANELS).forEach(m => { m.hidden = true; });
        // Reminders: the reminders box itself, right where it is on the desktop, ready to type in
        document.body.classList.toggle('popup-todo', target === 'todo');
        if (target === 'todo') todoInput.value = '';
        // Editing widgets: all of them where they are, with the double-clicked one ready to move
        document.body.classList.toggle('popup-layout', !!target?.layout);
        document.querySelectorAll('.drag-widget').forEach(w => w.classList.remove('edit-mode'));
        if (target?.layout) {
            reloadLayout();
            loadWeather();  // the popup doesn't keep the weather up to date otherwise
            document.querySelector(`.drag-widget[data-id="${CSS.escape(target.layout)}"]`)?.classList.add('edit-mode');
        } else {
            await showEditorTarget(target);
        }
        popupOpening = false;
        document.body.classList.remove('popup-enter');
        void document.body.offsetWidth;  // restart the ease-in
        document.body.classList.add('popup-enter');
        // Give it a moment to draw, so the last panel never flashes up (animation frames don't run while hidden)
        setTimeout(() => window.desktop.popupReady(), 40);
    });
    const closeTodo = () => {
        document.body.classList.remove('popup-todo');
        window.desktop.closePopup();
    };
    // Done editing widgets: save where everything is and go back to the desktop
    const finishLayout = () => {
        document.querySelectorAll('.drag-widget.edit-mode').forEach(w => { saveWidget(w); w.classList.remove('edit-mode'); });
        document.body.classList.remove('popup-layout');
        window.desktop.closePopup();
    };
    const inLayout = () => document.body.classList.contains('popup-layout');
    document.getElementById('layout-done-btn').addEventListener('click', finishLayout);
    document.getElementById('layout-reset-btn').addEventListener('click', () => {
        localStorage.removeItem(LAYOUT_KEY);
        reloadLayout();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (document.body.classList.contains('popup-todo')) closeTodo();
        else if (inLayout()) finishLayout();
    });
    document.addEventListener('mousedown', (e) => {
        if (document.body.classList.contains('popup-todo') && !e.target.closest('[data-id="todo"]')) closeTodo();
        // Clicking empty space while editing: finish, like clicking away on the desktop
        if (inLayout() && !e.target.closest('.drag-widget') && !e.target.closest('.layout-bar') && !e.target.closest('.format-menu')) finishLayout();
    });
}
