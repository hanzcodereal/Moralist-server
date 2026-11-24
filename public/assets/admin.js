const $ = (id) => document.getElementById(id);
const statusEl = $('status');
const HEADERS = { 'x-requested-with': 'moralist' };

function say(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('danger', isError);
}

async function api(path, options = {}) {
  const res = await fetch(`/admin/api/${path}`, { ...options, headers: { ...HEADERS, ...(options.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { location.reload(); throw new Error('Sesi berakhir'); }
  if (!res.ok) throw new Error(data.error || `Gagal (${res.status})`);
  return data;
}

const size = (b) => (b ? `${(b / 1048576).toFixed(1)} MB` : '-');

function cell(text, tag = 'td') {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

async function load() {
  $('loading').hidden = false;
  try {
    const rows = await api('releases');
    const body = $('list');
    body.replaceChildren();
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.append(cell(r.version, 'th'));
      tr.lastChild.scope = 'row';
      tr.append(cell(r.source === 'upload' ? 'Unggahan' : r.source === 'external' ? 'Tautan' : 'Belum ada berkas'));
      tr.append(cell(size(r.size)));
      tr.append(cell(String(r.downloads)));
      const st = cell(r.published ? 'Terbit' : 'Draf');
      st.className = r.published ? 'badge-on' : 'badge-off';
      tr.append(st);
      const actions = document.createElement('td');
      const wrap = document.createElement('div');
      wrap.className = 'row-actions';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'link';
      toggle.textContent = r.published ? 'Tarik' : 'Terbitkan';
      toggle.disabled = !r.hasFile;
      toggle.addEventListener('click', async () => {
        try { await api(`releases/${r.version}`, { method: 'PATCH', body: JSON.stringify({ published: !r.published }) }); say(`Versi ${r.version} diperbarui.`); load(); } catch (e) { say(e.message, true); }
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'link danger';
      del.textContent = 'Hapus';
      del.addEventListener('click', async () => {
        if (!confirm(`Hapus versi ${r.version} beserta berkasnya?`)) return;
        try { await api(`releases/${r.version}`, { method: 'DELETE' }); say(`Versi ${r.version} dihapus.`); load(); } catch (e) { say(e.message, true); }
      });
      wrap.append(toggle, del);
      actions.append(wrap);
      tr.append(actions);
      body.append(tr);
    });
    $('list-wrap').hidden = rows.length === 0;
    $('empty').hidden = rows.length !== 0;
  } catch (e) {
    say(e.message, true);
  } finally {
    $('loading').hidden = true;
  }
}

function uploadFile(version, file) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/admin/api/releases/${encodeURIComponent(version)}/apk`);
    xhr.setRequestHeader('x-requested-with', 'moralist');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) $('progress').value = (e.loaded / e.total) * 100; };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* biarkan kosong */ }
      xhr.status >= 200 && xhr.status < 300 ? resolve(data) : reject(new Error(data.error || `Unggah gagal (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Koneksi terputus saat mengunggah'));
    xhr.send(file);
  });
}

const form = $('add-form');
form.addEventListener('change', () => {
  const external = form.source.value === 'external';
  $('src-upload').hidden = external;
  $('src-external').hidden = !external;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const version = form.version.value.trim();
  const external = form.source.value === 'external';
  const publish = form.published.checked;
  if (!external && !form.file.files[0]) return say('Pilih berkas APK dulu.', true);
  if (external && !form.url.value.trim()) return say('Isi tautan unduhan dulu.', true);
  $('add-btn').disabled = true;
  say(external ? 'Menghitung checksum dari tautan, mohon tunggu…' : 'Membuat versi…');
  try {
    await api('releases', { method: 'POST', body: JSON.stringify({ version, source: external ? 'external' : 'upload', url: form.url.value.trim(), published: publish }) });
    if (!external) {
      $('progress').hidden = false;
      say('Mengunggah APK…');
      await uploadFile(version, form.file.files[0]);
      if (publish) await api(`releases/${version}`, { method: 'PATCH', body: JSON.stringify({ published: true }) });
    }
    say(`Versi ${version} tersimpan.`);
    form.reset();
    form.dispatchEvent(new Event('change'));
  } catch (e) {
    say(e.message, true);
  } finally {
    $('add-btn').disabled = false;
    $('progress').hidden = true;
    $('progress').value = 0;
    load();
  }
});

$('pw-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('password', { method: 'POST', body: JSON.stringify({ password: $('pw-new').value }) });
    location.reload();
  } catch (e) {
    say(e.message, true);
  }
});

load();
