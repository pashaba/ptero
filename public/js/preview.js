// js/preview.js
// This tab doesn't talk to Pterodactyl at all. It's a thin client for a
// webhook that your own bot script (Phoenix MD / Ourin MD / a Discord or
// Telegram bot) exposes, so you can test commands without opening WhatsApp.
// Nothing works here unless the bot side implements the webhook contract
// described in the config note below.

let _previewServerId = null;
let _activePreviewTab = 'whatsapp';

const BOT_PLATFORMS = {
  whatsapp: { label: 'WhatsApp', placeholder: '.ping', configKey: 'waWebhook' },
  discord: { label: 'Discord', placeholder: '!ping', configKey: 'discordWebhook' },
  telegram: { label: 'Telegram', placeholder: '/ping', configKey: 'telegramWebhook' },
};

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

function renderBotPreview(platform) {
  const cfg = Store.getServerConfig(_previewServerId);
  const meta = BOT_PLATFORMS[platform];
  const root = document.getElementById('previewRoot');

  root.innerHTML = `
    <div class="config-note">
      Simulator ini mengirim command ke webhook yang di-expose bot ${meta.label} kamu sendiri
      (endpoint HTTP di script bot, bukan Pterodactyl). Bot harus terima POST JSON <code>{ "command": "..." }</code>
      dan balas JSON <code>{ "reply": "..." }</code>. Webhook harus mengizinkan CORS dari domain Pterodash ini,
      atau proxy-kan lewat server bot kamu sendiri.
    </div>
    <div class="field-inline">
      <input id="webhookInput" placeholder="https://bot-kamu.example.com/preview-webhook" value="${escapeHtml(cfg[meta.configKey] || '')}">
      <button class="btn" id="saveWebhookBtn">Save</button>
    </div>
    <div class="bot-sim">
      <div class="bot-thread" id="botThread"></div>
      <div class="bot-input-row">
        <input id="botCmdInput" placeholder="${meta.placeholder}" autocomplete="off">
        <button id="botSendBtn">Send</button>
      </div>
    </div>
  `;

  document.getElementById('saveWebhookBtn').addEventListener('click', () => {
    const c = Store.getServerConfig(_previewServerId);
    c[meta.configKey] = document.getElementById('webhookInput').value.trim();
    Store.setServerConfig(_previewServerId, c);
    toast('Webhook tersimpan.', 'ok');
  });

  const thread = document.getElementById('botThread');
  const cmdInput = document.getElementById('botCmdInput');

  function bubble(text, dir) {
    const el = document.createElement('div');
    el.className = `bubble ${dir}`;
    el.textContent = text;
    thread.appendChild(el);
    thread.scrollTop = thread.scrollHeight;
  }

  async function send() {
    const command = cmdInput.value.trim();
    if (!command) return;
    const webhook = (Store.getServerConfig(_previewServerId)[meta.configKey] || '').trim();
    if (!webhook) { toast('Set webhook URL dulu.', 'err'); return; }

    bubble(command, 'out');
    cmdInput.value = '';
    const thinking = document.createElement('div');
    thinking.className = 'bubble in';
    thinking.textContent = '…';
    thread.appendChild(thinking);
    thread.scrollTop = thread.scrollHeight;

    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, platform, server_id: _previewServerId }),
      });
      const data = await res.json().catch(() => ({}));
      thinking.textContent = data.reply || JSON.stringify(data) || '(no reply field in response)';
    } catch (err) {
      thinking.textContent = 'Gagal hubungi webhook: ' + err.message;
      thinking.classList.add('line-err');
    }
  }

  document.getElementById('botSendBtn').addEventListener('click', send);
  cmdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
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
