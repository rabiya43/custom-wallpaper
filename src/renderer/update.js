// The card that says an update is ready. Details arrive in the query string.
const params = new URLSearchParams(location.search);
const version = params.get('version') || '';
const notes = (params.get('notes') || '').split('\n').map(l => l.trim()).filter(Boolean);

document.getElementById('title').textContent = `Version ${version} is ready`;
document.getElementById('sub').textContent = 'Takes a few seconds. Your wallpaper, alarms and settings stay as they are.';

const list = document.getElementById('notes');
if (notes.length) {
    const ul = document.createElement('ul');
    for (const line of notes) {
        const li = document.createElement('li');
        li.textContent = line.replace(/^[-*•]\s*/, '');
        ul.appendChild(li);
    }
    list.append(ul);
} else {
    list.textContent = 'Improvements and fixes.';
}

const now = document.getElementById('now');
now.addEventListener('click', () => {
    now.disabled = true;
    now.textContent = 'Updating...';
    window.desktop.updateAction('install');
});
const later = () => window.desktop.updateAction('later');
document.getElementById('later').addEventListener('click', later);
document.getElementById('close').addEventListener('click', later);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') later(); });
