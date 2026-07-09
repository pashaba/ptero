// js/server.js
requireAuth();

const params = new URLSearchParams(window.location.search);
const SERVER_ID = params.get('id');
if (!SERVER_ID) window.location.href = '/dashboard.html';

const user = Store.user;
document.getElementById('userChip').textContent = user ? (user.username || user.email || 'connected') : 'connected';

// ---------- tabs ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });
});

// ---------- power actions ----------
function bindPower(id, signal, label) {
  document.getElementById(id).addEventListener('click', async () => {
    const btn = document.getElementById(id);
    btn.disabled = true;
    try {
      await Api.sendPower(SERVER_ID, signal);
      toast(`${label} sent.`, 'ok');
    } catch (err) {
      toast('Power action failed: ' + err.message, 'err');
    } finally {
      setTimeout(() => { btn.disabled = false; }, 1500);
    }
  });
}
bindPower('btnStart', 'start', 'Start');
bindPower('btnRestart', 'restart', 'Restart');
bindPower('btnStop', 'stop', 'Stop');
bindPower('btnKill', 'kill', 'Kill');

// ---------- header + resources ----------
function fmtUptime(ms) {
  if (!ms) return '—';
  let s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

async function loadHeader() {
  try {
    const res = await Api.getServer(SERVER_ID);
    const a = res.attributes;
    document.getElementById('serverName').textContent = a.name;
    document.getElementById('idChip').textContent = a.identifier;
    document.title = a.name + ' — Pterodash';
  } catch (err) {
    toast('Gagal memuat detail server: ' + err.message, 'err');
  }
}

const statusDotClass = {
  running: 'status-running',
  offline: 'status-offline',
  starting: 'status-starting',
  stopping: 'status-stopping',
};

async function pollResources() {
  try {
    const res = await Api.getResources(SERVER_ID);
    const a = res.attributes;
    const dot = document.getElementById('statusDot');
    dot.className = 'status-dot ' + (statusDotClass[a.current_state] || 'status-error');
    document.getElementById('statVal-status').textContent = a.current_state;
    document.getElementById('statVal-cpu').textContent = (a.resources.cpu_absolute || 0).toFixed(1) + '%';
    document.getElementById('statVal-mem').textContent = fmtBytes(a.resources.memory_bytes);
    document.getElementById('statVal-disk').textContent = fmtBytes(a.resources.disk_bytes);
    document.getElementById('statVal-uptime').textContent = fmtUptime(a.resources.uptime);
  } catch (err) {
    // silent — resources endpoint can 404 briefly during (re)starts
  }
}

loadHeader();
pollResources();
setInterval(pollResources, 5000);

// ---------- init tab modules ----------
initConsole(SERVER_ID);
initFiles(SERVER_ID);
initStartup(SERVER_ID);
initNetwork(SERVER_ID);
initPreview(SERVER_ID);
