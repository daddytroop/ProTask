function applyStoredTheme() {
  document.documentElement.setAttribute('data-theme', localStorage.getItem('protask-theme') || 'aurora');
}
applyStoredTheme();

document.getElementById('mini-restore').addEventListener('click', () => window.api.exitMiniMode());
document.getElementById('mini-wrap').addEventListener('dblclick', () => window.api.exitMiniMode());

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function fmtPct(v) { return `${Math.round(v)}%`; }
function fmtBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '--';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = Math.abs(bytes);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
function fmtRate(v) { return fmtBytes(v) + '/s'; }
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function sumNet(netStats, key) { return (netStats || []).reduce((s, n) => s + (n[key] || 0), 0); }

function drawRing(canvas, pct, color) {
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

async function tick() {
  try {
    applyStoredTheme();
    const snap = await window.api.getSnapshot();
    const memPct = (snap.mem.active / snap.mem.total) * 100;
    const netTotal = sumNet(snap.netStats, 'rx_sec') + sumNet(snap.netStats, 'tx_sec');

    document.getElementById('qs-cpu').textContent = fmtPct(snap.load.currentLoad);
    document.getElementById('qs-mem').textContent = fmtPct(memPct);
    document.getElementById('qs-net').textContent = fmtRate(netTotal);

    const colors = { cpu: cssVar('--accent'), mem: cssVar('--accent-2'), net: cssVar('--good') };
    drawRing(document.querySelector('[data-ring="cpu"]'), snap.load.currentLoad, colors.cpu);
    drawRing(document.querySelector('[data-ring="mem"]'), memPct, colors.mem);
    drawRing(document.querySelector('[data-ring="net"]'), Math.min(100, (netTotal / (5 * 1024 * 1024)) * 100), colors.net);

    document.querySelector('.qs-item[data-metric="cpu"]').classList.toggle('hot', snap.load.currentLoad > 85);
    document.querySelector('.qs-item[data-metric="mem"]').classList.toggle('hot', memPct > 85);
  } catch (err) {
    console.error('mini tick error', err);
  } finally {
    setTimeout(tick, 1500);
  }
}
tick();
