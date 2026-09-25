// Page motion: sections rise in on scroll, the desktop tilts in 3D and flattens as you scroll,
// the floating widgets follow the mouse, and cards tilt toward it. All off with reduced motion.
(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = window.matchMedia('(pointer: fine)').matches;

    // Rise in on scroll
    const reveals = document.querySelectorAll('.reveal');
    if (still || !('IntersectionObserver' in window)) {
        reveals.forEach(el => el.classList.add('shown'));
    } else {
        const io = new IntersectionObserver(entries => {
            for (const e of entries) {
                if (e.isIntersecting) { e.target.classList.add('shown'); io.unobserve(e.target); }
            }
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
        reveals.forEach(el => io.observe(el));
    }
    if (still) return;

    // The desktop: tilted back at first, flat once it's in the middle of the screen
    const stage = document.getElementById('stage');
    const screen = document.getElementById('screen');
    const floats = [...document.querySelectorAll('.float')];
    let mouseX = 0, mouseY = 0, ticking = false;

    function update() {
        ticking = false;
        if (!stage) return;
        const r = stage.getBoundingClientRect();
        const progress = Math.min(1, Math.max(0, 1 - (r.top + r.height * 0.35) / window.innerHeight));
        const tiltX = 14 * (1 - progress) - mouseY * 3;
        screen.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
        screen.style.setProperty('--tilt-y', `${(mouseX * 4).toFixed(2)}deg`);
        screen.style.setProperty('--screen-scale', (0.92 + 0.08 * progress).toFixed(3));
        floats.forEach((f, i) => {
            const depth = [26, 18, 22, 30][i % 4];
            f.style.setProperty('--px', `${(mouseX * depth).toFixed(1)}px`);
            f.style.setProperty('--py', `${(mouseY * depth - (1 - progress) * depth).toFixed(1)}px`);
        });
    }
    const schedule = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    if (finePointer) {
        window.addEventListener('mousemove', (e) => {
            mouseX = e.clientX / window.innerWidth - 0.5;
            mouseY = e.clientY / window.innerHeight - 0.5;
            schedule();
        }, { passive: true });
    }
    update();

    // Cards lean toward the mouse, with a spotlight under it
    if (finePointer) {
        document.querySelectorAll('.card').forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const r = card.getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
                card.style.setProperty('--mx', `${x * 100}%`);
                card.style.setProperty('--my', `${y * 100}%`);
                card.style.setProperty('--ry', `${((x - 0.5) * 8).toFixed(2)}deg`);
                card.style.setProperty('--rx', `${((0.5 - y) * 8).toFixed(2)}deg`);
            });
            card.addEventListener('mouseleave', () => {
                card.style.setProperty('--rx', '0deg');
                card.style.setProperty('--ry', '0deg');
            });
        });
    }
})();
