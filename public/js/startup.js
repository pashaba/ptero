// js/startup.js
async function initStartup(serverId) {
  const root = document.getElementById('startupRoot');
  root.innerHTML = `<div class="empty-state">Memuat startup config…</div>`;
  try {
    const res = await Api.getStartup(serverId);
    const meta = res.meta || {};
    const vars = res.data || [];

    root.innerHTML = `
      <div class="startup-cmd">${escapeHtml(meta.startup_command || meta.raw_startup_command || 'startup command tidak tersedia dari API ini')}</div>
      <div class="var-list" id="varList"></div>
    `;

    const list = document.getElementById('varList');
    list.innerHTML = vars.map(v => {
      const a = v.attributes;
      return `
      <div class="var-row" data-key="${escapeHtml(a.env_variable)}">
        <div>
          <div class="vname">${escapeHtml(a.name)}</div>
          <div class="venv">${escapeHtml(a.env_variable)}</div>
        </div>
        <input value="${escapeHtml(a.server_value ?? '')}" ${a.is_editable ? '' : 'disabled'}>
        <button class="btn ${a.is_editable ? '' : 'btn-ghost'}" ${a.is_editable ? '' : 'disabled'}>Save</button>
      </div>`;
    }).join('') || `<div class="empty-state">Tidak ada startup variable.</div>`;

    list.querySelectorAll('.var-row').forEach(row => {
      const key = row.dataset.key;
      const input = row.querySelector('input');
      const btn = row.querySelector('button');
      if (btn.disabled) return;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = 'Saving…';
        try {
          await Api.setVariable(serverId, key, input.value);
          toast(`${key} tersimpan.`, 'ok');
        } catch (err) {
          toast('Gagal simpan: ' + err.message, 'err');
        } finally {
          btn.disabled = false;
          btn.textContent = original;
        }
      });
    });
  } catch (err) {
    root.innerHTML = `<div class="empty-state">Gagal memuat startup config: ${escapeHtml(err.message)}</div>`;
  }
}
