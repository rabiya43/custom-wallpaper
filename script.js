// Optional local Python server (calendar events + reminder mirroring)
const SYNC_SERVER = 'http://localhost:5000';

// --- Draggable, Resizable, & Edit Mode ---
document.addEventListener('dblclick', (e) => {
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
        
        const rect = elmnt.getBoundingClientRect();
        elmnt.style.transition = 'top 0.3s ease, left 0.3s ease';

        if (rect.left < snapDistance) {
            elmnt.style.left = edgePadding + 'px';
        } else if (window.innerWidth - rect.right < snapDistance) {
            elmnt.style.left = (window.innerWidth - rect.width - edgePadding) + 'px';
        }

        if (rect.top < snapDistance) {
            elmnt.style.top = edgePadding + 'px';
        } else if (window.innerHeight - rect.bottom < snapDistance) {
            elmnt.style.top = (window.innerHeight - rect.height - edgePadding) + 'px';
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
        // Keep widgets reachable if the window is smaller than when the layout was saved
        const rect = widget.getBoundingClientRect();
        if (rect.right > window.innerWidth) widget.style.left = Math.max(0, window.innerWidth - rect.width - 20) + 'px';
        if (rect.bottom > window.innerHeight) widget.style.top = Math.max(0, window.innerHeight - rect.height - 20) + 'px';
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

function getColorPalette(userInput) {
    const lower = userInput.toLowerCase().trim();
    for (const [key, palette] of Object.entries(CHARACTER_PALETTES)) {
        if (lower.includes(key)) return { name: key, palette };
    }
    // Deterministic hash gradient for unknown inputs
    const h1 = [...userInput].reduce((a,c) => a + c.charCodeAt(0), 0) % 360;
    const h2 = (h1 + 45) % 360;
    return {
        name: userInput,
        palette: {
            bg1: `hsl(${h1}, 45%, 35%)`, bg2: `hsl(${h2}, 55%, 25%)`,
            widgetBg: `hsla(${h1}, 45%, 15%, 0.45)`,
            accent: `hsl(${(h1+25)%360}, 85%, 75%)`,
            glow: `hsl(${(h1+15)%360}, 90%, 80%)`,
            text: '#FFF'
        }
    };
}

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
        alert('Please select an image file (PNG, JPG, WebP, GIF).');
        return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
        const dataUrl = e.target.result;
        setWallpaperDisplay(dataUrl);
        await WallpaperDB.save(dataUrl);
    };
    reader.readAsDataURL(file);
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
        if (fitLabel) fitLabel.textContent = 'Center';
    } else {
        wpContainer.classList.remove('mode-cover');
        wpContainer.classList.add('mode-center');
        if (fitLabel) fitLabel.textContent = 'Cover';
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

// 7. Character Name Prompt Search
const themeInput = document.getElementById('theme-input');
const applyNameBtn = document.getElementById('apply-theme-name-btn');

function handleNameSearch() {
    const val = themeInput ? themeInput.value.trim() : '';
    if (!val) return;
    const { name, palette } = getColorPalette(val);
    applyPalette(palette, name);
}

if (applyNameBtn) applyNameBtn.addEventListener('click', handleNameSearch);
if (themeInput) {
    themeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleNameSearch();
    });
}

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

// --- Alarm: stored as 24h "HH:MM", rings once when the time is reached ---
const alarmWidget = document.getElementById('alarm-widget');
const alarmTimeText = document.getElementById('alarm-time');
const alarmInput = document.getElementById('alarm-input');
let savedAlarm = localStorage.getItem('dashboard-alarm') || '';
let lastRungMinute = '';

function formatAlarm(value) {
    if (!value) return 'Off';
    const [h, m] = value.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function setAlarm(value) {
    savedAlarm = value;
    if (value) localStorage.setItem('dashboard-alarm', value);
    else localStorage.removeItem('dashboard-alarm');
    alarmTimeText.innerText = formatAlarm(value);
    alarmWidget.classList.toggle('alarm-on', !!value);
    if (value && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}

function ringAlarm() {
    alarmWidget.classList.add('alarm-ringing');
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [0, 0.35, 0.7].forEach(delay => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.2, ctx.currentTime + delay);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.3);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + delay);
            osc.stop(ctx.currentTime + delay + 0.3);
        });
    } catch (e) { /* audio blocked until the page gets a click */ }
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Alarm', { body: formatAlarm(savedAlarm) });
    }
    setTimeout(() => alarmWidget.classList.remove('alarm-ringing'), 15000);
}

function checkAlarm() {
    if (!savedAlarm) return;
    const now = new Date();
    const current = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (current === savedAlarm && lastRungMinute !== current) {
        lastRungMinute = current;
        ringAlarm();
    }
}

alarmWidget.addEventListener('click', () => {
    alarmWidget.classList.remove('alarm-ringing');
    alarmInput.value = savedAlarm || '07:00';
    if (alarmInput.showPicker) alarmInput.showPicker(); else alarmInput.click();
});
alarmWidget.addEventListener('contextmenu', (e) => { e.preventDefault(); setAlarm(''); });
alarmInput.addEventListener('change', () => setAlarm(alarmInput.value));
setAlarm(savedAlarm);
setInterval(checkAlarm, 5000);

function renderCalendar() {
    const now = new Date();
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
}
renderCalendar();

// Mark days that have events when the optional Python server is running
async function markCalendarEvents() {
    try {
        const res = await fetch(`${SYNC_SERVER}/api/calendar/events`);
        const events = await res.json();
        const now = new Date();
        const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-`;
        const days = document.querySelectorAll('#calendar-grid span:not(:empty)');
        events.forEach(ev => {
            if (!ev.start.startsWith(prefix)) return;
            const day = parseInt(ev.start.slice(8, 10), 10);
            const cell = days[day - 1];
            if (!cell) return;
            cell.classList.add('has-event');
            cell.title = cell.title ? `${cell.title}\n${ev.title}` : ev.title;
        });
    } catch (e) {
        // Server not running; the calendar just shows dates
    }
}
markCalendarEvents();

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

// --- Todo List Logic & Python Backend Sync ---
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

// Local storage is the source of truth; the optional Python server just mirrors it
function saveReminders() {
    localStorage.setItem('dashboard-reminders', JSON.stringify(reminders));
    fetch(`${SYNC_SERVER}/api/reminders/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reminders)
    }).catch(() => {});
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

// Optional Python server: only used to restore reminders when this browser has none
async function pullRemindersIfEmpty() {
    if (reminders.length > 0) return;
    try {
        const res = await fetch(`${SYNC_SERVER}/api/reminders`);
        const remote = await res.json();
        if (Array.isArray(remote) && remote.length > 0) {
            reminders = remote;
            saveReminders();
        }
    } catch (e) {
        // Server not running; the dashboard works fine without it
    }
}
pullRemindersIfEmpty();


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

function loadWeather() {
    const useDefault = () => fetchWeather(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lon, DEFAULT_LOCATION.name);
    if (!navigator.geolocation) return useDefault();
    navigator.geolocation.getCurrentPosition(
        p => fetchWeather(p.coords.latitude, p.coords.longitude),
        useDefault,
        { timeout: 8000 }
    );
}
loadWeather();
setInterval(loadWeather, 30 * 60 * 1000);