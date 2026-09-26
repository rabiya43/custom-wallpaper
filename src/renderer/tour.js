// A short guided tour of the dashboard, shown the first time someone customizes it.
// Each step highlights one part of the screen and explains it in a card with Back / Next / Skip.
// "Take the tour" (the ? in the Customize panel) plays it again.
(() => {
    if (MODE !== 'editor') return;
    const TOUR_KEY = 'dashboard-tour-done';

    const STEPS = [
        {
            title: 'Welcome to your new desktop',
            text: 'Your wallpaper is now a live dashboard: the time, weather, your calendar, alarms and reminders. This quick tour shows you around. It takes about a minute.',
        },
        {
            target: '#wp-search-form',
            title: 'Find a wallpaper',
            text: 'Type a character, movie or place (like "Studio Ghibli") and press Find. Pick a picture you like. Pictures marked "May look blurry" are small for your screen.',
        },
        {
            target: '#editor-web-btn',
            title: 'Search the whole web',
            text: 'Opens Google, Bing or DuckDuckGo Images. Click a picture to open it big, then right-click it and choose "Set as wallpaper".',
        },
        {
            target: '#builtin-grid',
            title: 'Ready-made wallpapers',
            text: 'Click one of these, or Upload a picture from your computer. Below, choose Fill screen or Centered. The widget colors change to match your picture.',
        },
        {
            target: '#alarm-widget',
            title: 'Alarms',
            text: 'Click the bell to set an alarm. You can type it the way you\'d say it: "tomorrow 7am" or "every weekday 8:30", and pick a sound, even your own song.',
        },
        {
            target: '#weather-container',
            title: 'Weather and battery',
            text: 'Click the weather to open the Windows Weather app, and the battery for your power settings. For weather at your exact spot, turn on Location in Windows settings.',
        },
        {
            target: '[data-id="calendar"]',
            title: 'Your calendar',
            text: 'Click any date to see that day\'s events and add a new one.',
        },
        {
            target: '[data-id="agenda"]',
            title: 'Upcoming',
            text: 'Sign in with Google (the Calendars button) and your next events show here. With a personal account you\'ll see your own events and reminders. With a school account you\'ll also see your class assignments. Tick the circle when you\'ve done one.',
        },
        {
            target: '[data-id="todo"]',
            title: 'Reminders',
            text: 'Type a reminder and press Enter. Click one to tick it off.',
        },
        {
            target: '[data-id="time"]',
            title: 'Make it yours',
            text: 'Double-click any widget to move it, resize it from the corner, or hide it. On the date and time you\'ll also find a Format button for 24-hour time, seconds and fonts.',
        },
        {
            target: '#editor-done-btn',
            title: 'Then just use your desktop',
            text: 'Press Done to go back to your desktop. The widgets keep working there: click them to use them, double-click to move them. Everything else is under the app\'s icon near the clock on the taskbar.',
        },
    ];

    let index = 0;
    let root = null;

    function visible(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    }

    function start() {
        end(false);
        document.querySelectorAll('.wp-modal').forEach(m => { m.hidden = true; });
        document.querySelectorAll('.drag-widget.edit-mode').forEach(w => w.classList.remove('edit-mode'));
        index = 0;
        root = document.createElement('div');
        root.className = 'tour';
        root.innerHTML = `
            <div class="tour-spot"></div>
            <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title">
                <button type="button" class="tour-close" aria-label="Close the tour"><i class="fa-solid fa-xmark"></i></button>
                <div class="tour-step"></div>
                <h3 id="tour-title"></h3>
                <p class="tour-text"></p>
                <div class="tour-actions">
                    <button type="button" class="tour-skip">Skip tour</button>
                    <span class="tour-dots"></span>
                    <button type="button" class="tour-back">Back</button>
                    <button type="button" class="tour-next">Next</button>
                </div>
            </div>`;
        document.body.appendChild(root);
        root.querySelector('.tour-close').addEventListener('click', () => end(true));
        root.querySelector('.tour-skip').addEventListener('click', () => end(true));
        root.querySelector('.tour-back').addEventListener('click', () => go(-1));
        root.querySelector('.tour-next').addEventListener('click', () => go(1));
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', show);
        show();
    }

    function end(remember) {
        if (!root) return;
        root.remove();
        root = null;
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('resize', show);
        if (remember) {
            try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) { /* private storage */ }
        }
    }

    function go(step) {
        let next = index + step;
        // Skip steps whose part is hidden (e.g. a widget someone closed)
        while (next > 0 && next < STEPS.length && STEPS[next].target && !visible(document.querySelector(STEPS[next].target))) next += step;
        if (next >= STEPS.length) return end(true);
        index = Math.max(0, next);
        show();
    }

    function onKey(e) {
        if (!root) return;
        if (e.key === 'Escape') { e.stopPropagation(); end(true); }
        else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); go(1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    }

    function show() {
        if (!root) return;
        const step = STEPS[index];
        const target = step.target && document.querySelector(step.target);
        const spot = root.querySelector('.tour-spot');
        const card = root.querySelector('.tour-card');

        root.querySelector('.tour-step').textContent = `${index + 1} of ${STEPS.length}`;
        root.querySelector('#tour-title').textContent = step.title;
        root.querySelector('.tour-text').textContent = step.text;
        root.querySelector('.tour-back').hidden = index === 0;
        root.querySelector('.tour-next').textContent = index === STEPS.length - 1 ? 'Finish' : (index === 0 ? 'Show me around' : 'Next');
        root.querySelector('.tour-dots').innerHTML = STEPS.map((_, i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('');

        const pad = 8;
        if (target && visible(target)) {
            const r = target.getBoundingClientRect();
            const radius = parseFloat(getComputedStyle(target).borderRadius) || 12;
            Object.assign(spot.style, {
                left: `${r.left - pad}px`, top: `${r.top - pad}px`,
                width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
                borderRadius: `${radius + pad}px`, opacity: '1',
            });
            root.classList.remove('tour-center');
            placeCard(card, { left: r.left - pad, top: r.top - pad, right: r.right + pad, bottom: r.bottom + pad });
        } else {
            // No part to point at: a centered card over a dimmed screen
            Object.assign(spot.style, { left: '50%', top: '50%', width: '0px', height: '0px', opacity: '1' });
            root.classList.add('tour-center');
            card.style.left = `${(innerWidth - card.offsetWidth) / 2}px`;
            card.style.top = `${(innerHeight - card.offsetHeight) / 2}px`;
        }
        root.querySelector('.tour-next').focus();
    }

    /** Puts the card beside the highlighted part: below, above, right or left, whichever fits. */
    function placeCard(card, r) {
        const gap = 14, w = card.offsetWidth, h = card.offsetHeight, m = 12;
        const options = [
            { left: (r.left + r.right) / 2 - w / 2, top: r.bottom + gap, fits: r.bottom + gap + h < innerHeight - m },
            { left: (r.left + r.right) / 2 - w / 2, top: r.top - gap - h, fits: r.top - gap - h > m },
            { left: r.right + gap, top: (r.top + r.bottom) / 2 - h / 2, fits: r.right + gap + w < innerWidth - m },
            { left: r.left - gap - w, top: (r.top + r.bottom) / 2 - h / 2, fits: r.left - gap - w > m },
        ];
        const pick = options.find(o => o.fits) || options[0];
        card.style.left = `${Math.min(Math.max(m, pick.left), innerWidth - w - m)}px`;
        card.style.top = `${Math.min(Math.max(m, pick.top), innerHeight - h - m)}px`;
    }

    document.getElementById('tour-btn')?.addEventListener('click', start);

    // First time customizing: start once the dashboard has settled
    let seen = false;
    try { seen = !!localStorage.getItem(TOUR_KEY); } catch (e) { seen = true; }
    if (!seen && !pageParams.has('notour')) setTimeout(start, 1200);

    window.dashboardTour = { start, end };
})();
