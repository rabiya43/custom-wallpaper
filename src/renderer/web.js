// Toolbar for the "Search the web" window. The page itself is shown in a separate view below it.
const q = document.getElementById('q');
const engine = document.getElementById('engine');
const back = document.getElementById('back');
const toast = document.getElementById('toast');
let toastTimer = null;

document.getElementById('form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (q.value.trim()) window.desktop.openWebSearch(q.value.trim(), engine.value);
});
engine.addEventListener('change', () => {
    if (q.value.trim()) window.desktop.openWebSearch(q.value.trim(), engine.value);
});
back.addEventListener('click', () => window.desktop.webBack());

window.desktop.onWebState(({ query, engine: eng }) => {
    q.value = query || '';
    engine.value = eng || 'google';
    if (!query) q.focus();
});
window.desktop.onWebNav(({ canGoBack }) => { back.disabled = !canGoBack; });
window.desktop.onWebToast((msg) => {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
});
