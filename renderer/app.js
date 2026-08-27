/* ===================== Window controls ===================== */
document.getElementById('win-min').addEventListener('click', () => window.api.minimize());
document.getElementById('win-max').addEventListener('click', () => window.api.maximize());
document.getElementById('win-close').addEventListener('click', () => window.api.close());

/* ===================== Theme ===================== */
const THEME_KEY = 'protask-theme';
const themeBtn = document.getElementById('theme-btn');
const themeMenu = document.getElementById('theme-menu');

function applyTheme(name) {
  document.documentElement.setAttribute('data-theme', name);
  localStorage.setItem(THEME_KEY, name);
}
applyTheme(localStorage.getItem(THEME_KEY) || 'aurora');

themeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  themeMenu.classList.toggle('open');
});
document.addEventListener('click', () => themeMenu.classList.remove('open'));
themeMenu.querySelectorAll('button[data-theme]').forEach((btn) => {
  btn.addEventListener('click', () => {
    applyTheme(btn.dataset.theme);
    themeMenu.classList.remove('open');
  });
});

/* ===================== Resource alerts ===================== */
const ALERTS_KEY = 'protask-alerts';
const defaultAlertSettings = { enabled: false, cpu: 90, mem: 90 };
let alertSettings = { ...defaultAlertSettings, ...JSON.parse(localStorage.getItem(ALERTS_KEY) || '{}') };
let cpuAlertArmed = true; // true = allowed to fire (re-arms once usage drops back down)
let memAlertArmed = true;

function saveAlertSettings() {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(alertSettings));
  document.getElementById('alerts-dot').classList.toggle('on', alertSettings.enabled);
}

const alertsBtn = document.getElementById('alerts-btn');
const alertsMenu = document.getElementById('alerts-menu');
const alertsEnabled = document.getElementById('alerts-enabled');
const alertsCpu = document.getElementById('alerts-cpu');
const alertsMem = document.getElementById('alerts-mem');

alertsEnabled.checked = alertSettings.enabled;
alertsCpu.value = alertSettings.cpu;
alertsMem.value = alertSettings.mem;
document.getElementById('alerts-cpu-val').textContent = `${alertSettings.cpu}%`;
document.getElementById('alerts-mem-val').textContent = `${alertSettings.mem}%`;
saveAlertSettings();

alertsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  alertsMenu.classList.toggle('open');
});
document.addEventListener('click', () => alertsMenu.classList.remove('open'));
alertsMenu.addEventListener('click', (e) => e.stopPropagation());

alertsEnabled.addEventListener('change', () => {
  alertSettings.enabled = alertsEnabled.checked;
  saveAlertSettings();
  if (alertSettings.enabled && Notification.permission === 'default') {
    Notification.requestPermission();
  }
});
alertsCpu.addEventListener('input', () => {
  alertSettings.cpu = Number(alertsCpu.value);
  document.getElementById('alerts-cpu-val').textContent = `${alertSettings.cpu}%`;
  saveAlertSettings();
});
alertsMem.addEventListener('input', () => {
  alertSettings.mem = Number(alertsMem.value);
  document.getElementById('alerts-mem-val').textContent = `${alertSettings.mem}%`;
  saveAlertSettings();
});

function checkAlerts(cpuPct, memPct) {
  if (!alertSettings.enabled || Notification.permission !== 'granted') return;

  if (cpuPct >= alertSettings.cpu) {
    if (cpuAlertArmed) {
      cpuAlertArmed = false;
      new Notification('High CPU usage', { body: `CPU is at ${Math.round(cpuPct)}%, above your ${alertSettings.cpu}% alert threshold.`, silent: false });
    }
  } else if (cpuPct < alertSettings.cpu - 5) {
    cpuAlertArmed = true; // re-arm once it drops with a little hysteresis
  }

  if (memPct >= alertSettings.mem) {
    if (memAlertArmed) {
      memAlertArmed = false;
      new Notification('High memory usage', { body: `Memory is at ${Math.round(memPct)}%, above your ${alertSettings.mem}% alert threshold.`, silent: false });
    }
  } else if (memPct < alertSettings.mem - 5) {
    memAlertArmed = true;
  }
}

/* ===================== Tab navigation ===================== */
document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    item.classList.add('active');
    document.getElementById('tab-' + item.dataset.tab).classList.add('active');

    if (item.dataset.tab === 'startup') loadStartup();
    if (item.dataset.tab === 'optimize') {
      refreshOptimizeStatic();
      refreshOptimizeLive();
    }
    if (item.dataset.tab === 'devices') loadDevices();
  });
});

document.getElementById('mini-mode-btn').addEventListener('click', () => window.api.enterMiniMode());

/* ===================== Toast ===================== */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ===================== Confirm modal ===================== */
function confirmAction(title, body) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-overlay');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-body').textContent = body;
    overlay.classList.add('open');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');

    function cleanup(result) {
      overlay.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onOverlay);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onOverlay(e) { if (e.target === overlay) cleanup(false); }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    overlay.addEventListener('click', onOverlay);
  });
}

/* ===================== Background FX canvas ===================== */
const fxCanvas = document.getElementById('bg-fx');
const fxCtx = fxCanvas.getContext('2d');
let blobs = [];

function resizeFx() {
  fxCanvas.width = window.innerWidth;
  fxCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeFx);
resizeFx();

function initBlobs() {
  blobs = Array.from({ length: 5 }, (_, i) => ({
    x: Math.random() * fxCanvas.width,
    y: Math.random() * fxCanvas.height,
    r: 180 + Math.random() * 220,
    dx: (Math.random() - 0.5) * 0.25,
    dy: (Math.random() - 0.5) * 0.25,
    hueIdx: i % 3,
  }));
}
initBlobs();

function themeColors() {
  const styles = getComputedStyle(document.documentElement);
  return [
    styles.getPropertyValue('--fx-a').trim(),
    styles.getPropertyValue('--fx-b').trim(),
    styles.getPropertyValue('--fx-c').trim(),
  ];
}

let fxBoost = 0; // temporary speed boost when system is under load
function drawFx() {
  const colors = themeColors();
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  fxCtx.globalCompositeOperation = 'lighter';
  for (const b of blobs) {
    const speed = 1 + fxBoost;
    b.x += b.dx * speed;
    b.y += b.dy * speed;
    if (b.x < -b.r) b.x = fxCanvas.width + b.r;
    if (b.x > fxCanvas.width + b.r) b.x = -b.r;
    if (b.y < -b.r) b.y = fxCanvas.height + b.r;
    if (b.y > fxCanvas.height + b.r) b.y = -b.r;

    const grad = fxCtx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    const c = colors[b.hueIdx] || '#8b7bff';
    grad.addColorStop(0, c + '33');
    grad.addColorStop(1, c + '00');
    fxCtx.fillStyle = grad;
    fxCtx.beginPath();
    fxCtx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    fxCtx.fill();
  }
  fxCtx.globalCompositeOperation = 'source-over';
  requestAnimationFrame(drawFx);
}
requestAnimationFrame(drawFx);

/* ===================== Helpers ===================== */
function fmtBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '--';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = Math.abs(bytes);
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
function fmtRate(bytesPerSec) {
  return fmtBytes(bytesPerSec) + '/s';
}
function fmtPct(v) {
  return `${Math.round(v)}%`;
}
function fmtUptime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* ===================== State ===================== */
const HISTORY_LEN = 60;
const history = {
  cpu: new Array(HISTORY_LEN).fill(0),
  memory: new Array(HISTORY_LEN).fill(0),
  disk: new Array(HISTORY_LEN).fill(0),
  network: new Array(HISTORY_LEN).fill(0),
};
const HOUR_LEN = 360; // ~1 hour at one sample per ~10s
const historyHour = {
  cpu: new Array(HOUR_LEN).fill(0),
  memory: new Array(HOUR_LEN).fill(0),
  disk: new Array(HOUR_LEN).fill(0),
  network: new Array(HOUR_LEN).fill(0),
};
let chartRange = 'live';

let staticInfo = null;
let lastSnapshot = null;
let activePerfMetric = 'cpu';
let sortState = { key: 'cpu', dir: 'desc' };
let searchQuery = '';
let startupCache = [];
const connCounts = new Map(); // pid(string) -> active connection count
let tickCount = 0;

function pushHistory(key, val) {
  const arr = history[key];
  arr.shift();
  arr.push(val);
}

function maybeSampleHour() {
  if (tickCount % 6 !== 0) return;
  for (const key of Object.keys(history)) {
    const harr = historyHour[key];
    harr.shift();
    harr.push(history[key][history[key].length - 1]);
  }
}

async function refreshConnections() {
  try {
    const counts = await window.api.getNetConnections();
    connCounts.clear();
    for (const pid in counts) connCounts.set(pid, counts[pid]);
  } catch {
    // ignore — connections are a nice-to-have, not critical
  }
}

/* ===================== Static info (once) ===================== */
async function loadStatic() {
  staticInfo = await window.api.getStatic();
  const { cpu, osInfo, graphics, memLayout } = staticInfo;

  document.getElementById('ov-system').innerHTML = kv([
    ['OS', `${osInfo.distro} ${osInfo.release}`],
    ['Arch', osInfo.arch],
    ['Hostname', osInfo.hostname],
    ['Kernel', osInfo.kernel],
    ['Show/hide window', 'Ctrl+Shift+T'],
  ]);

  document.getElementById('ov-cpu').innerHTML = kv([
    ['Model', `${cpu.manufacturer} ${cpu.brand}`],
    ['Cores', `${cpu.physicalCores} physical / ${cpu.cores} logical`],
    ['Base Speed', `${cpu.speed} GHz`],
    ['Cache (L3)', cpu.cache && cpu.cache.l3 ? fmtBytes(cpu.cache.l3) : '--'],
  ]);

  const gpu = graphics.controllers && graphics.controllers[0];
  document.getElementById('ov-gpu').innerHTML = kv([
    ['Model', gpu ? gpu.model : 'Unknown'],
    ['Vendor', gpu ? gpu.vendor : '--'],
    ['VRAM', gpu && gpu.vram ? fmtBytes(gpu.vram * 1024 * 1024) : '--'],
  ]);

  const modules = memLayout && memLayout.length
    ? memLayout.map((m) => `${fmtBytes(m.size)} @ ${m.clockSpeed || '?'}MHz`).join(', ')
    : '--';
  document.getElementById('ov-mem').dataset.modules = modules;

  buildCoreCells(cpu.cores);
}
function kv(pairs) {
  return pairs.map(([k, v]) => `<div class="kv-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
}

function buildCoreCells(count) {
  const wrap = document.getElementById('perf-cores');
  wrap.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const div = document.createElement('div');
    div.className = 'core-cell';
    div.innerHTML = `Core ${i}<span class="core-val" id="core-${i}">0%</span>`;
    wrap.appendChild(div);
  }
}

/* ===================== Process icons ===================== */
const iconCache = new Map(); // exePath -> dataURL|null|Promise

function buildExePath(p) {
  if (!p.path) return null;
  const sep = p.path.includes('\\') ? '\\' : '/';
  if (/\.exe$/i.test(p.path)) return p.path;
  const file = p.name ? (/\.exe$/i.test(p.name) ? p.name : `${p.name}.exe`) : null;
  if (!file) return null;
  return p.path.endsWith(sep) ? p.path + file : p.path + sep + file;
}

function getIcon(exePath) {
  if (!exePath) return Promise.resolve(null);
  const cached = iconCache.get(exePath);
  if (cached !== undefined) return cached instanceof Promise ? cached : Promise.resolve(cached);
  const p = window.api.getIcon(exePath).then((url) => { iconCache.set(exePath, url); return url; }).catch(() => null);
  iconCache.set(exePath, p);
  return p;
}

function iconLetter(name) {
  return (name || '?').replace(/\.exe$/i, '').slice(0, 1).toUpperCase();
}

// "System Idle Process" reports how much CPU capacity is FREE, not how much it's using —
// it's Windows' idle counter, not a real workload. Treat it specially everywhere so it
// never looks like a resource hog (and never crowds out real hogs when sorting by CPU).
function isIdleProcess(p) {
  return p && (p.pid === 0 || /^system idle process$/i.test(p.name || ''));
}

/* ===================== Friendly app names + signature info ===================== */
const nameCache = new Map(); // exePath -> { desc, signed, publisher } | null

function prettifyName(raw) {
  return (raw || 'Unknown').replace(/\.exe$/i, '');
}

function appInfo(exePath) {
  return exePath ? nameCache.get(exePath) || null : null;
}

function displayName(rawName, exePath) {
  const info = appInfo(exePath);
  if (info && info.desc) return info.desc;
  return prettifyName(rawName);
}

function friendlyProcessName(p) {
  return displayName(p.name, buildExePath(p));
}

function verifyBadgeHtml(exePath) {
  const info = appInfo(exePath);
  if (!info) return '';
  const signed = !!info.signed;
  const title = signed ? `Verified: ${escapeHtml(info.publisher || 'signed publisher')}` : 'Unsigned / unverified';
  return `<span class="verify-badge${signed ? '' : ' unsigned'}" title="${title}">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" fill="currentColor" opacity="${signed ? '.9' : '.5'}"/>${signed ? '<path d="M9 12l2 2 4-4" stroke="#08120c" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' : ''}</svg>
  </span>`;
}

async function ensureNames(processList) {
  const paths = [];
  for (const p of processList) {
    const ep = buildExePath(p);
    if (ep && !nameCache.has(ep)) paths.push(ep);
  }
  if (!paths.length) return;
  const unique = [...new Set(paths)];
  const result = await window.api.describeApps(unique);
  for (const ep of unique) {
    nameCache.set(ep, (result && result[ep]) || null);
  }
}

/* ===================== Process table (grouped, incremental) ===================== */
const rowElems = new Map(); // rowKey -> tr
const groupExpanded = new Set(); // group keys currently expanded

function groupKeyFor(p) {
  const exePath = buildExePath(p);
  return exePath || `name:${(p.name || 'unknown').toLowerCase()}`;
}

function computeMetrics(p) {
  // Windows reports "cpu" for the idle process as free capacity, not usage — zero it out
  // here so it can't look like a hog and can't dominate CPU-sorted views.
  const cpu = isIdleProcess(p) ? 0 : clamp(p.cpu || 0, 0, 100);
  const mem = clamp(p.memRss ? (p.memRss / (lastSnapshot.mem.total / 1024)) : (p.pmem || 0), 0, 100);
  const memBytes = p.memRss ? p.memRss * 1024 : (lastSnapshot.mem.total * (p.pmem || 0) / 100);
  return { cpu, mem, memBytes };
}

function buildGroups(list) {
  const map = new Map();
  for (const p of list) {
    const key = groupKeyFor(p);
    if (!map.has(key)) map.set(key, { key, exePath: buildExePath(p), rawName: p.name, members: [] });
    map.get(key).members.push(p);
  }
  return [...map.values()];
}

function aggregateGroup(g) {
  let cpu = 0, memBytes = 0;
  for (const m of g.members) {
    const met = computeMetrics(m);
    cpu += met.cpu;
    memBytes += met.memBytes;
  }
  const mem = clamp((memBytes / lastSnapshot.mem.total) * 100, 0, 100);
  return { cpu, memBytes, mem };
}

function warnClass(v) { return v > 60 ? 'hot' : v > 30 ? 'warn' : ''; }

function connCountFor(pid) {
  return connCounts.get(String(pid)) || 0;
}
function connCellHtml(count) {
  return `<span class="conn-cell${count > 0 ? ' has-conn' : ''}">${count > 0 ? count : '--'}</span>`;
}

function isEcoGroup(g) {
  return g.members.every((m) => (m.priority || 8) <= 4);
}

function idleCellHtml(rawCpu) {
  const free = Math.round(clamp(rawCpu || 0, 0, 100));
  return `<span class="idle-pill" title="Windows reports this as free CPU capacity, not usage — System Idle Process is not a real workload and can't be closed.">Idle · ${free}% free</span>`;
}

function buildGroupRow(tr, g) {
  tr.classList.add('proc-group-row');
  const multi = g.members.length > 1;
  const solo = g.members[0];
  const idle = !multi && isIdleProcess(solo);
  const pidCell = multi ? `${g.members.length} instances` : solo.pid;
  const stateCell = multi
    ? '<span class="state-pill">--</span>'
    : `<span class="state-pill ${(solo.state || 'unknown').toLowerCase()}">${(solo.state || 'unknown').toLowerCase()}</span>`;
  const priorityCell = multi ? '--' : (solo.priority ?? '--');
  const connCount = g.members.reduce((sum, m) => sum + connCountFor(m.pid), 0);
  const eco = isEcoGroup(g);
  const nameAttr = escapeHtml(g.name);
  const ecoBtn = multi
    ? `<button class="eco-btn${eco ? ' is-eco' : ''}" data-groupkey="${escapeHtml(g.key)}" data-name="${nameAttr}" data-eco="${eco}">${eco ? 'Eco' : 'Eco Mode'}</button>`
    : `<button class="eco-btn${eco ? ' is-eco' : ''}" data-pid="${solo.pid}" data-name="${nameAttr}" data-eco="${eco}">${eco ? 'Eco' : 'Eco Mode'}</button>`;
  const killBtn = multi
    ? `<button class="kill-btn" data-groupkey="${escapeHtml(g.key)}" data-name="${nameAttr}">End All</button>`
    : `<button class="kill-btn" data-pid="${solo.pid}" data-name="${nameAttr}" ${idle ? 'disabled title="System Idle Process can\'t be closed"' : ''}>End Task</button>`;
  const cpuCellInner = idle
    ? idleCellHtml(solo.cpu)
    : `<div class="bar-cell"><div class="bar-track"><div class="bar-fill ${warnClass(g.cpu)}" style="width:${clamp(g.cpu, 0, 100)}%"></div></div><span class="cpu-text">${g.cpu.toFixed(1)}%</span></div>`;

  tr.innerHTML = `
    <td><div class="proc-name">
      ${multi ? `<button class="group-toggle" data-groupkey="${escapeHtml(g.key)}">${groupExpanded.has(g.key) ? '▾' : '▸'}</button>` : `<span class="group-toggle-spacer"></span>`}
      <span class="proc-icon">${iconLetter(g.rawName)}</span>
      <span class="proc-name-text">${nameAttr}</span>
      <span class="badge-slot"></span>
      ${multi ? `<span class="group-count">×${g.members.length}</span>` : ''}
    </div></td>
    <td class="pid-cell">${pidCell}</td>
    <td class="state-cell">${stateCell}</td>
    <td class="cpu-td">${cpuCellInner}</td>
    <td class="mem-td"><div class="bar-cell"><div class="bar-track"><div class="bar-fill ${warnClass(g.mem)}" style="width:${clamp(g.mem, 0, 100)}%"></div></div><span class="mem-text">${fmtBytes(g.memBytes)}</span></div></td>
    <td>${priorityCell}</td>
    <td class="conn-td">${connCellHtml(connCount)}</td>
    <td>${ecoBtn}${killBtn}</td>
  `;
  getIcon(g.exePath).then((url) => {
    if (!url) return;
    const iconEl = tr.querySelector('.proc-icon');
    if (iconEl) iconEl.innerHTML = `<img src="${url}" alt="" />`;
  });
  updateBadgeSlot(tr, g.exePath);
}

function updateBadgeSlot(tr, exePath) {
  const slot = tr.querySelector('.badge-slot');
  if (!slot) return;
  const info = appInfo(exePath);
  slot.innerHTML = info ? verifyBadgeHtml(exePath) : '';
}

function updateGroupRow(tr, g) {
  const multi = g.members.length > 1;
  const solo = g.members[0];
  const idle = !multi && isIdleProcess(solo);

  const cpuTd = tr.querySelector('.cpu-td');
  if (cpuTd) {
    if (idle) {
      cpuTd.innerHTML = idleCellHtml(solo.cpu);
    } else if (cpuTd.querySelector('.cpu-text')) {
      const cpuCell = cpuTd.querySelector('.cpu-text');
      const cpuBar = cpuTd.querySelector('.bar-fill');
      cpuCell.textContent = `${g.cpu.toFixed(1)}%`;
      cpuBar.style.width = `${clamp(g.cpu, 0, 100)}%`;
      cpuBar.classList.toggle('hot', g.cpu > 60);
      cpuBar.classList.toggle('warn', g.cpu > 30 && g.cpu <= 60);
    } else {
      // was idle, is no longer (e.g. re-sorted onto a different pid) — rebuild as a normal bar
      cpuTd.innerHTML = `<div class="bar-cell"><div class="bar-track"><div class="bar-fill ${warnClass(g.cpu)}" style="width:${clamp(g.cpu, 0, 100)}%"></div></div><span class="cpu-text">${g.cpu.toFixed(1)}%</span></div>`;
    }
  }

  const memCell = tr.querySelector('.mem-td .mem-text');
  const memBar = tr.querySelector('.mem-td .bar-fill');
  if (memCell) memCell.textContent = fmtBytes(g.memBytes);
  if (memBar) {
    memBar.style.width = `${clamp(g.mem, 0, 100)}%`;
    memBar.classList.toggle('hot', g.mem > 60);
    memBar.classList.toggle('warn', g.mem > 30 && g.mem <= 60);
  }
  const pidCell = tr.querySelector('.pid-cell');
  if (pidCell) pidCell.textContent = multi ? `${g.members.length} instances` : g.members[0].pid;
  const nameText = tr.querySelector('.proc-name-text');
  if (nameText && nameText.textContent !== g.name) nameText.textContent = g.name;
  const countBadge = tr.querySelector('.group-count');
  if (countBadge) countBadge.textContent = `×${g.members.length}`;
  const toggleBtn = tr.querySelector('.group-toggle');
  if (toggleBtn) toggleBtn.textContent = groupExpanded.has(g.key) ? '▾' : '▸';
  const connCount = g.members.reduce((sum, m) => sum + connCountFor(m.pid), 0);
  const connTd = tr.querySelector('.conn-td');
  if (connTd) connTd.innerHTML = connCellHtml(connCount);
  const ecoBtn = tr.querySelector('.eco-btn');
  if (ecoBtn) {
    const eco = isEcoGroup(g);
    ecoBtn.classList.toggle('is-eco', eco);
    ecoBtn.dataset.eco = eco;
    ecoBtn.textContent = eco ? 'Eco' : 'Eco Mode';
  }
  updateBadgeSlot(tr, g.exePath);
}

function buildChildRow(tr, p, g) {
  tr.classList.add('proc-child-row');
  const met = computeMetrics(p);
  const state = (p.state || 'unknown').toLowerCase();
  const eco = (p.priority || 8) <= 4;
  const nameAttr = `${escapeHtml(g.name)} (PID ${p.pid})`;
  tr.innerHTML = `
    <td><div class="proc-name child-indent"><span class="proc-icon small">${iconLetter(p.name)}</span><span class="proc-name-text">PID ${p.pid}</span></div></td>
    <td class="pid-cell">${p.pid}</td>
    <td class="state-cell"><span class="state-pill ${state}">${state}</span></td>
    <td><div class="bar-cell"><div class="bar-track"><div class="bar-fill ${warnClass(met.cpu)}" style="width:${clamp(met.cpu, 0, 100)}%"></div></div><span class="cpu-text">${met.cpu.toFixed(1)}%</span></div></td>
    <td><div class="bar-cell"><div class="bar-track"><div class="bar-fill ${warnClass(met.mem)}" style="width:${clamp(met.mem, 0, 100)}%"></div></div><span class="mem-text">${fmtBytes(met.memBytes)}</span></div></td>
    <td>${p.priority ?? '--'}</td>
    <td class="conn-td">${connCellHtml(connCountFor(p.pid))}</td>
    <td><button class="eco-btn${eco ? ' is-eco' : ''}" data-pid="${p.pid}" data-name="${nameAttr}" data-eco="${eco}">${eco ? 'Eco' : 'Eco Mode'}</button><button class="kill-btn" data-pid="${p.pid}" data-name="${nameAttr}">End Task</button></td>
  `;
  const iconEl = tr.querySelector('.proc-icon');
  getIcon(g.exePath).then((url) => { if (url && iconEl) iconEl.innerHTML = `<img src="${url}" alt="" />`; });
}

function updateChildRow(tr, p) {
  const met = computeMetrics(p);
  const cpuCell = tr.querySelector('.cpu-text');
  const memCell = tr.querySelector('.mem-text');
  const bars = tr.querySelectorAll('.bar-fill');
  if (cpuCell) cpuCell.textContent = `${met.cpu.toFixed(1)}%`;
  if (memCell) memCell.textContent = fmtBytes(met.memBytes);
  if (bars[0]) {
    bars[0].style.width = `${clamp(met.cpu, 0, 100)}%`;
    bars[0].classList.toggle('hot', met.cpu > 60);
    bars[0].classList.toggle('warn', met.cpu > 30 && met.cpu <= 60);
  }
  if (bars[1]) {
    bars[1].style.width = `${clamp(met.mem, 0, 100)}%`;
    bars[1].classList.toggle('hot', met.mem > 60);
    bars[1].classList.toggle('warn', met.mem > 30 && met.mem <= 60);
  }
  const connTd = tr.querySelector('.conn-td');
  if (connTd) connTd.innerHTML = connCellHtml(connCountFor(p.pid));
  const ecoBtn = tr.querySelector('.eco-btn');
  if (ecoBtn) {
    const eco = (p.priority || 8) <= 4;
    ecoBtn.classList.toggle('is-eco', eco);
    ecoBtn.dataset.eco = eco;
    ecoBtn.textContent = eco ? 'Eco' : 'Eco Mode';
  }
}

function renderProcesses(list) {
  let filtered = list;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = list.filter((p) => {
      const info = appInfo(buildExePath(p));
      const friendly = (info && info.desc) || '';
      return (p.name || '').toLowerCase().includes(q) || friendly.toLowerCase().includes(q) || String(p.pid).includes(q);
    });
  }

  const groups = buildGroups(filtered).map((g) => ({
    ...g,
    ...aggregateGroup(g),
    name: displayName(g.rawName, g.exePath),
  }));

  groups.sort((a, b) => {
    const dir = sortState.dir === 'asc' ? 1 : -1;
    const key = sortState.key;
    if (key === 'name') {
      const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
      return an < bn ? -1 * dir : an > bn ? 1 * dir : 0;
    }
    if (key === 'pid') {
      const ap = Math.min(...a.members.map((m) => m.pid));
      const bp = Math.min(...b.members.map((m) => m.pid));
      return (ap - bp) * dir;
    }
    if (key === 'cpu') return (a.cpu - b.cpu) * dir;
    if (key === 'mem') return (a.memBytes - b.memBytes) * dir;
    if (key === 'priority') return ((a.members[0].priority || 0) - (b.members[0].priority || 0)) * dir;
    return 0;
  });

  const running = list.filter((p) => p.state === 'running').length;
  document.getElementById('proc-count').textContent = `${list.length} processes · ${groups.length} apps`;
  document.getElementById('proc-running').textContent = `${running} running`;

  const visible = [];
  for (const g of groups) {
    visible.push({ type: 'group', group: g });
    if (g.members.length > 1 && groupExpanded.has(g.key)) {
      const sortedMembers = [...g.members].sort((a, b) => (b.cpu || 0) - (a.cpu || 0));
      for (const m of sortedMembers) visible.push({ type: 'child', proc: m, group: g });
    }
  }

  const tbody = document.getElementById('proc-tbody');
  const seenKeys = new Set();

  visible.forEach((v, idx) => {
    const rowKey = v.type === 'group' ? `g:${v.group.key}` : `c:${v.proc.pid}`;
    seenKeys.add(rowKey);
    let tr = rowElems.get(rowKey);

    if (!tr) {
      tr = document.createElement('tr');
      tr.className = 'row-new';
      rowElems.set(rowKey, tr);
      setTimeout(() => tr.classList.remove('row-new'), 450);
      if (v.type === 'group') buildGroupRow(tr, v.group);
      else buildChildRow(tr, v.proc, v.group);
    } else if (v.type === 'group') {
      updateGroupRow(tr, v.group);
    } else {
      updateChildRow(tr, v.proc);
    }

    const current = tbody.children[idx];
    if (current !== tr) tbody.insertBefore(tr, current || null);
  });

  for (const [key, tr] of rowElems) {
    if (!seenKeys.has(key)) {
      tr.classList.add('row-leaving');
      setTimeout(() => tr.remove(), 260);
      rowElems.delete(key);
    }
  }
}

document.getElementById('proc-tbody').addEventListener('click', async (e) => {
  const toggleBtn = e.target.closest('.group-toggle');
  if (toggleBtn) {
    const key = toggleBtn.dataset.groupkey;
    if (groupExpanded.has(key)) groupExpanded.delete(key); else groupExpanded.add(key);
    if (lastSnapshot) renderProcesses(lastSnapshot.processes.list);
    return;
  }

  const ecoBtn = e.target.closest('.eco-btn');
  if (ecoBtn) {
    const turningOn = ecoBtn.dataset.eco !== 'true';
    const level = turningOn ? 'Idle' : 'Normal';
    const name = ecoBtn.dataset.name;
    let pids;
    if (ecoBtn.dataset.groupkey) {
      pids = lastSnapshot.processes.list.filter((p) => groupKeyFor(p) === ecoBtn.dataset.groupkey).map((p) => p.pid);
    } else {
      pids = [ecoBtn.dataset.pid];
    }
    ecoBtn.disabled = true;
    const results = await Promise.all(pids.map((pid) => window.api.setPriority(pid, level)));
    ecoBtn.disabled = false;
    const failed = results.filter((r) => !r.ok).length;
    if (failed) {
      toast(`Couldn't change priority for ${failed}/${pids.length} process(es)`);
    } else {
      toast(turningOn ? `Eco Mode on for ${name}` : `Eco Mode off for ${name}`);
    }
    return;
  }

  const btn = e.target.closest('.kill-btn');
  if (!btn) return;
  const name = btn.dataset.name;

  if (btn.dataset.groupkey) {
    const groupKey = btn.dataset.groupkey;
    const pids = lastSnapshot.processes.list.filter((p) => groupKeyFor(p) === groupKey).map((p) => p.pid);
    const ok = await confirmAction('End all instances?', `All ${pids.length} running instances of ${name} will be force-closed immediately. Unsaved work may be lost.`);
    if (!ok) return;
    btn.textContent = '...';
    btn.disabled = true;
    const results = await Promise.all(pids.map((pid) => window.api.killProcess(pid)));
    const failed = results.filter((r) => !r.ok).length;
    toast(failed ? `Ended ${pids.length - failed}/${pids.length} instances of ${name}` : `Ended all ${pids.length} instances of ${name}`);
    return;
  }

  const pid = btn.dataset.pid;
  const ok = await confirmAction('End this task?', `${name} will be force-closed immediately. Unsaved work in that app may be lost.`);
  if (!ok) return;
  btn.textContent = '...';
  btn.disabled = true;
  const res = await window.api.killProcess(pid);
  if (res.ok) {
    toast(`Ended ${name}`);
  } else {
    toast(`Failed to end ${name}: ${res.error || 'unknown error'}`);
    btn.textContent = 'End Task';
    btn.disabled = false;
  }
});

document.getElementById('proc-search').addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  if (lastSnapshot) renderProcesses(lastSnapshot.processes.list);
});

document.querySelectorAll('.proc-table th.sortable').forEach((th) => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (sortState.key === key) {
      sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    } else {
      sortState = { key, dir: 'desc' };
    }
    document.querySelectorAll('.proc-table th').forEach((h) => h.classList.remove('sorted-asc', 'sorted-desc'));
    th.classList.add(sortState.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
    if (lastSnapshot) renderProcesses(lastSnapshot.processes.list);
  });
});

/* ===================== Insight banner ===================== */
let lastInsightPid = null;
function updateInsightBanner(snap) {
  const banner = document.getElementById('insight-banner');
  const list = snap.processes.list.filter((p) => p.name && !isIdleProcess(p));
  const top = [...list].sort((a, b) => (b.cpu || 0) - (a.cpu || 0))[0];

  if (!top || (top.cpu || 0) < 55) {
    banner.style.display = 'none';
    lastInsightPid = null;
    return;
  }

  banner.style.display = 'flex';
  const friendly = friendlyProcessName(top);
  document.getElementById('insight-text').innerHTML =
    `<b>${escapeHtml(friendly)}</b> is using <b>${(top.cpu).toFixed(0)}%</b> CPU right now — closing it could free up your system.`;
  const actionBtn = document.getElementById('insight-action');
  actionBtn.dataset.pid = top.pid;
  actionBtn.dataset.name = friendly;
  if (top.pid !== lastInsightPid) {
    banner.style.animation = 'none';
    void banner.offsetWidth;
    banner.style.animation = '';
  }
  lastInsightPid = top.pid;
}
document.getElementById('insight-action').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const pid = btn.dataset.pid, name = btn.dataset.name;
  const ok = await confirmAction('End this task?', `${name} (PID ${pid}) will be force-closed immediately. Unsaved work in that app may be lost.`);
  if (!ok) return;
  const res = await window.api.killProcess(pid);
  toast(res.ok ? `Ended ${name}` : `Failed to end ${name}: ${res.error || 'unknown error'}`);
});

/* ===================== Performance tab ===================== */
document.querySelectorAll('.perf-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.perf-item').forEach((i) => i.classList.remove('active'));
    item.classList.add('active');
    activePerfMetric = item.dataset.metric;
    updatePerfDetail();
  });
});

document.querySelectorAll('.range-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.range-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    chartRange = btn.dataset.range;
    updatePerfDetail();
  });
});

function activeHistory(key) {
  return chartRange === 'hour' ? historyHour[key] : history[key];
}

function drawSparkline(canvas, data, color) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(...data, 1);
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + '55');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fill();
}

function drawRing(canvas, pct, color) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2, r = w / 2 - 3;
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 3;
  ctx.stroke();

  const frac = clamp(pct, 0, 100) / 100;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 5;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawMainChart(data, color) {
  const canvas = document.getElementById('perf-main-chart');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const max = Math.max(...data, 1);
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * (h - 10) - 5;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + '40');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fill();
}

function updatePerfDetail() {
  if (!lastSnapshot) return;
  const colorVar = { cpu: '--accent', memory: '--accent-2', disk: '--accent-3', network: '--good' };
  const color = cssVar(colorVar[activePerfMetric]);

  const titles = { cpu: 'CPU', memory: 'Memory', disk: 'Disk', network: 'Network' };
  document.getElementById('perf-title').textContent = titles[activePerfMetric];

  const { load, mem, disksIO, netStats } = lastSnapshot;
  const cores = document.getElementById('perf-cores');
  const metricsGrid = document.getElementById('perf-metrics-grid');

  if (activePerfMetric === 'cpu') {
    document.getElementById('perf-subtitle').textContent = `${staticInfo.cpu.manufacturer} ${staticInfo.cpu.brand}`;
    cores.style.display = 'grid';
    metricsGrid.innerHTML = statRows([
      ['Utilization', fmtPct(load.currentLoad)],
      ['Speed', `${staticInfo.cpu.speed} GHz`],
      ['Processes', lastSnapshot.processes.all],
      ['Sleeping', lastSnapshot.processes.sleeping ?? '--'],
      ['Up time', fmtUptime(lastSnapshot.time.uptime)],
      ['Temperature', lastSnapshot.temp.main != null ? `${Math.round(lastSnapshot.temp.main)}°C` : 'N/A'],
    ]);
    drawMainChart(activeHistory('cpu'), color);
  } else if (activePerfMetric === 'memory') {
    document.getElementById('perf-subtitle').textContent = `${fmtBytes(mem.total)} total`;
    cores.style.display = 'none';
    metricsGrid.innerHTML = statRows([
      ['In use', fmtBytes(mem.active)],
      ['Available', fmtBytes(mem.available)],
      ['Total', fmtBytes(mem.total)],
      ['Cached', fmtBytes(mem.cached || 0)],
      ['Swap used', fmtBytes(mem.swapused || 0)],
      ['Swap total', fmtBytes(mem.swaptotal || 0)],
    ]);
    drawMainChart(activeHistory('memory'), color);
  } else if (activePerfMetric === 'disk') {
    document.getElementById('perf-subtitle').textContent = 'Read + write activity';
    cores.style.display = 'none';
    const fs = lastSnapshot.fsSize && lastSnapshot.fsSize[0];
    metricsGrid.innerHTML = statRows([
      ['Read', fmtRate(disksIO && disksIO.rIO_sec)],
      ['Write', fmtRate(disksIO && disksIO.wIO_sec)],
      ['Capacity', fs ? fmtBytes(fs.size) : '--'],
      ['Used', fs ? `${fs.use.toFixed(0)}%` : '--'],
    ]);
    drawMainChart(activeHistory('disk'), color);
  } else if (activePerfMetric === 'network') {
    const totalRx = sumNet(netStats, 'rx_sec');
    const totalTx = sumNet(netStats, 'tx_sec');
    document.getElementById('perf-subtitle').textContent = `${fmtRate(totalRx)} down / ${fmtRate(totalTx)} up`;
    cores.style.display = 'none';
    metricsGrid.innerHTML = statRows([
      ['Download', fmtRate(totalRx)],
      ['Upload', fmtRate(totalTx)],
      ['Interfaces', netStats.length],
    ]);
    drawMainChart(activeHistory('network'), color);
  }

  renderTopConsumers();
}

function statRows(pairs) {
  return pairs.map(([l, v]) => `<div class="stat-row"><span class="s-label">${l}</span><span class="s-val">${v}</span></div>`).join('');
}

function renderTopConsumers() {
  const container = document.getElementById('perf-top-consumers');
  if (!lastSnapshot) { container.innerHTML = ''; return; }

  if (activePerfMetric !== 'cpu' && activePerfMetric !== 'memory') {
    container.innerHTML = `<div class="ptc-heading">Top Consumers</div><div class="ptc-empty">Per-process ${activePerfMetric} usage isn't exposed by Windows.</div>`;
    return;
  }

  const label = activePerfMetric === 'cpu' ? 'CPU' : 'Memory';
  const list = lastSnapshot.processes.list.filter((p) => p.name && !isIdleProcess(p));
  const withMetrics = list.map((p) => ({ p, met: computeMetrics(p) }));
  withMetrics.sort((a, b) => activePerfMetric === 'cpu' ? b.met.cpu - a.met.cpu : b.met.memBytes - a.met.memBytes);
  const top = withMetrics.slice(0, 5);
  const max = Math.max(...top.map((x) => activePerfMetric === 'cpu' ? x.met.cpu : x.met.memBytes), 1);

  container.innerHTML = `<div class="ptc-heading">Top ${label} Consumers</div>` + top.map(({ p, met }) => {
    const val = activePerfMetric === 'cpu' ? `${met.cpu.toFixed(1)}%` : fmtBytes(met.memBytes);
    const frac = (activePerfMetric === 'cpu' ? met.cpu : met.memBytes) / max;
    return `
      <div class="ptc-row" data-pid="${p.pid}">
        <div class="ptc-icon">${iconLetter(p.name)}</div>
        <div class="ptc-info">
          <div class="ptc-name">${escapeHtml(friendlyProcessName(p))}</div>
          <div class="ptc-track"><div class="ptc-fill" style="width:${clamp(frac * 100, 2, 100)}%"></div></div>
        </div>
        <div class="ptc-val">${val}</div>
      </div>`;
  }).join('');

  container.querySelectorAll('.ptc-row').forEach((row) => {
    const pid = row.dataset.pid;
    const entry = top.find((x) => String(x.p.pid) === pid);
    if (!entry) return;
    getIcon(buildExePath(entry.p)).then((url) => {
      if (!url) return;
      const iconEl = row.querySelector('.ptc-icon');
      if (iconEl) iconEl.innerHTML = `<img src="${url}" alt="" />`;
    });
  });
}

function sumNet(netStats, key) {
  return (netStats || []).reduce((sum, n) => sum + (n[key] || 0), 0);
}

/* ===================== Startup tab ===================== */
async function loadStartup() {
  const tbody = document.getElementById('startup-tbody');
  tbody.innerHTML = `<tr><td colspan="6" style="color:var(--muted); padding:16px;">Loading startup apps...</td></tr>`;
  startupCache = await window.api.listStartup();
  renderStartup();
}

function extractExePath(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1);
    if (end > 0) return trimmed.slice(1, end);
  }
  const match = trimmed.match(/^\S+\.exe/i);
  return match ? match[0] : (trimmed.split(' ')[0] || null);
}

function estimateImpact(entry) {
  const exePath = extractExePath(entry.value);
  if (!exePath || !lastSnapshot) return { label: 'Unknown', cls: 'unknown' };
  const lower = exePath.toLowerCase();
  const running = lastSnapshot.processes.list.find((p) => {
    const bp = buildExePath(p);
    return bp && bp.toLowerCase() === lower;
  });
  if (!running) return { label: 'Not running', cls: 'unknown' };
  const met = computeMetrics(running);
  if (met.cpu > 5 || met.mem > 5) return { label: 'High', cls: 'high' };
  if (met.cpu > 1 || met.mem > 1.5) return { label: 'Medium', cls: 'medium' };
  return { label: 'Low', cls: 'low' };
}

function renderStartup() {
  const tbody = document.getElementById('startup-tbody');
  document.getElementById('startup-count').textContent = `${startupCache.length} apps`;
  document.getElementById('startup-enabled-count').textContent = `${startupCache.filter((e) => e.enabled).length} enabled`;

  if (!startupCache.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--muted); padding:16px;">No startup apps found.</td></tr>`;
    return;
  }

  tbody.innerHTML = startupCache.map((e, idx) => {
    const impact = estimateImpact(e);
    return `
    <tr class="row-new">
      <td>${escapeHtml(e.name)}</td>
      <td>${escapeHtml(e.source)}</td>
      <td class="cmd-cell" title="${escapeHtml(e.value)}">${escapeHtml(e.value)}</td>
      <td><span class="impact-badge ${impact.cls}" title="Estimated from current CPU/memory usage if this app happens to be running right now">${impact.label}</span></td>
      <td><span class="state-pill ${e.enabled ? 'enabled' : 'disabled'}">${e.enabled ? 'Enabled' : 'Disabled'}</span></td>
      <td class="startup-actions">${
        e.editable
          ? `<button class="startup-toggle ${e.enabled ? 'is-on' : 'is-off'}" data-idx="${idx}">${e.enabled ? 'Disable' : 'Enable'}</button>`
          : `<button class="startup-toggle" disabled title="Requires administrator privileges">Admin only</button>`
      }<button class="settings-link-btn" data-uninstall="1" title="Open Windows' Apps &amp; Features so you can uninstall it there">Uninstall…</button></td>
    </tr>`;
  }).join('');
}

document.getElementById('startup-tbody').addEventListener('click', async (e) => {
  const settingsBtn = e.target.closest('.settings-link-btn');
  if (settingsBtn) {
    await window.api.openAppsSettings();
    toast('Opening Windows Settings — find the app there to uninstall it');
    return;
  }

  const btn = e.target.closest('.startup-toggle');
  if (!btn || btn.disabled) return;
  const idx = Number(btn.dataset.idx);
  const entry = startupCache[idx];
  if (!entry) return;

  const disabling = entry.enabled;
  const ok = await confirmAction(
    disabling ? 'Disable this startup app?' : 'Enable this startup app?',
    disabling
      ? `${entry.name} will no longer launch automatically when you sign in. You can re-enable it anytime.`
      : `${entry.name} will launch automatically the next time you sign in.`
  );
  if (!ok) return;

  btn.disabled = true;
  btn.textContent = '...';
  const res = await window.api.toggleStartup(entry);
  if (res.ok) {
    toast(`${entry.name} ${res.enabled ? 'enabled' : 'disabled'}`);
    await loadStartup();
  } else {
    toast(res.error || 'Failed to update startup entry');
    btn.disabled = false;
    btn.textContent = disabling ? 'Disable' : 'Enable';
  }
});

/* ===================== Devices tab ===================== */
let deviceCache = [];
let deviceSearch = '';
const deviceClassExpanded = new Set();

async function loadDevices() {
  const tbody = document.getElementById('device-tbody');
  tbody.innerHTML = `<tr><td colspan="3" style="color:var(--muted); padding:16px;">Scanning devices...</td></tr>`;
  deviceCache = await window.api.listDevices();
  renderDevices();
}

function deviceStatusInfo(d) {
  if (d.Present === false) return { label: 'Not present', cls: 'disabled' };
  const code = d.ConfigManagerErrorCode;
  if (code === 0) return { label: 'OK', cls: 'enabled' };
  if (code === 22) return { label: 'Disabled', cls: 'disabled' };
  return { label: 'Problem', cls: 'problem' };
}

function renderDevices() {
  const tbody = document.getElementById('device-tbody');
  let list = deviceCache;
  if (deviceSearch) {
    const q = deviceSearch.toLowerCase();
    list = list.filter((d) => (d.FriendlyName || '').toLowerCase().includes(q) || (d.Class || '').toLowerCase().includes(q));
  }

  document.getElementById('device-count').textContent = `${deviceCache.length} devices`;
  const problemCount = deviceCache.filter((d) => deviceStatusInfo(d).cls === 'problem').length;
  document.getElementById('device-problem-count').textContent = `${problemCount} with problems`;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="3" style="color:var(--muted); padding:16px;">No devices found.</td></tr>`;
    return;
  }

  const groups = new Map();
  for (const d of list) {
    const cls = d.Class || 'Other';
    if (!groups.has(cls)) groups.set(cls, []);
    groups.get(cls).push(d);
  }
  const sortedClasses = [...groups.keys()].sort((a, b) => a.localeCompare(b));

  const rows = [];
  sortedClasses.forEach((cls) => {
    const devices = groups.get(cls).sort((a, b) => (a.FriendlyName || '').localeCompare(b.FriendlyName || ''));
    const expanded = deviceClassExpanded.has(cls) || !!deviceSearch;
    const hasProblem = devices.some((d) => deviceStatusInfo(d).cls === 'problem');
    rows.push(`
      <tr class="device-class-row">
        <td><div class="proc-name">
          <button class="group-toggle" data-classkey="${escapeHtml(cls)}">${expanded ? '▾' : '▸'}</button>
          <span class="proc-name-text">${escapeHtml(cls)}</span>
          <span class="group-count">${devices.length}</span>
        </div></td>
        <td>${hasProblem ? '<span class="state-pill problem">Problem</span>' : ''}</td>
        <td></td>
      </tr>`);
    if (expanded) {
      devices.forEach((d) => {
        const status = deviceStatusInfo(d);
        const canToggle = d.Present !== false;
        const isDisabled = status.cls === 'disabled';
        const name = escapeHtml(d.FriendlyName || d.InstanceId || 'Unknown device');
        rows.push(`
          <tr class="proc-child-row">
            <td><div class="proc-name child-indent"><span class="proc-name-text">${name}</span></div></td>
            <td><span class="state-pill ${status.cls}">${status.label}</span></td>
            <td><div class="device-actions">
              <button class="settings-link-btn" data-action="props" data-id="${escapeHtml(d.InstanceId)}">Properties</button>
              ${canToggle ? `<button class="startup-toggle ${isDisabled ? 'is-off' : 'is-on'}" data-action="toggle" data-id="${escapeHtml(d.InstanceId)}" data-enable="${isDisabled}" data-name="${name}">${isDisabled ? 'Enable' : 'Disable'}</button>` : ''}
              <button class="settings-link-btn" data-action="uninstall" data-id="${escapeHtml(d.InstanceId)}" data-name="${name}">Uninstall</button>
            </div></td>
          </tr>`);
      });
    }
  });

  tbody.innerHTML = rows.join('');
}

document.getElementById('device-tbody').addEventListener('click', async (e) => {
  const toggleGroup = e.target.closest('.group-toggle');
  if (toggleGroup) {
    const cls = toggleGroup.dataset.classkey;
    if (deviceClassExpanded.has(cls)) deviceClassExpanded.delete(cls); else deviceClassExpanded.add(cls);
    renderDevices();
    return;
  }

  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const name = btn.dataset.name;

  if (action === 'props') {
    await window.api.openDeviceProperties(id);
    return;
  }

  if (action === 'toggle') {
    const enable = btn.dataset.enable === 'true';
    const ok = await confirmAction(
      enable ? 'Enable this device?' : 'Disable this device?',
      enable
        ? `${name} will be re-enabled. Windows will ask you to confirm this with an administrator prompt.`
        : `${name} will stop working until re-enabled. This requires administrator permission — Windows will prompt you. Don't disable a device you're not sure about, like your main display or network adapter.`
    );
    if (!ok) return;
    btn.disabled = true;
    btn.textContent = 'Waiting for permission...';
    const res = await window.api.toggleDevice(id, enable);
    if (res.ok) {
      toast(`${name} ${enable ? 'enabled' : 'disabled'}`);
      await loadDevices();
    } else {
      toast(res.error || 'Failed to change device state');
      btn.disabled = false;
      btn.textContent = enable ? 'Enable' : 'Disable';
    }
    return;
  }

  if (action === 'uninstall') {
    const ok = await confirmAction(
      'Uninstall this device?',
      `${name} will be removed from Windows and will need to be reconnected or reinstalled to work again. This requires administrator permission — Windows will prompt you.`
    );
    if (!ok) return;
    btn.disabled = true;
    btn.textContent = 'Waiting for permission...';
    const res = await window.api.uninstallDevice(id);
    if (res.ok) {
      toast(`${name} uninstalled`);
      await loadDevices();
    } else {
      toast(res.error || 'Failed to uninstall device');
      btn.disabled = false;
      btn.textContent = 'Uninstall';
    }
    return;
  }
});

document.getElementById('device-search').addEventListener('input', (e) => {
  deviceSearch = e.target.value.trim();
  renderDevices();
});

document.getElementById('device-scan-btn').addEventListener('click', async () => {
  const btn = document.getElementById('device-scan-btn');
  btn.disabled = true;
  btn.textContent = 'Waiting for permission...';
  const res = await window.api.scanDevices();
  toast(res.ok ? 'Scan complete' : (res.error || 'Scan failed or was cancelled'));
  btn.disabled = false;
  btn.textContent = 'Scan for changes';
  await loadDevices();
});

document.getElementById('device-manager-btn').addEventListener('click', () => {
  window.api.openDeviceManager();
});

/* ===================== Optimize tab ===================== */
function optLog(msg, ok = true) {
  const el = document.getElementById('opt-log');
  const line = document.createElement('div');
  line.className = ok ? 'log-ok' : 'log-fail';
  const time = new Date();
  const stamp = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}`;
  line.textContent = `${stamp} — ${msg}`;
  el.prepend(line);
  while (el.children.length > 8) el.removeChild(el.lastChild);
}

async function refreshOptimizeStatic() {
  const tempInfo = await window.api.getTempInfo();
  const prefix = tempInfo.truncated ? 'At least ' : '';
  document.getElementById('opt-tempinfo').textContent =
    `${prefix}${tempInfo.files} files using ${fmtBytes(tempInfo.bytes)}${tempInfo.truncated ? '+' : ''} in your temp folder.`;
  document.getElementById('opt-btn-temp').dataset.bytes = tempInfo.bytes;
}

function refreshOptimizeLive() {
  if (!lastSnapshot) return;
  const list = lastSnapshot.processes.list.filter((p) => p.name && !isIdleProcess(p));
  const top = [...list].sort((a, b) => (b.cpu || 0) - (a.cpu || 0))[0];
  if (top) {
    const friendly = friendlyProcessName(top);
    document.getElementById('opt-tophog').textContent =
      `${friendly} is using ${(top.cpu || 0).toFixed(1)}% CPU (PID ${top.pid}).`;
    const btn = document.getElementById('opt-btn-tophog');
    btn.disabled = false;
    btn.dataset.pid = top.pid;
    btn.dataset.name = friendly;
  }
  const memPct = (lastSnapshot.mem.active / lastSnapshot.mem.total) * 100;
  document.getElementById('opt-meminfo').textContent =
    `${fmtPct(memPct)} of ${fmtBytes(lastSnapshot.mem.total)} RAM in use.`;

  const enabledCount = startupCache.filter((e) => e.enabled).length;
  document.getElementById('opt-startupinfo').textContent =
    startupCache.length
      ? `${enabledCount} app${enabledCount === 1 ? '' : 's'} launch at sign-in.`
      : 'Open Startup to review launch apps.';
}

document.getElementById('opt-btn-tophog').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const pid = btn.dataset.pid, name = btn.dataset.name;
  if (!pid) return;
  const ok = await confirmAction('End this task?', `${name} (PID ${pid}) will be force-closed immediately. Unsaved work in that app may be lost.`);
  if (!ok) return;
  const res = await window.api.killProcess(pid);
  optLog(res.ok ? `Ended ${name} (PID ${pid})` : `Failed to end ${name}: ${res.error}`, res.ok);
  if (res.ok) toast(`Ended ${name}`);
});

document.getElementById('opt-btn-temp').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const bytes = Number(btn.dataset.bytes || 0);
  const ok = await confirmAction('Clear temporary files?', `This permanently deletes files in your user temp folder (currently ${fmtBytes(bytes)}). Files still in use will be skipped automatically.`);
  if (!ok) return;
  btn.disabled = true;
  btn.textContent = 'Clearing...';
  const res = await window.api.clearTemp();
  optLog(`Cleared temp folder: removed ${res.removed} item(s), freed ${fmtBytes(res.freed)}${res.failed ? `, ${res.failed} skipped (in use)` : ''}.`, true);
  toast(`Freed ${fmtBytes(res.freed)} from temp files`);
  btn.disabled = false;
  btn.textContent = 'Clear Temp Files';
  refreshOptimizeStatic();
});

document.getElementById('opt-btn-recycle').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const ok = await confirmAction('Empty Recycle Bin?', 'Everything currently in the Recycle Bin will be permanently deleted. This cannot be undone.');
  if (!ok) return;
  btn.disabled = true;
  btn.textContent = 'Emptying...';
  const res = await window.api.emptyRecycleBin();
  optLog(res.ok ? 'Recycle Bin emptied.' : `Failed to empty Recycle Bin: ${res.error}`, res.ok);
  if (res.ok) toast('Recycle Bin emptied');
  btn.disabled = false;
  btn.textContent = 'Empty Recycle Bin';
});

document.getElementById('opt-btn-dns').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Flushing...';
  const res = await window.api.flushDns();
  optLog(res.ok ? 'DNS cache flushed.' : `Failed to flush DNS: ${res.error}`, res.ok);
  if (res.ok) toast('DNS cache flushed');
  btn.disabled = false;
  btn.textContent = 'Flush DNS Cache';
});

document.getElementById('opt-btn-startup').addEventListener('click', () => {
  document.querySelector('.nav-item[data-tab="startup"]').click();
});
document.getElementById('opt-btn-procs').addEventListener('click', () => {
  document.querySelector('.nav-item[data-tab="processes"]').click();
});

/* ===================== Polling loop ===================== */
async function tick() {
  try {
    tickCount++;
    const snap = await window.api.getSnapshot();
    lastSnapshot = snap;
    ensureNames(snap.processes.list); // fire-and-forget; picked up by next render pass once cached
    if (tickCount % 3 === 0 && document.getElementById('tab-processes').classList.contains('active')) {
      refreshConnections(); // fire-and-forget; netstat is a bit heavier, so throttle it
    }

    const { load, mem, netStats, disksIO, time } = snap;

    // quickstats
    const memPct = (mem.active / mem.total) * 100;
    const netTotal = sumNet(netStats, 'rx_sec') + sumNet(netStats, 'tx_sec');
    document.getElementById('qs-cpu').textContent = fmtPct(load.currentLoad);
    document.getElementById('qs-mem').textContent = fmtPct(memPct);
    document.getElementById('qs-net').textContent = fmtRate(netTotal);

    const colors = {
      cpu: cssVar('--accent'),
      memory: cssVar('--accent-2'),
      disk: cssVar('--accent-3'),
      network: cssVar('--good'),
    };
    drawRing(document.querySelector('[data-ring="cpu"]'), load.currentLoad, colors.cpu);
    drawRing(document.querySelector('[data-ring="mem"]'), memPct, colors.memory);
    drawRing(document.querySelector('[data-ring="net"]'), Math.min(100, (netTotal / (5 * 1024 * 1024)) * 100), colors.network);

    document.querySelector('.qs-item[data-metric="cpu"]').classList.toggle('hot', load.currentLoad > 85);
    document.querySelector('.qs-item[data-metric="mem"]').classList.toggle('hot', memPct > 85);

    fxBoost = clamp((load.currentLoad - 40) / 60, 0, 1.5);

    // uptime
    document.getElementById('uptime-value').textContent = fmtUptime(time.uptime);

    checkAlerts(load.currentLoad, memPct);

    // history
    pushHistory('cpu', load.currentLoad);
    pushHistory('memory', memPct);
    const diskActivity = (disksIO && (disksIO.rIO_sec || 0) + (disksIO && disksIO.wIO_sec || 0)) || 0;
    pushHistory('disk', diskActivity);
    pushHistory('network', netTotal);
    maybeSampleHour();

    // perf list values + sparklines
    document.getElementById('pi-cpu-val').textContent = fmtPct(load.currentLoad);
    document.getElementById('pi-mem-val').textContent = fmtPct(memPct);
    document.getElementById('pi-disk-val').textContent = diskActivity > 0 ? fmtRate(diskActivity) : '0%';
    document.getElementById('pi-net-val').textContent = fmtRate(netTotal);

    drawSparkline(document.querySelector('[data-spark="cpu"]'), history.cpu, colors.cpu);
    drawSparkline(document.querySelector('[data-spark="memory"]'), history.memory, colors.memory);
    drawSparkline(document.querySelector('[data-spark="disk"]'), history.disk, colors.disk);
    drawSparkline(document.querySelector('[data-spark="network"]'), history.network, colors.network);

    // per-core
    if (load.cpus) {
      load.cpus.forEach((c, i) => {
        const el = document.getElementById(`core-${i}`);
        if (el) el.textContent = fmtPct(c.load);
      });
    }

    updateInsightBanner(snap);

    if (document.getElementById('tab-performance').classList.contains('active')) {
      updatePerfDetail();
    }
    if (document.getElementById('tab-processes').classList.contains('active')) {
      renderProcesses(snap.processes.list);
    }
    if (document.getElementById('tab-overview').classList.contains('active')) {
      updateOverview(snap);
    }
    if (document.getElementById('tab-optimize').classList.contains('active')) {
      refreshOptimizeLive();
    }
  } catch (err) {
    console.error('tick error', err);
  } finally {
    setTimeout(tick, 1500);
  }
}

function updateOverview(snap) {
  const { mem, fsSize } = snap;
  document.getElementById('ov-mem').innerHTML = kv([
    ['Total', fmtBytes(mem.total)],
    ['In use', fmtBytes(mem.active)],
    ['Available', fmtBytes(mem.available)],
    ['Modules', document.getElementById('ov-mem').dataset.modules || '--'],
  ]);

  document.getElementById('ov-disk').innerHTML = (fsSize || []).slice(0, 5).map((d) =>
    `<div class="kv-row"><span class="k">${d.fs}</span><span class="v">${fmtBytes(d.used)} / ${fmtBytes(d.size)} (${d.use.toFixed(0)}%)</span></div>`
  ).join('') || '<div class="kv-row"><span class="k">No drives found</span></div>';

  const top = snap.processes.list
    .filter((p) => !isIdleProcess(p))
    .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
    .slice(0, 6);
  document.getElementById('ov-top').innerHTML = top.map((p) =>
    `<div class="kv-row"><span class="k">${escapeHtml(friendlyProcessName(p))}</span><span class="v">${(p.cpu || 0).toFixed(1)}% CPU</span></div>`
  ).join('');
}

/* ===================== Boot ===================== */
loadStatic().then(() => tick());
loadStartup();
