// js/console.js
let _ws = null;
let _wsServerId = null;
let _wsAuthToken = null;
let _wsRetries = 0;

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

async function connectConsole(serverId) {
  try {
    const res = await Api.getWebsocket(serverId);
    const { token, socket } = res.data;
    _wsAuthToken = token;

    if (_ws) { try { _ws.close(); } catch (e) {} }
    _ws = new WebSocket(socket);
    _wsServerId = serverId;

    _ws.addEventListener('open', () => {
      _ws.send(JSON.stringify({ event: 'auth', args: [token] }));
    });

    _ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      handleWsEvent(msg);
    });

    _ws.addEventListener('close', () => {
      consoleAppend('\n[connection closed]\n', 'line-sys');
      if (_wsRetries < 5) {
        _wsRetries++;
        setTimeout(() => connectConsole(serverId), 2000 * _wsRetries);
      }
    });

    _ws.addEventListener('error', () => {
      consoleAppend('\n[websocket error]\n', 'line-err');
    });
  } catch (err) {
    consoleAppend('\n[failed to open console: ' + err.message + ']\n', 'line-err');
  }
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
      // refresh token silently
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
