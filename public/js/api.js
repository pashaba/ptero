// js/api.js
// Thin wrapper around the /api/ptero proxy. Credentials live only in
// localStorage on this device — they're sent as headers on every call.

const Store = {
  get panel() { return localStorage.getItem('pd_panel') || ''; },
  get key() { return localStorage.getItem('pd_key') || ''; },
  get user() { return JSON.parse(localStorage.getItem('pd_user') || 'null'); },
  save(panel, key, user) {
    localStorage.setItem('pd_panel', panel);
    localStorage.setItem('pd_key', key);
    if (user) localStorage.setItem('pd_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('pd_panel');
    localStorage.removeItem('pd_key');
    localStorage.removeItem('pd_user');
  },
  isLoggedIn() { return !!(this.panel && this.key); },
  // per-server preview config (bot webhook urls, website preview url)
  getServerConfig(id) {
    return JSON.parse(localStorage.getItem('pd_srv_' + id) || '{}');
  },
  setServerConfig(id, cfg) {
    localStorage.setItem('pd_srv_' + id, JSON.stringify(cfg));
  },
};

const Api = {
  async call(path, { method = 'GET', json, raw } = {}) {
    if (!Store.isLoggedIn()) throw new Error('Not connected to a panel.');
    const headers = {
      'X-Panel-Url': Store.panel,
      'X-Api-Key': Store.key,
    };
    let body;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (raw !== undefined) {
      headers['Content-Type'] = 'text/plain';
      body = raw;
    }
    const res = await fetch(`/api/ptero?path=${encodeURIComponent(path)}`, {
      method,
      headers,
      body,
    });

    const ct = res.headers.get('content-type') || '';
    let data;
    if (ct.includes('application/json')) {
      data = await res.json().catch(() => null);
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const detail = data && data.errors && data.errors[0] && data.errors[0].detail
        ? data.errors[0].detail
        : `Request failed (${res.status})`;
      const err = new Error(detail);
      err.status = res.status;
      throw err;
    }
    return data;
  },

  // -------- account / servers --------
  getAccount() { return this.call('/account'); },
  getServers() { return this.call('/'); },
  getServer(id) { return this.call(`/servers/${id}`); },
  getResources(id) { return this.call(`/servers/${id}/resources`); },
  sendPower(id, signal) { return this.call(`/servers/${id}/power`, { method: 'POST', json: { signal } }); },
  sendCommand(id, command) { return this.call(`/servers/${id}/command`, { method: 'POST', json: { command } }); },
  getWebsocket(id) { return this.call(`/servers/${id}/websocket`); },

  // -------- files --------
  listFiles(id, dir = '/') { return this.call(`/servers/${id}/files/list?directory=${encodeURIComponent(dir)}`); },
  readFile(id, file) { return this.call(`/servers/${id}/files/contents?file=${encodeURIComponent(file)}`); },
  writeFile(id, file, content) { return this.call(`/servers/${id}/files/write?file=${encodeURIComponent(file)}`, { method: 'POST', raw: content }); },
  deleteFiles(id, root, files) { return this.call(`/servers/${id}/files/delete`, { method: 'POST', json: { root, files } }); },
  createFolder(id, root, name) { return this.call(`/servers/${id}/files/create-folder`, { method: 'POST', json: { root, name } }); },
  renameFile(id, root, from, to) { return this.call(`/servers/${id}/files/rename`, { method: 'PUT', json: { root, files: [{ from, to }] } }); },

  // -------- startup --------
  getStartup(id) { return this.call(`/servers/${id}/startup`); },
  setVariable(id, key, value) { return this.call(`/servers/${id}/startup/variable`, { method: 'PUT', json: { key, value } }); },

  // -------- network --------
  getNetwork(id) { return this.call(`/servers/${id}/network/allocations`); },
};

function requireAuth() {
  if (!Store.isLoggedIn()) {
    window.location.href = '/index.html';
  }
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtBytes(n) {
  if (!n && n !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}
