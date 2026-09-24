// The window that pops up when an alarm rings. Details arrive in the query string.
const params = new URLSearchParams(location.search);
const id = params.get('id');
const time = params.get('time') || '';
const [h, m] = time.split(':').map(Number);

document.getElementById('time').innerHTML =
    `${h % 12 || 12}:${String(m).padStart(2, '0')}<small>${h >= 12 ? 'PM' : 'AM'}</small>`;
document.getElementById('label').textContent = params.get('label') || 'Alarm';
document.getElementById('snooze').textContent = `Snooze ${params.get('snooze') || 5} min`;

const stop = window.AlarmSound.play(params.get('sound') || 'chime', { loop: true, fadeIn: true });

// Stop after 10 minutes of ringing, and snooze so the alarm isn't lost
const giveUp = setTimeout(() => finish('snooze'), 10 * 60 * 1000);

function finish(action) {
    clearTimeout(giveUp);
    stop();
    window.desktop.alarmAction(id, action);
}

document.getElementById('snooze').addEventListener('click', () => finish('snooze'));
document.getElementById('dismiss').addEventListener('click', () => finish('dismiss'));
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') finish('dismiss');
});
document.getElementById('dismiss').focus();
