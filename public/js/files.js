// js/files.js
let _filesServerId = null;
let _currentDir = '/';
let _editingFile = null;

function initFiles(serverId) {
  _filesServerId = serverId;
  renderFileList();
}

function joinPath(dir, name) {
  return (dir.endsWith('/') ? dir : dir + '/') + name;
}

function breadcrumbHtml(dir) {
  const parts = dir.split('/').filter(Boolean);
  let acc = '';
  let html = `<span data-dir="/">root</span>`;
  parts.forEach(p => {
    acc += '/' + p;
    html += ` / <span data-dir="${escapeHtml(acc)}">${escapeHtml(p)}</span>`;
  });
  return html;
}

async function renderFileList() {
  const root = document.getElementById('fileManagerRoot');
  root.innerHTML = `
    <div class="files-toolbar">
      <div class="breadcrumb" id="breadcrumb">${breadcrumbHtml(_currentDir)}</div>
      <button class="btn" id="btnNewFile">+ File</button>
      <button class="btn" id="btnNewFolder">+ Folder</button>
      <button class="btn btn-ghost" id="btnRefresh">Refresh</button>
    </div>
    <div class="file-list" id="fileListBox"><div class="file-row">Memuat…</div></div>
  `;

  document.querySelectorAll('#breadcrumb span').forEach(el => {
    el.addEventListener('click', () => { _currentDir = el.dataset.dir; renderFileList(); });
  });
  document.getElementById('btnRefresh').addEventListener('click', renderFileList);
  document.getElementById('btnNewFile').addEventListener('click', createFilePrompt);
  document.getElementById('btnNewFolder').addEventListener('click', createFolderPrompt);

  try {
    const res = await Api.listFiles(_filesServerId, _currentDir);
    const items = (res.data || []).sort((a, b) => {
      if (a.attributes.is_file !== b.attributes.is_file) return a.attributes.is_file ? 1 : -1;
      return a.attributes.name.localeCompare(b.attributes.name);
    });
    const box = document.getElementById('fileListBox');
    if (!items.length) {
      box.innerHTML = `<div class="file-row">Folder kosong.</div>`;
      return;
    }
    box.innerHTML = items.map(it => {
      const a = it.attributes;
      const icon = a.is_file ? '▤' : '▸';
      return `
      <div class="file-row ${a.is_file ? '' : 'is-dir'}" data-name="${escapeHtml(a.name)}" data-isfile="${a.is_file}">
        <span class="ficon">${icon}</span>
        <span class="fname">${escapeHtml(a.name)}</span>
        <span class="fmeta">${a.is_file ? fmtBytes(a.size) : ''}</span>
        <span class="fmeta">${new Date(a.modified_at).toLocaleString()}</span>
        <button class="btn btn-ghost btn-del" style="font-size:11px;">Delete</button>
      </div>`;
    }).join('');

    box.querySelectorAll('.file-row').forEach(row => {
      const name = row.dataset.name;
      const isFile = row.dataset.isfile === 'true';
      row.querySelector('.fname').addEventListener('click', () => {
        if (isFile) openEditor(joinPath(_currentDir, name));
        else { _currentDir = joinPath(_currentDir, name); renderFileList(); }
      });
      row.querySelector('.btn-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm(`Hapus "${name}"?`)) return;
        try {
          await Api.deleteFiles(_filesServerId, _currentDir, [name]);
          toast('Dihapus.', 'ok');
          renderFileList();
        } catch (err) { toast('Gagal hapus: ' + err.message, 'err'); }
      });
    });
  } catch (err) {
    document.getElementById('fileListBox').innerHTML = `<div class="file-row">Gagal memuat: ${escapeHtml(err.message)}</div>`;
  }
}

async function createFilePrompt() {
  const name = prompt('Nama file baru:');
  if (!name) return;
  try {
    await Api.writeFile(_filesServerId, joinPath(_currentDir, name), '');
    toast('File dibuat.', 'ok');
    renderFileList();
  } catch (err) { toast('Gagal buat file: ' + err.message, 'err'); }
}

async function createFolderPrompt() {
  const name = prompt('Nama folder baru:');
  if (!name) return;
  try {
    await Api.createFolder(_filesServerId, _currentDir, name);
    toast('Folder dibuat.', 'ok');
    renderFileList();
  } catch (err) { toast('Gagal buat folder: ' + err.message, 'err'); }
}

async function openEditor(filePath) {
  _editingFile = filePath;
  const root = document.getElementById('fileManagerRoot');
  root.innerHTML = `
    <div class="editor-wrap">
      <div class="editor-toolbar">
        <span>${escapeHtml(filePath)}</span>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost" id="btnEditorBack">← Back</button>
          <button class="btn btn-primary" id="btnEditorSave">Save</button>
        </div>
      </div>
      <textarea class="editor-textarea" id="editorTextarea" spellcheck="false">Memuat…</textarea>
    </div>
  `;
  document.getElementById('btnEditorBack').addEventListener('click', () => { _editingFile = null; renderFileList(); });
  document.getElementById('btnEditorSave').addEventListener('click', saveEditor);

  try {
    const content = await Api.readFile(_filesServerId, filePath);
    document.getElementById('editorTextarea').value = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  } catch (err) {
    document.getElementById('editorTextarea').value = '';
    toast('Gagal buka file (mungkin file biner): ' + err.message, 'err');
  }
}

async function saveEditor() {
  const btn = document.getElementById('btnEditorSave');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const content = document.getElementById('editorTextarea').value;
    await Api.writeFile(_filesServerId, _editingFile, content);
    toast('Tersimpan.', 'ok');
  } catch (err) {
    toast('Gagal simpan: ' + err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}
