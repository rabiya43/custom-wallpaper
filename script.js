// --- Time and Date Logic ---
function updateTimeAndDate() {
    const now = new Date();
    
    // Update Time
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    document.getElementById('time-display').innerText = `${hours}:${minutes}`;
    
    // Update Date (Format like Mon, December 1)
    const options = { weekday: 'short', month: 'long', day: 'numeric' };
    const dateStr = now.toLocaleDateString('en-US', options);
    document.getElementById('date-display').innerText = dateStr;
    
    // Schedule next update at the start of the next minute
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(updateTimeAndDate, msUntilNextMinute);
}
updateTimeAndDate();

// --- Alarm Setup ---
const alarmWidget = document.getElementById('alarm-widget');
const alarmTimeText = document.getElementById('alarm-time');
let savedAlarm = localStorage.getItem('buttercup-alarm') || 'Off';
alarmTimeText.innerText = savedAlarm;

alarmWidget.addEventListener('click', () => {
    let newTime = prompt("Set your alarm time (e.g. 07:30 AM), or type 'Off' to disable:", savedAlarm);
    if (newTime !== null) {
        newTime = newTime.trim() === '' ? 'Off' : newTime;
        localStorage.setItem('buttercup-alarm', newTime);
        savedAlarm = newTime;
        alarmTimeText.innerText = newTime;
    }
});


// --- Calendar Logic ---
function renderCalendar() {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const today = now.getDate();
    
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    document.getElementById('calendar-month').innerText = monthNames[month];
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Adjust so Monday is 0 (JS standard is Sunday=0)
    let startDayIndex = firstDay === 0 ? 6 : firstDay - 1;
    
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    
    // Empty slots before 1st day
    for (let i = 0; i < startDayIndex; i++) {
        const span = document.createElement('span');
        grid.appendChild(span);
    }
    
    // Days
    for (let i = 1; i <= daysInMonth; i++) {
        const span = document.createElement('span');
        span.innerText = i;
        if (i === today) {
            span.classList.add('active-day');
        }
        grid.appendChild(span);
    }
}
renderCalendar();

// --- Battery Logic ---
async function updateBattery() {
    try {
        if ('getBattery' in navigator) {
            const battery = await navigator.getBattery();
            
            const updateLevel = () => {
                const level = Math.round(battery.level * 100);
                document.getElementById('battery-level').innerText = `${level}%`;
                
                const icon = document.getElementById('battery-icon');
                icon.className = 'fa-solid';
                if (battery.charging) {
                    icon.classList.add('fa-battery-full');
                    icon.style.color = '#A5C271';
                } else {
                    icon.style.color = '#D4E5AA';
                    if (level > 75) icon.classList.add('fa-battery-full');
                    else if (level > 50) icon.classList.add('fa-battery-three-quarters');
                    else if (level > 25) icon.classList.add('fa-battery-half');
                    else icon.classList.add('fa-battery-quarter');
                }
            };
            
            updateLevel();
            battery.addEventListener('levelchange', updateLevel);
            battery.addEventListener('chargingchange', updateLevel);
        }
    } catch (e) {
        console.log("Battery API not supported");
    }
}
updateBattery();

// --- To-Do List (Reminders) Logic ---
const todoInput = document.getElementById('todo-input');
const todoListContainer = document.getElementById('todo-list-container');

// Load saved array of tasks
let reminders = JSON.parse(localStorage.getItem('buttercup-reminders')) || [];

function renderReminders() {
    todoListContainer.innerHTML = '';
    reminders.forEach((reminder, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'todo-item' + (reminder.checked ? ' checked' : '');
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = reminder.checked;
        checkbox.addEventListener('change', () => toggleReminder(index));
        
        const textSpan = document.createElement('span');
        textSpan.className = 'task-text';
        textSpan.innerText = reminder.text;
        textSpan.addEventListener('click', () => toggleReminder(index));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        deleteBtn.addEventListener('click', () => deleteReminder(index));

        itemDiv.appendChild(checkbox);
        itemDiv.appendChild(textSpan);
        itemDiv.appendChild(deleteBtn);
        todoListContainer.appendChild(itemDiv);
    });
}

function saveReminders() {
    localStorage.setItem('buttercup-reminders', JSON.stringify(reminders));
    renderReminders();
}

function addReminder(text) {
    if (text.trim() === '') return;
    reminders.push({ text: text, checked: false });
    saveReminders();
}

function toggleReminder(index) {
    reminders[index].checked = !reminders[index].checked;
    saveReminders();
}

function deleteReminder(index) {
    reminders.splice(index, 1);
    saveReminders();
}

// Listen for Enter key to add new reminder
todoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addReminder(e.target.value);
        e.target.value = ''; // clear input
    }
});

// Initial render
renderReminders();


// --- Real Weather Logic (Using Open-Meteo API - Free, No Key Required) ---
async function fetchWeather(lat, lon) {
    try {
        // Fetch weather code, temperature, and humidity
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relativehumidity_2m`);
        const data = await response.json();
        
        const temp = Math.round(data.current_weather.temperature);
        const code = data.current_weather.weathercode;
        const humidity = data.hourly.relativehumidity_2m[0]; // Estimate humidity from hourly
        
        document.getElementById('weather-temp').innerHTML = `${temp}&deg;`;
        document.getElementById('humidity-level').innerText = `${humidity}%`;
        
        // Reverse geocode to get city name (Using free nominatim API)
        const geoResponse = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
        const geoData = await geoResponse.json();
        const city = geoData.address.city || geoData.address.town || geoData.address.village || 'Your Location';
        document.getElementById('weather-loc').innerText = city;

        // Interpret Weather Code (WMO Weather interpretation codes)
        let desc = "Clear sky";
        let iconClass = "fa-sun";
        
        if (code === 1 || code === 2 || code === 3) { desc = "Partly cloudy"; iconClass = "fa-cloud-sun"; }
        else if (code >= 45 && code <= 48) { desc = "Foggy"; iconClass = "fa-smog"; }
        else if (code >= 51 && code <= 57) { desc = "Drizzle"; iconClass = "fa-cloud-rain"; }
        else if (code >= 61 && code <= 67) { desc = "Rain"; iconClass = "fa-cloud-showers-heavy"; }
        else if (code >= 71 && code <= 77) { desc = "Snow"; iconClass = "fa-snowflake"; }
        else if (code >= 80 && code <= 82) { desc = "Rain showers"; iconClass = "fa-cloud-rain"; }
        else if (code >= 95 && code <= 99) { desc = "Thunderstorm"; iconClass = "fa-cloud-bolt"; }
        
        document.getElementById('weather-desc').innerText = desc;
        document.getElementById('weather-icon-display').className = `fa-solid ${iconClass}`;
        
    } catch (err) {
        console.log("Error fetching weather:", err);
        document.getElementById('weather-desc').innerText = "Weather unavailable";
    }
}

function setupWeather() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                fetchWeather(pos.coords.latitude, pos.coords.longitude);
            },
            (err) => {
                console.log("Geolocation error:", err);
                document.getElementById('weather-desc').innerText = "Location denied";
                document.getElementById('weather-loc').innerText = "Unknown";
            }
        );
    } else {
        document.getElementById('weather-desc').innerText = "Geo not supported";
    }
}
// Fetch weather initially, then every 30 minutes
setupWeather();
setInterval(setupWeather, 30 * 60 * 1000);
