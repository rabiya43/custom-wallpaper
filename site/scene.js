// The 3D background: glassy shapes floating in the app's greens, with drifting particles.
// The camera follows the mouse a little and the shapes drift as you scroll. With reduced motion
// it draws one still frame; without WebGL the CSS glow behind it stays.
import * as THREE from 'three';

const canvas = document.getElementById('scene');
const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = window.innerWidth < 700;

let renderer;
try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
} catch {
    canvas.remove();
}

if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x07110d, 12, 30);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 0, 14);

    scene.add(new THREE.AmbientLight(0xbfe8cf, 0.55));
    const key = new THREE.PointLight(0xc3ec7a, 90, 40);
    key.position.set(6, 6, 8);
    scene.add(key);
    const rim = new THREE.PointLight(0x6fe3b4, 70, 40);
    rim.position.set(-8, -4, 6);
    scene.add(rim);

    const glass = color => new THREE.MeshPhysicalMaterial({
        color, metalness: 0.15, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.15,
        transparent: true, opacity: 0.82, emissive: color, emissiveIntensity: 0.12,
    });
    const wire = color => new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.35 });

    const shapes = [
        { geo: new THREE.IcosahedronGeometry(1.25, 0), mat: glass(0x9fdc6a), pos: [-7.5, 3.4, -3] },
        { geo: new THREE.TorusGeometry(1, 0.34, 24, 64), mat: glass(0x6fe3b4), pos: [7.8, 2.6, -4] },
        { geo: new THREE.OctahedronGeometry(1, 0), mat: glass(0xc3ec7a), pos: [6.2, -3.8, -2] },
        { geo: new THREE.DodecahedronGeometry(0.9, 0), mat: glass(0x4fbf8f), pos: [-6.4, -3.6, -1] },
        { geo: new THREE.TorusKnotGeometry(0.7, 0.22, 100, 16), mat: glass(0xa8f0c8), pos: [-2.8, 5.2, -7] },
        { geo: new THREE.IcosahedronGeometry(1.6, 1), mat: wire(0xc3ec7a), pos: [3.4, 5.6, -9] },
        { geo: new THREE.OctahedronGeometry(1.3, 0), mat: wire(0x6fe3b4), pos: [-9.5, 0.2, -8] },
        { geo: new THREE.SphereGeometry(0.55, 32, 32), mat: glass(0xe6ffb3), pos: [2.2, -5.4, -5] },
    ].slice(0, small ? 5 : 8).map((s, i) => {
        const mesh = new THREE.Mesh(s.geo, s.mat);
        mesh.position.set(...s.pos);
        mesh.userData = { base: new THREE.Vector3(...s.pos), speed: 0.35 + (i % 4) * 0.12, phase: i * 1.7 };
        scene.add(mesh);
        return mesh;
    });

    // Particles
    const count = small ? 220 : 480;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 34;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 22;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 16 - 4;
    }
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dots = new THREE.Points(pgeo, new THREE.PointsMaterial({
        color: 0xc3ec7a, size: 0.05, transparent: true, opacity: 0.7, depthWrite: false,
    }));
    scene.add(dots);

    let mx = 0, my = 0, scrollY = window.scrollY;
    window.addEventListener('mousemove', (e) => {
        mx = e.clientX / window.innerWidth - 0.5;
        my = e.clientY / window.innerHeight - 0.5;
    }, { passive: true });
    window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });

    function resize() {
        const w = window.innerWidth, h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    const clock = new THREE.Clock();
    function frame() {
        const t = clock.getElapsedTime();
        const drift = scrollY * 0.0025;
        for (const m of shapes) {
            const { base, speed, phase } = m.userData;
            m.position.y = base.y + Math.sin(t * speed + phase) * 0.45 + drift * (0.6 + speed);
            m.position.x = base.x + Math.cos(t * speed * 0.7 + phase) * 0.25;
            m.rotation.x = t * speed * 0.4 + phase;
            m.rotation.y = t * speed * 0.55;
        }
        dots.rotation.y = t * 0.02;
        dots.position.y = drift * 0.8;
        camera.position.x += (mx * 1.6 - camera.position.x) * 0.04;
        camera.position.y += (-my * 1.2 - camera.position.y) * 0.04;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
    }

    if (still) {
        frame();
    } else {
        renderer.setAnimationLoop(frame);
        // Don't spend power while the tab is hidden
        document.addEventListener('visibilitychange', () => {
            renderer.setAnimationLoop(document.hidden ? null : frame);
        });
    }
}
