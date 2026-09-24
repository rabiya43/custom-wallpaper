// Places a window behind the desktop icons (the same technique Windows wallpaper apps use).
//
// Sending the undocumented 0x052C message to Progman makes Explorer create a WorkerW window
// between the desktop icons and the static wallpaper. Parenting our window to it puts the
// window behind the icons.
//   - Windows 10 / 11 before 24H2: the target WorkerW is a top-level window that sits right
//     after the WorkerW that holds SHELLDLL_DefView (the icons).
//   - Windows 11 24H2 and later: SHELLDLL_DefView and the WorkerW are children of Progman,
//     so the window is parented to Progman and ordered just below the icons.
const koffi = require('koffi');

const user32 = koffi.load('user32.dll');

const FindWindowW = user32.func('intptr __stdcall FindWindowW(str16 cls, str16 name)');
const FindWindowExW = user32.func('intptr __stdcall FindWindowExW(intptr parent, intptr after, str16 cls, str16 name)');
const SendMessageTimeoutW = user32.func('intptr __stdcall SendMessageTimeoutW(intptr hwnd, uint32 msg, uintptr wParam, intptr lParam, uint32 flags, uint32 timeout, _Out_ uintptr *result)');
const SetParent = user32.func('intptr __stdcall SetParent(intptr child, intptr parent)');
const SetWindowPos = user32.func('bool __stdcall SetWindowPos(intptr hwnd, intptr after, int x, int y, int cx, int cy, uint32 flags)');
const GetWindowLongPtrW = user32.func('intptr __stdcall GetWindowLongPtrW(intptr hwnd, int index)');
const SetWindowLongPtrW = user32.func('intptr __stdcall SetWindowLongPtrW(intptr hwnd, int index, intptr value)');
const SetLayeredWindowAttributes = user32.func('bool __stdcall SetLayeredWindowAttributes(intptr hwnd, uint32 key, uint8 alpha, uint32 flags)');
const GetSystemMetrics = user32.func('int __stdcall GetSystemMetrics(int index)');
const SystemParametersInfoW_get = user32.func('bool __stdcall SystemParametersInfoW(uint32 action, uint32 param, _Out_ uint16 *buf, uint32 winIni)');
const SystemParametersInfoW_set = user32.func('bool __stdcall SystemParametersInfoW(uint32 action, uint32 param, str16 value, uint32 winIni)');

const SMTO_NORMAL = 0x0;
const GWL_STYLE = -16;
const GWL_EXSTYLE = -20;
const WS_CHILD = 0x40000000;
const WS_POPUP = 0x80000000;
const WS_CAPTION = 0x00C00000;
const WS_THICKFRAME = 0x00040000;
const WS_EX_LAYERED = 0x00080000;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_NOACTIVATE = 0x08000000;
const WS_EX_APPWINDOW = 0x00040000;
const LWA_ALPHA = 0x2;
const SWP_NOSIZE = 0x1;
const SWP_NOMOVE = 0x2;
const SWP_NOACTIVATE = 0x10;
const SWP_FRAMECHANGED = 0x20;
const SWP_SHOWWINDOW = 0x40;
const SM_XVIRTUALSCREEN = 76;
const SM_YVIRTUALSCREEN = 77;
const SPI_GETDESKWALLPAPER = 0x0073;
const SPI_SETDESKWALLPAPER = 0x0014;

function hwndOf(win) {
    const buf = win.getNativeWindowHandle();
    return Number(buf.length >= 8 ? buf.readBigUInt64LE(0) : buf.readUInt32LE(0));
}

function spawnWorkerW(progman) {
    const result = [0];
    SendMessageTimeoutW(progman, 0x052C, 0xD, 0x1, SMTO_NORMAL, 1000, result);
    SendMessageTimeoutW(progman, 0x052C, 0, 0, SMTO_NORMAL, 1000, result);
}

/**
 * Parents the window behind the desktop icons and sizes it to `rect` (physical pixels,
 * screen coordinates). Returns true on success.
 */
function attach(win, rect) {
    const progman = FindWindowW('Progman', null);
    if (!progman) return false;
    spawnWorkerW(progman);

    const hwnd = hwndOf(win);

    // Turn the popup window into a borderless child window that never takes focus
    let style = Number(GetWindowLongPtrW(hwnd, GWL_STYLE));
    style = (style & ~(WS_POPUP | WS_CAPTION | WS_THICKFRAME)) | WS_CHILD;
    SetWindowLongPtrW(hwnd, GWL_STYLE, style);
    let ex = Number(GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
    ex = (ex & ~WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE | WS_EX_LAYERED;
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex);
    SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);

    // Child coordinates are relative to the parent, which starts at the virtual-screen origin
    const x = rect.x - GetSystemMetrics(SM_XVIRTUALSCREEN);
    const y = rect.y - GetSystemMetrics(SM_YVIRTUALSCREEN);

    const defViewInProgman = FindWindowExW(progman, 0, 'SHELLDLL_DefView', null);
    if (defViewInProgman) {
        // Windows 11 24H2+
        SetParent(hwnd, progman);
        SetWindowPos(hwnd, defViewInProgman, x, y, rect.width, rect.height, SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
        const workerw = FindWindowExW(progman, 0, 'WorkerW', null);
        if (workerw) SetWindowPos(workerw, hwnd, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        return true;
    }

    // Older layout: find the WorkerW that holds the icons, then the WorkerW right after it
    let target = 0;
    let w = 0;
    while ((w = FindWindowExW(0, w, 'WorkerW', null))) {
        if (FindWindowExW(w, 0, 'SHELLDLL_DefView', null)) {
            target = FindWindowExW(0, w, 'WorkerW', null);
            break;
        }
    }
    if (!target) target = progman;
    SetParent(hwnd, target);
    SetWindowPos(hwnd, 0, x, y, rect.width, rect.height, SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
    return true;
}

/** Progman's handle changes when Explorer restarts, which means the wallpaper must be re-attached. */
function currentProgman() {
    return FindWindowW('Progman', null);
}

/** Makes Windows repaint its own wallpaper (otherwise the last frame of ours stays visible). */
function restoreSystemWallpaper() {
    const buf = new Uint16Array(520);
    if (!SystemParametersInfoW_get(SPI_GETDESKWALLPAPER, buf.length, buf, 0)) return;
    const end = buf.indexOf(0);
    const path = String.fromCharCode(...buf.subarray(0, end < 0 ? buf.length : end));
    SystemParametersInfoW_set(SPI_SETDESKWALLPAPER, 0, path, 0);
}

module.exports = { attach, currentProgman, restoreSystemWallpaper };
