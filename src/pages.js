// Halaman HTML sisi server. Semua teks dalam bahasa Indonesia.
export const SITE = {
  name: 'Moralist',
  developer: 'Hanz Dev Official',
  email: 'hanzzcodee@gmail.com',
  donate: 'https://saweria.co/hanzreally',
  appVersion: '2.0.0',
};

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function formatSize(bytes) {
  if (!bytes) return '-';
  const mb = bytes / (1024 * 1024);
  return `${mb >= 100 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}
const dateFmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
export const formatDate = (iso) => dateFmt.format(new Date(iso));

const head = (title, desc, extra = '') => `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="light dark">
<link rel="icon" type="image/png" href="/assets/logo.png">
<link rel="stylesheet" href="/assets/style.css">
${extra}
</head>`;

const mark = (home = '/') => `<a class="brand" href="${home}"><img src="/assets/logo.png" width="36" height="36" alt="" class="brand-mark"><span>Moralist</span></a>`;

const FEATURES = [
  ['Pemutar YouTube Music', 'Cari lagu, album, artis, dan playlist, lalu putar langsung. Mendukung login akun YouTube Music untuk rekomendasi dan pustaka kamu.'],
  ['Pustaka dan mode offline', 'Simpan lagu, album, dan playlist ke pustaka. Lagu yang pernah diputar atau diunduh tetap bisa diputar saat jaringan putus.'],
  ['Lirik tersinkron', 'Lirik berjalan mengikuti lagu, dengan pilihan romanisasi dan terjemahan.'],
  ['MoraEQ', 'Equalizer dengan preset dan profil buatan sendiri yang bisa disimpan.'],
  ['Dengar Bersama', 'Putar lagu yang sama dengan temanmu dalam satu room, tersinkron. Host menyetujui anggota dan antrean, teman bisa menyarankan lagu.'],
  ['Pengenal lagu', 'Kenali lagu yang sedang terdengar di sekitarmu langsung dari aplikasi.'],
  ['Impor playlist', 'Bawa playlist dari Spotify, Apple Music, Deezer, Tidal, dan Amazon Music.'],
  ['Scrobble dan Discord', 'Kirim riwayat putar ke Last.fm dan tampilkan lagu yang kamu putar di Discord.'],
  ['Android Auto, widget, dan timer tidur', 'Kontrol dari mobil dan layar utama, serta matikan pemutaran otomatis saat kamu tertidur.'],
  ['Cast ke speaker', 'Alirkan ke perangkat Google Cast, DLNA, FCast, dan Sonos di jaringan yang sama.'],
  ['Cadangkan dan pulihkan', 'Simpan data aplikasi ke satu berkas dan pulihkan saat pindah ponsel.'],
];

export function homePage({ latest, history, base }) {
  const dl = latest
    ? `<p class="dl-version">${esc(latest.version)}</p>
       <dl class="facts">
         <div><dt>Ukuran</dt><dd>${esc(formatSize(latest.size))}</dd></div>
         <div><dt>Dirilis</dt><dd>${esc(formatDate(latest.created_at))}</dd></div>
         <div><dt>Android</dt><dd>7.0 ke atas</dd></div>
         <div><dt>SHA-256</dt><dd class="hash" id="sha">${esc(latest.sha256)}</dd></div>
       </dl>
       <div class="actions">
         <a class="btn btn-main" href="/download/${esc(latest.version)}" download>Unduh APK ${esc(latest.version)}</a>
         <button class="btn btn-quiet" type="button" id="copy-sha" data-target="sha">Salin SHA-256</button>
       </div>
       <p class="note" id="copy-status" role="status"></p>`
    : `<p class="dl-version dl-empty">Belum ada rilis</p>
       <p class="empty">Admin belum menerbitkan berkas APK. Kunjungi lagi nanti, atau hubungi <a href="mailto:${SITE.email}">${SITE.email}</a>.</p>`;

  const rows = history.length
    ? history
        .map(
          (r) => `<tr><th scope="row">${esc(r.version)}</th><td>${esc(formatDate(r.created_at))}</td><td>${esc(formatSize(r.size))}</td><td><a href="/download/${esc(r.version)}" download>Unduh</a></td></tr>`,
        )
        .join('')
    : '';

  return `${head('Moralist: pemutar YouTube Music untuk Android', 'Moralist adalah pemutar YouTube Music berbahasa Indonesia untuk Android. Unduh APK resmi dari Hanz Dev Official.')}
<body>
<a class="skip" href="#unduh">Lompat ke unduhan</a>
<header class="top">
  ${mark()}
  <nav aria-label="Utama">
    <a href="#unduh">Unduh</a>
    <a href="#isi">Isi aplikasi</a>
    <a href="#riwayat">Riwayat</a>
    <a href="#kontak">Kontak</a>
  </nav>
</header>
<main>
  <section class="hero">
    <div class="wave" role="img" aria-label="Gelombang suara, logo Moralist"></div>
    <h1>Moralist</h1>
    <p class="lede">Pemutar YouTube Music untuk Android. Seluruh tampilannya berbahasa Indonesia, dari menu sampai pesan galat.</p>
  </section>

  <section class="download" id="unduh" aria-labelledby="h-unduh">
    <h2 id="h-unduh">Unduh</h2>
    <div class="download-body">
      ${dl}
      <ol class="steps">
        <li>Buka berkas APK di ponselmu.</li>
        <li>Jika Android meminta, izinkan pemasangan dari browser atau pengelola berkas yang kamu pakai.</li>
        <li>Pembaruan berikutnya bisa diambil dari dalam aplikasi, menu Pengaturan lalu Pembaruan.</li>
      </ol>
    </div>
  </section>

  <section class="features" id="isi" aria-labelledby="h-isi">
    <div class="features-head">
      <h2 id="h-isi">Isi aplikasi</h2>
      <p>Daftar ini mengikuti fitur yang ada di kode Moralist ${SITE.appVersion}.</p>
    </div>
    <ol class="index">
      ${FEATURES.map(([t, d]) => `<li><h3>${esc(t)}</h3><p>${esc(d)}</p></li>`).join('\n      ')}
    </ol>
  </section>

  <section class="history" id="riwayat" aria-labelledby="h-riwayat">
    <h2 id="h-riwayat">Riwayat versi</h2>
    ${
      rows
        ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Tabel riwayat versi"><table><thead><tr><th scope="col">Versi</th><th scope="col">Tanggal</th><th scope="col">Ukuran</th><th scope="col"><span class="sr">Unduhan</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
        : '<p class="empty">Belum ada versi yang diterbitkan.</p>'
    }
  </section>

  <section class="contact" id="kontak" aria-labelledby="h-kontak">
    <h2 id="h-kontak">Kontak</h2>
    <div class="contact-body">
      <p class="who">${SITE.developer}</p>
      <p><a href="mailto:${SITE.email}">${SITE.email}</a></p>
      <p><a class="btn btn-main" href="${SITE.donate}" rel="noopener">Belikan saya kopi</a></p>
      <p class="note">Moralist bukan produk resmi YouTube atau Google.</p>
    </div>
  </section>
</main>
<footer class="foot">
  <div class="wave wave-small" aria-hidden="true"></div>
  <p>&copy; 2026 ${SITE.developer}. <a href="/privacy">Privasi</a></p>
</footer>
<script src="/assets/site.js" defer></script>
</body></html>`;
}

export function privacyPage() {
  return `${head('Privasi: Moralist', 'Data apa yang dikumpulkan server Moralist.')}
<body class="plain">
<header class="top">${mark()}<nav aria-label="Utama"><a href="/">Beranda</a></nav></header>
<main class="prose">
  <h1>Privasi</h1>
  <p>Halaman ini menjelaskan apa yang dicatat oleh server Moralist, yaitu server yang melayani situs ini dan pengecekan pembaruan aplikasi.</p>
  <h2>Yang dicatat server</h2>
  <p>Server menghitung berapa kali tiap versi APK diunduh. Seperti server web pada umumnya, alamat IP dan permintaan dapat tercatat di log hosting yang kamu pakai untuk menjalankan server ini. Server tidak meminta akun atau data pribadi dari pengunjung.</p>
  <h2>Dengar Bersama</h2>
  <p>Saat kamu memakai fitur Dengar Bersama, server menyimpan nama pengguna yang kamu isi, kode room, daftar anggota, lagu yang sedang diputar beserta antreannya, dan token sesi supaya kamu bisa tersambung lagi. Data itu disimpan di database server selama room masih ada, lalu dihapus saat room ditutup atau semua anggotanya keluar.</p>
  <h2>Yang dilakukan aplikasi</h2>
  <p>Saat cek pembaruan, aplikasi meminta daftar versi dari server ini. Pemutaran musik, pencarian, dan login akun berjalan langsung antara aplikasi dan YouTube Music, tidak melewati server ini.</p>
  <h2>Kontak</h2>
  <p>Pertanyaan bisa dikirim ke <a href="mailto:${SITE.email}">${SITE.email}</a>.</p>
</main>
</body></html>`;
}

export const notFoundPage = () => `${head('Tidak ditemukan: Moralist', 'Halaman tidak ditemukan.')}
<body class="plain">
<header class="top">${mark()}<nav aria-label="Utama"><a href="/">Beranda</a></nav></header>
<main class="prose"><h1>Halaman tidak ditemukan</h1><p>Alamat yang kamu buka tidak ada. <a href="/">Kembali ke beranda</a>.</p></main>
</body></html>`;

export function adminLoginPage(error = '') {
  return `${head('Masuk admin: Moralist', 'Panel admin Moralist.')}
<body class="plain admin">
<header class="top">${mark()}</header>
<main class="login">
  <h1>Masuk admin</h1>
  <form method="post" action="/admin/login" autocomplete="on">
    ${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ''}
    <label for="u">Username</label>
    <input id="u" name="username" type="text" autocomplete="username" required autofocus>
    <label for="p">Password</label>
    <input id="p" name="password" type="password" autocomplete="current-password" required>
    <button class="btn btn-main" type="submit">Masuk</button>
  </form>
</main>
</body></html>`;
}

export function adminPage(username) {
  return `${head('Admin: Moralist', 'Kelola versi dan tautan unduhan Moralist.')}
<body class="plain admin">
<header class="top">${mark()}
  <nav aria-label="Admin"><span class="who-in">${esc(username)}</span>
  <form method="post" action="/admin/logout" class="inline"><button class="link" type="submit">Keluar</button></form></nav>
</header>
<main class="panel" id="app" data-user="${esc(username)}">
  <h1>Kelola versi</h1>
  <p class="note" id="status" role="status"></p>

  <section aria-labelledby="h-add">
    <h2 id="h-add">Tambah versi</h2>
    <form id="add-form" class="stack">
      <label for="f-version">Nomor versi</label>
      <input id="f-version" name="version" inputmode="numeric" pattern="\\d+\\.\\d+\\.\\d+" placeholder="2.0.0" required>
      <fieldset>
        <legend>Sumber APK</legend>
        <label class="choice"><input type="radio" name="source" value="upload" checked> Unggah berkas APK ke server</label>
        <label class="choice"><input type="radio" name="source" value="external"> Pakai tautan unduhan yang sudah ada</label>
      </fieldset>
      <div id="src-upload">
        <label for="f-file">Berkas APK</label>
        <input id="f-file" name="file" type="file" accept=".apk,application/vnd.android.package-archive">
      </div>
      <div id="src-external" hidden>
        <label for="f-url">Tautan unduhan (https)</label>
        <input id="f-url" name="url" type="url" placeholder="https://contoh.com/moralist-2.0.0.apk">
      </div>
      <label class="choice"><input type="checkbox" name="published" checked> Terbitkan sekarang</label>
      <progress id="progress" max="100" value="0" hidden></progress>
      <button class="btn btn-main" type="submit" id="add-btn">Simpan versi</button>
    </form>
  </section>

  <section aria-labelledby="h-list">
    <h2 id="h-list">Daftar versi</h2>
    <p class="empty" id="loading">Memuat…</p>
    <div class="table-wrap" tabindex="0" role="region" aria-label="Daftar versi" id="list-wrap" hidden>
      <table><thead><tr><th scope="col">Versi</th><th scope="col">Sumber</th><th scope="col">Ukuran</th><th scope="col">Unduhan</th><th scope="col">Status</th><th scope="col">Aksi</th></tr></thead><tbody id="list"></tbody></table>
    </div>
    <p class="empty" id="empty" hidden>Belum ada versi. Tambahkan yang pertama di atas.</p>
  </section>

  <section aria-labelledby="h-pw">
    <h2 id="h-pw">Ganti password</h2>
    <form id="pw-form" class="stack">
      <label for="pw-new">Password baru (minimal 10 karakter)</label>
      <input id="pw-new" type="password" autocomplete="new-password" minlength="10" required>
      <button class="btn btn-quiet" type="submit">Ganti password</button>
    </form>
  </section>
</main>
<script src="/assets/admin.js" defer></script>
</body></html>`;
}

export function invitePage(code, active = false) {
  const safe = String(code || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();
  let body;
  if (!safe) {
    body = '<p>Link undangan ini tidak memuat kode room.</p>';
  } else if (!active) {
    body = '<p class="invite-gone">Room sudah tidak ada.</p><p>Kode room ini sudah tidak aktif. Minta teman untuk membuat room baru.</p>';
  } else {
    body = `<p>Kode room kamu:</p>
  <p class="invite-code" id="room-code-text" aria-label="Kode room">${esc(safe)}</p>
  <p><button class="btn btn-main" id="copy-room-code" data-target="room-code-text" type="button">Salin kode</button></p>
  <p id="room-copy-status" role="status"></p>`;
  }
  return `${head('Undangan Dengar Bersama: Moralist', 'Gabung ke room Dengar Bersama di Moralist.')}
<body class="plain">
<header class="top">${mark()}<nav aria-label="Utama"><a href="/">Beranda</a></nav></header>
<main class="prose">
  <h1>Undangan Dengar Bersama</h1>
  ${body}
  <p>Buka Moralist, masuk ke menu Dengar Bersama, lalu pilih Gabung dan masukkan kode di atas. Belum punya aplikasinya? <a href="/#unduh">Unduh Moralist</a>.</p>
</main>
<script src="/assets/site.js" defer></script>
</body></html>`;
}
