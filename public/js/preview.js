// js/preview.js
// Reads straight from the server's own files (via the same File Manager API
// used in the Files tab) — no webhook, no external POST. You point it at one
// or more files and/or plugin folders, type a command, and it greps the
// matching block of code across all of them — a static code preview, not a
// live execution (a real command still only runs inside the logged-in bot
// process, which a browser tab can't simulate).

let _previewServerId = null;
let _activePreviewTab = 'whatsapp';

const BOT_PLATFORMS = {
  whatsapp: { label: 'WhatsApp', placeholder: '.ping', defaultPaths: '/commands.js, /index.js, /plugins/' },
  discord: { label: 'Discord', placeholder: '!ping', defaultPaths: '/index.js, /commands/' },
  telegram: { label: 'Telegram', placeholder: '/ping', defaultPaths: '/index.js, /commands/' },
};

const MAX_SCAN_FILES = 40;
const JS_EXT = /\.(js|mjs|cjs|ts)$/i;

// cache: { serverId:platform -> { 'path': content, ... } }
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
  const pathsValue = cfg[platform + 'Paths'] || meta.defaultPaths;
  const root = document.getElementById('previewRoot');
  const cached = _fileCache[cacheKey(platform)];
  const cachedCount = cached ? Object.keys(cached).length : 0;

  root.innerHTML = `
    <div class="config-note">
      Preview ini nge-scan file/folder yang kamu tentuin buat cari command yang diketik —
      bukan eksekusi beneran, cuma nunjukin blok kode yang match. Isi bisa campur file
      langsung (<code>/index.js</code>) dan folder plugin (<code>/plugins/</code>, harus
      diakhiri "/" — semua file .js langsung di dalamnya ikut di-scan, max ${MAX_SCAN_FILES} file).
      Pisahkan pakai koma.
    </div>
    <div class="field-inline">
      <input id="pathsInput" placeholder="/commands.js, /index.js, /plugins/" value="${escapeHtml(pathsValue)}">
      <button class="btn" id="detectBtn" title="Baca 'main' dari package.json">Detect entry</button>
    </div>
    <div class="field-inline">
      <button class="btn" id="loadFileBtn">${cachedCount ? 'Reload files' : 'Load files'}</button>
      <span class="fmeta mono" id="fileStatus" style="align-self:center;">${cachedCount ? cachedCount + ' file dimuat' : 'belum dimuat'}</span>
    </div>
    <div class="bot-sim">
      <div class="bot-thread" id="botThread"></div>
      <div class="bot-input-row">
        <input id="botCmdInput" placeholder="${meta.placeholder}" autocomplete="off">
        <button id="botSendBtn">Search</button>
      </div>
    </div>
  `;

  document.getElementById('loadFileBtn').addEventListener('click', () => loadFiles(platform));
  document.getElementById('pathsInput').addEventListener('change', savePaths);
  document.getElementById('detectBtn').addEventListener('click', () => detectEntry(platform));

  function savePaths() {
    const c = Store.getServerConfig(_previewServerId);
    c[platform + 'Paths'] = document.getElementById('pathsInput').value.trim();
    Store.setServerConfig(_previewServerId, c);
  }

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

    let fileMap = _fileCache[cacheKey(platform)];
    if (!fileMap) {
      const status = bubble('memuat file dulu…', 'in');
      try {
        fileMap = await loadFiles(platform, true);
        status.remove();
      } catch (err) {
        status.textContent = 'Gagal load file: ' + err.message;
        return;
      }
    }

    const matches = findCommandMatches(fileMap, raw);
    if (!matches.length) {
      bubble(`Gak ketemu blok kode yang match dengan "${raw}" di ${Object.keys(fileMap).length} file yang di-scan.`, 'in');
      return;
    }
    matches.slice(0, 4).forEach((m) => {
      bubble(`${m.file} — baris ${m.startLine}–${m.endLine}:\n\n${m.snippet}`, 'in', true);
    });
    if (matches.length > 4) bubble(`(${matches.length - 4} match lain disembunyikan)`, 'in');
  }

  document.getElementById('botSendBtn').addEventListener('click', search);
  cmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') search(); });
}

async function detectEntry(platform) {
  const statusEl = document.getElementById('fileStatus');
  try {
    const content = await Api.readFile(_previewServerId, '/package.json');
    const pkg = JSON.parse(typeof content === 'string' ? content : JSON.stringify(content));
    const main = pkg.main ? (pkg.main.startsWith('/') ? pkg.main : '/' + pkg.main) : null;
    if (!main) { toast('package.json gak punya field "main".', 'err'); return; }

    const input = document.getElementById('pathsInput');
    const current = input.value.split(',').map(s => s.trim()).filter(Boolean);
    if (!current.includes(main)) current.push(main);
    input.value = current.join(', ');
    input.dispatchEvent(new Event('change'));
    toast('Entry point ditambahin: ' + main, 'ok');
  } catch (err) {
    toast('Gagal baca package.json: ' + err.message, 'err');
  }
}

async function loadFiles(platform, silent) {
  const input = document.getElementById('pathsInput');
  const cfg = Store.getServerConfig(_previewServerId);
  const pathsValue = (input ? input.value : cfg[platform + 'Paths']) || BOT_PLATFORMS[platform].defaultPaths;
  cfg[platform + 'Paths'] = pathsValue;
  Store.setServerConfig(_previewServerId, cfg);

  const entries = pathsValue.split(',').map(s => s.trim()).filter(Boolean);
  const statusEl = document.getElementById('fileStatus');
  if (statusEl && !silent) statusEl.textContent = 'memuat…';

  const fileMap = {};
  let scanned = 0;

  for (const entry of entries) {
    if (scanned >= MAX_SCAN_FILES) break;
    if (entry.endsWith('/')) {
      try {
        const listing = await Api.listFiles(_previewServerId, entry);
        const files = (listing.data || []).filter(it => it.attributes.is_file && JS_EXT.test(it.attributes.name));
        for (const f of files) {
          if (scanned >= MAX_SCAN_FILES) break;
          const p = entry + f.attributes.name;
          try {
            const content = await Api.readFile(_previewServerId, p);
            fileMap[p] = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
            scanned++;
          } catch (e) { /* skip unreadable file */ }
        }
      } catch (e) {
        if (statusEl) statusEl.textContent = `gagal list folder ${entry}: ${e.message}`;
      }
    } else {
      try {
        const content = await Api.readFile(_previewServerId, entry);
        fileMap[entry] = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        scanned++;
      } catch (e) {
        // skip missing/unreadable file, keep going with the rest
      }
    }
  }

  _fileCache[cacheKey(platform)] = fileMap;
  const count = Object.keys(fileMap).length;
  if (statusEl) statusEl.textContent = count ? `${count} file dimuat` : 'gak ada file yang berhasil dimuat — cek path-nya';
  return fileMap;
}

// Grep-style matcher across every loaded file. Finds lines referencing the
// typed command (with or without prefix char), then expands to an
// approximate enclosing block using brace-depth + "case/if" heuristics.
function findCommandMatches(fileMap, rawCommand) {
  const cmd = rawCommand.replace(/^[.!/]/, '').split(/\s+/)[0].toLowerCase();
  if (!cmd || cmd.length < 2) return [];

  const results = [];

  for (const [path, content] of Object.entries(fileMap)) {
    const lines = content.split('\n');
    const hitLines = [];
    lines.forEach((line, idx) => {
      const l = line.toLowerCase();
      if (l.includes(`'${cmd}'`) || l.includes(`"${cmd}"`) || l.includes(`\`${cmd}\``) || l.includes(cmd)) {
        hitLines.push(idx);
      }
    });

    const grouped = [];
    hitLines.forEach(idx => {
      if (grouped.length && idx - grouped[grouped.length - 1] <= 2) return;
      grouped.push(idx);
    });

    grouped.forEach(idx => {
      let start = idx;
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

      results.push({
        file: path,
        startLine: start + 1,
        endLine: end,
        snippet: lines.slice(start, end).join('\n'),
      });
    });
  }

  return results;
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
