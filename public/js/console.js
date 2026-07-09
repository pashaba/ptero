// js/console.js
let _ws = null;
let _wsServerId = null;
let _wsAuthToken = null;
let _wsRetries = 0;
const MAX_RETRIES = 3;
let _wsGaveUp = false;
let _lastSocketHost = null;

function consoleAppend(text, cls) {
  const out = document.getElementById('consoleOutput');
  if (!out) return;
  const atBottom = out.scrollTop + out.clientHeight >= out.scrollHeight - 40;
  const span = document.createElement('span');
  if (cls) span.className = cls;
  span.textContent = text;
  out.appendChild(span);
  if (atBottom) out.scrollTop = out.scrollHeight;
}

function consoleAppendLink(label, url) {
  const out = document.getElementById('consoleOutput');
  if (!out) return;
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = label;
  a.style.color = 'var(--cyan)';
  a.style.textDecoration = 'underline';
  a.style.display = 'block';
  a.style.margin = '4px 0';
  out.appendChild(a);
}

async function connectConsole(serverId) {
  _wsGaveUp = false;
  try {
    const res = await Api.getWebsocket(serverId);
    const { token, socket } = res.data;
    _wsAuthToken = token;

    try {
      const u = new URL(socket);
      _lastSocketHost = (u.protocol === 'wss:' ? 'https:' : 'http:') + '//' + u.host + '/';
    } catch (e) { _lastSocketHost = null; }

    if (_ws) { try { _ws.onclose = null; _ws.close(); } catch (e) {} }
    _ws = new WebSocket(socket);
    _wsServerId = serverId;

    let openedOk = false;

    _ws.addEventListener('open', () => {
      _ws.send(JSON.stringify({ event: 'auth', args: [token] }));
    });

    _ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.event === 'auth success') openedOk = true;
      handleWsEvent(msg);
    });

    _ws.addEventListener('close', (ev) => {
      handleDrop(openedOk, ev);
    });

    _ws.addEventListener('error', () => {
      consoleAppend('\n[websocket error]\n', 'line-err');
    });
  } catch (err) {
    const msg = /too many attempts/i.test(err.message)
      ? 'Panel lagi rate-limit request websocket (kebanyakan percobaan). Tunggu 1-2 menit lalu klik Reconnect.'
      : err.message;
    consoleAppend('\n[failed to open console: ' + msg + ']\n', 'line-err');
    showReconnectButton();
  }
}

function handleDrop(openedOk, ev) {
  if (_wsGaveUp) return;
  consoleAppend(`\n[connection closed${ev && ev.code ? ' — code ' + ev.code : ''}]\n`, 'line-sys');

  if (!openedOk) {
    _wsRetries++;
    if (_wsRetries >= MAX_RETRIES) {
      _wsGaveUp = true;
      const code = ev && ev.code;
      let hint = '';
      if (code === 1006 || !code) {
        hint =
          'Code 1006 = browser gagal buka koneksi sama sekali (bukan ditolak aplikasi).\n' +
          'Penyebab paling umum, coba urut dari atas:\n' +
          '  1. SSL certificate di node Wings belum di-trust browser (sering kejadian kalau\n' +
          '     node pakai self-signed cert). Klik link di bawah — kalau muncul warning\n' +
          '     "not secure"/cert error, klik "proceed anyway" sekali, lalu balik sini dan Reconnect.\n' +
          '  2. Port daemon Wings (biasanya 8080 atau 443 tergantung setup) kefirewall dari luar\n' +
          '     jaringan node — cek firewall/security group node-nya.\n' +
          '  3. Origin domain Pterodash belum di-whitelist di allowed_origins Wings (lihat README).\n';
      } else {
        hint = 'Wings menolak koneksi (code ' + code + '). Kemungkinan origin belum di-whitelist — cek README.';
      }
      consoleAppend('\n[gave up after ' + MAX_RETRIES + ' tries]\n' + hint, 'line-err');
      if (_lastSocketHost) consoleAppendLink('→ Buka ' + _lastSocketHost + ' (cek/accept SSL cert node)', _lastSocketHost);
      showReconnectButton();
      return;
    }
    setTimeout(() => connectConsole(_wsServerId), 2500 * _wsRetries);
  } else {
    _wsRetries = 0;
    setTimeout(() => connectConsole(_wsServerId), 2000);
  }
}

function showReconnectButton() {
  if (document.getElementById('consoleReconnectBtn')) return;
  const row = document.querySelector('.console-input-row');
  const btn = document.createElement('button');
  btn.id = 'consoleReconnectBtn';
  btn.className = 'btn';
  btn.textContent = 'Reconnect';
  btn.style.margin = '8px';
  btn.addEventListener('click', () => {
    btn.remove();
    _wsRetries = 0;
    _wsGaveUp = false;
    connectConsole(_wsServerId);
  });
  row.parentElement.insertBefore(btn, row);
}

function handleWsEvent(msg) {
  switch (msg.event) {
    case 'auth success':
      _wsRetries = 0;
      document.getElementById('consoleOutput').textContent = '';
      consoleAppend('[connected]\n', 'line-sys');
      _ws.send(JSON.stringify({ event: 'send logs', args: [null] }));
      break;
    case 'console output':
      consoleAppend((msg.args && msg.args[0] ? msg.args[0] : '') + '\n');
      break;
    case 'status':
      consoleAppend(`[status: ${msg.args && msg.args[0]}]\n`, 'line-sys');
      break;
    case 'token expiring':
    case 'token expired':
      Api.getWebsocket(_wsServerId).then(res => {
        _ws.send(JSON.stringify({ event: 'auth', args: [res.data.token] }));
      }).catch(() => {});
      break;
    case 'daemon error':
    case 'jwt error':
      consoleAppend('[error: ' + (msg.args && msg.args[0]) + ']\n', 'line-err');
      break;
    default:
      break;
  }
}

function initConsole(serverId) {
  connectConsole(serverId);

  const input = document.getElementById('consoleInput');
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const cmd = input.value.trim();
    if (!cmd) return;
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify({ event: 'send command', args: [cmd] }));
      consoleAppend('> ' + cmd + '\n', 'line-sys');
    } else {
      toast('Console belum terhubung.', 'err');
    }
    input.value = '';
  });
}
