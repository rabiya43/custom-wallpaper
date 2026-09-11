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

// --- 100% CLIENT-SIDE CHARACTER THEMING (No Python Required for Images) ---

// Dual-gradient palettes keyed by character name fragments
const CHARACTER_PALETTES = {
    'buttercup': {bg1:'#2D5A46', bg2:'#509F8C', widgetBg:'rgba(0,0,0,0.25)', accent:'#A5C271', glow:'#E2F3B9', text:'#FFF'},
    'blossom':   {bg1:'#D87093', bg2:'#FF7F50', widgetBg:'rgba(216,112,147,0.65)', accent:'#FFB6C1', glow:'#FFE4E1', text:'#FFF'},
    'bubbles':   {bg1:'#4682B4', bg2:'#FFD700', widgetBg:'rgba(70,130,180,0.65)', accent:'#87CEEB', glow:'#E0FFFF', text:'#FFF'},
    'cherry':    {bg1:'#6B2035', bg2:'#A020F0', widgetBg:'rgba(107,32,53,0.65)', accent:'#D45D7F', glow:'#FF8DA1', text:'#FFF'},
    'pikachu':   {bg1:'#E6AF2E', bg2:'#D62828', widgetBg:'rgba(230,175,46,0.65)', accent:'#FFE169', glow:'#FFD166', text:'#FFF'},
    'cinderella':{bg1:'#7098DA', bg2:'#E5ECF4', widgetBg:'rgba(112,152,218,0.65)', accent:'#A3C4F3', glow:'#E0FFFF', text:'#FFF'},
    'barbie':    {bg1:'#E05697', bg2:'#9B4F96', widgetBg:'rgba(224,86,151,0.65)', accent:'#FF85A1', glow:'#FFC2D1', text:'#FFF'},
    'batman':    {bg1:'#1A1A24', bg2:'#4A4E69', widgetBg:'rgba(26,26,36,0.75)', accent:'#F4D03F', glow:'#F9E79F', text:'#FFF'},
    'snow white':{bg1:'#2B3A67', bg2:'#E6AF2E', widgetBg:'rgba(43,58,103,0.65)', accent:'#FFD166', glow:'#E03616', text:'#FFF'},
    'elsa':      {bg1:'#3B82C4', bg2:'#E0F0FF', widgetBg:'rgba(59,130,196,0.65)', accent:'#87CEFA', glow:'#F0F8FF', text:'#FFF'},
    'naruto':    {bg1:'#E97520', bg2:'#1A2A5E', widgetBg:'rgba(233,117,32,0.65)', accent:'#FFB347', glow:'#FFE0B2', text:'#FFF'},
};

function getColorPalette(userInput) {
    const lower = userInput.toLowerCase();
    for (const [key, palette] of Object.entries(CHARACTER_PALETTES)) {
        if (lower.includes(key)) return palette;
    }
    // Deterministic dual-gradient from name hash
    const h1 = [...userInput].reduce((a,c) => a + c.charCodeAt(0), 0) % 360;
    const h2 = (h1 + 45) % 360;
    return {
        bg1: `hsl(${h1}, 45%, 40%)`, bg2: `hsl(${h2}, 55%, 30%)`,
        widgetBg: `hsla(${h1}, 45%, 20%, 0.6)`,
        accent: `hsl(${(h1+25)%360}, 85%, 75%)`,
        glow: `hsl(${(h1+15)%360}, 90%, 80%)`,
        text: '#FFF'
    };
}

/**
 * Searches Wikipedia for the user's EXACT typed query and returns the
 * best-matching article's thumbnail image URL. Pure client-side, no proxy.
 * Wikipedia images (upload.wikimedia.org) are freely hotlinkable.
 */
async function fetchCharacterImage(userQuery) {
    try {
        // Step 1: Use Wikipedia Search API to find the best article for the user's keywords
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srsearch=${encodeURIComponent(userQuery)}&srlimit=5`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();
        const results = searchData?.query?.search || [];

        // Step 2: Try each search result until we find one with an image
        for (const result of results) {
            const title = result.title;
            const imgUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&titles=${encodeURIComponent(title)}&pithumbsize=600&redirects=1`;
            const imgRes = await fetch(imgUrl);
            const imgData = await imgRes.json();
            const pages = imgData?.query?.pages || {};
            for (const pid in pages) {
                if (pid !== '-1' && pages[pid].thumbnail?.source) {
                    return pages[pid].thumbnail.source;
                }
            }
        }
    } catch (e) {
        console.warn('Wikipedia image fetch failed:', e);
    }
    return null;
}

function applyThemeColors(theme) {
    const root = document.documentElement;
    const bg1 = theme.bg1 || theme.bg || '#509F8C';
    const bg2 = theme.bg2 || theme.bg || '#2D5A46';
    root.style.setProperty('--bg-color-1', bg1);
    root.style.setProperty('--bg-color-2', bg2);
    root.style.setProperty('--widget-bg', theme.widgetBg || 'rgba(0,0,0,0.2)');
    root.style.setProperty('--accent-color', theme.accent || '#A5C271');
    root.style.setProperty('--glow-color', theme.glow || '#E2F3B9');
    root.style.setProperty('--primary-text', theme.text || '#FFF');
    document.body.style.background = `linear-gradient(135deg, ${bg1}, ${bg2})`;
}

function applyArchImage(imageUrl, displayName) {
    const archImg = document.getElementById('character-arch-img');
    const archFallback = document.getElementById('character-arch-fallback');
    const archName = document.getElementById('character-arch-name');
    if (archName) archName.textContent = displayName;

    if (imageUrl && archImg) {
        archImg.src = imageUrl;
        archImg.style.display = 'block';
        if (archFallback) archFallback.style.display = 'none';
    } else {
        if (archImg) archImg.style.display = 'none';
        if (archFallback) archFallback.style.display = 'flex';
    }
}

async function generateAITheme() {
    const input = document.getElementById('theme-input').value.trim();
    if (!input) return;

    const btn = document.querySelector('.theme-switcher button');
    btn.innerText = "Fetching...";

    // 1. Apply colors immediately (instant, no network)
    const palette = getColorPalette(input);
    applyThemeColors(palette);

    // 2. Fetch image from Wikipedia using user's exact keywords (async)
    const displayName = input;
    const imageUrl = await fetchCharacterImage(input);
    applyArchImage(imageUrl, displayName);

    // 3. Save to localStorage
    localStorage.setItem('dashboard-theme-data', JSON.stringify({
        name: displayName, theme: palette, image: imageUrl
    }));

    btn.innerText = "APPLY THEME";
}

// Restore saved theme on page load
const savedThemeData = localStorage.getItem('dashboard-theme-data');
if (savedThemeData) {
    try {
        const data = JSON.parse(savedThemeData);
        document.getElementById('theme-input').value = data.name;
        applyThemeColors(data.theme);
        applyArchImage(data.image, data.name);
    } catch(e) {}
}


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
