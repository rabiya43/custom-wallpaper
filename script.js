// --- Draggable & Resizable Independent Widgets ---
function makeDraggable(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    elmnt.onmousedown = function(e) {
        // Prevent dragging if interacting with inputs, buttons, tasks, or the close (X) button
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('.todo-item') || e.target.closest('#alarm-widget') || e.target.closest('.close-btn')) {
            return;
        }
        
        // CRITICAL FIX: Prevent dragging when user clicks the bottom-right corner to RESIZE the widget.
        const rect = elmnt.getBoundingClientRect();
        const isResizeHandle = (e.clientX > rect.right - 25 && e.clientY > rect.bottom - 25);
        if (isResizeHandle) return;

        dragMouseDown(e);
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
    function closeDragElement() { document.onmouseup = null; document.onmousemove = null; }
}

// Apply drag logic to all individual widgets
document.querySelectorAll('.drag-widget').forEach(makeDraggable);


// --- 100% RELIABLE NO-KEY CHARACTER THEMING (Wikipedia Method) ---

async function generateAITheme() {
    const input = document.getElementById('theme-input').value.trim();
    if (!input) return;

    const btn = document.querySelector('.theme-switcher button');
    const originalText = btn.innerText;
    btn.innerText = "Analyzing...";
    document.getElementById('character-name-display').textContent = "Loading...";

    try {
        let wikiText = input;
        try {
            const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(input)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.extract) wikiText += data.extract;
            }
        } catch(e) {}

        let hash = 0;
        for (let i = 0; i < wikiText.length; i++) {
            hash = wikiText.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const h = Math.abs(hash) % 360;

        const theme = {
            bg: `hsl(${h}, 35%, 45%)`,
            widgetBg: `hsla(${h}, 50%, 20%, 0.5)`,
            accent: `hsl(${(h + 30) % 360}, 80%, 75%)`,
            glow: `hsl(${(h + 15) % 360}, 90%, 70%)`,
            text: `#F9FDF0`
        };

        const fonts = ['Chewy', 'Bangers', 'Pacifico', 'Righteous', 'Titan One', 'Lobster', 'Carter One', 'Alfa Slab One', 'Sigmar One'];
        const fontName = fonts[Math.abs(hash) % fonts.length];
        theme.font = fontName;

        document.getElementById('dynamic-font').href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}&display=swap`;

        const root = document.documentElement;
        root.style.setProperty('--bg-color', theme.bg);
        root.style.setProperty('--widget-bg', theme.widgetBg);
        root.style.setProperty('--accent-color', theme.accent);
        root.style.setProperty('--glow-color', theme.glow);
        root.style.setProperty('--primary-text', theme.text);
        root.style.setProperty('--char-font', `'${fontName}', sans-serif`);

        const displayName = input.charAt(0).toUpperCase() + input.slice(1);
        document.getElementById('character-name-display').textContent = displayName;
        
        localStorage.setItem('dashboard-theme-data', JSON.stringify({name: displayName, theme: theme}));

    } catch (err) {
        document.getElementById('character-name-display').textContent = "Error";
    } finally {
        btn.innerText = originalText;
    }
}

const savedThemeData = localStorage.getItem('dashboard-theme-data');
if (savedThemeData) {
    try {
        const data = JSON.parse(savedThemeData);
        document.getElementById('theme-input').value = data.name;
        document.getElementById('character-name-display').textContent = data.name;
        const fontName = data.theme.font;
        document.getElementById('dynamic-font').href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}&display=swap`;
        const root = document.documentElement;
        root.style.setProperty('--bg-color', data.theme.bg);
        root.style.setProperty('--widget-bg', data.theme.widgetBg);
        root.style.setProperty('--accent-color', data.theme.accent);
        root.style.setProperty('--glow-color', data.theme.glow);
        root.style.setProperty('--primary-text', data.theme.text);
        root.style.setProperty('--char-font', `'${fontName}', sans-serif`);
    } catch(e) {}
}


// --- 12-Hour Format Time & Basic Functionality ---

function updateTimeAndDate() {
    const now = new Date();
    
    // 12 Hour Format (4 PM instead of 16)
    let hours = now.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 becomes 12
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

const todoInput = document.getElementById('todo-input');
const todoListContainer = document.getElementById('todo-list-container');
let reminders = JSON.parse(localStorage.getItem('buttercup-reminders')) || [];
function saveAndRenderReminders() {
    localStorage.setItem('buttercup-reminders', JSON.stringify(reminders));
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
todoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) { reminders.push({text: e.target.value, checked: false}); e.target.value = ''; saveAndRenderReminders(); }
});
saveAndRenderReminders();

async function fetchWeather(lat, lon) {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relativehumidity_2m`);
        const data = await res.json();
        document.getElementById('weather-temp').innerHTML = `${Math.round(data.current_weather.temperature)}&deg;`;
        document.getElementById('humidity-level').innerText = `${data.hourly.relativehumidity_2m[0]}%`;
        
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
        const geoData = await geoRes.json();
        document.getElementById('weather-loc').innerText = geoData.address.city || geoData.address.town || 'Your Location';
    } catch(e) {}
}
if(navigator.geolocation) navigator.geolocation.getCurrentPosition(p => fetchWeather(p.coords.latitude, p.coords.longitude));
