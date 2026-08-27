const { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray, globalShortcut, screen } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const zlib = require('zlib');
const { exec, execFile } = require('child_process');
const si = require('systeminformation');

let mainWindow;
let tray;
let isQuitting = false;

// ---- Generate the app/tray icon in-process (no external asset needed) ----
// Rounded-square gradient badge with a white "pulse" mark (fits a performance/task monitor).
function buildIconPng(size) {
  const w = size, h = size;
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) raw[y * stride] = 0; // PNG filter byte per row: none

  function pxOffset(x, y) { return y * stride + 1 + x * 4; }
  function blend(x, y, r, g, b, a) {
    if (x < 0 || x >= w || y < 0 || y >= h || a <= 0) return;
    const idx = pxOffset(x, y);
    const dstA = raw[idx + 3] / 255;
    const outA = a + dstA * (1 - a);
    if (outA <= 0.0001) { raw[idx + 3] = 0; return; }
    raw[idx] = Math.round((r * a + raw[idx] * dstA * (1 - a)) / outA);
    raw[idx + 1] = Math.round((g * a + raw[idx + 1] * dstA * (1 - a)) / outA);
    raw[idx + 2] = Math.round((b * a + raw[idx + 2] * dstA * (1 - a)) / outA);
    raw[idx + 3] = Math.round(outA * 255);
  }

  // background: rounded-square gradient (purple -> cyan), antialiased edge via rounded-rect SDF
  const c1 = [139, 123, 255];
  const c2 = [79, 214, 255];
  const halfW = w / 2, halfH = h / 2;
  const radius = w * 0.24;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x - halfW + 0.5, py = y - halfH + 0.5;
      const qx = Math.abs(px) - halfW + radius;
      const qy = Math.abs(py) - halfH + radius;
      const dist = Math.sqrt(Math.max(qx, 0) ** 2 + Math.max(qy, 0) ** 2) + Math.min(Math.max(qx, qy), 0) - radius;
      if (dist > 0.75) continue;
      const alpha = clamp01(0.75 - dist);
      const t = clamp01((px + py) / (w * 1.3) + 0.5);
      blend(x, y, Math.round(c1[0] + (c2[0] - c1[0]) * t), Math.round(c1[1] + (c2[1] - c1[1]) * t), Math.round(c1[2] + (c2[2] - c1[2]) * t), alpha);
    }
  }

  // foreground: a thick-stamped "pulse" line (activity/heartbeat), glow pass + crisp pass
  const pts = [
    [0.15, 0.56], [0.33, 0.56], [0.41, 0.30], [0.51, 0.76], [0.59, 0.48], [0.67, 0.48], [0.86, 0.48],
  ].map(([fx, fy]) => [fx * w, fy * h]);

  function stampLine(x0, y0, x1, y1, r, color, alpha) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = x0 + dx * t, cy = y0 + dy * t;
      const minX = Math.floor(cx - r), maxX = Math.ceil(cx + r);
      const minY = Math.floor(cy - r), maxY = Math.ceil(cy + r);
      for (let yy = minY; yy <= maxY; yy++) {
        for (let xx = minX; xx <= maxX; xx++) {
          const d = Math.hypot(xx - cx, yy - cy);
          if (d > r + 0.75) continue;
          blend(xx, yy, color[0], color[1], color[2], clamp01(r + 0.5 - d) * alpha);
        }
      }
    }
  }
  for (let i = 0; i < pts.length - 1; i++) stampLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w * 0.078, [255, 255, 255], 0.32);
  for (let i = 0; i < pts.length - 1; i++) stampLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w * 0.036, [255, 255, 255], 1);

  return encodePng(w, h, raw);
}
function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rawWithFilters) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = pngChunk('IHDR', ihdrData);
  const idat = pngChunk('IDAT', zlib.deflateSync(rawWithFilters));
  const iend = pngChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

let appIconImage;
function getAppIcon() {
  if (!appIconImage) {
    appIconImage = nativeImage.createFromBuffer(buildIconPng(256));
  }
  return appIconImage;
}
let trayIconImage;
function getTrayIcon() {
  if (!trayIconImage) {
    trayIconImage = nativeImage.createFromBuffer(buildIconPng(32));
  }
  return trayIconImage;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 560,
    frame: false,
    backgroundColor: '#0b0d14',
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('minimize', (e) => {
    e.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  tray = new Tray(getTrayIcon());
  tray.setToolTip('ProTask');
  const menu = Menu.buildFromTemplate([
    { label: 'Open ProTask', click: () => showWindow() },
    { label: 'Minimal Mode', click: () => enterMiniMode() },
    { type: 'separator' },
    { label: 'Quit ProTask', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (mainWindow.isVisible()) mainWindow.hide();
    else showWindow();
  });
}

// ---- Minimal Mode: a small always-on-top floating widget with just the 3 gauges ----
let miniWindow = null;

function createMiniWindow() {
  if (miniWindow) return miniWindow;
  const { workArea } = screen.getPrimaryDisplay();
  miniWindow = new BrowserWindow({
    width: 280,
    height: 64,
    x: workArea.x + workArea.width - 300,
    y: workArea.y + 16,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    icon: getAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  miniWindow.setAlwaysOnTop(true, 'floating');
  miniWindow.loadFile(path.join(__dirname, 'renderer', 'mini.html'));
  miniWindow.on('closed', () => { miniWindow = null; });
  return miniWindow;
}

function enterMiniMode() {
  createMiniWindow().show();
  if (mainWindow) mainWindow.hide();
}

function exitMiniMode() {
  if (miniWindow) { miniWindow.close(); miniWindow = null; }
  showWindow();
}

ipcMain.on('mini:enter', () => enterMiniMode());
ipcMain.on('mini:exit', () => exitMiniMode());

function showWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  globalShortcut.register('Control+Shift+T', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) mainWindow.hide();
    else showWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else showWindow();
});

// ---- Window controls ----
ipcMain.on('win:minimize', () => mainWindow?.minimize());
ipcMain.on('win:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('win:close', () => mainWindow?.close());

// ---- System stats ----
let staticInfoCache = null;

async function getStaticInfo() {
  if (staticInfoCache) return staticInfoCache;
  const [cpu, osInfo, graphics, mem] = await Promise.all([
    si.cpu(),
    si.osInfo(),
    si.graphics(),
    si.memLayout().catch(() => []),
  ]);
  staticInfoCache = { cpu, osInfo, graphics, memLayout: mem };
  return staticInfoCache;
}

ipcMain.handle('sys:static', async () => getStaticInfo());

ipcMain.handle('sys:snapshot', async () => {
  const [load, mem, fsSize, netStats, temp, battery, time, processes, disksIO] =
    await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      si.cpuTemperature().catch(() => ({ main: null })),
      si.battery().catch(() => ({ hasBattery: false })),
      Promise.resolve(si.time()),
      si.processes(),
      si.disksIO().catch(() => ({ rIO_sec: null, wIO_sec: null })),
    ]);

  return { load, mem, fsSize, netStats, temp, battery, time, processes, disksIO };
});

ipcMain.handle('sys:kill', async (_evt, pid) => {
  const numeric = Number(pid);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return { ok: false, error: 'Invalid PID' };
  }
  return new Promise((resolve) => {
    const cmd =
      process.platform === 'win32'
        ? `taskkill /PID ${numeric} /F`
        : `kill -9 ${numeric}`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) resolve({ ok: false, error: stderr || error.message });
      else resolve({ ok: true });
    });
  });
});

// ---- Process icons ----
const iconCache = new Map();

ipcMain.handle('sys:icon', async (_evt, exePath) => {
  if (!exePath || typeof exePath !== 'string') return null;
  if (iconCache.has(exePath)) return iconCache.get(exePath);
  try {
    const img = await app.getFileIcon(exePath, { size: 'normal' });
    const dataUrl = img && !img.isEmpty() ? img.toDataURL() : null;
    iconCache.set(exePath, dataUrl);
    return dataUrl;
  } catch {
    iconCache.set(exePath, null);
    return null;
  }
});

// ---- Friendly app names (reads FileDescription from the exe's version info) ----
const descCache = new Map();

function runPowerShellEncoded(script) {
  return new Promise((resolve) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        if (error) return resolve(null);
        resolve(stdout);
      }
    );
  });
}

// Runs a PowerShell script body elevated (UAC prompt), returning { ok, error } once it finishes.
// The elevated child can't pipe stdout back to us directly, so it writes its result to a temp
// file that we read once Start-Process -Wait returns.
function runElevated(scriptBody) {
  return new Promise((resolve) => {
    const tmpOut = path.join(os.tmpdir(), `protask-elev-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    const inner = `
$ErrorActionPreference = 'Stop'
try {
${scriptBody}
  $result = @{ ok = $true }
} catch {
  $result = @{ ok = $false; error = $_.Exception.Message }
}
$result | ConvertTo-Json -Compress | Out-File -FilePath '${tmpOut.replace(/'/g, "''")}' -Encoding utf8
`;
    const innerEncoded = Buffer.from(inner, 'utf16le').toString('base64');
    const outer = `Start-Process -FilePath powershell -ArgumentList '-NoProfile -NonInteractive -EncodedCommand ${innerEncoded}' -Verb RunAs -Wait -WindowStyle Hidden`;
    runPowerShellEncoded(outer).then(() => {
      fs.readFile(tmpOut, 'utf8', (readErr, data) => {
        fs.unlink(tmpOut, () => {});
        if (readErr) {
          resolve({ ok: false, error: 'Elevation was cancelled, or the change could not be confirmed.' });
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ ok: false, error: 'Could not read the result of the elevated action.' });
        }
      });
    });
  });
}

// ---- Devices (Device Manager equivalent, via the PnpDevice PowerShell module) ----
ipcMain.handle('devices:list', async () => {
  const script = `Get-PnpDevice | Select-Object FriendlyName, InstanceId, Class, Status, Present, ConfigManagerErrorCode | ConvertTo-Json -Compress`;
  const out = await runPowerShellEncoded(script);
  try {
    const parsed = out ? JSON.parse(out) : [];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
});

ipcMain.handle('devices:toggle', async (_evt, instanceId, enable) => {
  if (!instanceId || typeof instanceId !== 'string') return { ok: false, error: 'Missing device id' };
  const esc = instanceId.replace(/'/g, "''");
  return runElevated(`${enable ? 'Enable' : 'Disable'}-PnpDevice -InstanceId '${esc}' -Confirm:$false`);
});

ipcMain.handle('devices:uninstall', async (_evt, instanceId) => {
  if (!instanceId || typeof instanceId !== 'string') return { ok: false, error: 'Missing device id' };
  const esc = instanceId.replace(/'/g, "''");
  return runElevated(`Remove-PnpDevice -InstanceId '${esc}' -Confirm:$false`);
});

ipcMain.handle('devices:scan', async () => runElevated('pnputil /scan-devices | Out-Null'));

ipcMain.handle('devices:openProperties', async (_evt, instanceId) => {
  if (!instanceId || typeof instanceId !== 'string') return { ok: false };
  return new Promise((resolve) => {
    execFile(
      'rundll32.exe',
      ['devmgr.dll', 'DeviceProperties_RunDLL', '/MachineName:', `/DeviceID:${instanceId}`],
      { windowsHide: true },
      (error) => resolve({ ok: !error })
    );
  });
});

ipcMain.handle('devices:openManager', async () => {
  return new Promise((resolve) => {
    exec('start devmgmt.msc', { windowsHide: true }, (error) => resolve({ ok: !error }));
  });
});

ipcMain.handle('sys:describeBatch', async (_evt, paths) => {
  const unique = [...new Set((paths || []).filter((p) => typeof p === 'string' && p))].slice(0, 200);
  const result = {};
  const toFetch = [];
  for (const p of unique) {
    if (descCache.has(p)) result[p] = descCache.get(p);
    else toFetch.push(p);
  }
  if (!toFetch.length) return result;

  const psArray = toFetch.map((p) => `'${p.replace(/'/g, "''")}'`).join(',');
  const script = `
$paths = @(${psArray})
$results = @{}
foreach ($p in $paths) {
  $desc = $null
  $signed = $false
  $publisher = $null
  try {
    $desc = (Get-Item -LiteralPath $p -ErrorAction Stop).VersionInfo.FileDescription
  } catch {}
  try {
    $sig = Get-AuthenticodeSignature -LiteralPath $p -ErrorAction Stop
    if ($sig.Status -eq 'Valid') {
      $signed = $true
      if ($sig.SignerCertificate) {
        $subject = $sig.SignerCertificate.Subject
        if ($subject -match 'CN=([^,]+)') { $publisher = $matches[1] }
      }
    }
  } catch {}
  $results[$p] = @{ desc = $desc; signed = $signed; publisher = $publisher }
}
$results | ConvertTo-Json -Compress -Depth 4
`;
  const out = await runPowerShellEncoded(script);
  try {
    const parsed = out ? JSON.parse(out) : {};
    for (const p of toFetch) {
      const entry = parsed[p] || {};
      const info = {
        desc: (entry.desc || '').toString().trim() || null,
        signed: !!entry.signed,
        publisher: (entry.publisher || '').toString().trim() || null,
      };
      descCache.set(p, info);
      result[p] = info;
    }
  } catch {
    toFetch.forEach((p) => {
      const info = { desc: null, signed: false, publisher: null };
      descCache.set(p, info);
      result[p] = info;
    });
  }
  return result;
});

// ---- Process priority (Efficiency Mode) ----
ipcMain.handle('sys:setPriority', async (_evt, pid, level) => {
  const numeric = Number(pid);
  const allowed = ['Idle', 'BelowNormal', 'Normal', 'AboveNormal', 'High'];
  if (!Number.isInteger(numeric) || numeric <= 0 || !allowed.includes(level)) {
    return { ok: false, error: 'Invalid request' };
  }
  const script = `try { (Get-Process -Id ${numeric} -ErrorAction Stop).PriorityClass = '${level}'; 'ok' } catch { $_.Exception.Message }`;
  const out = await runPowerShellEncoded(script);
  const ok = (out || '').trim() === 'ok';
  return ok ? { ok: true } : { ok: false, error: (out || 'Failed to set priority').trim() };
});

// ---- Network connections per process (netstat) ----
ipcMain.handle('sys:netConnections', async () => {
  return new Promise((resolve) => {
    exec('netstat -ano -p TCP', { windowsHide: true, maxBuffer: 5 * 1024 * 1024 }, (error, stdout) => {
      if (error || !stdout) return resolve({});
      const counts = {};
      const lines = stdout.split(/\r?\n/);
      for (const line of lines) {
        const m = line.trim().match(/^TCP\s+\S+\s+\S+\s+(ESTABLISHED|LISTENING|TIME_WAIT|CLOSE_WAIT)\s+(\d+)$/i);
        if (!m) continue;
        const pid = m[2];
        counts[pid] = (counts[pid] || 0) + 1;
      }
      resolve(counts);
    });
  });
});

// ---- Open Windows Settings (for uninstall shortcut) ----
ipcMain.handle('sys:openAppsSettings', async () => {
  return new Promise((resolve) => {
    exec('start ms-settings:appsfeatures', { windowsHide: true }, (error) => {
      resolve({ ok: !error });
    });
  });
});

// ---- Startup apps (Windows registry Run keys) ----
const RUN_KEYS = [
  { hive: 'HKCU', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Run', editable: true },
  { hive: 'HKLM', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Run', editable: false },
  { hive: 'HKLM', key: 'Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run', editable: false },
];
const DISABLED_KEY = 'Software\\ProTask\\DisabledStartup';

function regQuery(hive, key) {
  return new Promise((resolve) => {
    exec(`reg query "${hive}\\${key}"`, (error, stdout) => {
      if (error) return resolve([]);
      const lines = stdout.split(/\r?\n/).filter((l) => /^\s{4}\S/.test(l));
      const entries = lines.map((line) => {
        const match = line.match(/^\s{4}(.+?)\s+(REG_\S+)\s+(.*)$/);
        if (!match) return null;
        return { name: match[1].trim(), type: match[2], value: match[3].trim() };
      }).filter(Boolean);
      resolve(entries);
    });
  });
}

function regAdd(hive, key, name, value) {
  return new Promise((resolve) => {
    const safeValue = value.replace(/"/g, '\\"');
    exec(`reg add "${hive}\\${key}" /v "${name}" /t REG_SZ /d "${safeValue}" /f`, (error) => {
      resolve(!error);
    });
  });
}

function regDelete(hive, key, name) {
  return new Promise((resolve) => {
    exec(`reg delete "${hive}\\${key}" /v "${name}" /f`, (error) => {
      resolve(!error);
    });
  });
}

ipcMain.handle('startup:list', async () => {
  const results = [];
  for (const { hive, key, editable } of RUN_KEYS) {
    const entries = await regQuery(hive, key);
    entries.forEach((e) => results.push({ ...e, hive, key, editable, enabled: true, source: `${hive}\\...\\Run` }));
  }
  const disabled = await regQuery('HKCU', DISABLED_KEY);
  disabled.forEach((e) =>
    results.push({ ...e, hive: 'HKCU', key: DISABLED_KEY, editable: true, enabled: false, source: 'Disabled by ProTask' })
  );
  return results;
});

ipcMain.handle('startup:toggle', async (_evt, entry) => {
  if (!entry || entry.hive !== 'HKCU') {
    return { ok: false, error: 'Only user-scope (HKCU) startup entries can be toggled without admin rights.' };
  }
  if (entry.enabled) {
    // disable: move from Run -> DisabledStartup
    const added = await regAdd('HKCU', DISABLED_KEY, entry.name, entry.value);
    if (!added) return { ok: false, error: 'Failed to store disabled entry.' };
    await regDelete(entry.hive, entry.key, entry.name);
    return { ok: true, enabled: false };
  } else {
    // enable: move from DisabledStartup -> Run
    const added = await regAdd('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Run', entry.name, entry.value);
    if (!added) return { ok: false, error: 'Failed to restore entry.' };
    await regDelete('HKCU', DISABLED_KEY, entry.name);
    return { ok: true, enabled: true };
  }
});

// ---- Optimizer ----
const SCAN_BUDGET_MS = 1500;
const SCAN_MAX_ENTRIES = 40000;

function dirSize(dirPath) {
  let total = 0;
  let files = 0;
  let visited = 0;
  let truncated = false;
  const start = Date.now();
  let stack = [dirPath];
  while (stack.length) {
    if (visited > SCAN_MAX_ENTRIES || Date.now() - start > SCAN_BUDGET_MS) {
      truncated = true;
      break;
    }
    const current = stack.pop();
    let items;
    try {
      items = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const item of items) {
      visited++;
      const full = path.join(current, item.name);
      try {
        if (item.isDirectory()) stack.push(full);
        else {
          const st = fs.statSync(full);
          total += st.size;
          files++;
        }
      } catch {
        // skip locked/inaccessible files
      }
    }
  }
  return { bytes: total, files, truncated };
}

function clearDir(dirPath) {
  let removed = 0;
  let failed = 0;
  let items;
  try {
    items = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return { removed, failed };
  }
  for (const item of items) {
    const full = path.join(dirPath, item.name);
    try {
      fs.rmSync(full, { recursive: true, force: true });
      removed++;
    } catch {
      failed++;
    }
  }
  return { removed, failed };
}

ipcMain.handle('optimize:tempInfo', async () => {
  const userTemp = os.tmpdir();
  const info = dirSize(userTemp);
  return { path: userTemp, ...info };
});

ipcMain.handle('optimize:clearTemp', async () => {
  const userTemp = os.tmpdir();
  const before = dirSize(userTemp).bytes;
  const result = clearDir(userTemp);
  const after = dirSize(userTemp).bytes;
  const freed = Math.max(0, before - after);
  return { path: userTemp, freed, ...result };
});

ipcMain.handle('optimize:emptyRecycleBin', async () => {
  return new Promise((resolve) => {
    exec(
      `powershell -NoProfile -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"`,
      (error, stdout, stderr) => {
        if (error) resolve({ ok: false, error: stderr || error.message });
        else resolve({ ok: true });
      }
    );
  });
});

ipcMain.handle('optimize:flushDns', async () => {
  return new Promise((resolve) => {
    exec('ipconfig /flushdns', (error, stdout, stderr) => {
      if (error) resolve({ ok: false, error: stderr || error.message });
      else resolve({ ok: true, output: stdout.trim() });
    });
  });
});
