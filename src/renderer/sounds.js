// Alarm sounds: built-in tones (generated, no audio files) and the user's own sound files.
// AlarmSound.play(sound, { loop, fadeIn }) starts playing and returns a stop() function.
window.AlarmSound = (() => {
    // Each tone is one cycle of notes: [frequency, start offset (s), length (s), wave]
    const TONES = {
        chime:   { cycle: 2.2, notes: [[880, 0, 0.5, 'sine'], [1108.7, 0.25, 0.5, 'sine'], [1318.5, 0.5, 0.9, 'sine']] },
        beep:    { cycle: 1.2, notes: [0, 0.18, 0.36, 0.54].map(t => [1000, t, 0.1, 'square']) },
        digital: { cycle: 1.0, notes: [0, 0.12, 0.24, 0.36].map(t => [2000, t, 0.07, 'square']) },
        gentle:  { cycle: 3.2, notes: [[523.3, 0, 1.4, 'sine'], [659.3, 0.35, 1.4, 'sine'], [784, 0.7, 1.4, 'sine'], [1046.5, 1.05, 1.8, 'sine']] },
    };
    const LABELS = { chime: 'Chime', beep: 'Beep', digital: 'Digital clock', gentle: 'Gentle' };
    const FADE_SECONDS = 20;

    function playTone(name, { loop, fadeIn }) {
        const tone = TONES[name] || TONES.chime;
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const master = ctx.createGain();
        master.connect(ctx.destination);
        master.gain.setValueAtTime(fadeIn ? 0.15 : 0.9, ctx.currentTime);
        if (fadeIn) master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + FADE_SECONDS);

        const scheduleCycle = at => {
            for (const [freq, offset, len, wave] of tone.notes) {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = wave;
                osc.frequency.value = freq;
                const t = at + offset;
                const peak = wave === 'square' ? 0.12 : 0.35;
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
                g.gain.exponentialRampToValueAtTime(0.0001, t + len);
                osc.connect(g).connect(master);
                osc.start(t);
                osc.stop(t + len + 0.05);
            }
        };

        let next = ctx.currentTime + 0.05;
        scheduleCycle(next);
        next += tone.cycle;
        const timer = loop ? setInterval(() => {
            while (next < ctx.currentTime + 1) { scheduleCycle(next); next += tone.cycle; }
        }, 250) : null;

        return () => { clearInterval(timer); ctx.close(); };
    }

    function playFile(name, { loop, fadeIn }) {
        const audio = new Audio(`/api/alarm-sound?name=${encodeURIComponent(name)}`);
        audio.loop = loop;
        audio.volume = fadeIn ? 0.15 : 1;
        let fade = null;
        if (fadeIn) {
            const started = Date.now();
            fade = setInterval(() => {
                const p = Math.min(1, (Date.now() - started) / (FADE_SECONDS * 1000));
                audio.volume = 0.15 + 0.85 * p;
                if (p >= 1) clearInterval(fade);
            }, 250);
        }
        const failed = new Promise(resolve => audio.addEventListener('error', () => resolve(true), { once: true }));
        audio.play().catch(() => {});
        const stop = () => { clearInterval(fade); audio.pause(); audio.src = ''; };
        stop.failed = failed;
        return stop;
    }

    /** sound: 'chime' | 'beep' | 'digital' | 'gentle' | 'file:<name>' */
    function play(sound, { loop = true, fadeIn = false } = {}) {
        if (typeof sound === 'string' && sound.startsWith('file:')) {
            const stop = playFile(sound.slice(5), { loop, fadeIn });
            // A missing or unreadable file falls back to the chime, so the alarm is never silent
            let fallback = null;
            stop.failed.then(() => { fallback = playTone('chime', { loop, fadeIn }); });
            return () => { stop(); if (fallback) fallback(); };
        }
        return playTone(sound, { loop, fadeIn });
    }

    return { play, TONES: Object.keys(TONES), LABELS };
})();
