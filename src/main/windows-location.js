// The computer's location from Windows' own Location service (Settings > Privacy & security > Location).
// Uses .NET's GeoCoordinateWatcher through PowerShell, so no native add-ons are needed.
// Returns null when Location is off, not allowed for desktop apps, or has no fix yet.
const { execFile } = require('child_process');

const SCRIPT = `
Add-Type -AssemblyName System.Device
$w = New-Object System.Device.Location.GeoCoordinateWatcher([System.Device.Location.GeoPositionAccuracy]::Default)
[void]$w.TryStart($false, [TimeSpan]::FromSeconds(8))
$sw = [Diagnostics.Stopwatch]::StartNew()
while ($w.Status -ne 'Ready' -and $w.Permission -ne 'Denied' -and $sw.Elapsed.TotalSeconds -lt 10) { Start-Sleep -Milliseconds 250 }
$l = $w.Position.Location
if ($w.Permission -eq 'Denied') { '{"status":"denied"}' }
elseif ($l.IsUnknown) { '{"status":"unavailable"}' }
else { '{"status":"ok","lat":' + $l.Latitude.ToString([Globalization.CultureInfo]::InvariantCulture) + ',"lon":' + $l.Longitude.ToString([Globalization.CultureInfo]::InvariantCulture) + ',"accuracy":' + [math]::Round($l.HorizontalAccuracy) + '}' }
$w.Stop()
`;

let cache = null;  // { time, value }
const TTL_MS = 30 * 60 * 1000;

/** { status: 'ok', lat, lon, accuracy } | { status: 'denied' | 'unavailable' | 'error' } */
function get() {
    if (cache && Date.now() - cache.time < TTL_MS) return Promise.resolve(cache.value);
    return new Promise(resolve => {
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT],
            { windowsHide: true, timeout: 15000 }, (err, stdout) => {
                let value = { status: 'error' };
                if (!err) {
                    try { value = JSON.parse(String(stdout).trim().split(/\r?\n/).pop()); } catch { /* keep error */ }
                }
                // Don't keep failures for long, so turning Location on is noticed quickly
                cache = { time: value.status === 'ok' ? Date.now() : Date.now() - TTL_MS + 60000, value };
                resolve(value);
            });
    });
}

module.exports = { get };
