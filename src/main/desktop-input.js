// Lets the widgets on the wallpaper respond to clicks on the desktop.
//
// The wallpaper sits behind the desktop icons, so Windows gives every click there to Explorer.
// This watches the mouse with Raw Input, the same way other wallpaper apps do: the wallpaper
// window is sent a copy of mouse input even in the background. Nothing is intercepted or blocked,
// so Explorer still gets every click as usual. A click is only reported when it lands on empty
// desktop:
//   - the window under the cursor is the desktop itself, not an app, the taskbar or a menu
//   - it is not on an icon (hovering an icon highlights it, and clicking one selects it)
//   - it is not a drag, such as selecting icons with a rectangle
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');

const POINT = koffi.struct('LWD_POINT', { x: 'int32', y: 'int32' });
const RAWINPUTDEVICE = koffi.struct('LWD_RAWINPUTDEVICE', {
    usUsagePage: 'uint16', usUsage: 'uint16', dwFlags: 'uint32', hwndTarget: 'intptr',
});

const RegisterRawInputDevices = user32.func('bool __stdcall RegisterRawInputDevices(LWD_RAWINPUTDEVICE *devices, uint32 count, uint32 size)');
const GetRawInputData = user32.func('uint32 __stdcall GetRawInputData(intptr raw, uint32 command, _Out_ void *data, _Inout_ uint32 *size, uint32 headerSize)');
const GetCursorPos = user32.func('bool __stdcall GetCursorPos(_Out_ LWD_POINT *pt)');
const WindowFromPoint = user32.func('intptr __stdcall WindowFromPoint(LWD_POINT pt)');
const GetParent = user32.func('intptr __stdcall GetParent(intptr hwnd)');
const GetClassNameW = user32.func('int __stdcall GetClassNameW(intptr hwnd, _Out_ uint16 *name, int max)');
const GetSystemMetrics = user32.func('int __stdcall GetSystemMetrics(int index)');
const SendMessageTimeoutW = user32.func('intptr __stdcall SendMessageTimeoutW(intptr hwnd, uint32 msg, uintptr wParam, intptr lParam, uint32 flags, uint32 timeout, _Out_ intptr *result)');

const WM_INPUT = 0x00FF;
const RID_INPUT = 0x10000003;
const RIM_TYPEMOUSE = 0;
const RIDEV_REMOVE = 0x1;
const RIDEV_INPUTSINK = 0x100;
const HEADER_SIZE = koffi.sizeof('intptr') === 8 ? 24 : 16;  // RAWINPUTHEADER
const BUTTON_FLAGS = HEADER_SIZE + 4;                        // RAWMOUSE.usButtonFlags
const LEFT_DOWN = 0x1, LEFT_UP = 0x2, RIGHT_DOWN = 0x4, RIGHT_UP = 0x8;
const SM_SWAPBUTTON = 23;
const LVM_GETSELECTEDCOUNT = 0x1032;
const LVM_GETHOTITEM = 0x103D;
const SMTO_ABORTIFHUNG = 0x2;

const CLICK_SLOP = 6;         // physical pixels the mouse may move during a click
const CLICK_MAX_MS = 800;
const HOVER_EVERY_MS = 40;
const DESKTOP_CLASSES = new Set(['SHELLDLL_DefView', 'WorkerW', 'Progman']);

const raw = Buffer.alloc(64);
const classBuf = new Uint16Array(64);
let current = null;  // { win, hwnd, onClick, onHover, down, hoverTimer, hovering }

function hwndOf(win) {
    const buf = win.getNativeWindowHandle();
    return Number(buf.length >= 8 ? buf.readBigUInt64LE(0) : buf.readUInt32LE(0));
}

function className(hwnd) {
    const n = hwnd ? GetClassNameW(hwnd, classBuf, classBuf.length) : 0;
    return String.fromCharCode(...classBuf.subarray(0, n));
}

function cursor() {
    const pt = {};
    return GetCursorPos(pt) ? { x: pt.x, y: pt.y } : null;
}

function ask(hwnd, msg) {
    const out = [0];
    return SendMessageTimeoutW(hwnd, msg, 0, 0, SMTO_ABORTIFHUNG, 200, out) ? Number(out[0]) : null;
}

/**
 * What is under a screen point: null when it isn't the desktop, otherwise { icons } with the
 * desktop icon list's window (0 when the icons are hidden).
 */
function desktopAt(pt) {
    const hwnd = WindowFromPoint(pt);
    if (!hwnd) return null;
    if (current && hwnd === current.hwnd) return { icons: 0 };
    const cls = className(hwnd);
    if (cls === 'SysListView32' && className(GetParent(hwnd)) === 'SHELLDLL_DefView') return { icons: hwnd };
    return DESKTOP_CLASSES.has(cls) ? { icons: 0 } : null;
}

const overIcon = desktop => desktop.icons !== 0 && (ask(desktop.icons, LVM_GETHOTITEM) ?? -1) >= 0;
const iconSelected = desktop => desktop.icons !== 0 && ask(desktop.icons, LVM_GETSELECTEDCOUNT) !== 0;

function buttonFlags(lParam) {
    const handle = Number(lParam.length >= 8 ? lParam.readBigUInt64LE(0) : lParam.readUInt32LE(0));
    const size = [raw.length];
    const n = GetRawInputData(handle, RID_INPUT, raw, size, HEADER_SIZE);
    if (n === 0xFFFFFFFF || n < BUTTON_FLAGS + 2 || raw.readUInt32LE(0) !== RIM_TYPEMOUSE) return 0;
    return raw.readUInt16LE(BUTTON_FLAGS);
}

function finishClick(c) {
    const start = c.down;
    c.down = null;
    const pt = cursor();
    if (!pt || Math.abs(pt.x - start.pt.x) > CLICK_SLOP || Math.abs(pt.y - start.pt.y) > CLICK_SLOP) return;
    if (Date.now() - start.at > CLICK_MAX_MS) return;
    // Let Explorer handle the click first: clicking empty desktop leaves no icon selected
    setTimeout(() => {
        if (current !== c) return;
        const desktop = desktopAt(pt);
        if (desktop && !iconSelected(desktop)) c.onClick(pt);
    }, 80);
}

function onInput(lParam) {
    const c = current;
    if (!c) return;
    const flags = buttonFlags(lParam);
    // Raw input reports physical buttons; follow Windows' "switch primary and secondary buttons"
    const swapped = GetSystemMetrics(SM_SWAPBUTTON) !== 0;
    const down = swapped ? RIGHT_DOWN : LEFT_DOWN;
    const up = swapped ? RIGHT_UP : LEFT_UP;

    if (flags & down) {
        c.down = null;
        const pt = cursor();
        const desktop = pt && desktopAt(pt);
        if (desktop && !overIcon(desktop)) c.down = { pt, at: Date.now() };
    }
    if (flags & up && c.down) finishClick(c);

    // Hover, sampled a few times a second rather than on every mouse movement
    if (!c.hoverTimer) {
        c.hoverTimer = setTimeout(() => {
            c.hoverTimer = null;
            if (current !== c) return;
            const pt = c.down ? null : cursor();
            const desktop = pt && desktopAt(pt);
            const over = desktop && !overIcon(desktop) ? pt : null;
            if (over || c.hovering) c.onHover(over);
            c.hovering = !!over;
        }, HOVER_EVERY_MS);
    }
}

/**
 * Starts reporting desktop clicks for the wallpaper window. onClick(point) and onHover(point|null)
 * get physical screen coordinates. Returns false if Windows refused.
 */
function start(win, { onClick, onHover }) {
    stop();
    const hwnd = hwndOf(win);
    const device = { usUsagePage: 0x01, usUsage: 0x02, dwFlags: RIDEV_INPUTSINK, hwndTarget: hwnd };  // mouse
    if (!RegisterRawInputDevices(device, 1, koffi.sizeof(RAWINPUTDEVICE))) return false;
    current = { win, hwnd, onClick, onHover, down: null, hoverTimer: null, hovering: false };
    win.hookWindowMessage(WM_INPUT, (_wParam, lParam) => onInput(lParam));
    win.once('closed', () => { if (current?.win === win) stop(); });
    return true;
}

function stop() {
    if (!current) return;
    const { win, hoverTimer } = current;
    current = null;
    clearTimeout(hoverTimer);
    RegisterRawInputDevices({ usUsagePage: 0x01, usUsage: 0x02, dwFlags: RIDEV_REMOVE, hwndTarget: 0 }, 1, koffi.sizeof(RAWINPUTDEVICE));
    if (!win.isDestroyed()) win.unhookWindowMessage(WM_INPUT);
}

const active = () => !!current;

module.exports = { start, stop, active, desktopAt };
