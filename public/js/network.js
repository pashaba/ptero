// js/network.js
async function initNetwork(serverId) {
  const root = document.getElementById('networkRoot');
  root.innerHTML = `<div class="empty-state">Memuat allocations…</div>`;
  try {
    const res = await Api.getNetwork(serverId);
    const items = res.data || [];
    if (!items.length) {
      root.innerHTML = `<div class="empty-state">Tidak ada allocation.</div>`;
      return;
    }
    root.innerHTML = `<div class="file-list">${items.map(it => {
      const a = it.attributes;
      return `
      <div class="file-row">
        <span class="ficon">${a.is_default ? '★' : '·'}</span>
        <span class="fname">${escapeHtml(a.ip)}:${a.port}</span>
        <span class="fmeta">${escapeHtml(a.notes || (a.is_default ? 'default' : ''))}</span>
      </div>`;
    }).join('')}</div>`;
  } catch (err) {
    root.innerHTML = `<div class="empty-state">Gagal memuat network: ${escapeHtml(err.message)}</div>`;
  }
}
