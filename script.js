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

// --- 100% RELIABLE NO-KEY CHARACTER THEMING (Wikipedia Method) ---

function applyThemeData(displayName, theme, imageUrl) {
    const fontName = theme.font || 'Chewy';
    document.getElementById('dynamic-font').href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}&display=swap`;

    const root = document.documentElement;
    root.style.setProperty('--bg-color', theme.bg);
    root.style.setProperty('--widget-bg', theme.widgetBg);
    root.style.setProperty('--accent-color', theme.accent);
    root.style.setProperty('--glow-color', theme.glow);
    root.style.setProperty('--primary-text', theme.text);
    root.style.setProperty('--char-font', `'${fontName}', sans-serif`);

    document.body.style.background = theme.bg;

    // Update Inverted-U Arch Frame
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
    const originalText = btn.innerText;
    btn.innerText = "Fetching...";

    try {
        const res = await fetch(`http://localhost:5000/api/theme?name=${encodeURIComponent(input)}`);
        if (res.ok) {
            const data = await res.json();
            const displayName = input.charAt(0).toUpperCase() + input.slice(1);
            applyThemeData(displayName, data.colors, data.image);
            localStorage.setItem('dashboard-theme-data', JSON.stringify({name: displayName, theme: data.colors, image: data.image}));
        }
    } catch (err) {
        console.error("Local API offline:", err);
    } finally {
        btn.innerText = originalText;
    }
}

const savedThemeData = localStorage.getItem('dashboard-theme-data');
if (savedThemeData) {
    try {
        const data = JSON.parse(savedThemeData);
        document.getElementById('theme-input').value = data.name;
        applyThemeData(data.name, data.theme, data.image);
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
