// js/preview.js
// This tab reads straight from the server's own files (via the same File
// Manager API used in the Files tab) — no webhook, no POST to anything
// outside the panel. You point it at your command file (e.g. commands.js),
// type a command, and it greps the matching block of code so you can see
// what would run — a static preview, not a live execution.

let _previewServerId = null;
let _activePreviewTab = 'whatsapp';

const BOT_PLATFORMS = {
  whatsapp: { label: 'WhatsApp', placeholder: '.ping', defaultFile: '/commands.js' },
  discord: { label: 'Discord', placeholder: '!ping', defaultFile: '/commands.js' },
  telegram: { label: 'Telegram', placeholder: '/ping', defaultFile: '/commands.js' },
};

// cache loaded file content per (serverId, platform) so retyping a command
// doesn't re-fetch the file every time
const _fileCache = {};

function initPreview(serverId) {
  _previewServerId = serverId;
  document.querySelectorAll('.pill[data-ptab]').forEach(p => {
    p.addEventListener('click', () => {
      document.querySelectorAll('.pill[data-ptab]').forEach(x => x.classList.remove('active'));
      p.classList.add('active');
      _activePreviewTab = p.dataset.ptab;
      renderPreviewTab();
    });
  });
  renderPreviewTab();
}

function renderPreviewTab() {
  if (_activePreviewTab === 'website') renderWebsitePreview();
  else renderBotPreview(_activePreviewTab);
}

function cacheKey(platform) { return _previewServerId + ':' + platform; }

function renderBotPreview(platform) {
  const cfg = Store.getServerConfig(_previewServerId);
  const meta = BOT_PLATFORMS[platform];
  const filePath = cfg[platform + 'File'] || meta.defaultFile;
  const root = document.getElementById('previewRoot');
  const cached = _fileCache[cacheKey(platform)];

  root.innerHTML = `
    <div class="config-note">
      Preview ini baca langsung isi file command bot ${meta.label} dari server (lewat File Manager
      API yang sama kayak tab Files) — bukan eksekusi beneran, cuma nunjukin blok kode yang
      match sama command yang kamu ketik. Cocok buat cek cepat command ada di mana / gimana logikanya
      tanpa buka WhatsApp/Discord/Telegram.
    </div>
    <div class="field-inline">
      <input id="fileInput" placeholder="/commands.js" value="${escapeHtml(filePath)}">
      <button class="btn" id="loadFileBtn">${cached ? 'Reload file' : 'Load file'}</button>
      <span class="fmeta mono" id="fileStatus" style="align-self:center;">${cached ? fmtBytes(cached.length) + ' loaded' : 'belum dimuat'}</span>
    </div>
    <div class="bot-sim">
      <div class="bot-thread" id="botThread"></div>
      <div class="bot-input-row">
        <input id="botCmdInput" placeholder="${meta.placeholder}" autocomplete="off">
        <button id="botSendBtn">Search</button>
      </div>
    </div>
  `;

  document.getElementById('loadFileBtn').addEventListener('click', () => loadCommandFile(platform));
  document.getElementById('fileInput').addEventListener('change', () => {
    const c = Store.getServerConfig(_previewServerId);
    c[platform + 'File'] = document.getElementById('fileInput').value.trim();
    Store.setServerConfig(_previewServerId, c);
  });

  const thread = document.getElementById('botThread');
  const cmdInput = document.getElementById('botCmdInput');

  function bubble(text, dir, mono) {
    const el = document.createElement('div');
    el.className = `bubble ${dir}`;
    if (mono) el.style.fontFamily = 'var(--font-mono)';
    el.textContent = text;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
    return el;
  }

  async function search() {
    const raw = cmdInput.value.trim();
    if (!raw) return;
    cmdInput.value = '';
    bubble(raw, 'out');

    let content = _fileCache[cacheKey(platform)];
    if (!content) {
      const status = bubble('memuat file dulu…', 'in');
      try {
        content = await loadCommandFile(platform, true);
        status.remove();
      } catch (err) {
        status.textContent = 'Gagal load file: ' + err.message;
        return;
      }
    }

    const matches = findCommandMatches(content, raw);
    if (!matches.length) {
      bubble(`Gak ketemu blok kode yang match dengan "${raw}" di file ini.`, 'in');
      return;
    }
    matches.slice(0, 3).forEach((m) => {
      bubble(`match di baris ${m.startLine}–${m.endLine}:\n\n${m.snippet}`, 'in', true);
    });
    if (matches.length > 3) bubble(`(${matches.length - 3} match lain disembunyikan)`, 'in');
  }

  document.getElementById('botSendBtn').addEventListener('click', search);
  cmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
}

async function loadCommandFile(platform, silent) {
  const cfg = Store.getServerConfig(_previewServerId);
  const filePath = (document.getElementById('fileInput')
    ? document.getElementById('fileInput').value.trim()
    : cfg[platform + 'File']) || BOT_PLATFORMS[platform].defaultFile;

  cfg[platform + 'File'] = filePath;
  Store.setServerConfig(_previewServerId, cfg);

  const statusEl = document.getElementById('fileStatus');
  if (statusEl && !silent) statusEl.textContent = 'memuat…';
  try {
    const content = await Api.readFile(_previewServerId, filePath);
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    _fileCache[cacheKey(platform)] = text;
    if (statusEl) statusEl.textContent = fmtBytes(text.length) + ' loaded';
    return text;
  } catch (err) {
    if (statusEl) statusEl.textContent = 'gagal: ' + err.message;
    throw err;
  }
}

// Grep-style matcher: finds lines referencing the typed command (with or
// without its prefix character like . ! /), then expands upward to the
// nearest enclosing "case"/condition line and downward until brace depth
// returns to the level it started at (capped) — a lightweight approximation
// of "the block of code that handles this command".
function findCommandMatches(content, rawCommand) {
  const cmd = rawCommand.replace(/^[.!/]/, '').split(/\s+/)[0].toLowerCase();
  if (!cmd || cmd.length < 2) return [];

  const lines = content.split('\n');
  const hitLines = [];
  lines.forEach((line, idx) => {
    const l = line.toLowerCase();
    if (l.includes(`'${cmd}'`) || l.includes(`"${cmd}"`) || l.includes(`\`${cmd}\``) || l.includes(cmd)) {
      hitLines.push(idx);
    }
  });

  // de-dupe hits that are within 2 lines of each other (same block)
  const grouped = [];
  hitLines.forEach(idx => {
    if (grouped.length && idx - grouped[grouped.length - 1] <= 2) return;
    grouped.push(idx);
  });

  return grouped.map(idx => {
    let start = idx;
    // walk back up to 5 lines to catch the "case '...':" / condition header
    for (let b = 1; b <= 5 && start > 0; b++) {
      const prev = lines[start - 1];
      if (/case\s+['"`]|command\s*===|cmd\s*===|if\s*\(/i.test(prev)) { start--; break; }
      start--;
    }
    start = Math.max(0, Math.min(start, idx));

    let end = idx;
    let depth = 0;
    const capLines = 25;
    for (let f = 0; f < capLines && end < lines.length; f++) {
      const line = lines[end];
      depth += (line.match(/{/g) || []).length;
      depth -= (line.match(/}/g) || []).length;
      if (f > 0 && depth <= 0 && /break;|^\s*}\s*$/.test(line)) { end++; break; }
      end++;
    }
    end = Math.min(end, lines.length);

    return {
      startLine: start + 1,
      endLine: end,
      snippet: lines.slice(start, end).join('\n'),
    };
  });
}

function renderWebsitePreview() {
  const cfg = Store.getServerConfig(_previewServerId);
  const root = document.getElementById('previewRoot');
  root.innerHTML = `
    <div class="config-note">
      Kalau server ini dipakai buat hosting website (misal via allocation port di tab Network),
      masukkan URL-nya di sini buat preview langsung + quick-edit gampang ke tab Files.
    </div>
    <div class="field-inline">
      <input id="siteUrlInput" placeholder="https://domain-kamu.com atau http://ip:port" value="${escapeHtml(cfg.websiteUrl || '')}">
      <button class="btn" id="saveSiteBtn">Load</button>
      <button class="btn btn-ghost" id="openSiteBtn">Open in new tab</button>
    </div>
    <div class="website-frame-wrap">
      <iframe id="siteFrame" src="${cfg.websiteUrl ? escapeHtml(cfg.websiteUrl) : 'about:blank'}"></iframe>
    </div>
  `;
  document.getElementById('saveSiteBtn').addEventListener('click', () => {
    const url = document.getElementById('siteUrlInput').value.trim();
    const c = Store.getServerConfig(_previewServerId);
    c.websiteUrl = url;
    Store.setServerConfig(_previewServerId, c);
    document.getElementById('siteFrame').src = url || 'about:blank';
  });
  document.getElementById('openSiteBtn').addEventListener('click', () => {
    const url = document.getElementById('siteUrlInput').value.trim();
    if (url) window.open(url, '_blank');
  });
}
