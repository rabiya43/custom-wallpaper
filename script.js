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

    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

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

    // 3. Restore wallpaper from IndexedDB (or fallback to clean default Buttercup)
    const savedWp = await WallpaperDB.load();
    if (savedWp) {
        setWallpaperDisplay(savedWp);
    } else {
        // High-quality transparent character art for initial display
        setWallpaperDisplay('https://upload.wikimedia.org/wikipedia/en/d/db/Buttercup_%28Powerpuff_Girls%29.png');
    }
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

const alarmWidget = document.getElementById('alarm-widget');
const alarmTimeText = document.getElementById('alarm-time');
let savedAlarm = localStorage.getItem('buttercup-alarm') || 'Off';
alarmTimeText.innerText = savedAlarm;
alarmWidget.addEventListener('click', () => {
    let newTime = prompt("Set your alarm time (e.g. 07:30 AM), or type 'Off':", savedAlarm);
    if (newTime !== null) {
        newTime = newTime.trim() === '' ? 'Off' : newTime;
        localStorage.setItem('buttercup-alarm', newTime);
        savedAlarm = newTime;
        alarmTimeText.innerText = newTime;
    }
});

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
const addTodoBtn = document.getElementById('add-todo-btn');
let reminders = JSON.parse(localStorage.getItem('buttercup-reminders')) || [];

function saveAndRenderReminders() {
    localStorage.setItem('buttercup-reminders', JSON.stringify(reminders));
    
    // Sync to python backend in background if running
    fetch('http://localhost:5000/api/reminders/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reminders)
    }).catch(e => {});

    todoListContainer.innerHTML = '';
    reminders.forEach((r, i) => {
        const div = document.createElement('div'); div.className = 'todo-item' + (r.checked ? ' checked' : '');
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = r.checked;
        cb.onchange = () => { r.checked = !r.checked; saveAndRenderReminders(); };
        const txt = document.createElement('span'); txt.className = 'task-text'; txt.innerText = r.text;
        const del = document.createElement('button'); del.className = 'delete-btn'; del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        del.onclick = () => { reminders.splice(i, 1); saveAndRenderReminders(); };
        div.append(cb, txt, del); todoListContainer.appendChild(div);
    });
}
function addTodo() {
    const val = todoInput.value.trim();
    if (val) {
        reminders.push({text: val, checked: false});
        todoInput.value = '';
        saveAndRenderReminders();
    }
}
todoInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addTodo(); });
addTodoBtn.addEventListener('click', addTodo);
saveAndRenderReminders();

// Python Calendar Integration
async function syncCalendarAndReminders() {
    try {
        // Fetch calendar events
        const eventsResponse = await fetch('http://localhost:5000/api/calendar/events');
        const events = await eventsResponse.json();
        
        // Example: update calendar widget with events (basic alert dot logic could go here)
        // console.log("Calendar events:", events);

        // Fetch reminders
        const remindersResponse = await fetch('http://localhost:5000/api/reminders');
        const remoteReminders = await remindersResponse.json();
        if (remoteReminders && remoteReminders.length > 0 && JSON.stringify(reminders) !== JSON.stringify(remoteReminders)) {
            reminders = remoteReminders;
            localStorage.setItem('buttercup-reminders', JSON.stringify(reminders));
            saveAndRenderReminders();
        }
    } catch (error) {
        console.log('Python local sync server not detected. Running offline.');
    }
    // Sync every 5 minutes
    setTimeout(syncCalendarAndReminders, 300000);
}
syncCalendarAndReminders();

// --- Integrated Weather Logic with Condition Mapping ---
const weatherCodeMap = {
    0: { desc: 'Clear sky', emoji: '☀️', bg: 'linear-gradient(135deg, rgba(255,215,0,0.2), transparent)' },
    1: { desc: 'Mainly clear', emoji: '🌤️', bg: 'linear-gradient(135deg, rgba(255,215,0,0.1), transparent)' },
    2: { desc: 'Partly cloudy', emoji: '⛅', bg: 'linear-gradient(135deg, rgba(200,200,200,0.2), transparent)' },
    3: { desc: 'Overcast', emoji: '☁️', bg: 'linear-gradient(135deg, rgba(150,150,150,0.3), transparent)' },
    45: { desc: 'Foggy', emoji: '🌫️', bg: 'linear-gradient(135deg, rgba(200,200,200,0.4), transparent)' },
    48: { desc: 'Depositing rime fog', emoji: '🌫️', bg: 'linear-gradient(135deg, rgba(200,200,200,0.4), transparent)' },
    51: { desc: 'Light drizzle', emoji: '🌦️', bg: 'linear-gradient(135deg, rgba(100,150,255,0.2), transparent)' },
    53: { desc: 'Moderate drizzle', emoji: '🌧️', bg: 'linear-gradient(135deg, rgba(100,150,255,0.3), transparent)' },
    55: { desc: 'Dense drizzle', emoji: '🌧️', bg: 'linear-gradient(135deg, rgba(100,150,255,0.4), transparent)' },
    61: { desc: 'Slight rain', emoji: '🌦️', bg: 'linear-gradient(135deg, rgba(100,150,255,0.2), transparent)' },
    63: { desc: 'Moderate rain', emoji: '🌧️', bg: 'linear-gradient(135deg, rgba(100,150,255,0.3), transparent)' },
    65: { desc: 'Heavy rain', emoji: '🌧️', bg: 'linear-gradient(135deg, rgba(100,150,255,0.5), transparent)' },
    71: { desc: 'Slight snow', emoji: '🌨️', bg: 'linear-gradient(135deg, rgba(255,255,255,0.3), transparent)' },
    73: { desc: 'Moderate snow', emoji: '❄️', bg: 'linear-gradient(135deg, rgba(255,255,255,0.4), transparent)' },
    75: { desc: 'Heavy snow', emoji: '❄️', bg: 'linear-gradient(135deg, rgba(255,255,255,0.5), transparent)' },
    95: { desc: 'Thunderstorm', emoji: '⛈️', bg: 'linear-gradient(135deg, rgba(100,50,150,0.4), transparent)' },
};

async function fetchWeather(lat, lon) {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relativehumidity_2m`);
        const data = await res.json();
        
        document.getElementById('weather-temp').innerHTML = `${Math.round(data.current_weather.temperature)}&deg;`;
        document.getElementById('humidity-level').innerText = `${data.hourly.relativehumidity_2m[0]}%`;
        
        // Map Condition
        const code = data.current_weather.weathercode;
        const condition = weatherCodeMap[code] || { desc: 'Unknown', emoji: '🌡️', bg: 'transparent' };
        document.getElementById('weather-desc').innerText = condition.desc;
        document.getElementById('weather-emoji').innerText = condition.emoji;
        
        // Apply subtle weather gradient to widget
        document.getElementById('weather-container').style.background = `var(--widget-bg), ${condition.bg}`;
        
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
        const geoData = await geoRes.json();
        document.getElementById('weather-loc').innerText = geoData.address.city || geoData.address.town || 'Your Location';
    } catch(e) {
        document.getElementById('weather-desc').innerText = "Unavailable";
    }
}
if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p => fetchWeather(p.coords.latitude, p.coords.longitude));
